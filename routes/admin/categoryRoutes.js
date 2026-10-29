import express from 'express';
const router = express.Router();
import categoryController from '../../controllers/admin/categoryController.js';
import { uploadCategoryImage } from '../../middleware/uploadCategoryImage.js';

// GET /admin/categories               -> list (search, sort desc, paginate) + modal state
router.get('/', categoryController.listCategories);

// POST /admin/categories/add          -> handle Add modal submit
router.post('/add', uploadCategoryImage, categoryController.createCategory);

// PUT or POST /admin/categories/:id/edit -> handle Edit modal submit
router.put('/:id/edit', uploadCategoryImage, categoryController.updateCategory);
router.post('/:id/edit', uploadCategoryImage, categoryController.updateCategory);

// PATCH /admin/categories/:id/status  -> toggle active/inactive (via _method=PATCH)
router.patch('/:id/status', categoryController.toggleStatus);

// DELETE /admin/categories/:id        -> soft delete (via _method=DELETE)
router.delete('/:id', categoryController.deleteCategory);

export default router;