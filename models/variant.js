const mongoose = require('mongoose');

const variantSchema = new mongoose.Schema(
  {
    product_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: [true, 'Product id is required'],
    },
    variant_name: {
      type: String,
      trim: true,
      // e.g. "50ml Eau de Parfum"
    },
    sku: {
      type: String,
      unique: true,
      trim: true,
    },
    size_ml: {
      type: Number,
      default: null,
    },
    concentration: {
      type: String,
      trim: true,
      // e.g. "Eau de Parfum", "Eau de Toilette"
    },
    price: {
      type: mongoose.Schema.Types.Decimal128,
      required: [true, 'Price is required'],
    },
    quantity: {
      type: Number,
      default: 0,
    },
    is_active: {
      type: Boolean,
      default: true,
    },
    deleted_at: {
      type: Date,
      default: null,
      // soft-delete: null = not deleted, a date = when it was deleted
    },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

const variant = mongoose.model('variant', variantSchema);
module.exports = variant;