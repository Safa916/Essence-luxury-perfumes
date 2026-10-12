const Coupon      = require('../../models/coupon');
const CouponUsage = require('../../models/couponUsage');
const mongoose    = require('mongoose');

function toNum(v) {
  if (v == null) return 0;
  return parseFloat(v.toString());
}

// ─── GET /admin/coupons ───────────────────────────────────────────────────────
exports.listCoupons = async (req, res) => {
  try {
    const page    = Math.max(1, parseInt(req.query.page) || 1);
    const limit   = 8;
    const search  = (req.query.search || '').trim().toUpperCase();

    const filter = search ? { code: { $regex: search, $options: 'i' } } : {};

    const [coupons, total] = await Promise.all([
      Coupon.find(filter).sort({ _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Coupon.countDocuments(filter),
    ]);

    // Attach usage count to each coupon
    const couponIds   = coupons.map(c => c._id);
    const usageCounts = await CouponUsage.aggregate([
      { $match: { coupon_id: { $in: couponIds } } },
      { $group: { _id: '$coupon_id', count: { $sum: 1 } } },
    ]);
    const usageMap = {};
    usageCounts.forEach(u => { usageMap[u._id.toString()] = u.count; });

    const enriched = coupons.map(c => ({
      ...c,
      used_count: usageMap[c._id.toString()] || 0,
      discount_value     : toNum(c.discount_value),
      min_order_value    : toNum(c.min_order_value),
      max_discount_amount: toNum(c.max_discount_amount),
    }));

    res.render('admin/coupons/list', {
      coupons    : enriched,
      page,
      totalPages : Math.ceil(total / limit),
      total,
      search,
      query      : req.query,
    });
  } catch (err) {
    console.error('listCoupons error:', err);
    res.status(500).send('Server error');
  }
};

// ─── POST /admin/coupons ──────────────────────────────────────────────────────
exports.createCoupon = async (req, res) => {
  try {
    const { code, description, discount_type, discount_value,
            min_order_value, max_discount_amount, valid_until, is_active } = req.body;

    await Coupon.create({
      code               : (code || '').trim().toUpperCase(),
      description        : (description || '').trim(),
      discount_type,
      discount_value     : parseFloat(discount_value),
      min_order_value    : parseFloat(min_order_value) || 0,
      max_discount_amount: max_discount_amount ? parseFloat(max_discount_amount) : null,
      valid_until        : valid_until || null,
      is_active          : is_active === 'true' || is_active === true || is_active === 'on',
    });

    res.redirect('/admin/coupons?created=1');
  } catch (err) {
    console.error('createCoupon error:', err);
    // Duplicate code
    if (err.code === 11000) {
      return res.redirect('/admin/coupons?error=duplicate');
    }
    res.redirect('/admin/coupons?error=1');
  }
};

// ─── GET /admin/coupons/:id/edit ──────────────────────────────────────────────
exports.renderEditCoupon = async (req, res) => {
  try {
    const coupon = await Coupon.findById(req.params.id).lean();
    if (!coupon) return res.redirect('/admin/coupons');

    res.render('admin/coupons/edit', {
      coupon: {
        ...coupon,
        discount_value     : toNum(coupon.discount_value),
        min_order_value    : toNum(coupon.min_order_value),
        max_discount_amount: toNum(coupon.max_discount_amount),
        valid_until        : coupon.valid_until
          ? new Date(coupon.valid_until).toISOString().split('T')[0]
          : '',
      },
    });
  } catch (err) {
    console.error('renderEditCoupon error:', err);
    res.redirect('/admin/coupons');
  }
};

// ─── POST /admin/coupons/:id/edit ─────────────────────────────────────────────
exports.updateCoupon = async (req, res) => {
  try {
    const { description, discount_type, discount_value,
            min_order_value, max_discount_amount, valid_until, is_active } = req.body;

    await Coupon.findByIdAndUpdate(req.params.id, {
      description        : (description || '').trim(),
      discount_type,
      discount_value     : parseFloat(discount_value),
      min_order_value    : parseFloat(min_order_value) || 0,
      max_discount_amount: max_discount_amount ? parseFloat(max_discount_amount) : null,
      valid_until        : valid_until || null,
      is_active          : is_active === 'true' || is_active === true || is_active === 'on',
    });

    res.redirect('/admin/coupons?updated=1');
  } catch (err) {
    console.error('updateCoupon error:', err);
    res.redirect('/admin/coupons?error=1');
  }
};

// ─── DELETE /admin/coupons/:id ────────────────────────────────────────────────
exports.deleteCoupon = async (req, res) => {
  try {
    await Coupon.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error('deleteCoupon error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ─── POST /admin/coupons/:id/toggle ──────────────────────────────────────────
exports.toggleCoupon = async (req, res) => {
  try {
    const coupon = await Coupon.findById(req.params.id);
    if (!coupon) return res.status(404).json({ success: false });
    coupon.is_active = !coupon.is_active;
    await coupon.save();
    res.json({ success: true, is_active: coupon.is_active });
  } catch (err) {
    console.error('toggleCoupon error:', err);
    res.status(500).json({ success: false });
  }
};
