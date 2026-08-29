const express = require('express');
const router = express.Router();

const variantController = require('../controllers/admin/variantController');

// Mounted at /admin/variants in adminRoutes.js (requireAdminAuth already applied)

router.get('/single/:variantId', variantController.getVariant);
router.post('/:productId', variantController.addVariant);
router.put('/:variantId', variantController.updateVariant);
router.delete('/:variantId', variantController.deleteVariant);

module.exports = router;
