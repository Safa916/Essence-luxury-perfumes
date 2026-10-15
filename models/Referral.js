const mongoose = require('mongoose');

/**
 * Tracks every referral event.
 *
 * referrer_id  – user who shared the code
 * referee_id   – user who signed up using the code
 * status       – 'pending' (signed up but not verified) | 'rewarded' (both credited)
 * rewarded_at  – timestamp when wallet credits were issued
 */
const referralSchema = new mongoose.Schema(
  {
    referrer_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    referee_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true, // one referral record per new user — prevents double-rewarding
    },
    referrer_reward: {
      type: Number,
      default: 0,
    },
    referee_reward: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ['pending', 'rewarded'],
      default: 'pending',
    },
    rewarded_at: {
      type: Date,
      default: null,
    },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: false } }
);

const Referral = mongoose.models.Referral || mongoose.model('Referral', referralSchema);
module.exports = Referral;
