const Product = require('../../models/product');
const Variant = require('../../models/variant');
const Review = require('../../models/review');

function formatRelativeTime(date) {
  const now = new Date();
  const diffMs = now - new Date(date);
  const sec = Math.floor(diffMs / 1000);
  const min = Math.floor(sec / 60);
  const hr = Math.floor(min / 60);
  const day = Math.floor(hr / 24);
  const week = Math.floor(day / 7);
  const month = Math.floor(day / 30);
  const year = Math.floor(day / 365);

  if (sec < 60) return 'Just now';
  if (min < 60) return `${min} minute${min === 1 ? '' : 's'} ago`;
  if (hr < 24) return `${hr} hour${hr === 1 ? '' : 's'} ago`;
  if (day < 7) return `${day} day${day === 1 ? '' : 's'} ago`;
  if (week < 5) return `${week} week${week === 1 ? '' : 's'} ago`;
  if (month < 12) return `${month} month${month === 1 ? '' : 's'} ago`;
  return `${year} year${year === 1 ? '' : 's'} ago`;
}

function formatReviewerName(fullName) {
  if (!fullName) return 'Anonymous';
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

function toNumber(decimal128) {
  if (decimal128 === null || decimal128 === undefined) return null;
  return parseFloat(decimal128.toString());
}

// GET /product/:slug
exports.renderProductDetails = async (req, res) => {
  try {
    const { slug } = req.params;

    const product = await Product.findOne({ slug })
      .populate('brand_id', 'name slug')
      .populate('category_id', 'name slug')
      .lean();

    // Product doesn't exist, OR exists but is blocked/unlisted/deleted —
    // either way, send the user back to the listing instead of a dead page.
    // Covers both a stale link and a product being blocked mid-session on refresh.
    if (!product || !product.is_active || product.is_deleted) {
      return res.redirect('/shop?notice=unavailable');
    }

    // If the product's category has been deactivated by an admin, treat the
    // product as unavailable on the user-facing store.
    if (product.category_id && product.category_id.is_active === false) {
      return res.redirect('/shop?notice=unavailable');
    }

    const variantsRaw = await Variant.find({
      product_id: product._id,
      deleted_at: null,
      is_active: true,
    })
      .sort({ size_ml: 1 })
      .lean();

    const variants = variantsRaw.map((v) => ({
      ...v,
      price: toNumber(v.price) ?? 0,
      compare_at_price: toNumber(v.compare_at_price),
    }));

    const inStock = variants.some((v) => v.quantity > 0);

    // Reviews — only publicly approved ones, newest first
    const reviewsRaw = await Review.find({ product_id: product._id, status: 'approved' })
      .sort({ created_at: -1 })
      .limit(10)
      .populate('user_id', 'full_name')
      .lean();

    const reviews = reviewsRaw.map((r) => ({
      ...r,
      relativeTime: formatRelativeTime(r.created_at),
      reviewerName: formatReviewerName(r.user_id?.full_name),
      isVerified: !!r.order_id,
    }));

    const ratingAgg = await Review.aggregate([
      { $match: { product_id: product._id, status: 'approved' } },
      { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
    ]);
    const avgRating = ratingAgg[0]?.avg || 0;
    const totalReviews = ratingAgg[0]?.count || 0;

    // Related products — same brand, excluding this one, still listed
    const relatedProducts = product.brand_id
      ? await Product.find({
          _id: { $ne: product._id },
          brand_id: product.brand_id._id,
          is_active: true,
          is_deleted: { $ne: true },
        })
          .limit(4)
          .lean()
      : [];

    res.render('user/product/productDetails', {
      user: req.user,
      product,
      variants,
      inStock,
      reviews,
      avgRating,
      totalReviews,
      relatedProducts,
    });
  } catch (err) {
    console.error('renderProductDetails error:', err);
    res.status(500).render('user/error', { message: 'Failed to load product' });
  }
};
