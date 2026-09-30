const express = require('express');
const router = express.Router();
const { requireAuth, checkUser } = require('../../middleware/authMiddleware');
const {
  addToCart,
  renderCart,
  updateQuantity,
  removeItem,
  requireAuthApi,
} = require('../../controllers/user/cartController');

// Full page — redirects to login if not authenticated
router.get('/', requireAuth, renderCart);

// AJAX endpoints — return JSON 401 instead of redirecting, so fetch() can react
router.post('/add', checkUser, requireAuthApi, addToCart);
router.patch('/update', checkUser, requireAuthApi, updateQuantity);
router.delete('/remove/:cartItemId', checkUser, requireAuthApi, removeItem);

module.exports = router;
