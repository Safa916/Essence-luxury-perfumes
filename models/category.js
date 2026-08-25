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
      // e.g. could represent category grouping like "gender", "occasion" — adjust based on your app's use case
    },
    is_active: {
      type: Boolean,
      default: true,
    },
    parent_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category', // self-reference — points to another Category document
      default: null,
    },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: false } } // diagram only shows created_at
);

const category = mongoose.model('category', categorySchema);
module.exports = category;