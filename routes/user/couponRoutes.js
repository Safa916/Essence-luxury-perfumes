const express  = require('express');
const router   = express.Router();
const { requireAuth, checkUser } = require('../../middleware/authMiddleware');
const {
  applyCoupon,
  removeCoupon,
  getAvailableCoupons,
  renderUserCoupons,
} = require('../../controllers/user/couponController');

// GET /coupon  — user coupons listing page
router.get('/', checkUser, renderUserCoupons);

// GET /coupon/available — JSON of active coupons for user & cart
router.get('/available', checkUser, getAvailableCoupons);

// POST /coupon/apply  — apply a coupon code to the cart
router.post('/apply',  requireAuth, applyCoupon);

// DELETE /coupon/remove — remove the currently applied coupon
router.delete('/remove', requireAuth, removeCoupon);

module.exports = router;
