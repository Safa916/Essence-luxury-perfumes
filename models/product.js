const mongoose = require('mongoose');

const productSchema = new mongoose.Schema(
  {
    brand_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'brands',
      default: null,
    },
    category_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'category',
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
    // Base price shown on the Product Management table.
    price: {
      type: Number,
      required: [true, 'Price is required'],
      min: 0,
      default: 0,
    },
    // Aggregate stock shown on the table (kept in sync with variant totals
    // by variantController.js's recalcProductStock()).
    stock: {
      type: Number,
      default: 0,
      min: 0,
    },
    is_active: {
      type: Boolean,
      default: true,
    },
    is_limited_edition: {
      type: Boolean,
      default: false,
    },
    // ---- Soft delete ----
    is_deleted: {
      type: Boolean,
      default: false,
    },
    deleted_at: {
      type: Date,
      default: null,
    },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

// Hide soft-deleted products from every normal find/findOne automatically.
productSchema.pre(/^find/, function () {
  if (!this.getOptions().withDeleted) {
    this.where({ is_deleted: { $ne: true } });
  }
});

const product = mongoose.models.product || mongoose.model('product', productSchema);
module.exports = product;