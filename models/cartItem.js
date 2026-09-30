const mongoose = require('mongoose');

const cartItemSchema = new mongoose.Schema(
  {
    cart_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Cart',
      required: [true, 'Cart id is required'],
    },
    product_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'product',
      required: [true, 'Product id is required'],
    },
    variant_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'variant',
      required: [true, 'Variant id is required'],
    },
    quantity: {
      type: Number,
      required: [true, 'Quantity is required'],
      min: [1, 'Quantity must be at least 1'],
      default: 1,
    },
    unit_price: {
      type: mongoose.Schema.Types.Decimal128,
      required: [true, 'Unit price is required'],
    },
    total_price: {
      type: mongoose.Schema.Types.Decimal128,
      required: [true, 'Total price is required'],
      // typically = unit_price * quantity, calculated in your controller logic
    },
  },
  { timestamps: { createdAt: 'added_at', updatedAt: 'updated_at' } }
  // note: your diagram uses "added_at" instead of the usual "created_at" — matched exactly
);

const cartItem = mongoose.model('cartItem', cartItemSchema);
module.exports = cartItem;