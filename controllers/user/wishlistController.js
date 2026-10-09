const mongoose = require('mongoose');
const WishlistItem = require('../../models/wishlistItems');
const Product = require('../../models/product');
const Variant = require('../../models/variant');

exports.requireAuthApi = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Please log in to continue.', redirect: '/auth/login' });
  }
  next();
};

function toNumber(decimal128) {
  if (decimal128 === null || decimal128 === undefined) return 0;
  return parseFloat(decimal128.toString());
}

// GET /wishlist
exports.renderWishlist = async (req, res) => {
  try {
    const itemsRaw = await WishlistItem.find({ user_id: req.user._id })
      .sort({ added_at: -1 })
      .populate('product_id')
      .populate('variant_id')
      .lean();

    const items = itemsRaw
      .filter((item) => item.product_id)
      .map((item) => {
        const product = item.product_id;
        const variant = item.variant_id;
        const available = product.is_active && !product.is_deleted;

        return {
          wishlist_item_id: item._id,
          product_id: product._id,
          product_name: product.name,
          product_slug: product.slug,
          image: (product.images && product.images[0]) || '/user/images/placeholder.jpg',
          variant_id: variant ? variant._id : null,
          size_ml: variant ? variant.size_ml : null,
          price: variant ? toNumber(variant.price) : toNumber(product.price),
          available,
          inStock: variant ? variant.quantity > 0 : product.stock > 0,
        };
      });

    res.render('user/wishlist/wishlist', { user: req.user, items });
  } catch (err) {
    console.error('renderWishlist error:', err);
    res.status(500).render('user/error', { message: 'Failed to load your wishlist' });
  }
};

// POST /wishlist/add  { product_id, variant_id }
exports.addToWishlist = async (req, res) => {
  try {
    const userId = req.user._id;
    const { product_id, variant_id } = req.body;

    if (!mongoose.Types.ObjectId.isValid(product_id)) {
      return res.status(400).json({ success: false, message: 'Invalid product.' });
    }

    const product = await Product.findById(product_id).lean();
    if (!product || !product.is_active || product.is_deleted) {
      return res.status(400).json({ success: false, message: 'This product is no longer available.' });
    }

    const existing = await WishlistItem.findOne({ user_id: userId, product_id });
    if (existing) {
      return res.json({ success: true, message: 'Already in your wishlist.', alreadyExists: true, inWishlist: true });
    }

    await WishlistItem.create({
      user_id: userId,
      product_id,
      variant_id: variant_id && mongoose.Types.ObjectId.isValid(variant_id) ? variant_id : null,
    });

    res.json({ success: true, message: 'Added to your wishlist.', inWishlist: true });
  } catch (err) {
    console.error('addToWishlist error:', err);
    res.status(500).json({ success: false, message: 'Could not add to wishlist.' });
  }
};

// DELETE /wishlist/remove/:wishlistItemId
exports.removeFromWishlist = async (req, res) => {
  try {
    await WishlistItem.findOneAndDelete({
      _id: req.params.wishlistItemId,
      user_id: req.user._id,
    });
    res.json({ success: true });
  } catch (err) {
    console.error('removeFromWishlist error:', err);
    res.status(500).json({ success: false, message: 'Could not remove item.' });
  }
};

// DELETE /wishlist/remove-by-product/:productId


exports.removeFromWishlistByProduct = async (req, res) => {
  try {
    await WishlistItem.deleteMany({
      user_id: req.user._id,
      product_id: req.params.productId,
    });
    res.json({ success: true });
  } catch (err) {
     console.error('removeFromWishlistByProduct error:', err);
    res.status(500).json({ success: false, message: 'Could not remove item.' });
  }
};