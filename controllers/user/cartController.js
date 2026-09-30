const mongoose = require('mongoose');
const Cart = require('../../models/cart');
const CartItem = require('../../models/cartItem');
const Product = require('../../models/product');
const Variant = require('../../models/variant');
const WishlistItem = require('../../models/wishlistItems');

const MAX_QTY_PER_ITEM = 5;

function toNumber(decimal128) {
  if (decimal128 === null || decimal128 === undefined) return 0;
  return parseFloat(decimal128.toString());
}

// Small auth guard for the JSON/AJAX endpoints below — page routes use the
// existing requireAuth (redirects); these return JSON so fetch() can react.
exports.requireAuthApi = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Please log in to continue.', redirect: '/auth/login' });
  }
  next();
};

async function recalcCartSubtotal(cartId) {
  const items = await CartItem.find({ cart_id: cartId });
  const subtotal = items.reduce((sum, item) => sum + toNumber(item.total_price), 0);
  await Cart.findByIdAndUpdate(cartId, { subtotal });
  return subtotal;
}

async function getOrCreateCart(userId) {
  let cart = await Cart.findOne({ user_id: userId });
  if (!cart) {
    cart = await Cart.create({ user_id: userId, items: [] });
  }
  return cart;
}

// POST /cart/add  { product_id, variant_id, quantity }
exports.addToCart = async (req, res) => {
  try {
    // Guard: requireAuthApi is in the route chain but add an explicit check
    // here too so a misconfigured route can never crash the server.
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Please log in to continue.', redirect: '/auth/login' });
    }
    const userId = req.user._id;
    const { product_id, variant_id } = req.body;
    let quantity = parseInt(req.body.quantity, 10) || 1;

    if (!mongoose.Types.ObjectId.isValid(product_id) || !mongoose.Types.ObjectId.isValid(variant_id)) {
      return res.status(400).json({ success: false, message: 'Invalid product or variant.' });
    }

    const product = await Product.findById(product_id).lean();
    if (!product || !product.is_active || product.is_deleted) {
      return res.status(400).json({ success: false, message: 'This product is no longer available.' });
    }

    const variant = await Variant.findOne({
      _id: variant_id,
      product_id: product._id,
      is_active: true,
      deleted_at: null,
    }).lean();

    if (!variant) {
      return res.status(400).json({ success: false, message: 'This size is no longer available.' });
    }

    if (variant.quantity <= 0) {
      return res.status(400).json({ success: false, message: 'This size is out of stock.' });
    }

    const cart = await getOrCreateCart(userId);
    const unitPrice = toNumber(variant.price);

    let existingItem = await CartItem.findOne({
      cart_id: cart._id,
      product_id: product._id,
      variant_id: variant._id,
    });

    if (existingItem) {
      const newQty = Math.min(existingItem.quantity + quantity, MAX_QTY_PER_ITEM, variant.quantity);
      existingItem.quantity = newQty;
      existingItem.unit_price = unitPrice;
      existingItem.total_price = unitPrice * newQty;
      await existingItem.save();
    } else {
      quantity = Math.min(quantity, MAX_QTY_PER_ITEM, variant.quantity);
      existingItem = await CartItem.create({
        cart_id: cart._id,
        product_id: product._id,
        variant_id: variant._id,
        quantity,
        unit_price: unitPrice,
        total_price: unitPrice * quantity,
      });
      cart.items.push(existingItem._id);
      await cart.save();
    }

    // Remove from wishlist once it's in the cart
    await WishlistItem.deleteMany({ user_id: userId, product_id: product._id });

    const subtotal = await recalcCartSubtotal(cart._id);
    const itemCount = await CartItem.countDocuments({ cart_id: cart._id });

    res.json({ success: true, message: 'Added to your bag', itemCount, subtotal });
  } catch (err) {
    console.error('addToCart error:', err);
    res.status(500).json({ success: false, message: 'Could not add to cart.' });
  }
};

// GET /cart  -> full cart page
const CART_PAGE_LIMIT = 4; // items shown per page

exports.renderCart = async (req, res) => {
  try {
    const cart = await Cart.findOne({ user_id: req.user._id }).lean();

    if (!cart || !cart.items.length) {
      return res.render('user/cart/cart', {
        user: req.user,
        items: [],
        subtotal: 0,
        hasUnavailable: false,
        currentPage: 1,
        totalPages: 1,
        totalItems: 0,
      });
    }

    const cartItemsRaw = await CartItem.find({ cart_id: cart._id })
      .populate('product_id')
      .populate('variant_id')
      .lean();

    let hasUnavailable = false;

    // Build the full items list (all pages) so subtotal is always accurate
    const allItems = cartItemsRaw
      .filter((item) => item.product_id)
      .map((item) => {
        const product = item.product_id;
        const variant = item.variant_id;

        const productOk = product.is_active && !product.is_deleted;
        const variantOk = variant && variant.is_active && !variant.deleted_at;
        const inStock = variantOk && variant.quantity > 0;
        const available = productOk && variantOk && inStock;

        if (!available) hasUnavailable = true;

        return {
          cart_item_id: item._id,
          product_id: product._id,
          product_name: product.name,
          product_slug: product.slug,
          image: (product.images && product.images[0]) || '/user/images/placeholder.jpg',
          variant_id: variant ? variant._id : null,
          size_ml: variant ? variant.size_ml : null,
          quantity: item.quantity,
          unit_price: toNumber(item.unit_price),
          total_price: toNumber(item.total_price),
          max_qty: variant ? Math.min(MAX_QTY_PER_ITEM, variant.quantity) : 0,
          available,
          unavailableReason: !productOk
            ? 'No longer available'
            : !variantOk
            ? 'This size was removed'
            : !inStock
            ? 'Out of stock'
            : null,
        };
      });

    // Subtotal always reflects ALL items, not just the current page
    const subtotal = allItems.filter((i) => i.available).reduce((sum, i) => sum + i.total_price, 0);

    // Pagination
    const totalItems= allItems.length;
    const totalPages = Math.max(Math.ceil(totalItems / CART_PAGE_LIMIT), 1);
    const currentPage = Math.min(Math.max(parseInt(req.query.page, 10) || 1, 1), totalPages);
    const startIdx = (currentPage - 1) * CART_PAGE_LIMIT;
    const items = allItems.slice(startIdx, startIdx + CART_PAGE_LIMIT);

    res.render('user/cart/cart', {
      user: req.user,
      items,
      subtotal,
      hasUnavailable,
      currentPage,
      totalPages,
      totalItems,
    });
  } catch (err) {
    console.error('renderCart error:', err);
    res.status(500).render('user/error', { message: 'Failed to load your bag' });
  }
};

// PATCH /cart/update  { cart_item_id, action: 'increase' | 'decrease' }
exports.updateQuantity = async (req, res) => {
  try {
    const { cart_item_id, action } = req.body;

    const item = await CartItem.findById(cart_item_id).populate('variant_id');
    if (!item) return res.status(404).json({ success: false, message: 'Item not found.' });

    const variant = item.variant_id;
    const maxQty = variant ? Math.min(MAX_QTY_PER_ITEM, variant.quantity) : MAX_QTY_PER_ITEM;

    let newQty = item.quantity;
    if (action === 'increase') newQty = Math.min(item.quantity + 1, maxQty);
    if (action === 'decrease') newQty = Math.max(item.quantity - 1, 1);

    item.quantity = newQty;
    item.total_price = toNumber(item.unit_price) * newQty;
    await item.save();

    const subtotal = await recalcCartSubtotal(item.cart_id);

    res.json({
      success: true,
      quantity: newQty,
      total_price: toNumber(item.total_price),
      subtotal,
      maxReached: newQty >= maxQty,
      minReached: newQty <= 1,
    });
  } catch (err) {
    console.error('updateQuantity error:', err);
    res.status(500).json({ success: false, message: 'Could not update quantity.' });
  }
};

// DELETE /cart/remove/:cartItemId
exports.removeItem = async (req, res) => {
  try {
    const item = await CartItem.findById(req.params.cartItemId);
    if (!item) return res.status(404).json({ success: false, message: 'Item not found.' });

    const cartId = item.cart_id;
    await CartItem.findByIdAndDelete(item._id);
    await Cart.findByIdAndUpdate(cartId, { $pull: { items: item._id } });

    const subtotal = await recalcCartSubtotal(cartId);
    const itemCount = await CartItem.countDocuments({ cart_id: cartId });

    res.json({ success: true, subtotal, itemCount });
  } catch (err) {
    console.error('removeItem error:', err);
    res.status(500).json({ success: false, message: 'Could not remove item.' });
  }
};