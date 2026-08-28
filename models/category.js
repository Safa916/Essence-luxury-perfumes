const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Category name is required'],
      trim: true,
    },
    slug: {
      type: String,
      required: [true, 'Slug is required'],
      unique: true,
      lowercase: true,
      trim: true,
      // e.g. "mens-perfume" — used in URLs like /categories/mens-perfume
    },
    banner_url: {
      type: String,
      default: null,
    },
    type: {
      type: String,
      trim: true,
    },
    is_active: {
      type: Boolean,
      default: true,
    },
    is_deleted: {
      // soft delete flag — kept separate from is_active (the storefront visibility toggle)
      type: Boolean,
      default: false,
    },
    parent_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'category',
      default: null,
    },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: false } }
);

const category = mongoose.model('category', categorySchema);
module.exports = category;