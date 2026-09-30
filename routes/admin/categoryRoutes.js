const express = require('express');
const router = express.Router();
const categoryController = require('../../controllers/admin/categoryController');
const { uploadCategoryImage } = require('../../middleware/uploadCategoryImage');

// GET /admin/categories               -> list (search, sort desc, paginate) + modal state
router.get('/', categoryController.listCategories);

// POST /admin/categories/add          -> handle Add modal submit
router.post('/add', uploadCategoryImage, categoryController.createCategory);

// PUT /admin/categories/:id/edit      -> handle Edit modal submit (via _method=PUT)
router.put('/:id/edit', uploadCategoryImage, categoryController.updateCategory);

// PATCH /admin/categories/:id/status  -> toggle active/inactive (via _method=PATCH)
router.patch('/:id/status', categoryController.toggleStatus);

// DELETE /admin/categories/:id        -> soft delete (via _method=DELETE)
router.delete('/:id', categoryController.deleteCategory);

module.exports = router;