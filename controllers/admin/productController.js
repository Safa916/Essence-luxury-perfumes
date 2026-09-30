const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Product = require('../../models/product');
const Variant = require('../../models/variant');
const APIFeatures = require('../../utils/apiFeatures');
const { uploadDir } = require('../../middleware/uploadProductImages');
const { nextVariantSku } = require('./variantController');

// Swap these requires for wherever your Category/Brand models actually live.
let Category, Brand;
try {
  Category = require('../../models/category');
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


function deleteUploadedImages(publicPaths) {
  (publicPaths || []).forEach((p) => {
    if (!p) return;
    const filePath = path.join(uploadDir, path.basename(p));
    fs.unlink(filePath, () => {});
  });
}

// Full server-side validation, matching the client-side checks in
// addProduct.ejs field-for-field. Returns an object keyed by field name —
// {} means valid. This is the source of truth; the browser-side JS is only
// there for instant feedback, this is what actually protects the database.
//
// NOTE: product.price / product.stock are NOT validated here anymore —
// they are derived from the variant fields in createProduct(), not taken
// as separate admin input, so there's nothing to validate independently.
function validateProductInput(data, imageCount) {
  const errors = {};

  if (!data.name || !data.name.trim()) errors.name = 'Product name is required.';
  if (!data.sku || !data.sku.trim()) errors.sku = 'SKU is required.';
  if (!data.full_description || !data.full_description.trim()) {
    errors.full_description = 'Product description is required.';
  }
  if (!data.category_id) errors.category_id = 'Please select a category.';
  if (!data.brand_id) errors.brand_id = 'Please select a brand.';

  if (!data.variant_concentration || !data.variant_concentration.trim()) {
    errors.variant_concentration = 'Concentration is required.';
  }
  if (!data.variant_size_ml || Number(data.variant_size_ml) <= 0) {
    errors.variant_size_ml = 'Size is required.';
  }
  if (data.variant_quantity === undefined || data.variant_quantity === '' || Number(data.variant_quantity) < 0) {
    errors.variant_quantity = 'Stock level is required.';
  }
  if (!data.variant_price || Number(data.variant_price) <= 0) {
    errors.variant_price = 'Variant price is required.';
  }

  if (imageCount < 3) errors.images = 'At least 3 product images are required.';

  return errors;
}

 exports.getProductss = async (req, res) => {

  try {
    const filteredProducts = await Product.find({
      price: { $gte: 2000, $lte: 5000 },
      is_active: true,
    },{name:1,price:1});

    res.status(200).send(filteredProducts);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};
 
 exports.getProductts=async (req,res)=>{
  try{
    const filterProducts= await Product.find({
      price:{$gte:2000,$lte:6000},
      is_active:true,
    
    },{name:1,price:1})
    res.status(200).send(filterProducts)
  }catch(err){


    console.error(err);
    res.status(500).json({message:'server error'})
  }
 };

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
  .sort({ created_at:-1 })
  .paginate();

    const [products, totalProducts] = await Promise.all([
  features.query.populate('category_id', 'name').populate('brand_id', 'name').lean(),
  Product.countDocuments(req.query.category ? { category_id: req.query.category } : {}),
]);

const { page, limit } = features.pagination;
const totalPages = Math.max(Math.ceil(totalProducts / limit), 1);

// Get variant counts split by active/inactive for this page of products
// total_count = all non-deleted variants (tells us if variants exist at all)
// active_count = only is_active:true variants (tells us if any are sellable)
const variantCounts = await Variant.aggregate([
  { $match: { product_id: { $in: products.map((p) => p._id) }, deleted_at: null } },
  {
    $group: {
      _id: '$product_id',
      total_count: { $sum: 1 },
      active_count: { $sum: { $cond: ['$is_active', 1, 0] } },
    },
  },
]);
const variantCountMap = new Map(variantCounts.map((v) => [v._id.toString(), v]));

const withSl = products.map((p, i) => {
  const vc = variantCountMap.get(p._id.toString()) || { total_count: 0, active_count: 0 };
  return {
    ...p,
    sl: (page - 1) * limit + i + 1,
    category: p.category_id?.name || '—',
    status: p.is_active ? 'Active' : 'Inactive',
    image: p.images && p.images[0] ? p.images[0] : null,
    variant_count: vc.total_count,        // total non-deleted variants
    active_variant_count: vc.active_count, // only is_active:true variants
  };
});

   const categories = Category ? await Category.find({ is_deleted: { $ne: true } }).lean() : []
 

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
    Category ? Category.find({ is_active: true, is_deleted: { $ne: true } }).lean() : [],
    Brand ? Brand.find().lean() : [],
  ]);
  res.render('admin/products/addProduct', { categories, brands, errors: {}, oldInput: null });
};


// ---------------------------------------------------------------------------
exports.createProduct = async (req, res) => {
  try {
    // resizeProductImages resizes files and stores paths on req.processedImages
    // (not req.body.images, to avoid multipart field-name collisions).
    const uploadedImages = req.processedImages || [];

    const errors = validateProductInput(req.body, uploadedImages.length);

    if (Object.keys(errors).length > 0) {
      deleteUploadedImages(uploadedImages);
      const [categories, brands] = await Promise.all([
        Category ? Category.find({ is_active: true, is_deleted: { $ne: true } }).lean() : [],
        Brand ? Brand.find().lean() : [],
      ]);
      return res.status(400).render('admin/products/addProduct', {
        categories,
        brands,
        errors,
        oldInput: req.body,
      });
    }

    const {
      name,
      sku,
      short_description,
      full_description,
      brand_id,
      category_id,
      status,
      limited_edition,
    } = req.body;

    const product = await Product.create({
      name,
      slug: `${slugify(name)}-${Date.now().toString(36)}`,
      sku,
      short_description,
      full_description,
      images: uploadedImages,
      price: Number(req.body.variant_price) || 0,
      stock: Number(req.body.variant_quantity) || 0,
      brand_id: brand_id || null,
      category_id: category_id || null,
      is_active: status === 'active' || status === 'on' || status === 'true',
      is_limited_edition:
        limited_edition === 'active' || limited_edition === 'on' || limited_edition === 'true',
    });

    // Create the required first variant alongside the product. If this
    // fails, roll back the product so we never end up with an orphan
    // product that has zero variants.
    try {
      const sku2 = await nextVariantSku(product);
      await Variant.create({
        product_id: product._id,
        sku: sku2,
        concentration: req.body.variant_concentration || '',
        size_ml: Number(req.body.variant_size_ml),
        quantity: Number(req.body.variant_quantity),
        price: mongoose.Types.Decimal128.fromString(String(req.body.variant_price)),
        is_active: true,
      });
    } catch (variantErr) {
      await Product.findByIdAndDelete(product._id);
      deleteUploadedImages(uploadedImages);
      throw variantErr;
    }

    res.redirect(`/admin/products?created=${product._id}`);
  } catch (err) {
    console.error('createProduct error:', err);
    deleteUploadedImages(req.processedImages);

    const [categories, brands] = await Promise.all([
      Category ? Category.find({ is_active: true, is_deleted: { $ne: true } }).lean() : [],
      Brand ? Brand.find().lean() : [],
    ]);

    // Surface multer file-type / size errors as a form-level image error
    // instead of a blank error page, so the admin can correct and resubmit.
    let errors;
    if (err.code === 'INVALID_FILE_TYPE') {
      errors = { images: err.message };
    } else if (err.code === 'LIMIT_FILE_SIZE') {
      errors = { images: 'One or more images exceed the 5 MB size limit.' };
    } else {
      errors = { general: err.message || 'Could not create product' };
    }

    res.status(400).render('admin/products/addProduct', {
      categories,
      brands,
      errors,
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

  const [categories, brands, variantCount] = await Promise.all([
    Category ? Category.find({ is_active: true, is_deleted: { $ne: true } }).lean() : [],
    Brand ? Brand.find().lean() : [],
    Variant.countDocuments({ product_id: product._id, deleted_at: null }),
  ]);

  res.render('admin/products/editProduct', { product, categories, brands, errors: {}, variantCount });
};

// ---------------------------------------------------------------------------
// PUT /admin/products/:id
// price/stock are intentionally not accepted from this form — they're
// derived from the product's variants via recalcProductStock/
// recalcProductPrice in variantController.js, kept in sync automatically
// whenever a variant is added, edited, or deleted.
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
      brand_id,
      category_id,
      status,
      removed_images, // comma separated list of existing image URLs to drop
    } = req.body;

    let images = [...product.images];

    if (removed_images) {
      const toRemove = removed_images.split(',').filter(Boolean);
      images = images.filter((img) => !toRemove.includes(img));
      // best-effort delete from disk
      toRemove.forEach((img) => {
        const filePath = path.join(uploadDir, path.basename(img));
        fs.unlink(filePath, () => {});
      });
    }

    // resizeProductImages resizes new files and stores paths on req.processedImages.
    if (req.processedImages && req.processedImages.length) {
      images.push(...req.processedImages);
    }

    // price/stock are no longer editable here — they're derived from the
    // product's variants (recalcProductStock/recalcProductPrice, run by
    // variantController.js on every variant add/edit/delete), so there's
    // nothing to validate independently.
    const errors = {};
    if (!name || !name.trim()) errors.name = 'Product name is required.';
    if (!sku || !sku.trim()) errors.sku = 'SKU is required.';
    if (!full_description || !full_description.trim()) errors.full_description = 'Product description is required.';
    if (!category_id) errors.category_id = 'Please select a category.';
    if (!brand_id) errors.brand_id = 'Please select a brand.';
    if (images.length < 3) errors.images = 'At least 3 product images are required.';

    if (Object.keys(errors).length > 0) {
      deleteUploadedImages(req.processedImages);
      const [categories, brands, variantCount] = await Promise.all([
        Category ? Category.find({ is_active: true, is_deleted: { $ne: true } }).lean() : [],
        Brand ? Brand.find().lean() : [],
        Variant.countDocuments({ product_id: product._id, deleted_at: null }),
      ]);
      return res.status(400).render('admin/products/editProduct', {
        product: { ...product.toObject(), ...req.body, images },
        categories,
        brands,
        errors,
        variantCount,
      });
    }

    product.name = name;
    product.sku = sku;
    product.short_description = short_description;
    product.full_description = full_description;
    product.images = images;
    product.brand_id = brand_id || null;
    product.category_id = category_id || null;
    product.is_active = status === 'active' || status === 'on' || status === 'true';

    await product.save();

    res.redirect(`/admin/products?updated=${product._id}`);
  } catch (err) {
    console.error('updateProduct error:', err);
    deleteUploadedImages(req.processedImages);
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
// GET /admin/products/:id  -> Core Specs page
// ---------------------------------------------------------------------------
exports.renderProductDetail = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id)
      .populate('category_id', 'name')
      .populate('brand_id', 'name')
      .lean();

    if (!product) return res.status(404).render('admin/error', { message: 'Product not found' });

    const variantCount = await Variant.countDocuments({
      product_id: product._id,
      deleted_at: null,
    });

    // Stock Health — computed from the aggregate stock field (kept in sync
    // with variant totals). Thresholds are a starting point — tune freely.
    const stock = product.stock || 0;
    let stockHealth = 'optimal';
    if (stock === 0) stockHealth = 'sold-out';
    else if (stock < 10) stockHealth = 'critical';
    else if (stock < 50) stockHealth = 'low';

    res.render('admin/products/productDetail', {
      product,
      variantCount,
      stockHealth,
    });
  } catch (err) {
    console.error('renderProductDetail error:', err);
    res.status(500).render('admin/error', { message: 'Failed to load product' });
  }
};

// ---------------------------------------------------------------------------
// GET /admin/products/:id/variants  -> Variant Manager page for this product
// ---------------------------------------------------------------------------
exports.renderVariantManager = async (req, res) => {
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
      Variant.find({ product_id: product._id, deleted_at: null }).sort('sku').skip(skip).limit(limit).lean(),
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
    console.error('renderVariantManager error:', err);
    res.status(500).render('admin/error', { message: 'Failed to load product' });
  }
};
