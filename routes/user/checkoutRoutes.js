import express from 'express';
const router   = express.Router();
import { requireAuth } from '../../middleware/authMiddleware.js';
import {
  renderCheckout,
  placeOrder,
  renderOrderSuccess,
  createRazorpayOrder,
  verifyRazorpayPayment,
  renderPaymentFailure,
  getCheckoutSummary,
  checkCheckoutStock
} from '../../controllers/user/checkoutController.js';

// GET  /checkout                     — render checkout page (login required)
router.get('/',                       requireAuth, renderCheckout);

// GET  /checkout/check-stock         — JSON: live pre-flight stock verification
router.get('/check-stock',            requireAuth, checkCheckoutStock);

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

export default router;
