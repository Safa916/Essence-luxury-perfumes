const express = require('express');
const router = express.Router();
const { checkUser } = require('../../middleware/authMiddleware');
const {
  renderProductListing,
  getProductsPartial,
} = require('../../controllers/user/productListingController');

// Full page load
router.get('/', checkUser, renderProductListing);

// AJAX endpoint — returns { html, totalProducts, currentPage, totalPages }
// Called by public/user/js/shop/productListing.js on search/sort/filter/page change
router.get('/products', checkUser, getProductsPartial);

module.exports = router;

