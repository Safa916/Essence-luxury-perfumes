const mongoose = require('mongoose');

const brandSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Brand name is required'],
      trim: true,
    },
    slug: {
      type: String,
      required: [true, 'Slug is required'],
      unique: true,
      lowercase: true,
      trim: true,
      // e.g. "coco-noir" — used in URLs like /brands/coco-noir
    },
    tagline: {
      type: String,
      trim: true,
    },
    logo_url: {
      type: String,
      default: null,
    },
    banner_url: {
      type: String,
      default: null,
    },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: false } } // diagram only shows created_at
);

const brands = mongoose.models.brands || mongoose.model('brands', brandSchema);
module.exports = brands;