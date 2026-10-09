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
      enum: ['placed', 'processing', 'shipped', 'out_for_delivery', 'delivered', 'cancelled', 'returned'],
      default: 'placed',
    },
    items: [
      {
        product_id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'product',   // matches mongoose.model('product', ...)
        },
        variant_id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'variant',   // matches mongoose.model('variant', ...)
        },
        product_name: String, // snapshot at time of order
        size: String,
        image: { type: String, default: '' }, // first product image URL — snapshot
        quantity: {
          type: Number,
          required: true,
          min: 1,
        },
        price_at_purchase: {
          type: mongoose.Schema.Types.Decimal128,
          required: true,
        },
        item_status: {
          type: String,
          enum: ['placed', 'processing', 'shipped', 'out_for_delivery', 'delivered', 'cancelled', 'returned'],
          default: 'placed',
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
    cancel_reason: {
      type: String,
      default: null,
      trim: true,
    },
    return_reason: {
      type: String,
      default: null,
      trim: true,
    },
  },
  { timestamps: { createdAt: 'placed_at', updatedAt: 'updated_at' } }
);

const order = mongoose.models.order || mongoose.model('order', orderSchema);
module.exports = order;