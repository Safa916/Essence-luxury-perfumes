import Brand from '../../models/brands.js';
import Product from '../../models/product.js';
import { HTTP_STATUS } from '../../constants/httpStatus.js';

// ── helpers ──────────────────────────────────────────────────────────────────
function slugify(str) {
  return str.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

// ── GET /admin/brands ─────────────────────────────────────────────────────────
export const listBrands = async (req, res) => {
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
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send('Server error');
  }
};

// ── GET /admin/brands/add ─────────────────────────────────────────────────────
export const renderAdd = (req, res) => {
  res.render('admin/brands/add', {
    activePage: 'brand',
    admin: req.admin,
    errors: [],
    brand: { name: '', tagline: '', is_active: true },
  });
};

// ── POST /admin/brands/add ────────────────────────────────────────────────────
export const createBrand = async (req, res) => {
  try {
    const { name, tagline, is_active } = req.body;
    const errors = [];
    const trimmedName = (name || '').trim();
    const trimmedTagline = (tagline || '').trim();
    const activeBool = is_active === 'on' || is_active === 'true' || is_active === true;

    if (!trimmedName) {
      errors.push('Brand name is required.');
    } else if (trimmedName.length < 2) {
      errors.push('Brand name must be at least 2 characters long.');
    } else if (trimmedName.length > 50) {
      errors.push('Brand name cannot exceed 50 characters.');
    } else if (!/^[a-zA-Z0-9\s'&.-]+$/.test(trimmedName) || !/[a-zA-Z]/.test(trimmedName)) {
      errors.push("Brand name must contain letters and only valid characters (letters, numbers, spaces, &, ', ., -).");
    }

    if (trimmedTagline && trimmedTagline.length > 150) {
      errors.push('Brand tagline cannot exceed 150 characters.');
    }

    // Slug uniqueness check
    const slug = slugify(trimmedName);
    if (slug) {
      const existing = await Brand.findOne({ slug });
      if (existing) {
        errors.push('A brand with this name already exists.');
      }
    }

    if (errors.length) {
      return res.render('admin/brands/add', {
        activePage: 'brand',
        admin: req.admin,
        errors,
        brand: { name: trimmedName, tagline: trimmedTagline, is_active: activeBool },
      });
    }

    await Brand.create({
      name: trimmedName,
      slug,
      tagline: trimmedTagline,
      is_active: activeBool,
    });

    res.redirect('/admin/brands');
  } catch (err) {
    console.error('createBrand error:', err);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send('Server error');
  }
};

// ── GET /admin/brands/:id/edit ────────────────────────────────────────────────
export const renderEdit = async (req, res) => {
  try {
    const brand = await Brand.findById(req.params.id).lean();
    if (!brand) return res.status(HTTP_STATUS.NOT_FOUND).send('Brand not found');
    res.render('admin/brands/edit', { activePage: 'brand', admin: req.admin, brand, errors: [] });
  } catch (err) {
    console.error('renderEdit error:', err);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send('Server error');
  }
};

// ── POST /admin/brands/:id/edit ───────────────────────────────────────────────
export const updateBrand = async (req, res) => {
  try {
    const brand = await Brand.findById(req.params.id);
    if (!brand) return res.status(HTTP_STATUS.NOT_FOUND).send('Brand not found');

    const { name, tagline, is_active } = req.body;
    const errors = [];
    const trimmedName = (name || '').trim();
    const trimmedTagline = (tagline || '').trim();
    const activeBool = is_active === 'on' || is_active === 'true' || is_active === true;

    if (!trimmedName) {
      errors.push('Brand name is required.');
    } else if (trimmedName.length < 2) {
      errors.push('Brand name must be at least 2 characters long.');
    } else if (trimmedName.length > 50) {
      errors.push('Brand name cannot exceed 50 characters.');
    } else if (!/^[a-zA-Z0-9\s'&.-]+$/.test(trimmedName) || !/[a-zA-Z]/.test(trimmedName)) {
      errors.push("Brand name must contain letters and only valid characters (letters, numbers, spaces, &, ', ., -).");
    }

    if (trimmedTagline && trimmedTagline.length > 150) {
      errors.push('Brand tagline cannot exceed 150 characters.');
    }

    const newSlug = slugify(trimmedName);
    if (newSlug) {
      const conflict = await Brand.findOne({ slug: newSlug, _id: { $ne: brand._id } });
      if (conflict) {
        errors.push('Another brand with this name already exists.');
      }
    }

    if (errors.length) {
      return res.render('admin/brands/edit', {
        activePage: 'brand',
        admin: req.admin,
        brand: { _id: brand._id, name: trimmedName, tagline: trimmedTagline, is_active: activeBool },
        errors,
      });
    }

    brand.name      = trimmedName;
    brand.slug      = newSlug;
    brand.tagline   = trimmedTagline;
    brand.is_active = activeBool;

    await brand.save();
    res.redirect('/admin/brands');
  } catch (err) {
    console.error('updateBrand error:', err);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send('Server error');
  }
};

// ── POST /admin/brands/:id/toggle ─────────────────────────────────────────────
export const toggleBrand = async (req, res) => {
  try {
    const brand = await Brand.findById(req.params.id);
    if (!brand) return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false });
    brand.is_active = !brand.is_active;
    await brand.save();
    res.json({ success: true, is_active: brand.is_active });
  } catch (err) {
    console.error('toggleBrand error:', err);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false });
  }
};

// ── POST /admin/brands/:id/delete ─────────────────────────────────────────────
export const deleteBrand = async (req, res) => {
  try {
    await Brand.findByIdAndDelete(req.params.id);
    res.redirect('/admin/brands');
  } catch (err) {
    console.error('deleteBrand error:', err);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send('Server error');
  }
};

export default {
  listBrands,
  renderAdd,
  createBrand,
  renderEdit,
  updateBrand,
  toggleBrand,
  deleteBrand
};
