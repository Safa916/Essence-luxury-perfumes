import Category from '../../models/category.js';
import Brand from '../../models/brands.js';
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import Product from '../../models/product.js';
import Variant from '../../models/variant.js';
import APIFeatures from '../../utils/apiFeatures.js';
import { uploadDir } from '../../middleware/uploadProductImages.js';
import { nextVariantSku } from './variantController.js';
import { HTTP_STATUS } from '../../constants/httpStatus.js';



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



// ─── GET /admin/products/check-name?name=... ─────────────────────────────────
// JSON endpoint — returns { exists: bool } for live duplicate-name checking.
export const checkProductName = async (req, res) => {
  try {
    const name = (req.query.name || '').trim();
    const excludeId = req.query.excludeId || null; // for edit-product use
    if (!name) return res.json({ exists: false });

    const escaped = name.replace(/[.*+?^$${}()|[\]\\]/g, '\\$&');
    const query = { name: { $regex: '^' + escaped + '$', $options: 'i' }, is_deleted: { $ne: true } };
    if (excludeId && mongoose.Types.ObjectId.isValid(excludeId)) {
      query._id = { $ne: new mongoose.Types.ObjectId(excludeId) };
    }
    const existing = await Product.findOne(query).lean();
    return res.json({ exists: !!existing });
  } catch (err) {
    console.error('checkProductName error:', err);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ exists: false });
  }
};

// ─── GET /admin/products/check-sku?sku=... ──────────────────────────────────────────────
// JSON endpoint — returns { exists: bool, usedBy: string } for live SKU check.
export const checkProductSku = async (req, res) => {
  try {
    const sku = (req.query.sku || '').trim().toUpperCase();
    const excludeId = req.query.excludeId || null;
    if (!sku) return res.json({ exists: false });

    const escaped = sku.replace(/[.*+?^$${}()|[\]\\]/g, '\\$&');
    const skuRegex = { $regex: '^' + escaped + '$', $options: 'i' };

    const productQuery = { sku: skuRegex, is_deleted: { $ne: true } };
    if (excludeId && mongoose.Types.ObjectId.isValid(excludeId)) {
      productQuery._id = { $ne: new mongoose.Types.ObjectId(excludeId) };
    }

    const variantQuery = { sku: skuRegex, deleted_at: null };
    if (excludeId && mongoose.Types.ObjectId.isValid(excludeId)) {
      variantQuery.product_id = { $ne: new mongoose.Types.ObjectId(excludeId) };
    }

    const [existingProduct, existingVariant] = await Promise.all([
      Product.findOne(productQuery, 'name sku').lean(),
      Variant.findOne(variantQuery, 'sku').lean(),
    ]);

    if (existingProduct) {
      return res.json({ exists: true, usedBy: 'product "' + existingProduct.name + '"' });
    }
    if (existingVariant) {
      return res.json({ exists: true, usedBy: 'an existing product variant' });
    }
    return res.json({ exists: false });
  } catch (err) {
    console.error('checkProductSku error:', err);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ exists: false });
  }
};

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
export const getProductss = async (req, res) => {

  try {
    const filteredProducts = await Product.find({
      price: { $gte: 2000, $lte: 5000 },
      is_active: true,
    },{name:1,price:1});

    res.status(HTTP_STATUS.OK).send(filteredProducts);
  } catch (err) {
    console.error(err);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ message: 'Server error' });
  }
};
export const getProductts = async (req,res)=>{
  try{
    const filterProducts= await Product.find({
      price:{$gte:2000,$lte:6000},
      is_active:true,
    
    },{name:1,price:1})
    res.status(HTTP_STATUS.OK).send(filterProducts)
  }catch(err){


    console.error(err);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({message:'server error'})
  }
 };

// ---------------------------------------------------------------------------
// GET /admin/products  -> Product Management table
// ---------------------------------------------------------------------------
export const renderProductManagement = async (req, res) => {
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
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).render('admin/error', { message: 'Failed to load products' });
  }
};

// ---------------------------------------------------------------------------
// GET /admin/products/add
// ---------------------------------------------------------------------------
export const renderAddProduct = async (req, res) => {
  const [categories, brands] = await Promise.all([
    Category ? Category.find({ is_active: true, is_deleted: { $ne: true } }).lean() : [],
    Brand ? Brand.find({ is_active: true }).sort({ name: 1 }).lean() : [],
  ]);
  res.render('admin/products/addProduct', { categories, brands, errors: {}, oldInput: null });
};


// ---------------------------------------------------------------------------
export const createProduct = async (req, res) => {
  try {
   
    const uploadedImages = req.processedImages || [];

    const errors = validateProductInput(req.body, uploadedImages.length);

    if (Object.keys(errors).length > 0) {
      deleteUploadedImages(uploadedImages);
      const [categories, brands] = await Promise.all([
        Category ? Category.find({ is_active: true, is_deleted: { $ne: true } }).lean() : [],
        Brand ? Brand.find({ is_active: true }).sort({ name: 1 }).lean() : [],
      ]);
      return res.status(HTTP_STATUS.BAD_REQUEST).render('admin/products/addProduct', {
        categories,
        brands,
        errors,
        oldInput: req.body,
      });
    }

    // ── Duplicate name check (case-insensitive) ──────────────────────────────
    const trimmedName = req.body.name.trim();
    const nameConflict = await Product.findOne({
      name: { $regex: `^${trimmedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' },
      deleted_at: null,
    }).lean();

    if (nameConflict) {
      deleteUploadedImages(uploadedImages);
      const [categories, brands] = await Promise.all([
        Category ? Category.find({ is_active: true, is_deleted: { $ne: true } }).lean() : [],
        Brand ? Brand.find({ is_active: true }).sort({ name: 1 }).lean() : [],
      ]);
      return res.status(HTTP_STATUS.BAD_REQUEST).render('admin/products/addProduct', {
        categories,
        brands,
        errors: { name: `A product named "${trimmedName}" already exists. Please use a different name.` },
        oldInput: req.body,
      });
    }
    // ────────────────────────────────────────────────────────────────────────

    // ── Duplicate SKU check (case-insensitive, checks products + variants) ───
    const trimmedSku = (req.body.sku || '').trim().toUpperCase();
    const escapedSku = trimmedSku.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const skuRx = { $regex: '^' + escapedSku + '$', $options: 'i' };
    const [skuProductConflict, skuVariantConflict] = await Promise.all([
      Product.findOne({ sku: skuRx, deleted_at: null }, 'name').lean(),
      Variant.findOne({ sku: skuRx }, 'sku').lean(),
    ]);
    if (skuProductConflict || skuVariantConflict) {
      deleteUploadedImages(uploadedImages);
      const [categories, brands] = await Promise.all([
        Category ? Category.find({ is_active: true, is_deleted: { $ne: true } }).lean() : [],
        Brand ? Brand.find({ is_active: true }).sort({ name: 1 }).lean() : [],
      ]);
      const skuUsedBy = skuProductConflict
        ? 'It is already assigned to the product "' + skuProductConflict.name + '".'
        : 'It is already assigned to an existing product variant.';
      return res.status(HTTP_STATUS.BAD_REQUEST).render('admin/products/addProduct', {
        categories,
        brands,
        errors: { sku: 'SKU "' + trimmedSku + '" is already taken. ' + skuUsedBy + ' Please use a unique SKU.' },
        oldInput: req.body,
      });
    }
    // ────────────────────────────────────────────────────────────────────────

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
      Brand ? Brand.find({ is_active: true }).sort({ name: 1 }).lean() : [],
    ]);
    let errors = {};
    if (err.code === 'INVALID_FILE_TYPE') {
      errors = { images: err.message };
    } else if (err.code === 'LIMIT_FILE_SIZE') {
      errors = { images: 'One or more images exceed the 5 MB size limit.' };
    } else if (err.code === 11000) {
      const msg = err.message || '';
      if (err.keyPattern?.sku || msg.includes('sku')) {
        errors.sku = 'SKU "' + (req.body.sku || '').toUpperCase() + '" is already taken. Please use a unique SKU.';
      } else if (err.keyPattern?.name || err.keyPattern?.slug || msg.includes('name') || msg.includes('slug')) {
        errors.name = 'A product named "' + (req.body.name || '') + '" already exists. Please use a different name.';
      } else {
        errors.general = 'A duplicate field error occurred. Please check the product details.';
      }
    } else {
      errors = { general: err.message || 'Could not create product' };
    }

    res.status(HTTP_STATUS.BAD_REQUEST).render('admin/products/addProduct', {
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
export const renderEditProduct = async (req, res) => {
  const product = await Product.findById(req.params.id).lean();
  if (!product) return res.status(HTTP_STATUS.NOT_FOUND).render('admin/error', { message: 'Product not found' });

  const [categories, brands, variantCount] = await Promise.all([
    Category ? Category.find({ is_active: true, is_deleted: { $ne: true } }).lean() : [],
    Brand ? Brand.find({ $or: [{ is_active: true }, { _id: product.brand_id }] }).sort({ name: 1 }).lean() : [],
    Variant.countDocuments({ product_id: product._id, deleted_at: null }),
  ]);

  res.render('admin/products/editProduct', { product, categories, brands, errors: {}, variantCount });
};

// ---------------------------------------------------------------------------
export const updateProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(HTTP_STATUS.NOT_FOUND).render('admin/error', { message: 'Product not found' });

    const {
      name,
      sku,
      short_description,
      full_description,
      brand_id,
      category_id,
      status,
      removed_images,
    } = req.body;

    let images = [...product.images];

    if (removed_images) {
      const toRemove = removed_images.split(',').filter(Boolean);
      images = images.filter((img) => !toRemove.includes(img));
      toRemove.forEach((img) => {
        const filePath = path.join(uploadDir, path.basename(img));
        fs.unlink(filePath, () => {});
      });
    }

    if (req.processedImages && req.processedImages.length) {
      images.push(...req.processedImages);
    }

    const errors = {};
    if (!name || !name.trim()) errors.name = 'Product name is required.';
    if (!sku || !sku.trim()) errors.sku = 'SKU is required.';
    if (!full_description || !full_description.trim()) errors.full_description = 'Product description is required.';
    if (!category_id) errors.category_id = 'Please select a category.';
    if (!brand_id) errors.brand_id = 'Please select a brand.';
    if (images.length < 3) errors.images = 'At least 3 product images are required.';

    // Check duplicate Name (excluding this product)
    if (name && name.trim()) {
      const trimmedName = name.trim();
      const escapedName = trimmedName.replace(/[.*+?^$${}()|[\]\\]/g, '\\$&');
      const nameConflict = await Product.findOne({
        _id: { $ne: product._id },
        name: { $regex: '^' + escapedName + '$', $options: 'i' },
        is_deleted: { $ne: true },
      }).lean();

      if (nameConflict) {
        errors.name = 'A product named "' + trimmedName + '" already exists. Please use a different name.';
      }
    }

    // Check duplicate SKU (excluding this product and its variants)
    if (sku && sku.trim()) {
      const trimmedSku = sku.trim().toUpperCase();
      const escapedSku = trimmedSku.replace(/[.*+?^$${}()|[\]\\]/g, '\\$&');
      const skuRx = { $regex: '^' + escapedSku + '$', $options: 'i' };
      const [skuProductConflict, skuVariantConflict] = await Promise.all([
        Product.findOne({ _id: { $ne: product._id }, sku: skuRx, is_deleted: { $ne: true } }, 'name').lean(),
        Variant.findOne({ product_id: { $ne: product._id }, sku: skuRx, deleted_at: null }, 'sku').lean(),
      ]);

      if (skuProductConflict || skuVariantConflict) {
        const skuUsedBy = skuProductConflict
          ? 'It is already assigned to the product "' + skuProductConflict.name + '".'
          : 'It is already assigned to an existing product variant.';
        errors.sku = 'SKU "' + trimmedSku + '" is already taken. ' + skuUsedBy + ' Please use a unique SKU.';
      }
    }

    if (Object.keys(errors).length > 0) {
      deleteUploadedImages(req.processedImages);
      const [categories, brands, variantCount] = await Promise.all([
        Category ? Category.find({ is_active: true, is_deleted: { $ne: true } }).lean() : [],
        Brand ? Brand.find({ $or: [{ is_active: true }, { _id: product.brand_id }] }).sort({ name: 1 }).lean() : [],
        Variant.countDocuments({ product_id: product._id, deleted_at: null }),
      ]);
      return res.status(HTTP_STATUS.BAD_REQUEST).render('admin/products/editProduct', {
        product: { ...product.toObject(), ...req.body, images },
        categories,
        brands,
        errors,
        variantCount,
      });
    }

    product.name = name.trim();
    product.sku = sku.trim().toUpperCase();
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

    const [categories, brands, variantCount] = await Promise.all([
      Category ? Category.find({ is_active: true, is_deleted: { $ne: true } }).lean() : [],
      Brand ? Brand.find({ $or: [{ is_active: true }, { _id: req.body.brand_id }] }).sort({ name: 1 }).lean() : [],
      Variant.countDocuments({ product_id: req.params.id, deleted_at: null }),
    ]);

    const errors = {};
    if (err.code === 11000) {
      const msg = err.message || '';
      if (err.keyPattern?.sku || msg.includes('sku')) {
        errors.sku = 'SKU "' + (req.body.sku || '').toUpperCase() + '" is already taken. Please use a unique SKU.';
      } else if (err.keyPattern?.name || err.keyPattern?.slug || msg.includes('name') || msg.includes('slug')) {
        errors.name = 'A product named "' + (req.body.name || '') + '" already exists. Please use a different name.';
      } else {
        errors.general = 'A duplicate field error occurred. Please check the product details.';
      }
    } else {
      errors.general = err.message || 'Could not update product';
    }

    res.status(HTTP_STATUS.BAD_REQUEST).render('admin/products/editProduct', {
      product: { _id: req.params.id, ...req.body },
      categories,
      brands,
      errors,
      variantCount,
    });
  }
};

// ---------------------------------------------------------------------------
// DELETE /admin/products/:id  (soft delete, called via fetch from the modal)
// ---------------------------------------------------------------------------
export const softDeleteProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: 'Product not found' });

    product.is_deleted = true;
    product.deleted_at = new Date();
    product.is_active = false;
    if (product.sku && !product.sku.startsWith('__DELETED_')) {
      product.sku = '__DELETED_' + product._id + '_' + product.sku;
    }
    if (product.slug && !product.slug.startsWith('__deleted_')) {
      product.slug = '__deleted_' + product._id + '_' + product.slug;
    }
    await product.save({ validateBeforeSave: false });

    // Soft delete the variants and rename their SKUs so they never block reuse
    const variants = await Variant.find({ product_id: product._id, deleted_at: null });
    for (const v of variants) {
      v.deleted_at = new Date();
      v.is_active = false;
      if (v.sku && !v.sku.startsWith('__DELETED_')) {
        v.sku = '__DELETED_' + v._id + '_' + v.sku;
      }
      await v.save({ validateBeforeSave: false });
    }

    res.json({ success: true, message: 'Product deleted', id: product._id });
  } catch (err) {
    console.error('softDeleteProduct error:', err);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: 'Could not delete product' });
  }
};

// GET /admin/products/:id  -> Core Specs page
// ---------------------------------------------------------------------------
export const renderProductDetail = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id)
      .populate('category_id', 'name')
      .populate('brand_id', 'name')
      .lean();

    if (!product) return res.status(HTTP_STATUS.NOT_FOUND).render('admin/error', { message: 'Product not found' });

    const variantCount = await Variant.countDocuments({
      product_id: product._id,
      deleted_at: null,
    });

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
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).render('admin/error', { message: 'Failed to load product' });
  }
};

// ---------------------------------------------------------------------------
// GET /admin/products/:id/variants  -> Variant Manager page for this product
// ---------------------------------------------------------------------------
export const renderVariantManager = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id)
      .populate('category_id', 'name')
      .populate('brand_id', 'name')
      .lean();

    if (!product) return res.status(HTTP_STATUS.NOT_FOUND).render('admin/error', { message: 'Product not found' });

    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = 4; // matches the "Showing 4 of 24 variants" screenshot
    const skip = (page - 1) * limit;

    const [variantsRaw, totalVariants] = await Promise.all([
      Variant.find({ product_id: product._id, deleted_at: null }).sort('sku').skip(skip).limit(limit).lean(),
      Variant.countDocuments({ product_id: product._id, deleted_at: null }),
    ]);

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
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).render('admin/error', { message: 'Failed to load product' });
  }
};

export default {
  getProductss,
  getProductts,
  renderProductManagement,
  renderAddProduct,
  createProduct,
  checkProductName,
  checkProductSku,
  renderEditProduct,
  updateProduct,
  softDeleteProduct,
  renderProductDetail,
  renderVariantManager
};
