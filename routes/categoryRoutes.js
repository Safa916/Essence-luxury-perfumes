const express = require('express');
const router = express.Router();
const categoryController = require('../controllers/admin/categoryController');

// GET /admin/categories               -> list (search, sort desc, paginate) + modal state
router.get('/', categoryController.listCategories);

// POST /admin/categories/add          -> handle Add modal submit
router.post('/add', categoryController.createCategory);

// PUT /admin/categories/:id/edit      -> handle Edit modal submit (via _method=PUT)
router.put('/:id/edit', categoryController.updateCategory);

// PATCH /admin/categories/:id/status  -> toggle active/inactive (via _method=PATCH)
router.patch('/:id/status', categoryController.toggleStatus);

// DELETE /admin/categories/:id        -> soft delete (via _method=DELETE)
router.delete('/:id', categoryController.deleteCategory);

module.exports = router;