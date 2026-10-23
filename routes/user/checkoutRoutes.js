const express  = require('express');
const router   = express.Router();
const { requireAuth } = require('../../middleware/authMiddleware');
const {
  renderCheckout,
  placeOrder,
  renderOrderSuccess,
  createRazorpayOrder,
  verifyRazorpayPayment,
  renderPaymentFailure,
  getCheckoutSummary,
} = require('../../controllers/user/checkoutController');

// GET  /checkout                     — render checkout page (login required)
router.get('/',                       requireAuth, renderCheckout);

// GET  /checkout/summary             — JSON: fresh totals for stale-tab detection
router.get('/summary',                requireAuth, getCheckoutSummary);

// POST /checkout                     — place COD order
router.post('/',                      requireAuth, placeOrder);

// POST /checkout/create-razorpay-order — initialize Razorpay online order
router.post('/create-razorpay-order', requireAuth, createRazorpayOrder);

// POST /checkout/verify-razorpay-payment — verify signature & finalize order
router.post('/verify-razorpay-payment', requireAuth, verifyRazorpayPayment);

// GET  /checkout/failure             — payment failed / cancelled page
router.get('/failure',                requireAuth, renderPaymentFailure);

// GET  /checkout/success/:orderId    — order confirmation page
router.get('/success/:orderId',        requireAuth, renderOrderSuccess);

module.exports = router;
