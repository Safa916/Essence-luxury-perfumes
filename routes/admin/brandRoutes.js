import express from 'express';
const router  = express.Router();
import bc from '../../controllers/admin/brandController.js';

// List
router.get('/',                bc.listBrands);

// Add
router.get('/add',             bc.renderAdd);
router.post('/add',            bc.createBrand);

// Edit
router.get('/:id/edit',        bc.renderEdit);
router.post('/:id/edit',       bc.updateBrand);

// Toggle active (AJAX)
router.post('/:id/toggle',     bc.toggleBrand);

// Delete
router.post('/:id/delete',     bc.deleteBrand);

export default router;
