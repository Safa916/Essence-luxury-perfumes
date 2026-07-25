const User = require('../models/User');
const OTP = require('../models/OTP');
const { sendOTPEmail } = require('../services/emailService');
const { generateOTPCode } = require('../utils/otp');

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
    res.render('user/profile/user-profile', {
      user: formatUserForProfile(req.user),
      passwordChanged: req.query.passwordChanged === 'true',
    });
  } catch (error) {
    console.error('Get profile error:', error.message);
    res.status(500).send('Server error loading profile');
  }
};
// @desc    Show the "Edit Profile" form
// @route   GET /profile/edit
exports.getEditProfileForm = (req, res) => {
  try {
    res.render('user/profile/edit-profile', { user: formatUserForProfile(req.user) });
  } catch (error) {
    console.error('Get edit profile form error:', error.message);
    res.status(500).send('Server error loading edit profile form');
  }
};

// @desc    Update profile (name, phone, avatar) — NOT email or password
// @route   POST /profile/edit
exports.updateProfile = async (req, res) => {
  try {
    const { fullName, phone } = req.body;

    const errors = [];
    if (!fullName || fullName.trim().length < 2) {
      errors.push('Full name must be at least 2 characters');
    }
    if (phone && !/^[6-9]\d{9}$/.test(phone.trim())) {
      errors.push('Phone number must be a valid 10-digit Indian mobile number');
    }

    if (errors.length > 0) {
      return res.render('user/profile/edit-profile', {
        user: { ...formatUserForProfile(req.user), fullName, phone },
        errors,
      });
    }

    const updateData = {
      full_name: fullName.trim(),
      phone_number: phone ? phone.trim() : '',
    };

    if (req.file) {
      updateData.profile_picture = `/uploads/avatars/${req.file.filename}`;
    }

    await User.findByIdAndUpdate(req.user._id, updateData);

    res.redirect('/profile');
  } catch (error) {
    console.error('Update profile error:', error.message);
    res.status(500).send('Server error updating profile');
  }
};

// @desc    Show "Change Email" form
// @route   GET /profile/security/email
exports.getChangeEmailForm = (req, res) => {
  res.render('user/profile/change-email', { user: formatUserForProfile(req.user) });
};

// @desc    Request email change - sends OTP to NEW email
// @route   POST /profile/security/email
exports.requestEmailChange = async (req, res) => {
  try {
    const { newEmail } = req.body;

    if (!newEmail || !/^\S+@\S+\.\S+$/.test(newEmail.trim())) {
      return res.render('user/profile/change-email', {
        user: formatUserForProfile(req.user),
        errors: ['Enter a valid email address'],
      });
    }

    const existing = await User.findOne({ email: newEmail.trim().toLowerCase() });
    if (existing) {
      return res.render('user/profile/change-email', {
        user: formatUserForProfile(req.user),
        errors: ['This email is already registered'],
      });
    }

    const otpCode = generateOTPCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await OTP.create({
      recipient_type: 'user',
      recipient_id: req.user._id,
      email: newEmail.trim().toLowerCase(),
      otp_code: otpCode,
      purpose: 'email_change',
      expires_at: expiresAt,
    });

    await sendOTPEmail(newEmail.trim().toLowerCase(), otpCode, 'email_change');

    res.render('user/profile/verify-email-otp', {
      newEmail: newEmail.trim().toLowerCase(),
    });
  } catch (error) {
    console.error('Request email change error:', error.message);
    res.status(500).send('Server error requesting email change');
  }
};

// @desc    Verify OTP and finalize email change
// @route   POST /profile/security/email/verify
exports.verifyEmailChange = async (req, res) => {
  try {
    const { newEmail, otp } = req.body;

    const otpRecord = await OTP.findOne({
      email: newEmail,
      otp_code: otp,
      purpose: 'email_change',
      is_used: false,
    }).sort({ created_at: -1 });

    if (!otpRecord) {
      return res.render('user/profile/verify-email-otp', {
        newEmail,
        errors: ['Invalid OTP'],
      });
    }

    if (otpRecord.expires_at < new Date()) {
      return res.render('user/profile/verify-email-otp', {
        newEmail,
        errors: ['OTP has expired'],
      });
    }

    otpRecord.is_used = true;
    await otpRecord.save();

    await User.findByIdAndUpdate(req.user._id, { email: newEmail });

    res.redirect('/profile');
  } catch (error) {
    console.error('Verify email change error:', error.message);
    res.status(500).send('Server error verifying email change');
  }

};

// @desc    Show "Change Password" form
// @route   GET /profile/security/password
exports.getChangePasswordForm = (req, res) => {
  res.render('user/profile/change-password');
};

// @desc    Change password - requires current password
// @route   POST /profile/security/password
exports.updatePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmNewPassword } = req.body;

    const errors = [];

    if (!currentPassword || !newPassword || !confirmNewPassword) {
      errors.push('All fields are required');
    }
    if (newPassword && newPassword.length < 6) {
      errors.push('New password must be at least 6 characters');
    }
    if (newPassword && confirmNewPassword && newPassword !== confirmNewPassword) {
      errors.push('New passwords do not match');
    }

    if (errors.length > 0) {
      return res.render('user/profile/change-password', { errors });
    }

    // req.user has no password_hash (stripped by requireAuth) — fetch it fresh
    const user = await User.findById(req.user._id);

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.render('user/profile/change-password', {
        errors: ['Current password is incorrect'],
      });
    }

    if (currentPassword === newPassword) {
      return res.render('user/profile/change-password', {
        errors: ['New password must be different from current password'],
      });
    }

    res.redirect('/profile?passwordChanged=true');
  } catch (error) {
    console.error('Update password error:', error.message);
    res.status(500).send('Server error updating password');
  }
};