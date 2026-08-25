const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const adminSchema = new mongoose.Schema(
  {
    full_name: {
      type: String,
      required: [true, 'Full name is required'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
    },
    phone_number: {
      type: String,
      trim: true,
    },
    password_hash: {
      type: String,
      required: [true, 'Password is required'],
      minlength: 6,
    },
    password_changed_at: {
      type: Date,
      default: null,
    },
    employee_id: {
      type: String,
      trim: true,
    },
    otp_expires_at: {
      type: Date,
      default: null,
    },
    is_active: {
      type: Boolean,
      default: true,
    },
    last_login_at: {
      type: Date,
      default: null,
    },
    profile_picture: {
      type: String, // corrected from "Date" in diagram — likely meant to be a URL/path
      default: null,
    },
    access_level: {
      type: String,
      default: 'staff', // e.g. 'staff', 'super_admin' — based on your access levels
    },
    referralcode: {
      type: String,
      default: null,
    },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

// Hash password before saving
adminSchema.pre('save', async function () {
  if (!this.isModified('password_hash')) return;
  const salt = await bcrypt.genSalt(10);
  this.password_hash = await bcrypt.hash(this.password_hash, salt);
});

// Compare entered password with hashed one (used at login)
adminSchema.methods.comparePassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password_hash);
};


const admin = mongoose.models.admin || mongoose.model('admin', adminSchema);
module.exports = admin;