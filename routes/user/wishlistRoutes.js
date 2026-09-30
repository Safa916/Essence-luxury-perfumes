const express = require('express');
const router = express.Router();
const { requireAuth, checkUser } = require('../../middleware/authMiddleware');
const {
  renderWishlist,
  addToWishlist,
  removeFromWishlist,
  removeFromWishlistByProduct,
  requireAuthApi,
} = require('../../controllers/user/wishlistController');

// Full page — redirects to login if not authenticated
router.get('/', requireAuth, renderWishlist);

// AJAX endpoints — JSON 401 instead of redirecting
router.post('/add', checkUser, requireAuthApi, addToWishlist);
router.delete('/remove/:wishlistItemId', checkUser, requireAuthApi, removeFromWishlist);
router.delete('/remove-by-product/:productId', checkUser, requireAuthApi, removeFromWishlistByProduct);

module.exports = router;