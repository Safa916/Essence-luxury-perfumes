import express from 'express';
const router = express.Router();
import { checkUser } from '../../middleware/authMiddleware.js';
import { renderProductListing, getProductsPartial } from '../../controllers/user/productListingController.js';

// Full page load
router.get('/', checkUser, renderProductListing);

// AJAX endpoint — returns { html, totalProducts, currentPage, totalPages }
// Called by public/user/js/shop/productListing.js on search/sort/filter/page change
router.get('/products', checkUser, getProductsPartial);

export default router;

