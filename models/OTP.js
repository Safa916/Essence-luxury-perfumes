const mongoose = require('mongoose');

const otpSchema = new mongoose.Schema(
  {
    recipient_type: {
      type: String,
      enum: ['user', 'admin'], // since you have separate User and Admin collections
      required: [true, 'Recipient type is required'],
    },
    recipient_id: {
      type: mongoose.Schema.Types.ObjectId,
      required: [true, 'Recipient id is required'],
      refPath: 'recipient_type_model', // dynamic reference, see note below
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      lowercase: true,
      trim: true,
    },
    otp_code: {
      type: String,
      required: [true, 'OTP code is required'],
    },
    purpose: {
      type: String,
      enum: ['registration', 'login', 'password_reset', 'email_verification'],
      required: [true, 'Purpose is required'],
    },
    is_used: {
      type: Boolean,
      default: false,
    },
    expires_at: {
      type: Date,
      required: [true, 'Expiry time is required'],
    },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: false } } // your diagram only shows created_at, no updated_at
);

const OTP = mongoose.model('OTP', otpSchema);
module.exports = OTP;