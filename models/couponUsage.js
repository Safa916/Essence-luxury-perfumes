const mongoose = require('mongoose');

const couponUsageSchema = new mongoose.Schema(
  {
    coupon_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Coupon',
      required: [true, 'Coupon id is required'],
    },
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User id is required'],
    },
    order_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: [true, 'Order id is required'],
    },
    discount_applied: {
      type: mongoose.Schema.Types.Decimal128,
      required: [true, 'Discount applied is required'],
    },
  },
  { timestamps: { createdAt: 'used_at', updatedAt: false } }
  // matches your diagram's "used_at" field name exactly
);

const couponUsage = mongoose.model('couponUsage', couponUsageSchema);
module.exports = couponUsage;