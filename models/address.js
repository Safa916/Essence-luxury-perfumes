const mongoose = require('mongoose');

const addressSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User id is required'],
    },
    full_name: {
      type: String,
      required: [true, 'Full name is required'],
      trim: true,
    },
    phone_number: {
      type: String,
      required: [true, 'Phone number is required'],
      trim: true,
    },
    address_line1: {
      type: String,
      required: [true, 'Address line 1 is required'],
      trim: true,
    },
    address_line2: {
      type: String,
      trim: true,
    },
    city: {
      type: String,
      required: [true, 'City is required'],
      trim: true,
    },
    state: {
      type: String,
      required: [true, 'State is required'],
      trim: true,
    },
    country: {
      type: String,
      required: [true, 'Country is required'],
      trim: true,
    },
    pincode: {
      type: String,
      required: [true, 'Pincode is required'],
      trim: true,
    },
    address_type: {
      type: String,
      enum: ['home', 'work', 'other'],
      default: 'home',
    },
    is_default: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

const address = mongoose.model('address', addressSchema);
module.exports = address;