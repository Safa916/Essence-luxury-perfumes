import express from 'express';
const router = express.Router();
import { checkUser } from '../../middleware/authMiddleware.js';
import { renderCategoriesPage } from '../../controllers/user/categoryController.js';

router.get('/', checkUser, renderCategoriesPage);

export default router;
