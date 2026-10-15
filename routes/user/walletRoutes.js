const express = require('express');
const router  = express.Router();
const { requireAuth } = require('../../middleware/authMiddleware');
const {
  renderWallet,
  createTopupOrder,
  verifyTopupPayment,
} = require('../../controllers/user/walletController');

// GET /wallet — user wallet & transactions page
router.get('/', requireAuth, renderWallet);

// POST /wallet/topup/create-order — initiate Razorpay order for wallet topup
router.post('/topup/create-order', requireAuth, createTopupOrder);

// POST /wallet/topup/verify — verify Razorpay payment & credit wallet
router.post('/topup/verify', requireAuth, verifyTopupPayment);

module.exports = router;
