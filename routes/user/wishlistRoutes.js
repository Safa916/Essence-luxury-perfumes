import express from 'express';
const router = express.Router();
import { requireAuth, checkUser } from '../../middleware/authMiddleware.js';
import { renderWishlist, addToWishlist, removeFromWishlist, removeFromWishlistByProduct, requireAuthApi } from '../../controllers/user/wishlistController.js';

// Full page — redirects to login if not authenticated
router.get('/', requireAuth, renderWishlist);


router.post('/add', checkUser, requireAuthApi, addToWishlist);
router.delete('/remove/:wishlistItemId', checkUser, requireAuthApi, removeFromWishlist);
router.delete('/remove-by-product/:productId', checkUser, requireAuthApi, removeFromWishlistByProduct);

export default router;