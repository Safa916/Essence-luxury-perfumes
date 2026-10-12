const Cart       = require('../../models/cart');
const Coupon     = require('../../models/coupon');
const CouponUsage = require('../../models/couponUsage');

// ─── helpers ──────────────────────────────────────────────────────────────────
const GST_RATE         = 0.18;
const FREE_SHIPPING_AT = 2000;
const SHIPPING_FEE     = 99;

function toNum(v) {
  if (v == null) return 0;
  return parseFloat(v.toString());
}

// Recalculate all totals given subtotal + discount value
function calcTotals(subtotal, discountValue) {
  const discount = Math.min(discountValue, subtotal); // can't discount more than subtotal
  const taxable  = Math.max(subtotal - discount, 0);
  const tax      = parseFloat((taxable * GST_RATE).toFixed(2));
  const shipping = taxable >= FREE_SHIPPING_AT ? 0 : SHIPPING_FEE;
  const total    = parseFloat((taxable + tax + shipping).toFixed(2));
  return { discount, tax, shipping, total };
}

// ─── POST /coupon/apply ───────────────────────────────────────────────────────
exports.applyCoupon = async (req, res) => {
  try {
    const userId = req.user._id;
    const code   = (req.body.code || '').trim().toUpperCase();

    if (!code) {
      return res.status(400).json({ success: false, message: 'Please enter a coupon code.' });
    }

    // 1. Find the coupon
    const coupon = await Coupon.findOne({ code, is_active: true });
    if (!coupon) {
      return res.status(404).json({ success: false, message: 'Invalid or expired coupon code.' });
    }

    // 2. Check expiry
    if (coupon.valid_until && new Date(coupon.valid_until) < new Date()) {
      return res.status(400).json({ success: false, message: 'This coupon has expired.' });
    }

    // 3. Get cart subtotal
    const cart = await Cart.findOne({ user_id: userId }).lean();
    if (!cart) {
      return res.status(400).json({ success: false, message: 'Your cart is empty.' });
    }

    // 4. Minimum order check
    const minOrder = toNum(coupon.min_order_value);
    // cart.subtotal may not be accurate — we trust the checkout controller to set it,
    // so we re-read subtotal from CartItems via the existing field on cart
    // (cart.items is just refs; the reliable value is in CartItem total_price sums)
    // For simplicity we use cart's stored subtotal if present, else 0
    // The renderCheckout already calculates it — we do a quick re-calc here
    const CartItem = require('../../models/cartItem');
    const rawItems = await CartItem.find({ cart_id: cart._id }).lean();
    const subtotal = rawItems.reduce((s, i) => s + toNum(i.total_price), 0);

    if (subtotal < minOrder) {
      return res.status(400).json({
        success: false,
        message: `Minimum order value for this coupon is ₹${minOrder.toLocaleString('en-IN')}.`,
      });
    }

    // 5. Check if this user already used this coupon on a completed order
    const alreadyUsed = await CouponUsage.findOne({ coupon_id: coupon._id, user_id: userId });
    if (alreadyUsed) {
      return res.status(400).json({ success: false, message: 'You have already used this coupon.' });
    }

    // 6. Calculate discount
    let discountValue = 0;
    if (coupon.discount_type === 'percentage') {
      discountValue = parseFloat(((subtotal * toNum(coupon.discount_value)) / 100).toFixed(2));
      const cap = toNum(coupon.max_discount_amount);
      if (cap > 0 && discountValue > cap) discountValue = cap;
    } else {
      // fixed
      discountValue = toNum(coupon.discount_value);
    }

    // 7. Save applied coupon to cart
    await Cart.findByIdAndUpdate(cart._id, {
      $set: {
        applied_coupon: {
          code           : coupon.code,
          discount_value : discountValue,
        },
      },
    });

    // 8. Return new totals for the frontend to update the summary live
    const totals = calcTotals(subtotal, discountValue);

    return res.json({
      success       : true,
      message       : `Coupon "${coupon.code}" applied! You saved ₹${discountValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}.`,
      couponCode    : coupon.code,
      discount      : totals.discount,
      tax           : totals.tax,
      shipping      : totals.shipping,
      total         : totals.total,
      subtotal,
    });
  } catch (err) {
    console.error('applyCoupon error:', err);
    return res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
  }
};

// ─── DELETE /coupon/remove ────────────────────────────────────────────────────
exports.removeCoupon = async (req, res) => {
  try {
    const userId = req.user._id;

    const cart = await Cart.findOne({ user_id: userId });
    if (!cart) {
      return res.status(400).json({ success: false, message: 'Cart not found.' });
    }

    // Clear the applied coupon
    await Cart.findByIdAndUpdate(cart._id, {
      $set: { applied_coupon: { code: null, discount_value: null } },
    });

    // Recalculate totals with zero discount
    const CartItem = require('../../models/cartItem');
    const rawItems = await CartItem.find({ cart_id: cart._id }).lean();
    const subtotal = rawItems.reduce((s, i) => s + toNum(i.total_price), 0);
    const totals   = calcTotals(subtotal, 0);

    return res.json({
      success  : true,
      message  : 'Coupon removed.',
      discount : 0,
      tax      : totals.tax,
      shipping : totals.shipping,
      total    : totals.total,
      subtotal,
    });
  } catch (err) {
    console.error('removeCoupon error:', err);
    return res.status(500).json({ success: false, message: 'Something went wrong.' });
  }
};
