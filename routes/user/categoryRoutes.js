const express = require('express');
const router = express.Router();
const { checkUser } = require('../../middleware/authMiddleware');
const { renderCategoriesPage } = require('../../controllers/user/categoryController');

router.get('/', checkUser, renderCategoriesPage);

module.exports = router;
