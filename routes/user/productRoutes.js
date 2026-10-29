import express from 'express';
const router = express.Router();
import { checkUser } from '../../middleware/authMiddleware.js';
import { renderProductDetails } from '../../controllers/user/productDetailsController.js';

router.get('/:slug', checkUser, renderProductDetails);

export default router;
