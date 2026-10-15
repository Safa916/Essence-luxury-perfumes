const Brand   = require('../../models/brands');
const Product = require('../../models/product');

// ── helpers ──────────────────────────────────────────────────────────────────
function slugify(str) {
  return str.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

// ── GET /admin/brands ─────────────────────────────────────────────────────────
exports.listBrands = async (req, res) => {
  try {
    const search = (req.query.search || '').trim();
    const page   = Math.max(1, parseInt(req.query.page) || 1);
    const limit  = 8;

    const filter = search ? { name: { $regex: search, $options: 'i' } } : {};

    const [brandsRaw, totalCount, totalBrands, activeBrands] = await Promise.all([
      Brand.find(filter).sort({ _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Brand.countDocuments(filter),
      Brand.countDocuments({}),
      Brand.countDocuments({ is_active: true }),
    ]);

    // Count products per brand
    const brandIds = brandsRaw.map(b => b._id);
    const productCounts = await Product.aggregate([
      { $match: { brand_id: { $in: brandIds }, is_deleted: { $ne: true } } },
      { $group: { _id: '$brand_id', count: { $sum: 1 } } },
    ]);
    const countMap = {};
    productCounts.forEach(p => { countMap[p._id.toString()] = p.count; });

    const brands = brandsRaw.map(b => ({
      ...b,
      productCount: countMap[b._id.toString()] || 0,
    }));

    const totalPages = Math.ceil(totalCount / limit);

    res.render('admin/brands/list', {
      activePage: 'brand',
      admin: req.admin,
      brands,
      totalBrands,
      activeBrands,
      totalCount,
      currentPage: page,
      totalPages,
      search,
    });
  } catch (err) {
    console.error('listBrands error:', err);
    res.status(500).send('Server error');
  }
};

// ── GET /admin/brands/add ─────────────────────────────────────────────────────
exports.renderAdd = (req, res) => {
  res.render('admin/brands/add', { activePage: 'brand', admin: req.admin, errors: [] });
};

// ── POST /admin/brands/add ────────────────────────────────────────────────────
exports.createBrand = async (req, res) => {
  try {
    const { name, tagline, is_active } = req.body;
    const errors = [];

    if (!name || !name.trim()) errors.push('Brand name is required.');

    // Slug uniqueness check
    const slug = slugify(name || '');
    const existing = await Brand.findOne({ slug });
    if (existing) errors.push('A brand with this name already exists.');

    if (errors.length) {
      return res.render('admin/brands/add', { activePage: 'brand', admin: req.admin, errors });
    }

    await Brand.create({
      name: name.trim(),
      slug,
      tagline: (tagline || '').trim(),
      is_active: is_active === 'on' || is_active === 'true' || is_active === true,
    });

    res.redirect('/admin/brands');
  } catch (err) {
    console.error('createBrand error:', err);
    res.status(500).send('Server error');
  }
};

// ── GET /admin/brands/:id/edit ────────────────────────────────────────────────
exports.renderEdit = async (req, res) => {
  try {
    const brand = await Brand.findById(req.params.id).lean();
    if (!brand) return res.status(404).send('Brand not found');
    res.render('admin/brands/edit', { activePage: 'brand', admin: req.admin, brand, errors: [] });
  } catch (err) {
    console.error('renderEdit error:', err);
    res.status(500).send('Server error');
  }
};

// ── POST /admin/brands/:id/edit ───────────────────────────────────────────────
exports.updateBrand = async (req, res) => {
  try {
    const brand = await Brand.findById(req.params.id);
    if (!brand) return res.status(404).send('Brand not found');

    const { name, tagline, is_active } = req.body;
    const errors = [];

    if (!name || !name.trim()) errors.push('Brand name is required.');

    if (errors.length) {
      return res.render('admin/brands/edit', {
        activePage: 'brand', admin: req.admin,
        brand: brand.toObject(), errors,
      });
    }

    const newSlug = slugify(name);
    const conflict = await Brand.findOne({ slug: newSlug, _id: { $ne: brand._id } });
    if (conflict) {
      return res.render('admin/brands/edit', {
        activePage: 'brand', admin: req.admin,
        brand: brand.toObject(),
        errors: ['Another brand with this name already exists.'],
      });
    }

    brand.name      = name.trim();
    brand.slug      = newSlug;
    brand.tagline   = (tagline || '').trim();
    brand.is_active = is_active === 'on' || is_active === 'true' || is_active === true;

    await brand.save();
    res.redirect('/admin/brands');
  } catch (err) {
    console.error('updateBrand error:', err);
    res.status(500).send('Server error');
  }
};

// ── POST /admin/brands/:id/toggle ─────────────────────────────────────────────
exports.toggleBrand = async (req, res) => {
  try {
    const brand = await Brand.findById(req.params.id);
    if (!brand) return res.status(404).json({ success: false });
    brand.is_active = !brand.is_active;
    await brand.save();
    res.json({ success: true, is_active: brand.is_active });
  } catch (err) {
    console.error('toggleBrand error:', err);
    res.status(500).json({ success: false });
  }
};

// ── POST /admin/brands/:id/delete ─────────────────────────────────────────────
exports.deleteBrand = async (req, res) => {
  try {
    await Brand.findByIdAndDelete(req.params.id);
    res.redirect('/admin/brands');
  } catch (err) {
    console.error('deleteBrand error:', err);
    res.status(500).send('Server error');
  }
};
