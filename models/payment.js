const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User id is required'],
    },
    order_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      default: null,
    },
    product_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      default: null,
    },
    purpose: {
      type: String,
      trim: true,
      // e.g. "order_payment", "wallet_topup"
    },
    gateway: {
      type: String,
      trim: true,
      // e.g. "razorpay", "stripe"
    },
    gateway_order_id: {
      type: String,
      trim: true,
    },
    transaction_id: {
      type: String,
      trim: true,
      default: null,
    },
    amount: {
      type: mongoose.Schema.Types.Decimal128,
      required: [true, 'Amount is required'],
    },
    status: {
      type: String,
      enum: ['pending', 'success', 'failed', 'refunded'],
      default: 'pending',
    },
    failure_reason: {
      type: String,
      default: null,
    },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: false } }
);

const payment = mongoose.models.payment || mongoose.model('payment', paymentSchema);
module.exports = payment;