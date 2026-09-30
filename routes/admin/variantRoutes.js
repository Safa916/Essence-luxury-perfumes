const express = require('express');
const router = express.Router();

const variantController = require('../../controllers/admin/variantController');

// Mounted at /admin/variants in adminRoutes.js (requireAdminAuth already applied)
//
// GET    /admin/variants/:variantId          — fetch single variant (prefill Edit modal)
// POST   /admin/variants/product/:productId  — add a new variant to a product
// PUT    /admin/variants/:variantId          — update an existing variant
// DELETE /admin/variants/:variantId          — soft-delete a variant

router.get('/:variantId',             variantController.getVariant);
router.post('/product/:productId',    variantController.addVariant);
router.put('/:variantId',             variantController.updateVariant);
router.delete('/:variantId',          variantController.deleteVariant);

module.exports = router;
