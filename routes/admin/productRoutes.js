import express from 'express';
const router = express.Router();

import productController from '../../controllers/admin/productController.js';
import { uploadProductImages, resizeProductImages } from '../../middleware/uploadProductImages.js';

// NOTE: this router is mounted at /admin/products in adminRoutes.js,
// and requireAdminAuth is already applied there.

// Product Management table


router.get('/', productController.renderProductManagement);






// Add product
router.get('/add', productController.renderAddProduct);
router.get('/check-name', productController.checkProductName);
router.get('/check-sku', productController.checkProductSku);
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



export default router;