import express from 'express';
const router   = express.Router();
import { requireAuth, checkUser } from '../../middleware/authMiddleware.js';
import { applyCoupon, removeCoupon, getAvailableCoupons, renderUserCoupons } from '../../controllers/user/couponController.js';

// GET /coupon  — user coupons listing page
router.get('/', checkUser, renderUserCoupons);

// GET /coupon/available — JSON of active coupons for user & cart
router.get('/available', checkUser, getAvailableCoupons);

// POST /coupon/apply  — apply a coupon code to the cart
router.post('/apply',  requireAuth, applyCoupon);

// DELETE /coupon/remove — remove the currently applied coupon
router.delete('/remove', requireAuth, removeCoupon);

export default router;
