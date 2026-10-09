const express = require('express');
const router = express.Router();

const productController = require('../../controllers/admin/productController');
const { uploadProductImages, resizeProductImages } = require('../../middleware/uploadProductImages');

// NOTE: this router is mounted at /admin/products in adminRoutes.js,
// and requireAdminAuth is already applied there.

// Product Management table


router.get('/', productController.renderProductManagement);






// Add product
router.get('/add', productController.renderAddProduct);
router.post('/add', uploadProductImages.array('images', 8), resizeProductImages, productController.createProduct);





// Edit product
router.get('/:id/edit', productController.renderEditProduct);
router.put('/:id', uploadProductImages.array('images', 8), resizeProductImages, productController.updateProduct);

// Soft delete (AJAX from the confirm popup)
router.delete('/:id', productController.softDeleteProduct);

// Core Specs page (clicking a row on Product Management)
router.get('/:id', productController.renderProductDetail);

// Variant Manager (reached via the "View Variants" button on the Core Specs page)
router.get('/:id/variants', productController.renderVariantManager);



module.exports = router;