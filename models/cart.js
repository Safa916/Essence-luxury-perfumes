const mongoose = require('mongoose');

const cartSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User id is required'],
      unique: true, // one active cart per user
    },
    items: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'cartItem', // points to documents in the cartItem collection (matches model registration name)
      },
    ],
    applied_coupon: {
      code: { type: String, default: null },
      discount_value: { type: mongoose.Schema.Types.Decimal128, default: null },
    },
    subtotal: {
      type: mongoose.Schema.Types.Decimal128,
      default: 0,
    },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

const cart = mongoose.model('cart', cartSchema);
module.exports = cart;