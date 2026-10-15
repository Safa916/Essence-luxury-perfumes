const express = require('express');
const router = express.Router();
const { checkUser } = require('../../middleware/authMiddleware');
const {
  renderBrandsPage,
  renderBrandDetail,
} = require('../../controllers/user/brandController');

// GET /brands
router.get('/', checkUser, renderBrandsPage);

// GET /brands/:slug
router.get('/:slug', checkUser, renderBrandDetail);

module.exports = router;
