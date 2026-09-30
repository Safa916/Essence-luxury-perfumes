const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const Category = require('../../models/category');
const APIFeatures = require('../../utils/apiFeatures');
const { toPublicPath, uploadDir } = require('../../middleware/uploadCategoryImage');

function slugify(text) {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Guards against CastError crashes when an id is missing/malformed (e.g. "0")
function isValidId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

// Best-effort delete of an old category banner from disk when it's being
// replaced or the category is removed. Safe no-op if the path isn't one of
// ours (e.g. still null, or an external URL).
function deleteBannerFile(bannerUrl) {
  if (!bannerUrl || !bannerUrl.startsWith('/uploads/categories/')) return;
  const filePath = path.join(uploadDir, path.basename(bannerUrl));
  fs.unlink(filePath, () => {});
}

// ===== LIST =====
exports.listCategories = async (req, res) => {
  try {
    const search = (req.query.search || '').trim();
    const baseFilter = { is_deleted: false };

    const features = new APIFeatures(Category.find(baseFilter), req.query)
      .search(['name'])
      .sort({ created_at: -1 })
      .paginate();

    const categoriesRaw = await features.query;
    const { page, limit } = features.pagination;

    const matchFilter = { ...baseFilter };
    if (search) {
      matchFilter.name = new RegExp(escapeRegex(search), 'i');
    }

    // Count products (non-deleted) per category so the table shows accurate numbers
    const Product = require('../../models/product');
    const productCounts = await Product.aggregate([
      { $match: { is_deleted: { $ne: true } } },
      { $group: { _id: '$category_id', count: { $sum: 1 } } },
    ]);
    const countMap = {};
    productCounts.forEach((entry) => {
      if (entry._id) countMap[entry._id.toString()] = entry.count;
    });

    // Attach productCount to every category document
    const categories = categoriesRaw.map((cat) => {
      const plain = cat.toObject ? cat.toObject() : { ...cat };
      plain.productCount = countMap[plain._id.toString()] || 0;
      return plain;
    });

    const [matchedCategories, totalCategoriesAll, totalActive, totalInactive] = await Promise.all([
      Category.countDocuments(matchFilter),
      Category.countDocuments({ is_deleted: false }),
      Category.countDocuments({ is_deleted: false, is_active: true }),
      Category.countDocuments({ is_deleted: false, is_active: false }),
    ]);

    res.render('admin/categories/categoryManagement', {
      activePage: 'categories',
      categories,
      search,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(matchedCategories / limit)),
      matchedCategories,
      totalCategoriesAll,
      totalActive,
      totalInactive,
      openModal: req.query.openModal || null,
      formError: req.query.formError || null,
      editId: req.query.editId || null,
      enteredName: req.query.enteredName || null,
    });
  } catch (err) {
    console.error('Error loading categories:', err);
    res.status(500).send('Something went wrong while loading categories.');
  }
};

// ===== ADD =====
exports.createCategory = async (req, res) => {
  try {
    const { name, is_active } = req.body;
    const bannerFile = req.file; // set by uploadCategoryImage middleware, if a file was chosen

    if (!name || !name.trim()) {
      if (bannerFile) fs.unlink(bannerFile.path, () => {});
      return res.redirect(
        `/admin/categories?openModal=add&formError=${encodeURIComponent('Category name is required.')}`
      );
    }

    const slug = slugify(name);
    const bannerUrl = bannerFile ? toPublicPath(bannerFile.filename) : null;

    // Check across ALL categories (including soft-deleted) since slug is unique at the DB level
    const existing = await Category.findOne({ slug });

    if (existing && !existing.is_deleted) {
      // A live category already uses this name
      if (bannerFile) fs.unlink(bannerFile.path, () => {});
      return res.redirect(
        `/admin/categories?openModal=add&formError=${encodeURIComponent(
          'A category with this name already exists.'
        )}&enteredName=${encodeURIComponent(name)}`
      );
    }

    if (existing && existing.is_deleted) {
      // A previously soft-deleted category used this exact name — restore it instead of
      // trying to insert a new document (which would fail the unique slug constraint)
      existing.is_deleted = false;
      existing.name = name.trim();
      existing.is_active = is_active === 'on' || is_active === 'true';
      if (bannerUrl) {
        deleteBannerFile(existing.banner_url);
        existing.banner_url = bannerUrl;
      }
      await existing.save();
      return res.redirect('/admin/categories');
    }

    await Category.create({
      name: name.trim(),
      slug,
      is_active: is_active === 'on' || is_active === 'true',
      banner_url: bannerUrl,
    });

    res.redirect('/admin/categories');
  } catch (err) {
    console.error('Error creating category:', err);
    if (req.file) fs.unlink(req.file.path, () => {});
    res.redirect(
      `/admin/categories?openModal=add&formError=${encodeURIComponent('Something went wrong. Please try again.')}`
    );
  }
};

// ===== EDIT =====
exports.updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const bannerFile = req.file;

    // Guard: if id is missing/invalid (e.g. still "0"), don't let Mongoose throw — send back cleanly
    if (!isValidId(id)) {
      console.warn('updateCategory called with invalid id:', id);
      if (bannerFile) fs.unlink(bannerFile.path, () => {});
      return res.redirect(
        `/admin/categories?formError=${encodeURIComponent('Invalid category selected. Please try again.')}`
      );
    }

    const { name, is_active } = req.body;
    const category = await Category.findById(id);
    if (!category) {
      if (bannerFile) fs.unlink(bannerFile.path, () => {});
      return res.redirect(
        `/admin/categories?formError=${encodeURIComponent('That category no longer exists.')}`
      );
    }

    if (!name || !name.trim()) {
      if (bannerFile) fs.unlink(bannerFile.path, () => {});
      return res.redirect(
        `/admin/categories?openModal=edit&editId=${id}&formError=${encodeURIComponent('Category name is required.')}`
      );
    }

    const slug = slugify(name);
    const duplicate = await Category.findOne({
      slug,
      is_deleted: false,
      _id: { $ne: id },
    });
    if (duplicate) {
      if (bannerFile) fs.unlink(bannerFile.path, () => {});
      return res.redirect(
        `/admin/categories?openModal=edit&editId=${id}&formError=${encodeURIComponent(
          'A category with this name already exists.'
        )}&enteredName=${encodeURIComponent(name)}`
      );
    }

    // A soft-deleted category might still hold this slug at the DB level.
    // If so, permanently free it up so this update doesn't hit the unique constraint.
    const deletedHolder = await Category.findOne({
      slug,
      is_deleted: true,
      _id: { $ne: id },
    });
    if (deletedHolder) {
      deletedHolder.slug = `${slug}-old-${Date.now()}`;
      await deletedHolder.save();
    }

    category.name = name.trim();
    category.slug = slug;
    category.is_active = is_active === 'on' || is_active === 'true';

    // Only touch the banner if a new file was actually uploaded — otherwise
    // keep whatever banner_url the category already had.
    if (bannerFile) {
      deleteBannerFile(category.banner_url);
      category.banner_url = toPublicPath(bannerFile.filename);
    }

    await category.save();

    res.redirect('/admin/categories');
  } catch (err) {
    console.error('Error updating category:', err);
    if (req.file) fs.unlink(req.file.path, () => {});
    res.redirect(
      `/admin/categories?formError=${encodeURIComponent('Something went wrong while updating. Please try again.')}`
    );
  }
};

// ===== TOGGLE ACTIVE/INACTIVE =====
exports.toggleStatus = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      console.warn('toggleStatus called with invalid id:', id);
      return res.redirect('/admin/categories');
    }

    const category = await Category.findById(id);
    if (category) {
      category.is_active = !category.is_active;
      await category.save();
    }
    res.redirect('/admin/categories');
  } catch (err) {
    console.error('Error toggling category status:', err);
    res.redirect('/admin/categories');
  }
};

// ===== DELETE (soft delete) =====
exports.deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      console.warn('deleteCategory called with invalid id:', id);
      return res.redirect('/admin/categories');
    }

    // Soft delete only — banner file is intentionally left on disk in case
    // the category is restored later (see the "existing.is_deleted" branch
    // in createCategory, which reuses a soft-deleted doc's slug).
    await Category.findByIdAndUpdate(id, { is_deleted: true });
    res.redirect('/admin/categories');
  } catch (err) {
    console.error('Error deleting category:', err);
    res.redirect('/admin/categories');
  }
};