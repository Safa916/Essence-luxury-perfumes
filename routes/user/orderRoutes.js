const express = require('express');
const router  = express.Router();
const { requireAuth } = require('../../middleware/authMiddleware');
const { listOrders, getOrderDetail, cancelOrder, renderReturnForm, submitReturn, downloadInvoice } = require('../../controllers/user/orderController');

// GET  /orders           — listing
router.get('/',    requireAuth, listOrders);

// GET  /orders/:id       — detail page
router.get('/:id', requireAuth, getOrderDetail);

// POST /orders/:id/cancel — cancel an order
router.post('/:id/cancel', requireAuth, cancelOrder);

// GET  /orders/:id/return — return form
router.get('/:id/return',  requireAuth, renderReturnForm);

// POST /orders/:id/return — submit return
router.post('/:id/return', requireAuth, submitReturn);

// GET  /orders/:id/invoice — download PDF invoice
router.get('/:id/invoice', requireAuth, downloadInvoice);

module.exports = router;
