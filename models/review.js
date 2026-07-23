const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema(
  {
    product_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: [true, 'Product id is required'],
    },
    order_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      default: null,
    },
    order_item_id: {
      type: mongoose.Schema.Types.ObjectId,
      // points to a specific item within the order's embedded items array
      default: null,
    },
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User id is required'],
    },
    headline: {
      type: String,
      trim: true,
    },
    review_text: {
      type: String,
      trim: true,
    },
    rating: {
      type: Number,
      required: [true, 'Rating is required'],
      min: 1,
      max: 5,
    },
    photos: {
      type: [String], // array of image URLs
      default: [],
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
      // useful if you want admin approval before a review shows publicly
    },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: false } }
);

const review = mongoose.model('review', reviewSchema);
module.exports = review;