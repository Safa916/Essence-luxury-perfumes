const express = require('express');
const router  = express.Router();
const bc      = require('../../controllers/admin/brandController');

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

module.exports = router;
