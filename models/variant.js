const mongoose = require('mongoose');

const variantSchema = new mongoose.Schema(
  {
    product_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'product',
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

// Enforce uniqueness of size_ml + concentration per product, but only among
// non-deleted variants (deleted_at === null). This prevents adding a duplicate
// variant while still allowing the same combination to be re-created after a
// soft-delete. The partial filter makes it a sparse-style unique index.
variantSchema.index(
  { product_id: 1, size_ml: 1, concentration: 1 },
  {
    unique: true,
    partialFilterExpression: { deleted_at: null },
    name: 'unique_active_variant_per_product',
  }
);

// Enforce uniqueness of variant_name per product among non-deleted variants
// that actually have a name (sparse: blank / null names are excluded).
variantSchema.index(
  { product_id: 1, variant_name: 1 },
  {
    unique: true,
    partialFilterExpression: { deleted_at: null, variant_name: { $type: 'string', $ne: '' } },
    name: 'unique_active_variant_name_per_product',
  }
);


// Convert Decimal128 fields to plain JS numbers in JSON responses.
// Without this, `price` is serialised as {"$numberDecimal":"..."} which
// breaks the Edit-Variant modal's numeric inputs.
variantSchema.set('toJSON', {
  transform(doc, ret) {
    if (ret.price != null) {
      ret.price = parseFloat(ret.price.toString());
    }
    return ret;
  },
});

const variant = mongoose.model('variant', variantSchema);
module.exports = variant;