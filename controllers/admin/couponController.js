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
      usage_limit_per_user: c.usage_limit_per_user || 1,
      total_usage_limit  : c.total_usage_limit || null,
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
            min_order_value, max_discount_amount, valid_until,
            usage_limit_per_user, total_usage_limit, is_active } = req.body;

    // ── Server-side validation ──────────────────────────────────────────────
    const cleanCode = (code || '').trim().toUpperCase();
    const cleanDesc = (description || '').trim();
    const cleanType = discount_type === 'fixed' ? 'fixed' : 'percentage';
    const dv        = parseFloat(discount_value);
    const mov       = min_order_value !== '' && min_order_value != null ? parseFloat(min_order_value) : 0;
    const maxCap    = max_discount_amount ? parseFloat(max_discount_amount) : null;

    // 1. Code validation
    const codeAlphanum = cleanCode.replace(/[^A-Z0-9]/g, '').length;
    if (
      !cleanCode ||
      cleanCode.length < 3 ||
      cleanCode.length > 15 ||
      codeAlphanum < 3 ||
      !/^[A-Z0-9]+([-_][A-Z0-9]+)*$/.test(cleanCode)
    ) {
      return res.redirect('/admin/coupons?error=invalid_code&open=add');
    }

    // 2. Description validation
    const descAlphanum = cleanDesc.replace(/[^a-zA-Z0-9]/g, '').length;
    if (!cleanDesc || cleanDesc.length < 3 || cleanDesc.length > 100 || descAlphanum < 3) {
      return res.redirect('/admin/coupons?error=invalid_desc&open=add');
    }

    // 3. Discount value validation
    if (isNaN(dv) || dv <= 0) {
      return res.redirect('/admin/coupons?error=invalid_value&open=add');
    }
    if (cleanType === 'percentage' && dv > 100) {
      return res.redirect('/admin/coupons?error=invalid_value&open=add');
    }

    // 4. Min order value validation
    if (isNaN(mov) || mov < 0) {
      return res.redirect('/admin/coupons?error=invalid_min_order&open=add');
    }
    if (cleanType === 'fixed' && mov > 0 && dv >= mov) {
      return res.redirect('/admin/coupons?error=fixed_gt_min&open=add');
    }

    // 5. Max discount cap validation (required for percentage discounts)
    if (cleanType === 'percentage') {
      if (maxCap == null || isNaN(maxCap) || maxCap <= 0) {
        return res.redirect('/admin/coupons?error=invalid_max_cap&open=add');
      }
    }

    // 6. Usage limit per user validation
    const userLimit = usage_limit_per_user ? parseInt(usage_limit_per_user, 10) : 1;
    if (isNaN(userLimit) || userLimit < 1) {
      return res.redirect('/admin/coupons?error=invalid_limit&open=add');
    }

    // 7. Total usage limit validation (optional)
    let cleanTotalLimit = null;
    if (total_usage_limit !== undefined && total_usage_limit !== '' && total_usage_limit !== null) {
      cleanTotalLimit = parseInt(total_usage_limit, 10);
      if (isNaN(cleanTotalLimit) || cleanTotalLimit < 1) {
        return res.redirect('/admin/coupons?error=invalid_total_limit&open=add');
      }
    }

    // 8. Expiry date validation
    let expDate = null;
    if (valid_until) {
      expDate = new Date(valid_until);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (isNaN(expDate.getTime()) || expDate < today) {
        return res.redirect('/admin/coupons?error=invalid_date&open=add');
      }
    }
    // ────────────────────────────────────────────────────────────────────────

    await Coupon.create({
      code               : cleanCode,
      description        : cleanDesc,
      discount_type      : cleanType,
      discount_value     : dv,
      min_order_value    : mov,
      max_discount_amount: cleanType === 'percentage' ? maxCap : null,
      valid_until        : expDate,
      usage_limit_per_user: userLimit,
      total_usage_limit  : cleanTotalLimit,
      is_active          : is_active === 'true' || is_active === true || is_active === 'on',
    });

    res.redirect('/admin/coupons?created=1');
  } catch (err) {
    console.error('createCoupon error:', err);
    // Duplicate code
    if (err.code === 11000) {
      return res.redirect('/admin/coupons?error=duplicate&open=add');
    }
    res.redirect('/admin/coupons?error=1&open=add');
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
        usage_limit_per_user: coupon.usage_limit_per_user || 1,
        total_usage_limit  : coupon.total_usage_limit || null,
        valid_until        : coupon.valid_until
          ? new Date(coupon.valid_until).toISOString().split('T')[0]
          : '',
      },
      query: req.query,
    });
  } catch (err) {
    console.error('renderEditCoupon error:', err);
    res.redirect('/admin/coupons');
  }
};

// ─── POST /admin/coupons/:id/edit ─────────────────────────────────────────────
exports.updateCoupon = async (req, res) => {
  const couponId = req.params.id;
  try {
    const { description, discount_type, discount_value,
            min_order_value, max_discount_amount, valid_until,
            usage_limit_per_user, total_usage_limit, is_active } = req.body;

    const cleanDesc = (description || '').trim();
    const cleanType = discount_type === 'fixed' ? 'fixed' : 'percentage';
    const dv        = parseFloat(discount_value);
    const mov       = min_order_value !== '' && min_order_value != null ? parseFloat(min_order_value) : 0;
    const maxCap    = max_discount_amount ? parseFloat(max_discount_amount) : null;

    // 1. Description validation
    const descAlphanum = cleanDesc.replace(/[^a-zA-Z0-9]/g, '').length;
    if (!cleanDesc || cleanDesc.length < 3 || cleanDesc.length > 100 || descAlphanum < 3) {
      return res.redirect(`/admin/coupons/${couponId}/edit?error=invalid_desc`);
    }

    // 2. Discount value validation
    if (isNaN(dv) || dv <= 0) {
      return res.redirect(`/admin/coupons/${couponId}/edit?error=invalid_value`);
    }
    if (cleanType === 'percentage' && dv > 100) {
      return res.redirect(`/admin/coupons/${couponId}/edit?error=invalid_value`);
    }

    // 3. Min order value validation
    if (isNaN(mov) || mov < 0) {
      return res.redirect(`/admin/coupons/${couponId}/edit?error=invalid_min_order`);
    }
    if (cleanType === 'fixed' && mov > 0 && dv >= mov) {
      return res.redirect(`/admin/coupons/${couponId}/edit?error=fixed_gt_min`);
    }

    // 4. Max discount cap validation
    if (cleanType === 'percentage') {
      if (maxCap == null || isNaN(maxCap) || maxCap <= 0) {
        return res.redirect(`/admin/coupons/${couponId}/edit?error=invalid_max_cap`);
      }
    }

    // 5. Usage limit per user validation
    const userLimit = usage_limit_per_user ? parseInt(usage_limit_per_user, 10) : 1;
    if (isNaN(userLimit) || userLimit < 1) {
      return res.redirect(`/admin/coupons/${couponId}/edit?error=invalid_limit`);
    }

    // 6. Total usage limit validation (optional)
    let cleanTotalLimit = null;
    if (total_usage_limit !== undefined && total_usage_limit !== '' && total_usage_limit !== null) {
      cleanTotalLimit = parseInt(total_usage_limit, 10);
      if (isNaN(cleanTotalLimit) || cleanTotalLimit < 1) {
        return res.redirect(`/admin/coupons/${couponId}/edit?error=invalid_total_limit`);
      }
    }

    // 7. Expiry date validation
    let expDate = null;
    if (valid_until) {
      expDate = new Date(valid_until);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (isNaN(expDate.getTime()) || expDate < today) {
        return res.redirect(`/admin/coupons/${couponId}/edit?error=invalid_date`);
      }
    }

  

    await Coupon.findByIdAndUpdate(couponId, {
      description        : cleanDesc,
      discount_type      : cleanType,
      discount_value     : dv,
      min_order_value    : mov,
      max_discount_amount: cleanType === 'percentage' ? maxCap : null,
      valid_until        : expDate,
      usage_limit_per_user: userLimit,
      total_usage_limit  : cleanTotalLimit,
      is_active          : is_active === 'true' || is_active === true || is_active === 'on',
    });

    res.redirect('/admin/coupons?updated=1');
  } catch (err) {
    console.error('updateCoupon error:', err);
    res.redirect(`/admin/coupons/${couponId}/edit?error=1`);
  }
};

// ─── DELETE /admin/coupons/:id ────────────────────────────────────────────────
exports.deleteCoupon = async (req, res) => {
  try {
    await Coupon.findByIdAndDelete(req.params.id);
    await CouponUsage.deleteMany({ coupon_id: req.params.id });
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
