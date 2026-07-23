const mongoose = require('mongoose');

const wishlistItemSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User id is required'],
    },
    product_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: [true, 'Product id is required'],
    },
    variant_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Variant',
      default: null,
    },
  },
  { timestamps: { createdAt: 'added_at', updatedAt: false } }
);

const wishlistItem = mongoose.model('wishlistItem', wishlistItemSchema);
module.exports = wishlistItem;