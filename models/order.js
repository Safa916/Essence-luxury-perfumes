const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User id is required'],
    },
    order_number: {
      type: String,
      required: [true, 'Order number is required'],
      unique: true,
      trim: true,
    },
    shipping_address: {
      // embedded snapshot of the address at time of order
      // (not a reference — so it stays accurate even if the user edits/deletes their saved address later)
      full_name: String,
      phone_number: String,
      address_line1: String,
      address_line2: String,
      city: String,
      state: String,
      country: String,
      pincode: String,
    },
    payment_method: {
      type: String,
      trim: true,
    },
    payment_status: {
      type: String,
      enum: ['pending', 'paid', 'failed', 'refunded'],
      default: 'pending',
    },
    order_status: {
      type: String,
      enum: ['placed', 'processing', 'shipped', 'delivered', 'cancelled'],
      default: 'placed',
    },
    items: [
      {
        product_id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Product',
        },
        variant_id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Variant',
        },
        product_name: String, // snapshot at time of order
        size: String,
        quantity: {
          type: Number,
          required: true,
          min: 1,
        },
        price_at_purchase: {
          type: mongoose.Schema.Types.Decimal128,
          required: true,
        },
      },
    ],
    subtotal: {
      type: mongoose.Schema.Types.Decimal128,
      required: true,
    },
    discount_amount: {
      type: mongoose.Schema.Types.Decimal128,
      default: 0,
    },
    tax_amount: {
      type: mongoose.Schema.Types.Decimal128,
      default: 0,
    },
    shipping_fee: {
      type: mongoose.Schema.Types.Decimal128,
      default: 0,
    },
    total_amount: {
      type: mongoose.Schema.Types.Decimal128,
      required: true,
    },
    coupon_code: {
      type: String,
      default: null,
      trim: true,
    },
    payment_id: {
      type: String,
      default: null,
    },
    courier_name: {
      type: String,
      default: null,
    },
    tracking_number: {
      type: String,
      default: null,
    },
    estimated_delivery: {
      type: String,
      default: null,
    },
    internal_notes: {
      type: String,
      default: null,
    },
  },
  { timestamps: { createdAt: 'placed_at', updatedAt: 'updated_at' } }
);

const order = mongoose.model('order', orderSchema);
module.exports = order;