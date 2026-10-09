const mongoose = require('mongoose');
const Address  = require('../../models/address');
const Cart     = require('../../models/cart');
const CartItem = require('../../models/cartItem');
const Product  = require('../../models/product');
const Variant  = require('../../models/variant');
const Order    = require('../../models/order');

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

    // 3. Build items list — only available + in-stock items
    const items = cartItemsRaw
      .filter(i => i.product_id && i.variant_id)
      .map(i => {
        const p = i.product_id;
        const v = i.variant_id;
        const unitPrice = toNum(i.unit_price);
        return {
          cart_item_id : i._id,
          product_id   : p._id,
          variant_id   : v._id,
          name         : p.name,
          image        : (p.images && p.images[0]) || '/user/images/placeholder.jpg',
          size         : v.size_ml ? `${v.size_ml}ML` : '',
          quantity     : i.quantity,
          unit_price   : unitPrice,
          item_total   : toNum(i.total_price),
          stock        : v.quantity,
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

    res.render('user/checkout/checkout', {
      user       : req.user,
      addresses,
      defaultAddressId : defaultAddr ? defaultAddr._id.toString() : null,
      items,
      coupon,
      subtotal,
      discount,
      tax,
      shipping,
      total,
    });
  } catch (err) {
    console.error('renderCheckout error:', err);
    res.status(500).render('user/error', { message: 'Failed to load checkout' });
  }
};

// ─── POST /checkout ───────────────────────────────────────────────────────────
exports.placeOrder = async (req, res) => {
  try {
    const userId = req.user._id;
    const { addressId, paymentMethod } = req.body;

    // Only COD accepted for now
    const method = 'Cash on Delivery';

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

    const cartItemsRaw = await CartItem.find({ cart_id: cart._id })
      .populate('product_id')
      .populate('variant_id')
      .lean();

    const validItems = cartItemsRaw.filter(i => i.product_id && i.variant_id);
    if (!validItems.length) return res.redirect('/cart');

    // 3. Stock validation
    for (const i of validItems) {
      const liveVariant = await Variant.findById(i.variant_id._id);
      if (!liveVariant || liveVariant.quantity < i.quantity) {
        return res.status(400).render('user/error', {
          message: `"${i.product_id.name}" (${i.variant_id.size_ml}ML) is out of stock or insufficient quantity. Please update your cart.`,
        });
      }
    }

    // 4. Build order items snapshot
    const orderItems = validItems.map(i => ({
      product_id        : i.product_id._id,
      variant_id        : i.variant_id._id,
      product_name      : i.product_id.name,
      size              : i.variant_id.size_ml ? `${i.variant_id.size_ml}ML` : '',
      image             : (i.product_id.images && i.product_id.images[0]) || '',
      quantity          : i.quantity,
      price_at_purchase : toNum(i.unit_price),
      item_status       : 'placed',
    }));

    // 5. Pricing
    const subtotal  = validItems.reduce((s, i) => s + toNum(i.total_price), 0);
    const coupon    = cart.applied_coupon?.code ? cart.applied_coupon : null;
    const discount  = coupon ? toNum(cart.applied_coupon.discount_value) : 0;
    const taxable   = Math.max(subtotal - discount, 0);
    const tax       = parseFloat((taxable * GST_RATE).toFixed(2));
    const shipping  = taxable >= FREE_SHIPPING_ABOVE ? 0 : SHIPPING_FEE;
    const total     = parseFloat((taxable + tax + shipping).toFixed(2));

    // 6. Create order with retry for duplicate order_number
    let order;
    let attempts = 0;
    while (!order && attempts < 5) {
      try {
        order = await Order.create({
          user_id          : userId,
          order_number     : generateOrderNumber(),
          shipping_address : {
            full_name    : address.full_name,
            phone_number : address.phone_number,
            address_line1: address.address_line1,
            address_line2: address.address_line2 || '',
            city         : address.city,
            state        : address.state,
            country      : address.country || 'India',
            pincode      : address.pincode,
          },
          payment_method   : method,
          payment_status   : 'pending',
          order_status     : 'placed',
          items            : orderItems,
          subtotal,
          discount_amount  : discount,
          tax_amount       : tax,
          shipping_fee     : shipping,
          total_amount     : total,
          coupon_code      : coupon?.code || null,
        });
      } catch (e) {
        if (e.code === 11000) { attempts++; continue; } // duplicate order_number — retry
        throw e;
      }
    }

    if (!order) throw new Error('Could not generate a unique order number');

    // 7. Decrement variant.quantity AND product.stock for each item
    const Product = require('../../models/product');
    for (const i of validItems) {
      // decrement the variant's own quantity
      await Variant.findByIdAndUpdate(i.variant_id._id, {
        $inc: { quantity: -i.quantity },
      });
      // keep product.stock aggregate in sync (what admin list shows)
      await Product.findByIdAndUpdate(i.product_id._id, {
        $inc: { stock: -i.quantity },
      });
    }

    // 8. Clear the cart
    await CartItem.deleteMany({ cart_id: cart._id });
    await Cart.findByIdAndUpdate(cart._id, {
      items           : [],
      subtotal        : 0,
      applied_coupon  : { code: null, discount_value: null },
    });

    // 9. Redirect to success page
    res.redirect(`/checkout/success/${order._id}`);
  } catch (err) {
    console.error('placeOrder error:', err);
    res.status(500).render('user/error', { message: 'Could not place your order. Please try again.' });
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
