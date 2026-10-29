import express from 'express';
const router = express.Router();
import { checkUser } from '../../middleware/authMiddleware.js';
import { renderBrandsPage, renderBrandDetail } from '../../controllers/user/brandController.js';

// GET /brands
router.get('/', checkUser, renderBrandsPage);

// GET /brands/:slug
router.get('/:slug', checkUser, renderBrandDetail);

export default router;
