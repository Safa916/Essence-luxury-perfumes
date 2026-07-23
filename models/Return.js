const mongoose = require('mongoose');

const returnSchema = new mongoose.Schema(
  {
    order_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: [true, 'Order id is required'],
    },
    order_item_id: {
      type: mongoose.Schema.Types.ObjectId,
      // points to a specific item within the order's embedded items array
      default: null,
    },
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User id is required'],
    },
    return_id: {
      type: String,
      unique: true,
      trim: true,
      // e.g. a human-readable return reference number
    },
    reason: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: ['requested', 'approved', 'rejected', 'picked_up', 'refunded'],
      default: 'requested',
    },
    refund_amount: {
      type: mongoose.Schema.Types.Decimal128,
      default: 0,
    },
    refund_method: {
      type: String,
      trim: true,
      // e.g. "original_payment", "wallet"
    },
    shipping_fee: {
      type: mongoose.Schema.Types.Decimal128,
      default: 0,
    },
    comments: {
      type: String,
      default: null,
    },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

const Return = mongoose.model('Return', returnSchema);
module.exports = Return;