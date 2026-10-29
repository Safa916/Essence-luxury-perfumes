import express from 'express';
const router = express.Router();
import { requireAuth, checkUser } from '../../middleware/authMiddleware.js';
import { addToCart, renderCart, updateQuantity, removeItem, requireAuthApi } from '../../controllers/user/cartController.js';

// Full page — redirects to login if not authenticated
router.get('/', requireAuth, renderCart);

// AJAX endpoints — return JSON 401 instead of redirecting, so fetch() can react
router.post('/add', checkUser, requireAuthApi, addToCart);
router.patch('/update', checkUser, requireAuthApi, updateQuantity);
router.delete('/remove/:cartItemId', checkUser, requireAuthApi, removeItem);


export default router;
