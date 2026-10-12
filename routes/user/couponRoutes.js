const express  = require('express');
const router   = express.Router();
const { requireAuth } = require('../../middleware/authMiddleware');
const { applyCoupon, removeCoupon } = require('../../controllers/user/couponController');

// POST /coupon/apply  — apply a coupon code to the cart
router.post('/apply',  requireAuth, applyCoupon);

// DELETE /coupon/remove — remove the currently applied coupon
router.delete('/remove', requireAuth, removeCoupon);

module.exports = router;
