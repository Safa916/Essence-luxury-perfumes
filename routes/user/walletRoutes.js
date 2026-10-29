import express from 'express';
const router  = express.Router();
import { requireAuth } from '../../middleware/authMiddleware.js';
import { renderWallet, createTopupOrder, verifyTopupPayment } from '../../controllers/user/walletController.js';

// GET /wallet — user wallet & transactions page
router.get('/', requireAuth, renderWallet);

// POST /wallet/topup/create-order — initiate Razorpay order for wallet topup
router.post('/topup/create-order', requireAuth, createTopupOrder);

// POST /wallet/topup/verify — verify Razorpay payment & credit wallet
router.post('/topup/verify', requireAuth, verifyTopupPayment);

export default router;
