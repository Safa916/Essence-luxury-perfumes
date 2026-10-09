const mongoose = require('mongoose');

const offerSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Offer name is required'],
      trim: true,
    },
    internal_code: {
      type: String,
      unique: true,
      trim: true,
    },
    offer_type: {
      type: String,
      trim: true,
      // e.g. "flash_sale", "seasonal", "clearance"
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
    maximum_discount_amount: {
      type: mongoose.Schema.Types.Decimal128,
      default: null,
    },
    minimum_purchase_amount: {
      type: mongoose.Schema.Types.Decimal128,
      default: 0,
    },
    apply_to: {
      type: String,
      enum: ['product', 'category'],
      required: [true, 'Apply to is required'],
    },
    target_ids: [
      {
        type: mongoose.Schema.Types.ObjectId,
        // dynamically refers to Product or Category, depending on "apply_to"
        refPath: 'apply_to_model', // see note below
      },
    ],
    first_time_customers_only: {
      type: Boolean,
      default: false,
    },
    offer_image_url: {
      type: String,
      default: null,
    },
    status: {
      type: String,
      enum: ['draft', 'active', 'expired', 'paused'],
      default: 'draft',
    },
    is_ongoing: {
      type: Boolean,
      default: false,
    },
    start_date: {
      type: Date,
      default: null,
    },
    end_date: {
      type: Date,
      default: null,
    },
    deleted_at: {
      type: Date,
      default: null,
      // soft-delete pattern, same as Variant.js
    },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

const offer = mongoose.models.offer || mongoose.model('offer', offerSchema);
module.exports = offer;