const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: [true, 'Coupon code is required'],
      unique: true,
      uppercase: true,
      trim: true,
      // e.g. "SAVE20"
    },
    description: {
      type: String,
      required: [true, 'Description is required'],
      trim: true,
    },
    discount_type: {
      type: String,
      enum: ['percentage', 'fixed'],
      required: [true, 'Discount type is required'],
    },
    discount_value: {
      type: mongoose.Schema.Types.Decimal128,
      required: [true, 'Discount value is required'],
    },
    min_order_value: {
      type: mongoose.Schema.Types.Decimal128,
      default: 0,
    },
    max_discount_amount: {
      type: mongoose.Schema.Types.Decimal128,
      default: null, // nullable — e.g. for "fixed" discounts, a cap may not apply
    },
    valid_until: {
      type: Date,
      default: null,
    },
    is_active: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: false } // your diagram shows no created_at/updated_at for this collection
);

const coupon = mongoose.models.coupon || mongoose.model('coupon', couponSchema);
module.exports = coupon;