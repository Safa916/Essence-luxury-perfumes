const express = require('express');
const router = express.Router();
const { checkUser } = require('../../middleware/authMiddleware');
const { renderProductDetails } = require('../../controllers/user/productDetailsController');

router.get('/:slug', checkUser, renderProductDetails);

module.exports = router;
