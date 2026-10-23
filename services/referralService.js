const crypto          = require('crypto');
const User            = require('../models/user');
const Referral        = require('../models/Referral');
const ReferralSettings = require('../models/ReferralSettings');
const walletService   = require('./walletService');

// ── Code generation ──────────────────────────────────────────────────────────

/**
 * Generate a unique referral code for a user and save it.
 * Format: ESS-<6 random uppercase chars>
 * Retries up to 5 times on collision (astronomically unlikely).
 */
async function generateAndSaveCode(userId) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = 'ESS-' + crypto.randomBytes(3).toString('hex').toUpperCase();
    try {
      const updated = await User.findByIdAndUpdate(
        userId,
        { referral_code: code },
        { new: true }
      );
      return updated.referral_code;
    } catch (err) {
      if (err.code !== 11000) throw err; // only retry on duplicate-key error
    }
  }
  throw new Error('Could not generate unique referral code after 5 attempts');
}

/**
 * Return the user's referral code, generating one if not yet assigned.
 */
async function getOrCreateCode(userId) {
  const user = await User.findById(userId).select('referral_code').lean();
  if (user && user.referral_code) return user.referral_code;
  return generateAndSaveCode(userId);
}

// ── Referral lookup ───────────────────────────────────────────────────────────

/**
 * Find the user who owns this referral code.
 * Returns null if the code is invalid.
 */
async function findReferrerByCode(code) {
  if (!code) return null;
  return User.findOne({ referral_code: code.trim().toUpperCase() })
    .select('_id full_name referral_code')
    .lean();
}

// ── Pending record ────────────────────────────────────────────────────────────

/**
 * Create a pending Referral record after a new user signs up via a code.
 * Safe to call even if the referee has no valid referrer — does nothing.
 * Safe to call multiple times — upserts so no duplicate records.
 */
async function recordPendingReferral({ referrerId, refereeId }) {
  if (!referrerId || !refereeId) return;
  if (referrerId.toString() === refereeId.toString()) return; // can't refer yourself

  const settings = await getSettings();

  await Referral.findOneAndUpdate(
    { referee_id: refereeId },
    {
      referrer_id:     referrerId,
      referee_id:      refereeId,
      referrer_reward: settings.referrer_reward,
      referee_reward:  settings.referee_reward,
      status:          'pending',
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

// ── Reward on verification ────────────────────────────────────────────────────

/**
 * Credit both the referrer and the new user once the new user verifies their email.
 * Idempotent — if already rewarded, does nothing.
 */
async function rewardReferral(refereeId) {
  const referral = await Referral.findOne({ referee_id: refereeId, status: 'pending' });
  if (!referral) return; // no pending referral for this user

  // Atomic status update to prevent double-rewarding under concurrent requests
  const updated = await Referral.findOneAndUpdate(
    { _id: referral._id, status: 'pending' },
    { status: 'rewarded', rewarded_at: new Date() },
    { new: true }
  );
  if (!updated) return; // another process already rewarded it

  const { referrer_id, referee_id, referrer_reward, referee_reward } = updated;

  // Credit referrer
  if (referrer_reward > 0) {
    await walletService.creditWallet({
      userId      : referrer_id,
      amount      : referrer_reward,
      category    : 'referral_reward',
      description : `Referral bonus — a friend joined using your code`,
      method      : 'system',
    });
  }

  // Credit referee
  if (referee_reward > 0) {
    await walletService.creditWallet({
      userId      : referee_id,
      amount      : referee_reward,
      category    : 'referral_reward',
      description : `Welcome bonus — signed up via referral code`,
      method      : 'system',
    });
  }
}

// ── Settings helpers ──────────────────────────────────────────────────────────

async function getSettings() {
  let settings = await ReferralSettings.findOne().lean();
  if (!settings) {
    // Auto-create with defaults on first use
    settings = await ReferralSettings.create({});
    return settings.toObject ? settings.toObject() : settings;
  }
  return settings;
}

async function updateSettings({ referrer_reward, referee_reward }) {
  return ReferralSettings.findOneAndUpdate(
    {},
    { referrer_reward, referee_reward },
    { upsert: true, new: true }
  );
}
 

/**
 * Returns referral statistics for a given user.
 */
async function getUserReferralStats(userId) {
  const [total, rewarded] = await Promise.all([
    Referral.countDocuments({ referrer_id: userId }),
    Referral.countDocuments({ referrer_id: userId, status: 'rewarded' }),
  ]);
  return { total, rewarded, pending: total - rewarded };
}

module.exports = {
  getOrCreateCode,
  findReferrerByCode,
  recordPendingReferral,
  rewardReferral,
  getSettings,
  updateSettings,
  getUserReferralStats,
};
