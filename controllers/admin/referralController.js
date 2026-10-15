const Referral         = require('../../models/Referral');
const User             = require('../../models/user');
const referralService  = require('../../services/referralService');

// ── GET /admin/referrals ──────────────────────────────────────────────────────
exports.listReferrals = async (req, res) => {
  try {
    const page    = Math.max(1, parseInt(req.query.page) || 1);
    const PER_PAGE = 20;

    const [referrals, total, settings] = await Promise.all([
      Referral.find()
        .sort({ created_at: -1 })
        .skip((page - 1) * PER_PAGE)
        .limit(PER_PAGE)
        .populate('referrer_id', 'full_name email referral_code')
        .populate('referee_id',  'full_name email created_at')
        .lean(),
      Referral.countDocuments(),
      referralService.getSettings(),
    ]);

    // Summary stats
    const [totalRewarded, totalPending] = await Promise.all([
      Referral.countDocuments({ status: 'rewarded' }),
      Referral.countDocuments({ status: 'pending'  }),
    ]);

    res.render('admin/referrals/referrals', {
      activePage   : 'referrals',
      referrals,
      settings,
      currentPage  : page,
      totalPages   : Math.ceil(total / PER_PAGE),
      totalReferrals: total,
      totalRewarded,
      totalPending,
      query        : req.query,
    });
  } catch (err) {
    console.error('listReferrals error:', err);
    res.status(500).send('Server error loading referrals');
  }
};

// ── POST /admin/referrals/settings ────────────────────────────────────────────
exports.updateSettings = async (req, res) => {
  try {
    const referrer_reward = parseFloat(req.body.referrer_reward);
    const referee_reward  = parseFloat(req.body.referee_reward);

    if (isNaN(referrer_reward) || referrer_reward < 0 ||
        isNaN(referee_reward)  || referee_reward  < 0) {
      return res.redirect('/admin/referrals?error=invalid_amounts');
    }

    await referralService.updateSettings({ referrer_reward, referee_reward });
    res.redirect('/admin/referrals?success=settings_saved');
  } catch (err) {
    console.error('updateSettings error:', err);
    res.redirect('/admin/referrals?error=server_error');
  }
};
