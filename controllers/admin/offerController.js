import Offer from '../../models/offer.js';
import Product from '../../models/product.js';
import Category from '../../models/category.js';
import mongoose from 'mongoose';

function toNum(d) {
  if (d == null) return 0;
  return parseFloat(d.toString());
}

const PER_PAGE = 10;

// ─── GET /admin/offers ────────────────────────────────────────────────────────
export const listOffers = async (req, res) => {
  try {
    const { search = '', type = 'all', status = 'all', page = 1 } = req.query;
    const currentPage = Math.max(1, parseInt(page, 10) || 1);

    const query = { deleted_at: null };

    if (search.trim()) {
      const q = search.trim();
      query.$or = [
        { name: { $regex: q, $options: 'i' } },
        { internal_code: { $regex: q, $options: 'i' } },
      ];
    }

    if (type !== 'all' && ['product', 'category'].includes(type)) {
      query.apply_to = type;
    }

    const now = new Date();
    if (status === 'active') {
      query.status = 'active';
      query.$and = (query.$and || []).concat([
        { $or: [{ end_date: null }, { end_date: { $gte: now } }] },
      ]);
    } else if (status === 'expired') {
      query.$and = (query.$and || []).concat([
        { $or: [{ status: 'expired' }, { end_date: { $lt: now } }] },
      ]);
    } else if (status === 'draft') {
      query.status = 'draft';
      query.$and = (query.$and || []).concat([
        { $or: [{ end_date: null }, { end_date: { $gte: now } }] },
      ]);
    } else if (status !== 'all' && ['paused'].includes(status)) {
      query.status = status;
    }

    const total = await Offer.countDocuments(query);
    const totalPages = Math.ceil(total / PER_PAGE) || 1;
    const safePage = Math.min(currentPage, totalPages);

    const offersRaw = await Offer.find(query)
      .sort({ created_at: -1 })
      .skip((safePage - 1) * PER_PAGE)
      .limit(PER_PAGE)
      .lean();

    // Populate target items (product or category names)
    const productIds = [];
    const categoryIds = [];
    offersRaw.forEach((o) => {
      (o.target_ids || []).forEach((id) => {
        if (o.apply_to === 'product') productIds.push(id);
        else if (o.apply_to === 'category') categoryIds.push(id);
      });
    });

    const [products, categories] = await Promise.all([
      productIds.length ? Product.find({ _id: { $in: productIds } }).select('name').lean() : [],
      categoryIds.length ? Category.find({ _id: { $in: categoryIds } }).select('name').lean() : [],
    ]);

    const productMap = new Map(products.map((p) => [p._id.toString(), p.name]));
    const categoryMap = new Map(categories.map((c) => [c._id.toString(), c.name]));
    const offers = offersRaw.map((o) => {
      const targetNames = (o.target_ids || []).map((id) => {
        const idStr = id.toString();
        return o.apply_to === 'product' ? (productMap.get(idStr) || 'Unknown Product') : (categoryMap.get(idStr) || 'Unknown Category');
      });

      const isExpired = o.end_date && new Date(o.end_date) < now;
      let effectiveStatus = o.status;
      if (isExpired) {
        effectiveStatus = 'expired';
      }

      return {
        _id: o._id,
        name: o.name,
        internal_code: o.internal_code || '',
        apply_to: o.apply_to,
        targets: targetNames.join(', ') || 'All',
        targetCount: (o.target_ids || []).length,
        discount_type: o.discount_type,
        discount_value: toNum(o.discount_value),
        minimum_purchase_amount: toNum(o.minimum_purchase_amount),
        maximum_discount_amount: toNum(o.maximum_discount_amount),
        start_date: o.start_date,
        end_date: o.end_date,
        status: effectiveStatus,
        raw_status: o.status,
      };
    });

    // Also get all products & categories for modal / dropdown
    const [allProducts, allCategories] = await Promise.all([
      Product.find({ is_active: true, is_deleted: { $ne: true } }).select('name').sort({ name: 1 }).lean(),
      Category.find({ is_active: true, is_deleted: { $ne: true } }).select('name').sort({ name: 1 }).lean(),
    ]);

    res.render('admin/offers/list', {
      offers,
      total,
      currentPage: safePage,
      totalPages,
      query: req.query,
      allProducts,
      allCategories,
      activePage: 'offers',
    });
  } catch (err) {
    console.error('listOffers error:', err);
    res.redirect('/admin/dashboard');
  }
};

// ─── POST /admin/offers ───────────────────────────────────────────────────────
export const createOffer = async (req, res) => {
  try {
    const {
      name,
      internal_code,
      discount_value,
      apply_to,
      target_id,
      minimum_purchase_amount,
      maximum_discount_amount,
      start_date,
      end_date,
      status,
    } = req.body;

    // Name validations
    const trimmedName = (name || '').trim();
    if (!trimmedName) {
      return res.redirect('/admin/offers?error=name_required');
    }
    if (trimmedName.length < 3 || trimmedName.length > 100) {
      return res.redirect('/admin/offers?error=name_length');
    }
    if (!/[a-zA-Z]/.test(trimmedName)) {
      return res.redirect('/admin/offers?error=name_invalid');
    }

    // Discount value validation
    const val = parseFloat(discount_value);
    if (isNaN(val) || val <= 0 || val > 90) {
      return res.redirect('/admin/offers?error=percentage_out_of_range');
    }

    // Apply to & Target validations
    if (!['product', 'category'].includes(apply_to)) {
      return res.redirect('/admin/offers?error=invalid_apply_to');
    }

    if (!target_id || !mongoose.Types.ObjectId.isValid(target_id)) {
      return res.redirect('/admin/offers?error=target_required');
    }

    // Purchase & discount amount validations
    const minPurchase = minimum_purchase_amount !== undefined && minimum_purchase_amount !== ''
      ? parseFloat(minimum_purchase_amount)
      : 0;
    if (isNaN(minPurchase) || minPurchase < 0) {
      return res.redirect('/admin/offers?error=min_purchase_invalid');
    }

    let maxDiscount = null;
    if (maximum_discount_amount !== undefined && maximum_discount_amount !== '') {
      maxDiscount = parseFloat(maximum_discount_amount);
      if (isNaN(maxDiscount) || maxDiscount <= 0) {
        return res.redirect('/admin/offers?error=max_discount_invalid');
      }
    }

    // Date validations
    let startDateObj = start_date ? new Date(start_date) : null;
    let endDateObj = end_date ? new Date(end_date) : null;

    if (startDateObj && isNaN(startDateObj.getTime())) {
      return res.redirect('/admin/offers?error=invalid_dates');
    }
    if (endDateObj && isNaN(endDateObj.getTime())) {
      return res.redirect('/admin/offers?error=invalid_dates');
    }
    if (startDateObj && endDateObj && endDateObj < startDateObj) {
      return res.redirect('/admin/offers?error=invalid_dates');
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (startDateObj && startDateObj < today) {
      return res.redirect('/admin/offers?error=start_date_past');
    }
    if (endDateObj && endDateObj < today) {
      return res.redirect('/admin/offers?error=end_date_past');
    }

    const isActive = status === 'active' || status === 'true' || status === true || status === '1';

    const code = (internal_code || '').trim().toUpperCase() || `OFF-${Date.now().toString(36).toUpperCase()}`;

    // Check duplicate code
    const existingCode = await Offer.findOne({ internal_code: code, deleted_at: null });
    if (existingCode) {
      return res.redirect('/admin/offers?error=code_exists');
    }

    // If activating an offer for a target, deactivate any older active offers on that same target
    if (isActive) {
      await Offer.updateMany(
        {
          apply_to,
          target_ids: new mongoose.Types.ObjectId(target_id),
          status: 'active',
          deleted_at: null,
        },
        { $set: { status: 'draft' } }
      );
    }

    await Offer.create({
      name: trimmedName,
      internal_code: code,
      discount_type: 'percentage',
      discount_value: val,
      apply_to,
      target_ids: [new mongoose.Types.ObjectId(target_id)],
      minimum_purchase_amount: minPurchase,
      maximum_discount_amount: maxDiscount,
      start_date: startDateObj,
      end_date: endDateObj,
      status: isActive ? 'active' : 'draft',
    });

    res.redirect('/admin/offers?success=created');
  } catch (err) {
    console.error('createOffer error:', err);
    res.redirect('/admin/offers?error=failed');
  }
};

// ─── GET /admin/offers/:id/edit ───────────────────────────────────────────────
export const renderEditOffer = async (req, res) => {
  try {
    const offer = await Offer.findOne({ _id: req.params.id, deleted_at: null }).lean();
    if (!offer) {
      return res.redirect('/admin/offers?error=not_found');
    }

    const [allProducts, allCategories] = await Promise.all([
      Product.find({ is_active: true, is_deleted: { $ne: true } }).select('name').sort({ name: 1 }).lean(),
      Category.find({ is_active: true, is_deleted: { $ne: true } }).select('name').sort({ name: 1 }).lean(),
    ]);

    const targetId = (offer.target_ids && offer.target_ids[0]) ? offer.target_ids[0].toString() : '';

    res.render('admin/offers/edit', {
      offer: {
        ...offer,
        discount_value: toNum(offer.discount_value),
        minimum_purchase_amount: toNum(offer.minimum_purchase_amount),
        maximum_discount_amount: toNum(offer.maximum_discount_amount),
        target_id: targetId,
        start_date_str: offer.start_date ? new Date(offer.start_date).toISOString().split('T')[0] : '',
        end_date_str: offer.end_date ? new Date(offer.end_date).toISOString().split('T')[0] : '',
      },
      allProducts,
      allCategories,
      activePage: 'offers',
      query: req.query,
    });
  } catch (err) {
    console.error('renderEditOffer error:', err);
    res.redirect('/admin/offers');
  }
};

// ─── POST /admin/offers/:id/edit ──────────────────────────────────────────────
export const updateOffer = async (req, res) => {
  try {
    const offer = await Offer.findOne({ _id: req.params.id, deleted_at: null });
    if (!offer) {
      return res.redirect('/admin/offers?error=not_found');
    }

    const {
      name,
      internal_code,
      discount_value,
      apply_to,
      target_id,
      minimum_purchase_amount,
      maximum_discount_amount,
      start_date,
      end_date,
      status,
    } = req.body;

    // Name validations
    const trimmedName = (name || '').trim();
    if (!trimmedName) {
      return res.redirect(`/admin/offers/${req.params.id}/edit?error=name_required`);
    }
    if (trimmedName.length < 3 || trimmedName.length > 100) {
      return res.redirect(`/admin/offers/${req.params.id}/edit?error=name_length`);
    }
    if (!/[a-zA-Z]/.test(trimmedName)) {
      return res.redirect(`/admin/offers/${req.params.id}/edit?error=name_invalid`);
    }

    // Discount value validation
    const val = parseFloat(discount_value);
    if (isNaN(val) || val <= 0 || val > 90) {
      return res.redirect(`/admin/offers/${req.params.id}/edit?error=percentage_out_of_range`);
    }

    // Target validation
    if (!target_id || !mongoose.Types.ObjectId.isValid(target_id)) {
      return res.redirect(`/admin/offers/${req.params.id}/edit?error=target_required`);
    }

    // Purchase & discount amount validations
    const minPurchase = minimum_purchase_amount !== undefined && minimum_purchase_amount !== ''
      ? parseFloat(minimum_purchase_amount)
      : 0;
    if (isNaN(minPurchase) || minPurchase < 0) {
      return res.redirect(`/admin/offers/${req.params.id}/edit?error=min_purchase_invalid`);
    }

    let maxDiscount = null;
    if (maximum_discount_amount !== undefined && maximum_discount_amount !== '') {
      maxDiscount = parseFloat(maximum_discount_amount);
      if (isNaN(maxDiscount) || maxDiscount <= 0) {
        return res.redirect(`/admin/offers/${req.params.id}/edit?error=max_discount_invalid`);
      }
    }

    // Date validations
    let startDateObj = start_date ? new Date(start_date) : null;
    let endDateObj = end_date ? new Date(end_date) : null;

    if (startDateObj && isNaN(startDateObj.getTime())) {
      return res.redirect(`/admin/offers/${req.params.id}/edit?error=invalid_dates`);
    }
    if (endDateObj && isNaN(endDateObj.getTime())) {
      return res.redirect(`/admin/offers/${req.params.id}/edit?error=invalid_dates`);
    }
    if (startDateObj && endDateObj && endDateObj < startDateObj) {
      return res.redirect(`/admin/offers/${req.params.id}/edit?error=invalid_dates`);
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const prevStartStr = offer.start_date ? new Date(offer.start_date).toISOString().split('T')[0] : '';
    const newStartStr = start_date || '';
    if (newStartStr && newStartStr !== prevStartStr && startDateObj && startDateObj < today) {
      return res.redirect(`/admin/offers/${req.params.id}/edit?error=start_date_past`);
    }
    if (endDateObj && endDateObj < today) {
      return res.redirect(`/admin/offers/${req.params.id}/edit?error=end_date_past`);
    }

    const isActive = status === 'active' || status === 'true' || status === true || status === '1';

    const code = (internal_code || '').trim().toUpperCase();
    if (code && code !== offer.internal_code) {
      const existing = await Offer.findOne({ internal_code: code, _id: { $ne: offer._id }, deleted_at: null });
      if (existing) {
        return res.redirect(`/admin/offers/${req.params.id}/edit?error=code_exists`);
      }
      offer.internal_code = code;
    }

    if (isActive) {
      await Offer.updateMany(
        {
          _id: { $ne: offer._id },
          apply_to,
          target_ids: new mongoose.Types.ObjectId(target_id),
          status: 'active',
          deleted_at: null,
        },
        { $set: { status: 'draft' } }
      );
    }

    offer.name = trimmedName;
    offer.discount_type = 'percentage';
    offer.discount_value = val;
    offer.apply_to = apply_to;
    offer.target_ids = [new mongoose.Types.ObjectId(target_id)];
    offer.minimum_purchase_amount = minPurchase;
    offer.maximum_discount_amount = maxDiscount;
    offer.start_date = startDateObj;
    offer.end_date = endDateObj;
    offer.status = isActive ? 'active' : 'draft';

    await offer.save();

    res.redirect('/admin/offers?success=updated');
  } catch (err) {
    console.error('updateOffer error:', err);
    res.redirect(`/admin/offers/${req.params.id}/edit?error=failed`);
  }
};

// ─── POST /admin/offers/:id/toggle ───────────────────────────────────────────
export const toggleOffer = async (req, res) => {
  try {
    const offer = await Offer.findOne({ _id: req.params.id, deleted_at: null });
    if (!offer) {
      return res.status(404).json({ success: false, message: 'Offer not found' });
    }

    const now = new Date();
    const isExpired = offer.end_date && new Date(offer.end_date) < now;

    // If currently active, switch to draft
    if (offer.status === 'active') {
      offer.status = 'draft';
      await offer.save();
      return res.json({
        success: true,
        status: 'draft',
        message: 'Offer moved to draft.',
      });
    }

    // If attempting to activate an expired offer
    if (isExpired) {
      if (offer.status !== 'expired') {
        offer.status = 'expired';
        await offer.save();
      }
      return res.status(400).json({
        success: false,
        message: 'Cannot activate an expired offer. Please edit and extend the end date first.',
      });
    }

    // Deactivate other active offers on the same target(s) to avoid collisions
    let deactivatedIds = [];
    if (offer.target_ids && offer.target_ids.length > 0) {
      const conflicting = await Offer.find({
        _id: { $ne: offer._id },
        apply_to: offer.apply_to,
        target_ids: { $in: offer.target_ids },
        status: 'active',
        deleted_at: null,
      }).select('_id');
      deactivatedIds = conflicting.map((c) => c._id.toString());

      if (deactivatedIds.length > 0) {
        await Offer.updateMany(
          { _id: { $in: deactivatedIds } },
          { $set: { status: 'draft' } }
        );
      }
    }

    offer.status = 'active';
    await offer.save();

    return res.json({
      success: true,
      status: 'active',
      deactivatedIds,
      message: deactivatedIds.length > 0
        ? 'Offer activated. Conflicting active offer on the same target was moved to draft.'
        : 'Offer activated successfully.',
    });
  } catch (err) {
    console.error('toggleOffer error:', err);
    return res.status(500).json({ success: false, message: 'Failed to update status' });
  }
};

// ─── POST /admin/offers/:id/delete ────────────────────────────────────────────
export const deleteOffer = async (req, res) => {
  try {
    const offer = await Offer.findOne({ _id: req.params.id, deleted_at: null });
    if (!offer) {
      return res.redirect('/admin/offers?error=not_found');
    }

    offer.deleted_at = new Date();
    await offer.save();

    res.redirect('/admin/offers?success=deleted');
  } catch (err) {
    console.error('deleteOffer error:', err);
    res.redirect('/admin/offers?error=failed');
  }
};

export default {
  listOffers,
  createOffer,
  renderEditOffer,
  updateOffer,
  toggleOffer,
  deleteOffer
};
