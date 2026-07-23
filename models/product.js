const mongoose = require('mongoose');

const productSchema = new mongoose.Schema(
  {
    brand_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Brand',
      default: null,
    },
    category_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      default: null,
    },
    name: {
      type: String,
      required: [true, 'Product name is required'],
      trim: true,
    },
    slug: {
      type: String,
      required: [true, 'Slug is required'],
      unique: true,
      lowercase: true,
      trim: true,
    },
    sku: {
      type: String,
      unique: true,
      trim: true,
      // e.g. "NK-MV15-2024"
    },
    short_description: {
      type: String,
      trim: true,
    },
    full_description: {
      type: String,
      trim: true,
    },
    images: {
      type: [String], // array of image URLs
      default: [],
    },
    is_active: {
      type: Boolean,
      default: true,
    },
    is_limited_edition: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

const product = mongoose.model('product', productSchema);
module.exports = product;