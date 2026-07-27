const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
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
    profile_picture: {
      type: String,
      default: null,
    },
    auth_provider: {
      type: String,
      default: 'local', // e.g. 'local', 'google'
    },
    is_verified: {
      type: Boolean,
      default: false,
    },
    google_id: {
      type: String,
      default: null,
    },
    password_changed_at: {
      type: Date,
      default: null,
    },
    is_active: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

// Hash password before saving
userSchema.pre('save', async function () {
  if (!this.isModified('password_hash')) return;
  const salt = await bcrypt.genSalt(10);
  this.password_hash = await bcrypt.hash(this.password_hash, salt);
});

// Compare entered password with hashed one (used at login)
userSchema.methods.comparePassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password_hash);
};

const User = mongoose.models.User || mongoose.model('User', userSchema);
module.exports = User;