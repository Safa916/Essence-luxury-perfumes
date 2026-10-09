const mongoose = require('mongoose');

const walletTransactionSchema = new mongoose.Schema(
  {
    wallet_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Wallet',
      required: [true, 'Wallet id is required'],
    },
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User id is required'],
    },
    type: {
      type: String,
      enum: ['credit', 'debit'],
      required: [true, 'Transaction type is required'],
    },
    amount: {
      type: mongoose.Schema.Types.Decimal128,
      required: [true, 'Amount is required'],
    },
    balance_after: {
      type: mongoose.Schema.Types.Decimal128,
      required: [true, 'Balance after transaction is required'],
      // snapshot of wallet balance right after this transaction — useful for auditing
    },
    category: {
      type: String,
      trim: true,
      // e.g. "refund", "cashback", "order_payment", "top_up"
    },
    description: {
      type: String,
      trim: true,
    },
    method: {
      type: String,
      trim: true,
      // e.g. "system", "admin_adjustment", "gateway"
    },
    related_order_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      default: null,
    },
    related_payment_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Payment',
      default: null,
    },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: false } }
);

const walletTransaction = mongoose.models.walletTransaction || mongoose.model('walletTransaction', walletTransactionSchema);
module.exports = walletTransaction;