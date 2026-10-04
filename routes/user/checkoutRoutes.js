const express  = require('express');
const router   = express.Router();
const { requireAuth } = require('../../middleware/authMiddleware');
const {
  renderCheckout,
  placeOrder,
  renderOrderSuccess,
} = require('../../controllers/user/checkoutController');

// GET  /checkout          — render checkout page (login required)
router.get('/',        requireAuth, renderCheckout);

// POST /checkout          — place COD order
router.post('/',       requireAuth, placeOrder);

// GET  /checkout/success/:orderId  — order confirmation page
router.get('/success/:orderId', requireAuth, renderOrderSuccess);

module.exports = router;
