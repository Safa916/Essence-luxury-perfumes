const mongoose = require('mongoose');
const Product = require('../../models/product');
const Category = require('../../models/category');
const Brand = require('../../models/brands');
const Variant = require('../../models/variant');
const WishlistItem = require('../../models/wishlistItems');

const DEFAULT_LIMIT = 6;

const SORT_MAP = {
  price_low_high: { price: 1 },
  price_high_low: { price: -1 },
  name_a_z: { name: 1 },
  name_z_a: { name: -1 },
  newest: { created_at: -1 },
}

function escapeRegex(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function csvToIds(value) {
  if (!value) return [];
  return String(value)
    .split(',')
    .map((v) => v.trim())
    .filter((v) => v && mongoose.Types.ObjectId.isValid(v));
}

function csvToStrings(value) {
  if (!value) return [];
  return String(value)
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

async function buildProductQuery(query, userId) {
  const {
    search = '',
    category = '',
    brand = '',
    concentration = '',
    size = '',
    minPrice,
    maxPrice,
    sort = 'newest',
  } = query;

  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.max(parseInt(query.limit, 10) || DEFAULT_LIMIT, 1);
  const skip = (page - 1) * limit;

  const match = {
    is_active: true,
    is_deleted: { $ne: true },
  };

  if (search && search.trim()) {
    match.name = new RegExp(escapeRegex(search.trim()), 'i');
  }

  const categoryIds = csvToIds(category);
  if (categoryIds.length) {
    match.category_id = { $in: categoryIds.map((id) => new mongoose.Types.ObjectId(id)) };
  }

  const brandIds = csvToIds(brand);
  if (brandIds.length) {
    match.brand_id = { $in: brandIds.map((id) => new mongoose.Types.ObjectId(id)) };
  }

  const min = parseFloat(minPrice);
  const max = parseFloat(maxPrice);
  if (!Number.isNaN(min) || !Number.isNaN(max)) {
    match.price = {};
    if (!Number.isNaN(min)) match.price.$gte = min;
    if (!Number.isNaN(max)) match.price.$lte = max;
  }

  const concentrationList = csvToStrings(concentration);
  const sizeList = csvToStrings(size).map(Number).filter((n) => !Number.isNaN(n));

  const sortOption = SORT_MAP[sort] || SORT_MAP.newest;

  // Start pipeline: match active, non-deleted products then filter by active category
  const pipeline = [
    { $match: match },
    // Join the category and exclude products belonging to an inactive category
    {
      $lookup: {
        from: 'categories',
        localField: 'category_id',
        foreignField: '_id',
        as: '_cat',
      },
    },
    {
      $match: {
        '_cat.is_active': true,
        '_cat.is_deleted': { $ne: true },
      },
    },
  ];

  if (concentrationList.length || sizeList.length) {
    pipeline.push({
      $lookup: {
        from: 'variants',
        let: { productId: '$_id' },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ['$product_id', '$$productId'] },
              deleted_at: null,
              is_active: true,
            },
          },
        ],
        as: 'variants',
      },
    });

    if (concentrationList.length) {
      pipeline.push({ $match: { 'variants.concentration': { $in: concentrationList } } });
    }
    if (sizeList.length) {
      pipeline.push({ $match: { 'variants.size_ml': { $in: sizeList } } });
    }
  }

  pipeline.push(
    { $sort: sortOption },
    {
      $lookup: {
        from: 'brands',
        localField: 'brand_id',
        foreignField: '_id',
        as: 'brand',
      },
    },
    {
      $lookup: {
        from: 'categories',
        localField: 'category_id',
        foreignField: '_id',
        as: 'category',
      },
    },
    // First active, in-stock variant → used only when there's exactly 1 variant total
    {
      $lookup: {
        from: 'variants',
        let: { productId: '$_id' },
        pipeline: [
          { $match: { $expr: { $eq: ['$product_id', '$$productId'] }, deleted_at: null, is_active: true, quantity: { $gt: 0 } } },
          { $sort: { size_ml: 1 } },
          { $limit: 1 },
        ],
        as: 'defaultVariant',
      },
    },
    // NEW: all active variants (any stock level) → used to count how many variants exist
    {
      $lookup: {
        from: 'variants',
        let: { productId: '$_id' },
        pipeline: [
          { $match: { $expr: { $eq: ['$product_id', '$$productId'] }, deleted_at: null, is_active: true } },
        ],
        as: 'allVariants',
      },
    },
    {
      $facet: {
        data: [
          { $skip: skip },
          { $limit: limit },
          {
            $project: {
              name: 1,
              slug: 1,
              price: 1,
              stock: 1,
              images: 1,
              is_limited_edition: 1,
              brand: { $arrayElemAt: ['$brand.name', 0] },
              brand_slug: { $arrayElemAt: ['$brand.slug', 0] },
              category: { $arrayElemAt: ['$category.name', 0] },
              default_variant_id: { $arrayElemAt: ['$defaultVariant._id', 0] },
              variant_count: { $size: '$allVariants' }, // NEW
            },
          },
        ],
        totalCount: [{ $count: 'count' }],
      },
    }
  );

  const result = await Product.aggregate(pipeline);
  let products = result[0]?.data || [];
  
  const totalProducts = result[0]?.totalCount[0]?.count || 0;
  const totalPages = Math.max(Math.ceil(totalProducts / limit), 1);

  if (userId && products.length) {
    const wishlistedIds = await WishlistItem.find({
      user_id: userId,
      product_id: { $in: products.map((p) => p._id) },
    }).distinct('product_id');
    const wishlistedSet = new Set(wishlistedIds.map((id) => id.toString()));
    products = products.map((p) => ({ ...p, isWishlisted: wishlistedSet.has(p._id.toString()) }));
  } else {
    products = products.map((p) => ({ ...p, isWishlisted: false }));
  }

  return { products, totalProducts, page, totalPages, limit };
}

async function getFilterOptions() {
  const [categories, brands, concentrations, sizes, priceBounds] = await Promise.all([
    Category.find({ is_active: true, is_deleted: { $ne: true } }).select('name slug').lean(),
    Brand.find().select('name slug').lean(),
    Variant.distinct('concentration', { deleted_at: null, concentration: { $nin: [null, ''] } }),
    Variant.distinct('size_ml', { deleted_at: null, size_ml: { $ne: null } }),
    Product.aggregate([
      { $match: { is_active: true, is_deleted: { $ne: true } } },
      { $group: { _id: null, min: { $min: '$price' }, max: { $max: '$price' } } },
    ]),
  ]);

  return {
    categories,
    brands,
    concentrations: concentrations.sort(),
    sizes: sizes.sort((a, b) => a - b),
    priceMin: priceBounds[0]?.min ?? 0,
    priceMax: priceBounds[0]?.max ?? 100000,
  };
}

exports.renderProductListing = async (req, res) => {
  try {
    const userId = req.user ? req.user._id : null;
    const [{ products, totalProducts, page, totalPages, limit }, filterOptions] = await Promise.all([
      buildProductQuery(req.query, userId),
      getFilterOptions(),
    ]);

    res.render('user/shop/productListing', {
      user: req.user,
      products,
      totalProducts,
      currentPage: page,
      totalPages,
      limit,
      ...filterOptions,
      query: req.query,
    });
  } catch (err) {
    console.error('renderProductListing error:', err);
    res.status(500).render('user/error', { message: 'Failed to load products' });
  }
};

exports.getProductsPartial = async (req, res) => {
  try {
    const userId = req.user ? req.user._id : null;
    const { products, totalProducts, page, totalPages, limit } = await buildProductQuery(req.query, userId);

    res.render(
      'user/shop/partials/productGrid',
      {
        products,
        totalProducts,
        currentPage: page,
        totalPages,
        limit,
        query: req.query,
        layout: false,
      },
      (err, html) => {
        if (err) {
          console.error('getProductsPartial render error:', err);
          return res.status(500).json({ success: false, message: 'Failed to load products' });
        }
        res.json({ success: true, html, totalProducts, currentPage: page, totalPages });
      }
    );
  } catch (err) {
    console.error('getProductsPartial error:', err);
    res.status(500).json({ success: false, message: 'Failed to load products' });
  }
};