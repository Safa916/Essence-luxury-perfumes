const fs = require('fs');
const path = require('path');
const Product = require('../../models/product');
const Variant = require('../../models/variant');
const APIFeatures = require('../../utils/apiFeatures');
const { toPublicPath, uploadDir: UPLOAD_DIR } = require('../../middleware/uploadProductImages');

// Swap these requires for wherever your Category/Brand models actually live.
let Category, Brand;
try {
  Category =  require('../../models/category');
} catch (e) {
  Category = null;
}
try {
  Brand = require('../../models/brands');
} catch (e) {
  Brand = null;
}

const slugify = (str) =>
  String(str)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

// ---------------------------------------------------------------------------
// GET /admin/products  -> Product Management table
// ---------------------------------------------------------------------------
exports.renderProductManagement = async (req, res) => {
  try {
    const baseQuery = Product.find();

    if (req.query.category) baseQuery.where('category_id').equals(req.query.category);
    if (req.query.status) baseQuery.where('is_active').equals(req.query.status === 'Active');

    const features = new APIFeatures(baseQuery, req.query)
      .search(['name', 'sku'])
      .sort('-created_at')
      .paginate();

    const [products, totalProducts] = await Promise.all([
      features.query.populate('category_id', 'name').populate('brand_id', 'name').lean(),
      Product.countDocuments(
        req.query.category ? { category_id: req.query.category } : {}
      ),
    ]);

    const { page, limit } = features.pagination;
    const totalPages = Math.max(Math.ceil(totalProducts / limit), 1);

    const withSl = products.map((p, i) => ({
      ...p,
      sl: (page - 1) * limit + i + 1,
      category: p.category_id?.name || '—',
      status: p.is_active ? 'Active' : 'Inactive',
      image: p.images && p.images[0] ? p.images[0] : null,
    }));

  const categories = Category ? await Category.find().lean() : [];

    res.render('admin/products/productManagement', {
      products: withSl,
      totalProducts,
      currentPage: page,
      totalPages,
      categories,
      query: req.query,
    });
  } catch (err) {
    console.error('renderProductManagement error:', err);
    res.status(500).render('admin/error', { message: 'Failed to load products' });
  }
};

// ---------------------------------------------------------------------------
// GET /admin/products/add
// ---------------------------------------------------------------------------
exports.renderAddProduct = async (req, res) => {
  const [categories, brands] = await Promise.all([
    Category ? Category.find().lean() : [],
    Brand ? Brand.find().lean() : [],
  ]);
   res.render('admin/products/addProduct', { categories, brands, errors: [], oldInput: null });
};

// ---------------------------------------------------------------------------
// POST /admin/products/add
// ---------------------------------------------------------------------------
exports.createProduct = async (req, res) => {
  try {
    const files = req.files || [];

    if (files.length < 3) {
      // Clean up any files multer already wrote before we reject
      files.forEach((f) => fs.unlink(f.path, () => {}));
      const [categories, brands] = await Promise.all([
        Category ? Category.find().lean() : [],
        Brand ? Brand.find().lean() : [],
      ]);
      return res.status(400).render('admin/products/addProduct', {
        categories,
        brands,
        errors: ['Please upload at least 3 product images'],
        oldInput: req.body,
      });
    }

    const {
      name,
      sku,
      short_description,
      full_description,
      price,
      stock,
      brand_id,
      category_id,
      status,
      limited_edition,
    } = req.body;

    const images = files.map((f) => toPublicPath(f.filename));

    const product = await Product.create({
      name,
      slug: `${slugify(name)}-${Date.now().toString(36)}`,
      sku,
      short_description,
      full_description,
      images,
      price: Number(price) || 0,
      stock: Number(stock) || 0,
      brand_id: brand_id || null,
      category_id: category_id || null,
      is_active: status === 'active' || status === 'on' || status === 'true',
      is_limited_edition: limited_edition === 'active' || limited_edition === 'on' || limited_edition === 'true',
    });

    res.redirect(`/admin/products?created=${product._id}`);
  } catch (err) {
    console.error('createProduct error:', err);
    (req.files || []).forEach((f) => fs.unlink(f.path, () => {}));
    const [categories, brands] = await Promise.all([
      Category ? Category.find().lean() : [],
      Brand ? Brand.find().lean() : [],
    ]);
    res.status(400).render('admin/products/addProduct', {
      categories,
      brands,
      errors: [err.message || 'Could not create product'],
      oldInput: req.body,
    });
  }
};

// ---------------------------------------------------------------------------
// GET /admin/products/:id/edit
// ---------------------------------------------------------------------------
exports.renderEditProduct = async (req, res) => {
  const product = await Product.findById(req.params.id).lean();
  if (!product) return res.status(404).render('admin/error', { message: 'Product not found' });

  const [categories, brands] = await Promise.all([
    Category ? Category.find().lean() : [],
    Brand ? Brand.find().lean() : [],
  ]);

  res.render('admin/products/editProduct', { product, categories, brands, errors: [] });
};

// ---------------------------------------------------------------------------
// PUT /admin/products/:id
// ---------------------------------------------------------------------------
exports.updateProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).render('admin/error', { message: 'Product not found' });

    const {
      name,
      sku,
      short_description,
      full_description,
      price,
      stock,
      brand_id,
      category_id,
      status,
      limited_edition,
      removed_images, // comma separated list of existing image URLs to drop
    } = req.body;

    let images = [...product.images];

    if (removed_images) {
      const toRemove = removed_images.split(',').filter(Boolean);
      images = images.filter((img) => !toRemove.includes(img));
      // best-effort delete from disk
      toRemove.forEach((img) => {
        const filePath = path.join(UPLOAD_DIR, path.basename(img));
        fs.unlink(filePath, () => {});
      });
    }

    const newFiles = req.files || [];
    if (newFiles.length) {
      images.push(...newFiles.map((f) => toPublicPath(f.filename)));
    }

    if (images.length < 3) {
      newFiles.forEach((f) => fs.unlink(f.path, () => {}));
      const [categories, brands] = await Promise.all([
        Category ? Category.find().lean() : [],
        Brand ? Brand.find().lean() : [],
      ]);
      return res.status(400).render('admin/products/editProduct', {
        product: { ...product.toObject(), ...req.body },
        categories,
        brands,
        errors: ['At least 3 product images are required'],
      });
    }

    product.name = name;
    product.sku = sku;
    product.short_description = short_description;
    product.full_description = full_description;
    product.images = images;
    product.price = Number(price) || product.price;
    product.stock = Number(stock) ?? product.stock;
    product.brand_id = brand_id || null;
    product.category_id = category_id || null;
    product.is_active = status === 'active' || status === 'on' || status === 'true';
    product.is_limited_edition =
      limited_edition === 'active' || limited_edition === 'on' || limited_edition === 'true';

    await product.save();

    res.redirect(`/admin/products?updated=${product._id}`);
  } catch (err) {
    console.error('updateProduct error:', err);
    res.status(400).render('admin/error', { message: err.message || 'Could not update product' });
  }
};

// ---------------------------------------------------------------------------
// DELETE /admin/products/:id  (soft delete, called via fetch from the modal)
// ---------------------------------------------------------------------------
exports.softDeleteProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

    product.is_deleted = true;
    product.deleted_at = new Date();
    product.is_active = false;
    await product.save();

    // Soft delete the variants that belong to it too (your variant schema
    // uses deleted_at, not is_deleted)
    await Variant.updateMany(
      { product_id: product._id, deleted_at: null },
      { $set: { deleted_at: new Date(), is_active: false } }
    );

    res.json({ success: true, message: 'Product deleted', id: product._id });
  } catch (err) {
    console.error('softDeleteProduct error:', err);
    res.status(500).json({ success: false, message: 'Could not delete product' });
  }
};

// ---------------------------------------------------------------------------
// GET /admin/products/:id  -> Variant Manager page for this product
// ---------------------------------------------------------------------------
exports.renderViewProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id)
      .populate('category_id', 'name')
      .populate('brand_id', 'name')
      .lean();

    if (!product) return res.status(404).render('admin/error', { message: 'Product not found' });

    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = 4; // matches the "Showing 4 of 24 variants" screenshot
    const skip = (page - 1) * limit;

    const [variantsRaw, totalVariants] = await Promise.all([
      Variant.find({ product_id: product._id }).sort('sku').skip(skip).limit(limit).lean(),
      Variant.countDocuments({ product_id: product._id, deleted_at: null }),
    ]);

    // Decimal128 doesn't come through .lean() as a plain number, so convert
    // it for the view (matches the toJSON transform used by the JSON API).
    const variants = variantsRaw.map((v) => ({
      ...v,
      price: v.price != null ? parseFloat(v.price.toString()) : 0,
    }));

    const totalPages = Math.max(Math.ceil(totalVariants / limit), 1);

    res.render('admin/products/viewProduct', {
      product,
      variants,
      totalVariants,
      currentPage: page,
      totalPages,
    });
  } catch (err) {
    console.error('renderViewProduct error:', err);
    res.status(500).render('admin/error', { message: 'Failed to load product' });
  }
};
