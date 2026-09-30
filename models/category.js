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

// Hide soft-deleted categories from every normal find/findOne automatically.
// Bypass with .setOptions({ withDeleted: true }) if you ever need to see
// deleted categories (e.g. an admin "trash" view).
categorySchema.pre(/^find/, function () {
  if (!this.getOptions().withDeleted) {
    this.where({ is_deleted: { $ne: true } });
  }
});

const category = mongoose.model('category', categorySchema);
module.exports = category;