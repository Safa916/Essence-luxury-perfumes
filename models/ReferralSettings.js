const mongoose = require('mongoose');

/**
 * Global referral reward configuration — admin editable.
 * There should only ever be ONE document in this collection.
 */
const referralSettingsSchema = new mongoose.Schema(
  {
    referrer_reward: {
      type: Number,
      default: 100,   // amount credited to the person who shared the code
      min: 0,
    },
    referee_reward: {
      type: Number,
      default: 50,    // amount credited to the new user who signed up via the code
      min: 0,
    },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

const ReferralSettings =
  mongoose.models.ReferralSettings ||
  mongoose.model('ReferralSettings', referralSettingsSchema);

module.exports = ReferralSettings;
