import offerService from '../../services/offerService.js';
import mongoose from 'mongoose';
import Address from '../../models/address.js';
import Cart from '../../models/cart.js';
import CartItem from '../../models/cartItem.js';
import Product from '../../models/product.js';
import Variant from '../../models/variant.js';
import Order from '../../models/order.js';
import Coupon from '../../models/coupon.js';
import CouponUsage from '../../models/couponUsage.js';
import Payment from '../../models/payment.js';
import walletService from '../../services/walletService.js';
import crypto from 'crypto';
import { getRazorpayInstance } from '../../config/razorpay.js';
import { getAvailableCouponsForUser } from './couponController.js';

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

/**
 * Atomically reserves stock for a list of items to prevent race conditions.
 * Uses MongoDB findOneAndUpdate with condition `quantity: { $gte: reqQty }` so that
 * concurrent order placements cannot oversell the same item.
 * If any item cannot be reserved, all previously reserved items in this order are rolled back.
 */
async function reserveStockAtomically(items) {
  const reserved = [];

  for (const item of items) {
    const variantId = item.variant_id._id || item.variant_id;
    const productId = item.product_id._id || item.product_id;
    const reqQty = Number(item.quantity) || 1;

    // Atomically find & decrement ONLY if current stock >= reqQty and variant is not soft-deleted
    const updatedVariant = await Variant.findOneAndUpdate(
      {
        _id: variantId,
        quantity: { $gte: reqQty },
        deleted_at: null,
      },
      { $inc: { quantity: -reqQty } },
      { new: true }
    );

    if (!updatedVariant) {
      // Stock reservation failed! Roll back all items that were successfully reserved in this transaction
      for (const r of reserved) {
        await Variant.findByIdAndUpdate(r.variantId, { $inc: { quantity: r.qty } });
        await Product.findByIdAndUpdate(r.productId, { $inc: { stock: r.qty } });
      }

      // Check current live stock to return the exact available quantity
      const liveV = await Variant.findById(variantId).lean();
      const currentStock = liveV && liveV.deleted_at === null ? Math.max(0, liveV.quantity) : 0;

      return {
        success: false,
        failedItem: item,
        availableStock: currentStock,
        requestedQuantity: reqQty,
      };
    }

    // Keep product aggregate stock in sync
    await Product.findByIdAndUpdate(productId, { $inc: { stock: -reqQty } });

    reserved.push({ variantId, productId, qty: reqQty });
  }

  return { success: true, reserved };
}

/**
 * Rolls back an already reserved batch of stock items (e.g. if order creation or wallet debit fails).
 */
async function rollbackStockReservation(reserved) {
  if (!Array.isArray(reserved)) return;
  for (const r of reserved) {
    try {
      await Variant.findByIdAndUpdate(r.variantId, { $inc: { quantity: r.qty } });
      await Product.findByIdAndUpdate(r.productId, { $inc: { stock: r.qty } });
    } catch (err) {
      console.error('[StockRollback] Failed to restore stock for item:', r, err);
    }
  }
}

// ─── GET /checkout ────────────────────────────────────────────────────────────
export const renderCheckout = async (req, res) => {
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
// offerService imported at top
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
export const getCheckoutSummary = async (req, res) => {
  try {
    const userId = req.user._id;
    const cart = await Cart.findOne({ user_id: userId }).lean();
    if (!cart) return res.json({ success: false, message: 'Cart not found.' });

    const rawItems = await CartItem.find({ cart_id: cart._id })
      .populate('product_id').populate('variant_id').lean();
// offerService imported at top
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

// ─── GET /checkout/check-stock (Live Pre-flight Stock Verification) ────────────
export const checkCheckoutStock = async (req, res) => {
  try {
    const userId = req.user._id;
    const cart = await Cart.findOne({ user_id: userId }).lean();
    if (!cart || !cart.items.length) {
      return res.json({ success: true, inStock: true, items: [], message: 'Cart is empty' });
    }

    const cartItemsRaw = await CartItem.find({ cart_id: cart._id })
      .populate('product_id')
      .populate('variant_id')
      .lean();

    const validItems = cartItemsRaw.filter(i => i.product_id && i.variant_id);
    let allInStock = true;
    const issues = [];
    const stockStatus = [];

    for (const item of validItems) {
      const liveVariant = await Variant.findById(item.variant_id._id).lean();
      const currentStock = liveVariant && liveVariant.deleted_at === null ? Math.max(0, liveVariant.quantity) : 0;
      const isAvailable = currentStock >= item.quantity && currentStock > 0;
      const prodName = (item.product_id && item.product_id.name) || 'Product';
      const sizeStr = (item.variant_id && item.variant_id.size_ml) ? `${item.variant_id.size_ml}ML` : '';

      stockStatus.push({
        cartItemId: item._id,
        variantId: item.variant_id._id,
        productName: prodName,
        size: sizeStr,
        requestedQty: item.quantity,
        availableStock: currentStock,
        inStock: isAvailable,
      });

      if (!isAvailable) {
        allInStock = false;
        const msg = currentStock <= 0
          ? `Sorry! "${prodName}" (${sizeStr}) is currently out of stock.`
          : `Only ${currentStock} unit(s) of "${prodName}" (${sizeStr}) are left in stock (you requested ${item.quantity}). Please adjust your quantity.`;

        issues.push({
          cartItemId: item._id,
          productName: prodName,
          size: sizeStr,
          requestedQty: item.quantity,
          availableStock: currentStock,
          message: msg,
        });
      }
    }

    return res.json({
      success: true,
      inStock: allInStock,
      items: stockStatus,
      issues,
      message: issues.length ? issues[0].message : 'All items are in stock',
    });
  } catch (err) {
    console.error('checkCheckoutStock error:', err);
    return res.status(500).json({ success: false, message: 'Could not verify stock status.' });
  }
};

// ─── POST /checkout ───────────────────────────────────────────────────────────
export const placeOrder = async (req, res) => {
  const isAjax = req.xhr || req.headers.accept?.includes('application/json') || req.is('json');

  const sendError = (status, payload) => {
    if (isAjax) {
      return res.status(status).json(typeof payload === 'string' ? { success: false, message: payload } : { success: false, ...payload });
    }
    return res.status(status).render('user/error', { message: typeof payload === 'string' ? payload : payload.message });
  };

  let reservedBatch = null;

  try {
    const userId = req.user._id;
    const { addressId, paymentMethod = 'cod' } = req.body;

    const method = paymentMethod === 'wallet' ? 'Wallet' : 'Cash on Delivery';

    // 1. Validate address belongs to this user
    if (!addressId || !mongoose.Types.ObjectId.isValid(addressId)) {
      return sendError(400, 'Invalid delivery address selected.');
    }
    const address = await Address.findOne({ _id: addressId, user_id: userId }).lean();
    if (!address) {
      return sendError(400, 'Selected shipping address not found.');
    }

    // 2. Get cart
    const cart = await Cart.findOne({ user_id: userId }).lean();
    if (!cart || !cart.items.length) {
      return sendError(400, { message: 'Your cart is empty.', redirectUrl: '/cart' });
    }

    // 3. Load cart items with product & variant data
    const cartItemsRaw = await CartItem.find({ cart_id: cart._id })
      .populate('product_id')
      .populate('variant_id')
      .lean();
    const validItems = cartItemsRaw.filter(i => i.product_id && i.variant_id);
    if (!validItems.length) {
      return sendError(400, { message: 'No valid items in cart.', redirectUrl: '/cart' });
    }

    // 4. Validate maximum allowed quantity per item (10 units)
    for (const i of validItems) {
      if (i.quantity > 10) {
        return sendError(400, `Maximum allowed quantity for "${i.product_id.name}" is 10 units. Please adjust your order.`);
      }
    }

    // 5. ATOMIC STOCK RESERVATION (Prevents Race Condition when two users order concurrently)
    const reservation = await reserveStockAtomically(validItems);
    if (!reservation.success) {
      const failed = reservation.failedItem;
      const prodName = (failed.product_id && failed.product_id.name) || 'Selected fragrance';
      const sizeStr = (failed.variant_id && failed.variant_id.size_ml) ? ` (${failed.variant_id.size_ml}ML)` : '';
      const avail = reservation.availableStock;
      const reqQty = reservation.requestedQuantity;

      const message = avail <= 0
        ? `Sorry! "${prodName}"${sizeStr} is currently out of stock. Another customer just purchased the last item.`
        : `Only ${avail} unit(s) of "${prodName}"${sizeStr} are available in stock (you requested ${reqQty}). Please adjust your quantity to continue.`;

      return sendError(409, {
        code: 'INSUFFICIENT_STOCK',
        message,
        availableStock: avail,
        requestedQuantity: reqQty,
        productName: prodName,
        size: sizeStr,
        cartItemId: failed._id,
      });
    }

    reservedBatch = reservation.reserved;

    // 6. Build order items snapshot with live offer pricing
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

    // 7. Pricing calculations
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

    // 8. Check wallet balance if payment method is Wallet
    if (method === 'Wallet') {
      const currentBal = await walletService.getBalance(userId);
      if (currentBal < total) {
        await rollbackStockReservation(reservedBatch);
        reservedBatch = null;
        return sendError(400, {
          message: `Insufficient wallet balance. You have ₹${currentBal.toLocaleString('en-IN')}, but order total is ₹${total.toLocaleString('en-IN')}.`,
        });
      }
    }

    // 9. Create order (retry on duplicate order_number)
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
        if (e.code === 11000) { attempts++; continue; }
        await rollbackStockReservation(reservedBatch);
        reservedBatch = null;
        throw e;
      }
    }

    if (!order) {
      await rollbackStockReservation(reservedBatch);
      reservedBatch = null;
      throw new Error('Could not generate a unique order number');
    }

    // If paid by wallet, debit the wallet balance
    if (method === 'Wallet') {
      try {
        await walletService.debitWallet({
          userId,
          amount: total,
          category: 'purchase',
          description: `Order payment for #${order.order_number}`,
          method: 'Wallet',
          relatedOrderId: order._id,
        });
      } catch (debitErr) {
        console.error('Wallet debit failed, cancelling order:', debitErr);
        await Order.findByIdAndUpdate(order._id, { $set: { order_status: 'cancelled', payment_status: 'failed' } });
        await rollbackStockReservation(reservedBatch);
        reservedBatch = null;
        return sendError(500, 'Wallet payment failed. Your balance was not charged.');
      }
    }

    // 10. Record coupon usage so admin dashboard shows correct count
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
        }
      } catch (usageErr) {
        console.error('[CouponUsage] Error saving coupon usage:', usageErr);
      }
    }

    // 11. Clear the cart
    await CartItem.deleteMany({ cart_id: cart._id });
    await Cart.findByIdAndUpdate(cart._id, { $set: { items: [], applied_coupon: { code: null, discount_value: null } } });

    if (isAjax) {
      return res.json({ success: true, redirectUrl: `/checkout/success/${order._id}` });
    }
    return res.redirect(`/checkout/success/${order._id}`);
  } catch (err) {
    console.error('placeOrder error:', err);
    if (reservedBatch) {
      await rollbackStockReservation(reservedBatch);
    }
    return sendError(500, 'Failed to place order. Please try again.');
  }
};


// ─── GET /checkout/success/:orderId ──────────────────────────────────────────
export const renderOrderSuccess = async (req, res) => {
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
export const createRazorpayOrder = async (req, res) => {
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
      const liveVariant = await Variant.findById(i.variant_id._id).lean();
      const currentStock = liveVariant && liveVariant.deleted_at === null ? Math.max(0, liveVariant.quantity) : 0;
      if (currentStock < i.quantity || currentStock <= 0) {
        const prodName = (i.product_id && i.product_id.name) || 'Selected fragrance';
        const sizeStr = (i.variant_id && i.variant_id.size_ml) ? ` (${i.variant_id.size_ml}ML)` : '';
        const msg = currentStock <= 0
          ? `Sorry! "${prodName}"${sizeStr} is currently out of stock.`
          : `Only ${currentStock} unit(s) of "${prodName}"${sizeStr} are left in stock (you requested ${i.quantity}). Please adjust your quantity.`;
        return res.status(400).json({
          success: false,
          code: 'INSUFFICIENT_STOCK',
          message: msg,
          availableStock: currentStock,
          requestedQuantity: i.quantity,
          productName: prodName,
          size: sizeStr,
        });
      }
    }

    // 4. Calculate total with live offer pricing
    const offerServiceRzp = offerService;
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
export const verifyRazorpayPayment = async (req, res) => {
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
    const offerServiceVerify = offerService;
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

    // 6. ATOMIC STOCK RESERVATION
    const reservation = await reserveStockAtomically(validItems);
    if (!reservation.success) {
      const failed = reservation.failedItem;
      const prodName = (failed.product_id && failed.product_id.name) || 'Selected fragrance';
      const sizeStr = (failed.variant_id && failed.variant_id.size_ml) ? ` (${failed.variant_id.size_ml}ML)` : '';
      const avail = reservation.availableStock;

      // Update payment record to reflect failed stock
      await Payment.findOneAndUpdate(
        { gateway_order_id: razorpay_order_id },
        { status: 'refunded_to_wallet', transaction_id: razorpay_payment_id }
      );

      // Refund the captured amount to user's Essence Wallet
      await walletService.creditWallet({
        userId,
        amount: total,
        category: 'refund',
        description: `Automatic refund for out-of-stock item: ${prodName}${sizeStr} (Payment #${razorpay_payment_id})`,
        method: 'Online Payment',
      });

      const message = avail <= 0
        ? `"${prodName}"${sizeStr} went out of stock right as your payment finished. Your payment of ₹${total.toLocaleString('en-IN')} has been immediately credited to your Essence Wallet.`
        : `Only ${avail} unit(s) of "${prodName}"${sizeStr} remain in stock. Your payment of ₹${total.toLocaleString('en-IN')} has been immediately refunded to your Essence Wallet.`;

      return res.status(409).json({
        success: false,
        code: 'INSUFFICIENT_STOCK',
        message,
        refundedToWallet: true,
      });
    }

    const reservedBatch = reservation.reserved;

    // 7. Create Order with payment_status = 'paid'
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
        await rollbackStockReservation(reservedBatch);
        throw e;
      }
    }
    if (!order) {
      await rollbackStockReservation(reservedBatch);
      throw new Error('Could not generate unique order number');
    }

    // 8. Update Payment record
    await Payment.findOneAndUpdate(
      { gateway_order_id: razorpay_order_id },
      {
        order_id: order._id,
        transaction_id: razorpay_payment_id,
        status: 'success',
      }
    );

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
export const renderPaymentFailure = (req, res) => {
  const reason = req.query.reason || 'Your payment was not completed.';
  res.render('user/checkout/payment-failure', { reason });
};


export default {
  renderCheckout,
  getCheckoutSummary,
  checkCheckoutStock,
  placeOrder,
  renderOrderSuccess,
  createRazorpayOrder,
  verifyRazorpayPayment,
  renderPaymentFailure
};
