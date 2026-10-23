const mongoose    = require('mongoose');
const Address     = require('../../models/address');
const Cart        = require('../../models/cart');
const CartItem    = require('../../models/cartItem');
const Product     = require('../../models/product');
const Variant     = require('../../models/variant');
const Order       = require('../../models/order');
const Coupon      = require('../../models/coupon');
const CouponUsage = require('../../models/couponUsage');
const Payment     = require('../../models/payment');
const walletService = require('../../services/walletService');
const crypto      = require('crypto');
const { getRazorpayInstance } = require('../../config/razorpay');
const { getAvailableCouponsForUser } = require('./couponController');

// ─── constants ───────────────────────────────────────────────────────────────
const GST_RATE        = 0.18;          // 18 % GST on subtotal
const FREE_SHIPPING_ABOVE = 2000;      // free shipping when subtotal ≥ ₹2000
const SHIPPING_FEE    = 99;            // flat fee otherwise

function toNum(decimal128) {
  if (decimal128 == null) return 0;
  return parseFloat(decimal128.toString());
}

// Generate a unique order number like ESS-20261004-A3F9
function generateOrderNumber() {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randPart = Math.random().toString(36).toUpperCase().slice(2, 6);
  return `ESS-${datePart}-${randPart}`;
}

// ─── GET /checkout ────────────────────────────────────────────────────────────
exports.renderCheckout = async (req, res) => {
  try {
    const userId = req.user._id;

    // 1. Fetch all user addresses
    const addresses = await Address.find({ user_id: userId }).lean();

    // 2. Fetch cart + items
    const cart = await Cart.findOne({ user_id: userId }).lean();
    if (!cart || !cart.items.length) {
      return res.redirect('/cart');
    }

    const cartItemsRaw = await CartItem.find({ cart_id: cart._id })
      .populate('product_id')
      .populate('variant_id')
      .lean();

    const offerService = require('../../services/offerService');
    const activeOffers = await offerService.getActiveOffers();

    // 3. Build items list — only available + in-stock items with live offer calculation
    const items = cartItemsRaw
      .filter(i => i.product_id && i.variant_id)
      .map(i => {
        const p = i.product_id;
        const v = i.variant_id;
        const basePrice = toNum(v.price) || toNum(i.unit_price);
        const offerCalc = offerService.calculateProductDiscount({
          productId: p._id,
          categoryId: p.category_id,
          price: basePrice,
          activeOffers,
        });

        const effectivePrice = offerCalc.finalPrice;
        return {
          cart_item_id : i._id,
          product_id   : p._id,
          variant_id   : v._id,
          name         : p.name,
          image        : (p.images && p.images[0]) || '/user/images/placeholder.jpg',
          size         : v.size_ml ? `${v.size_ml}ML` : '',
          quantity     : i.quantity,
          unit_price   : effectivePrice,
          original_price: basePrice,
          hasOffer     : offerCalc.discount > 0,
          offerDiscount: offerCalc.discount,
          offerPercentage: offerCalc.discountPercentage,
          item_total   : parseFloat((effectivePrice * i.quantity).toFixed(2)),
          stock        : Math.min(10, v.quantity),
        };
      });

    if (!items.length) return res.redirect('/cart');

    // 4. Pricing
    const subtotal   = items.reduce((s, i) => s + i.item_total, 0);
    const coupon     = cart.applied_coupon?.code ? cart.applied_coupon : null;
    const discount   = coupon ? toNum(cart.applied_coupon.discount_value) : 0;
    const taxable    = Math.max(subtotal - discount, 0);
    const tax        = parseFloat((taxable * GST_RATE).toFixed(2));
    const shipping   = taxable >= FREE_SHIPPING_ABOVE ? 0 : SHIPPING_FEE;
    const total      = parseFloat((taxable + tax + shipping).toFixed(2));

    // 5. Default address (pre-select)
    const defaultAddr = addresses.find(a => a.is_default) || addresses[0] || null;
    const walletBalance = await walletService.getBalance(userId);
    const availableCoupons = await getAvailableCouponsForUser(userId, subtotal);

    res.render('user/checkout/checkout', {
      user       : req.user,
      addresses,
      defaultAddressId : defaultAddr ? defaultAddr._id.toString() : null,
      items,
      coupon,
      availableCoupons,
      subtotal,
      discount,
      tax,
      shipping,
      total,
      walletBalance,
      razorpayKeyId: process.env.RAZORPAY_KEY_ID || '',
    });
  } catch (err) {
    console.error('renderCheckout error:', err);
    res.status(500).render('user/error', { message: 'Failed to load checkout' });
  }
};

// ─── GET /checkout/summary  (JSON — re-validate stale checkout UI) ────────────
exports.getCheckoutSummary = async (req, res) => {
  try {
    const userId = req.user._id;
    const cart = await Cart.findOne({ user_id: userId }).lean();
    if (!cart) return res.json({ success: false, message: 'Cart not found.' });

    const rawItems = await CartItem.find({ cart_id: cart._id })
      .populate('product_id').populate('variant_id').lean();

    const offerService = require('../../services/offerService');
    const activeOffers = await offerService.getActiveOffers();

    const subtotal = rawItems
      .filter(i => i.product_id && i.variant_id)
      .reduce((s, i) => {
        const basePrice = toNum(i.variant_id.price) || toNum(i.unit_price);
        const offerCalc = offerService.calculateProductDiscount({
          productId: i.product_id._id,
          categoryId: i.product_id.category_id,
          price: basePrice,
          activeOffers,
        });
        return s + offerCalc.finalPrice * i.quantity;
      }, 0);

    const coupon   = cart.applied_coupon?.code ? cart.applied_coupon : null;
    const discount = coupon ? toNum(cart.applied_coupon.discount_value) : 0;
    const taxable  = Math.max(subtotal - discount, 0);
    const tax      = parseFloat((taxable * GST_RATE).toFixed(2));
    const shipping = taxable >= FREE_SHIPPING_ABOVE ? 0 : SHIPPING_FEE;
    const total    = parseFloat((taxable + tax + shipping).toFixed(2));

    return res.json({
      success    : true,
      subtotal   : parseFloat(subtotal.toFixed(2)),
      discount,
      couponCode : coupon ? coupon.code.toString() : null,
      tax,
      shipping,
      total,
    });
  } catch (err) {
    console.error('getCheckoutSummary error:', err);
    return res.status(500).json({ success: false });
  }
};

// ─── POST /checkout ───────────────────────────────────────────────────────────
exports.placeOrder = async (req, res) => {
  try {
    const userId = req.user._id;
    const { addressId, paymentMethod = 'cod' } = req.body;

    const method = paymentMethod === 'wallet' ? 'Wallet' : 'Cash on Delivery';

    // 1. Validate address belongs to this user
    if (!mongoose.Types.ObjectId.isValid(addressId)) {
      return res.status(400).render('user/error', { message: 'Invalid address selected.' });
    }
    const address = await Address.findOne({ _id: addressId, user_id: userId }).lean();
    if (!address) {
      return res.status(400).render('user/error', { message: 'Address not found.' });
    }

    // 2. Get cart
    const cart = await Cart.findOne({ user_id: userId }).lean();
    if (!cart || !cart.items.length) {
      return res.redirect('/cart');
    }

    // 3. Load cart items with product & variant data
    const cartItemsRaw = await CartItem.find({ cart_id: cart._id })
      .populate('product_id')
      .populate('variant_id')
      .lean();
    const validItems = cartItemsRaw.filter(i => i.product_id && i.variant_id);
    if (!validItems.length) return res.redirect('/cart');

    // 4. Live stock and max quantity validation — re-fetch each variant to catch admin edits since page load
    for (const i of validItems) {
      if (i.quantity > 10) {
        return res.status(400).render('user/error', {
          message: `Maximum allowed quantity for "${i.product_id.name}" is 10 units. Please adjust your order.`,
        });
      }
      const liveVariant = await Variant.findById(i.variant_id._id);
      if (!liveVariant || liveVariant.quantity < i.quantity) {
        return res.status(400).render('user/error', {
          message: `"${i.product_id.name}" (${i.variant_id.size_ml}ML) is out of stock or has insufficient quantity. Please update your cart.`,
        });
      }
    }

    // 5. Build order items snapshot with live offer pricing
    const offerService = require('../../services/offerService');
    const activeOffers = await offerService.getActiveOffers();

    const orderItems = validItems.map(i => {
      const basePrice = toNum(i.variant_id.price) || toNum(i.unit_price);
      const offerCalc = offerService.calculateProductDiscount({
        productId: i.product_id._id,
        categoryId: i.product_id.category_id,
        price: basePrice,
        activeOffers,
      });

      const finalPrice = offerCalc.finalPrice;
      return {
        product_id:        i.product_id._id,
        variant_id:        i.variant_id._id,
        product_name:      i.product_id.name,
        size:              i.variant_id.size_ml ? `${i.variant_id.size_ml}ML` : '',
        image:             (i.product_id.images && i.product_id.images[0]) || '',
        quantity:          i.quantity,
        price_at_purchase: finalPrice,
        item_status:       'placed',
      };
    });

    // 6. Pricing calculations
    const subtotal = orderItems.reduce((s, i) => s + (i.price_at_purchase * i.quantity), 0);
    let coupon     = cart.applied_coupon?.code ? cart.applied_coupon : null;
    let discount   = coupon ? toNum(cart.applied_coupon.discount_value) : 0;

    // Verify coupon usage limit
    if (coupon && coupon.code) {
      const couponDoc = await Coupon.findOne({ code: coupon.code.toString().trim().toUpperCase(), is_active: true });
      if (couponDoc) {
        const userLimit = couponDoc.usage_limit_per_user || 1;
        const usedCount = await CouponUsage.countDocuments({ coupon_id: couponDoc._id, user_id: userId });
        if (usedCount >= userLimit) {
          coupon = null;
          discount = 0;
          await Cart.findByIdAndUpdate(cart._id, { $set: { applied_coupon: { code: null, discount_value: null } } });
        }
      } else {
        coupon = null;
        discount = 0;
        await Cart.findByIdAndUpdate(cart._id, { $set: { applied_coupon: { code: null, discount_value: null } } });
      }
    }

    const taxable  = Math.max(subtotal - discount, 0);
    const tax      = parseFloat((taxable * GST_RATE).toFixed(2));
    const shipping = taxable >= FREE_SHIPPING_ABOVE ? 0 : SHIPPING_FEE;
    const total    = parseFloat((taxable + tax + shipping).toFixed(2));

    // 7. Check wallet balance if payment method is Wallet
    if (method === 'Wallet') {
      const currentBal = await walletService.getBalance(userId);
      if (currentBal < total) {
        return res.status(400).render('user/error', {
          message: `Insufficient wallet balance. You have ₹${currentBal.toLocaleString('en-IN')}, but order total is ₹${total.toLocaleString('en-IN')}.`,
        });
      }
    }

    // 8. Create order (retry on duplicate order_number)
    let order;
    let attempts = 0;
    while (!order && attempts < 5) {
      try {
        order = await Order.create({
          user_id: userId,
          order_number: generateOrderNumber(),
          shipping_address: {
            full_name:     address.full_name,
            phone_number:  address.phone_number,
            address_line1: address.address_line1,
            address_line2: address.address_line2 || '',
            city:          address.city,
            state:         address.state,
            country:       address.country || 'India',
            pincode:       address.pincode,
          },
          payment_method:  method,
          payment_status:  method === 'Wallet' ? 'paid' : 'pending',
          order_status:    'placed',
          items:           orderItems,
          subtotal,
          discount_amount: discount,
          tax_amount:      tax,
          shipping_fee:    shipping,
          total_amount:    total,
          coupon_code:     coupon?.code || null,
        });
      } catch (e) {
        if (e.code === 11000) { attempts++; continue; } // duplicate order_number — retry
        throw e;
      }
    }
    if (!order) throw new Error('Could not generate a unique order number');

    // If paid by wallet, debit the wallet balance
    if (method === 'Wallet') {
      await walletService.debitWallet({
        userId,
        amount: total,
        category: 'purchase',
        description: `Order payment for #${order.order_number}`,
        method: 'Wallet',
        relatedOrderId: order._id,
      });
    }

    // 8. Decrement stock for each item
    for (const i of validItems) {
      await Variant.findByIdAndUpdate(i.variant_id._id, { $inc: { quantity: -i.quantity } });
      await Product.findByIdAndUpdate(i.product_id._id, { $inc: { stock:    -i.quantity } });
    }
    // 9. Record coupon usage so admin dashboard shows correct count
    if (coupon && coupon.code) {
      try {
        const cleanCode = coupon.code.toString().trim().toUpperCase();
        const couponDoc = await Coupon.findOne({ code: cleanCode }).lean();
        if (couponDoc) {
          await CouponUsage.create({
            coupon_id       : couponDoc._id,
            user_id         : userId,
            order_id        : order._id,
            discount_applied: discount,
          });
          console.log(`[CouponUsage] Recorded usage for coupon: ${cleanCode}, user: ${userId}, order: ${order._id}`);
        } else {
          console.warn(`[CouponUsage] Coupon code "${cleanCode}" not found in database.`);
        }
      } catch (usageErr) {
        console.error('[CouponUsage] Error saving coupon usage:', usageErr);
      }
    }

    // 10. Clear the cart
    await CartItem.deleteMany({ cart_id: cart._id });
    await Cart.findByIdAndUpdate(cart._id, { $set: { items: [], applied_coupon: { code: null, discount_value: null } } });

    res.redirect(`/checkout/success/${order._id}`);
  } catch (err) {
    console.error('placeOrder error:', err);
    res.status(500).render('user/error', { message: 'Failed to place order. Please try again.' });
  }
};


// ─── GET /checkout/success/:orderId ──────────────────────────────────────────
exports.renderOrderSuccess = async (req, res) => {
  try {
    const order = await Order.findOne({
      _id     : req.params.orderId,
      user_id : req.user._id,
    })
      .populate('items.product_id', 'name images brand_id')
      .lean();

    if (!order) return res.redirect('/orders');

    // Shape data for the view
    const items = order.items.map(i => {
      const p = i.product_id || {};
      return {
        image : (p.images && p.images[0]) || '/user/images/placeholder.jpg',
        name  : i.product_name,
        size  : i.size,
        qty   : i.quantity,
      };
       
    });

    res.render('user/checkout/order-success', {
      user : req.user,
      order: {
        id               : order.order_number,
        total            : toNum(order.total_amount),
        paymentMethod    : order.payment_method,
        estimatedDelivery: '3–5 Business Days',
        items,
        supportEmail     : 'support@essence.com',
      },
    });
  } catch (err) {
    console.error('renderOrderSuccess error:', err);
    res.redirect('/orders');
  }
};

// ─── POST /checkout/create-razorpay-order ─────────────────────────────────────
exports.createRazorpayOrder = async (req, res) => {
  try {
    const userId = req.user._id;
    const { addressId } = req.body;

    // 1. Validate address
    if (!addressId || !mongoose.Types.ObjectId.isValid(addressId)) {
      return res.status(400).json({ success: false, message: 'Please select a valid shipping address.' });
    }
    const address = await Address.findOne({ _id: addressId, user_id: userId }).lean();
    if (!address) {
      return res.status(400).json({ success: false, message: 'Address not found.' });
    }

    // 2. Load cart & items
    const cart = await Cart.findOne({ user_id: userId }).lean();
    if (!cart || !cart.items.length) {
      return res.status(400).json({ success: false, message: 'Your cart is empty.' });
    }

    const cartItemsRaw = await CartItem.find({ cart_id: cart._id })
      .populate('product_id')
      .populate('variant_id')
      .lean();
    const validItems = cartItemsRaw.filter(i => i.product_id && i.variant_id);
    if (!validItems.length) {
      return res.status(400).json({ success: false, message: 'No valid items in cart.' });
    }

    // 3. Stock validation
    for (const i of validItems) {
      const liveVariant = await Variant.findById(i.variant_id._id);
      if (!liveVariant || liveVariant.quantity < i.quantity) {
        return res.status(400).json({
          success: false,
          message: `"${i.product_id.name}" (${i.variant_id.size_ml}ML) has insufficient stock.`,
        });
      }
    }

    // 4. Calculate total with live offer pricing
    const offerServiceRzp = require('../../services/offerService');
    const activeOffersRzp = await offerServiceRzp.getActiveOffers();

    const subtotal = validItems.reduce((s, i) => {
      const basePrice = toNum(i.variant_id.price) || toNum(i.unit_price);
      const offerCalc = offerServiceRzp.calculateProductDiscount({
        productId: i.product_id._id,
        categoryId: i.product_id.category_id,
        price: basePrice,
        activeOffers: activeOffersRzp,
      });
      return s + (offerCalc.finalPrice * i.quantity);
    }, 0);
    let coupon     = cart.applied_coupon?.code ? cart.applied_coupon : null;
    let discount   = coupon ? toNum(cart.applied_coupon.discount_value) : 0;

    if (coupon && coupon.code) {
      const couponDoc = await Coupon.findOne({ code: coupon.code.toString().trim().toUpperCase(), is_active: true });
      if (couponDoc) {
        const userLimit = couponDoc.usage_limit_per_user || 1;
        const usedCount = await CouponUsage.countDocuments({ coupon_id: couponDoc._id, user_id: userId });
        if (usedCount >= userLimit) {
          coupon = null;
          discount = 0;
          await Cart.findByIdAndUpdate(cart._id, { $set: { applied_coupon: { code: null, discount_value: null } } });
        }
      } else {
        coupon = null;
        discount = 0;
        await Cart.findByIdAndUpdate(cart._id, { $set: { applied_coupon: { code: null, discount_value: null } } });
      }
    }

    const taxable  = Math.max(subtotal - discount, 0);
    const tax      = parseFloat((taxable * GST_RATE).toFixed(2));
    const shipping = taxable >= FREE_SHIPPING_ABOVE ? 0 : SHIPPING_FEE;
    const total    = parseFloat((taxable + tax + shipping).toFixed(2));

    const razorpay = getRazorpayInstance();
    if (!razorpay) {
      return res.status(500).json({
        success: false,
        message: 'Online payment gateway is not configured yet. Please configure RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in .env or choose Cash on Delivery.',
      });
    }

    // Razorpay amount in paise (1 INR = 100 paise)
    const amountInPaise = Math.round(total * 100);

    const rzpOrder = await razorpay.orders.create({
      amount: amountInPaise,
      currency: 'INR',
      receipt: `rcpt_${Date.now().toString(36).toUpperCase()}`,
      notes: {
        userId: userId.toString(),
        addressId: addressId.toString(),
      },
    });

    // Save pending payment log
    await Payment.create({
      user_id: userId,
      purpose: 'order_payment',
      gateway: 'razorpay',
      gateway_order_id: rzpOrder.id,
      amount: total,
      status: 'pending',
    });

    return res.json({
      success: true,
      orderId: rzpOrder.id,
      amount: rzpOrder.amount,
      currency: rzpOrder.currency,
      keyId: process.env.RAZORPAY_KEY_ID,
      user: {
        name: req.user.full_name || '',
        email: req.user.email || '',
        phone: address.phone_number || '',
      },
    });
  } catch (err) {
    console.error('createRazorpayOrder error:', err);
    return res.status(500).json({ success: false, message: 'Could not initialize payment gateway.' });
  }
};

// ─── POST /checkout/verify-razorpay-payment ───────────────────────────────────
exports.verifyRazorpayPayment = async (req, res) => {
  try {
    const userId = req.user._id;
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      addressId,
    } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ success: false, message: 'Missing payment verification credentials.' });
    }

    // 1. Verify signature
    const secret = process.env.RAZORPAY_KEY_SECRET || '';
    const bodyStr = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(bodyStr)
      .digest('hex');

    const isAuthentic = expectedSignature === razorpay_signature;

    if (!isAuthentic) {
      await Payment.findOneAndUpdate(
        { gateway_order_id: razorpay_order_id },
        { status: 'failed', failure_reason: 'Signature verification mismatch' }
      );
      return res.status(400).json({ success: false, message: 'Payment verification failed. Invalid signature.' });
    }

    // 2. Validate address
    const address = await Address.findOne({ _id: addressId, user_id: userId }).lean();
    if (!address) {
      return res.status(400).json({ success: false, message: 'Shipping address not found.' });
    }

    // 3. Load cart & items
    const cart = await Cart.findOne({ user_id: userId }).lean();
    if (!cart || !cart.items.length) {
      return res.status(400).json({ success: false, message: 'Cart items not found.' });
    }

    const cartItemsRaw = await CartItem.find({ cart_id: cart._id })
      .populate('product_id')
      .populate('variant_id')
      .lean();
    const validItems = cartItemsRaw.filter(i => i.product_id && i.variant_id);
    if (!validItems.length) {
      return res.status(400).json({ success: false, message: 'No valid items.' });
    }

    const offerServiceVerify = require('../../services/offerService');
    const activeOffersVerify = await offerServiceVerify.getActiveOffers();

    // 4. Snapshot order items with live offer pricing
    const orderItems = validItems.map(i => {
      const basePrice = toNum(i.variant_id.price) || toNum(i.unit_price);
      const offerCalc = offerServiceVerify.calculateProductDiscount({
        productId: i.product_id._id,
        categoryId: i.product_id.category_id,
        price: basePrice,
        activeOffers: activeOffersVerify,
      });

      return {
        product_id:        i.product_id._id,
        variant_id:        i.variant_id._id,
        product_name:      i.product_id.name,
        size:              i.variant_id.size_ml ? `${i.variant_id.size_ml}ML` : '',
        image:             (i.product_id.images && i.product_id.images[0]) || '',
        quantity:          i.quantity,
        price_at_purchase: offerCalc.finalPrice,
        item_status:       'placed',
      };
    });

    // 5. Calculate pricing
    const subtotal = orderItems.reduce((s, i) => s + (i.price_at_purchase * i.quantity), 0);
    let coupon     = cart.applied_coupon?.code ? cart.applied_coupon : null;
    let discount   = coupon ? toNum(cart.applied_coupon.discount_value) : 0;

    if (coupon && coupon.code) {
      const couponDoc = await Coupon.findOne({ code: coupon.code.toString().trim().toUpperCase(), is_active: true });
      if (couponDoc) {
        const userLimit = couponDoc.usage_limit_per_user || 1;
        const usedCount = await CouponUsage.countDocuments({ coupon_id: couponDoc._id, user_id: userId });
        if (usedCount >= userLimit) {
          coupon = null;
          discount = 0;
          await Cart.findByIdAndUpdate(cart._id, { $set: { applied_coupon: { code: null, discount_value: null } } });
        }
      } else {
        coupon = null;
        discount = 0;
        await Cart.findByIdAndUpdate(cart._id, { $set: { applied_coupon: { code: null, discount_value: null } } });
      }
    }

    const taxable  = Math.max(subtotal - discount, 0);
    const tax      = parseFloat((taxable * GST_RATE).toFixed(2));
    const shipping = taxable >= FREE_SHIPPING_ABOVE ? 0 : SHIPPING_FEE;
    const total    = parseFloat((taxable + tax + shipping).toFixed(2));

    // 6. Create Order with payment_status = 'paid'
    let order;
    let attempts = 0;
    while (!order && attempts < 5) {
      try {
        order = await Order.create({
          user_id: userId,
          order_number: generateOrderNumber(),
          shipping_address: {
            full_name:     address.full_name,
            phone_number:  address.phone_number,
            address_line1: address.address_line1,
            address_line2: address.address_line2 || '',
            city:          address.city,
            state:         address.state,
            country:       address.country || 'India',
            pincode:       address.pincode,
          },
          payment_method:  'Online Payment',
          payment_status:  'paid',
          order_status:    'placed',
          items:           orderItems,
          subtotal,
          discount_amount: discount,
          tax_amount:      tax,
          shipping_fee:    shipping,
          total_amount:    total,
          coupon_code:     coupon?.code || null,
        });
      } catch (e) {
        if (e.code === 11000) { attempts++; continue; }
        throw e;
      }
    }
    if (!order) throw new Error('Could not generate unique order number');

    // 7. Update Payment record
    await Payment.findOneAndUpdate(
      { gateway_order_id: razorpay_order_id },
      {
        order_id: order._id,
        transaction_id: razorpay_payment_id,
        status: 'success',
      }
    );

    // 8. Decrement stock
    for (const i of validItems) {
      await Variant.findByIdAndUpdate(i.variant_id._id, { $inc: { quantity: -i.quantity } });
      await Product.findByIdAndUpdate(i.product_id._id, { $inc: { stock:    -i.quantity } });
    }

    // 9. Record coupon usage
    if (coupon && coupon.code) {
      try {
        const cleanCode = coupon.code.toString().trim().toUpperCase();
        const couponDoc = await Coupon.findOne({ code: cleanCode }).lean();
        if (couponDoc) {
          await CouponUsage.create({
            coupon_id       : couponDoc._id,
            user_id         : userId,
            order_id        : order._id,
            discount_applied: discount,
          });
          console.log(`[CouponUsage] Recorded online usage for coupon: ${cleanCode}, user: ${userId}, order: ${order._id}`);
        }
      } catch (usageErr) {
        console.error('[CouponUsage] Error saving coupon usage:', usageErr);
      }
    }

    // 10. Clear cart
    await CartItem.deleteMany({ cart_id: cart._id });
    await Cart.findByIdAndUpdate(cart._id, { $set: { items: [], applied_coupon: { code: null, discount_value: null } } });

    return res.json({
      success: true,
      redirectUrl: `/checkout/success/${order._id}`,
    });
  } catch (err) {
    console.error('verifyRazorpayPayment error:', err);
    return res.status(500).json({ success: false, message: 'Order finalization failed after payment.' });
  }
};

// ─── GET /checkout/failure ────────────────────────────────────────────────────
exports.renderPaymentFailure = (req, res) => {
  const reason = req.query.reason || 'Your payment was not completed.';
  res.render('user/checkout/payment-failure', { reason });
};

