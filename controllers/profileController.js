const User = require('../models/User');

// Helper: format a date into "3 months ago" style text
const formatRelativeTime = (date) => {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  const intervals = [
    { label: 'year', secs: 31536000 },
    { label: 'month', secs: 2592000 },
    { label: 'day', secs: 86400 },
    { label: 'hour', secs: 3600 },
    { label: 'minute', secs: 60 },
  ];
  for (const { label, secs } of intervals) {
    const count = Math.floor(seconds / secs);
    if (count >= 1) return `${count} ${label}${count > 1 ? 's' : ''} ago`;
  }
  return 'just now';
};

// Helper: format a user doc into what the profile views expect
const formatUserForProfile = (user) => ({
  id: user._id.toString(),
  fullName: user.full_name,
  email: user.email,
  phone: user.phone_number || '',
  avatar: user.profile_picture || null,
  memberSince: (user.created_at || user.createdAt).getFullYear().toString(),
  referralCode: `ESSENCE-${user.full_name.split(' ')[0].toUpperCase()}-${user._id
    .toString()
    .slice(-4)
    .toUpperCase()}`,
  passwordUpdated: user.password_changed_at
    ? `Last updated ${formatRelativeTime(user.password_changed_at)}`
    : 'Password never changed',
});

// @desc    Show the logged-in user's profile
// @route   GET /profile
exports.getProfile = (req, res) => {
  try {
    res.render('user/profile/user-profile', { user: formatUserForProfile(req.user) });
  } catch (error) {
    console.error('Get profile error:', error.message);
    res.status(500).send('Server error loading profile');
  }
};