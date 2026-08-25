// services/user/userService.js
//
// Business logic only — no req/res here. Every function either returns
// a result the controller can send back, or throws an error object
// shaped like { status, message } that the controller maps to an
// HTTP response. This file can be reused anywhere (scripts, tests,
// other controllers) without depending on Express at all.

const User = require('../../models/user');
const OTP = require('../../models/OTP');
const jwt = require('jsonwebtoken');
const { sendOTPEmail } = require('../emailService');
const { OAuth2Client } = require('google-auth-library');
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const { generateOTPCode } = require('../../utils/otp');
const { isValidName, isValidPassword, suggestEmailCorrection } = require('../../utils/validators');

exports.registerUser = async ({ fullName, email, password, confirmPassword }) => {
  if (!fullName || !email || !password || !confirmPassword) {
    throw { status: 400, message: 'All fields are required' };
  }

  if (!isValidName(fullName)) {
    throw { status: 400, message: 'Please enter a valid full name (letters only)' };
  }

  if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
    throw { status: 400, message: 'Please enter a valid email address' };
  }

  const suggestion = suggestEmailCorrection(email.trim());
  if (suggestion) {
    throw { status: 400, message: `Did you mean ${suggestion}? Please double-check your email address.` };
  }

  if (!isValidPassword(password)) {
    throw { status: 400, message: 'Password must be at least 8 characters and include a letter and a number' };
  }

  if (password !== confirmPassword) {
    throw { status: 400, message: 'Passwords do not match' };
  }

  const existingUser = await User.findOne({ email });
  if (existingUser) {
    throw { status: 409, message: 'Email is already registered' };
  }

  const newUser = await User.create({
    full_name: fullName,
    email,
    password_hash: password,
  });

  const otpCode = generateOTPCode();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await OTP.create({
    recipient_type: 'user',
    recipient_id: newUser._id,
    email: newUser.email,
    otp_code: otpCode,
    purpose: 'registration',
    expires_at: expiresAt,
  });

  await sendOTPEmail(newUser.email, otpCode, 'registration');

  return {
    message: 'User registered successfully. Please verify your email.',
    user: {
      id: newUser._id,
      fullName: newUser.full_name,
      email: newUser.email,
    },
  };
};

exports.verifyOTP = async ({ email, otp }) => {
  if (!email || !otp) {
    throw { status: 400, message: 'Email and OTP are required' };
  }

  const otpRecord = await OTP.findOne({
    email,
    otp_code: otp,
    purpose: 'registration',
    is_used: false,
  }).sort({ created_at: -1 });

  if (!otpRecord) {
    throw { status: 400, message: 'Invalid OTP' };
  }

  if (otpRecord.expires_at < new Date()) {
    throw { status: 400, message: 'OTP has expired' };
  }

  otpRecord.is_used = true;
  await otpRecord.save();

  await User.findOneAndUpdate({ email }, { is_verified: true });

  return { message: 'Email verified successfully' };
};

exports.resendOTP = async ({ email }) => {
  if (!email) {
    throw { status: 400, message: 'Email is required' };
  }

  const user = await User.findOne({ email });
  if (!user) {
    throw { status: 404, message: 'No account found with this email' };
  }

  if (user.is_verified) {
    throw { status: 400, message: 'This email is already verified' };
  }

  await OTP.updateMany(
    { email, purpose: 'registration', is_used: false },
    { is_used: true }
  );

  const otpCode = generateOTPCode();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await OTP.create({
    recipient_type: 'user',
    recipient_id: user._id,
    email: user.email,
    otp_code: otpCode,
    purpose: 'registration',
    expires_at: expiresAt,
  });

  await sendOTPEmail(user.email, otpCode, 'registration');

  return { message: 'A new OTP has been sent to your email' };
};

exports.loginUser = async ({ email, password }) => {
  if (!email || !password) {
    throw { status: 400, message: 'Email and password are required' };
  }

  const user = await User.findOne({ email });
  if (!user) {
    throw { status: 401, message: 'Invalid email or password' };
  }

  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    throw { status: 401, message: 'Invalid email or password' };
  }

  if (!user.is_verified) {
    throw { status: 403, message: 'Please verify your email before logging in' };
  }

  if (!user.is_active) {
    throw { status: 403, message: 'This account has been deactivated' };
  }

  const token = jwt.sign(
    { id: user._id, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  return {
    token,
    message: 'Login successful',
    user: {
      id: user._id,
      fullName: user.full_name,
      email: user.email,
      isVerified: user.is_verified,
    },
  };
};

exports.forgotPassword = async ({ email }) => {
  if (!email) {
    throw { status: 400, message: 'Email is required' };
  }

  const normalizedEmail = email.trim().toLowerCase();
  const user = await User.findOne({ email: normalizedEmail });

  // Deliberately the SAME response whether or not the user exists —
  // prevents account enumeration. See note in the controller too.
  if (!user) {
    return { message: 'If this email is registered, a reset code has been sent' };
  }

  await OTP.updateMany(
    { email, purpose: 'password_reset', is_used: false },
    { is_used: true }
  );

  const otpCode = generateOTPCode();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await OTP.create({
    recipient_type: 'user',
    recipient_id: user._id,
    email: user.email,
    otp_code: otpCode,
    purpose: 'password_reset',
    expires_at: expiresAt,
  });

  await sendOTPEmail(user.email, otpCode, 'password_reset');

  return { message: 'If this email is registered, a reset code has been sent' };
};

exports.verifyResetCode = async ({ email, otp }) => {
  if (!email || !otp) {
    throw { status: 400, message: 'Email and OTP are required' };
  }

  const otpRecord = await OTP.findOne({
    email,
    otp_code: otp,
    purpose: 'password_reset',
    is_used: false,
  }).sort({ created_at: -1 });

  if (!otpRecord) {
    throw { status: 400, message: 'Invalid OTP' };
  }

  if (otpRecord.expires_at < new Date()) {
    throw { status: 400, message: 'OTP has expired' };
  }

  return { message: 'OTP verified. You can now reset your password' };
};

exports.resetPassword = async ({ email, otp, newPassword, confirmNewPassword }) => {
  if (!email || !otp || !newPassword || !confirmNewPassword) {
    throw { status: 400, message: 'All fields are required' };
  }

  if (newPassword !== confirmNewPassword) {
    throw { status: 400, message: 'Passwords do not match' };
  }

  const otpRecord = await OTP.findOne({
    email,
    otp_code: otp,
    purpose: 'password_reset',
    is_used: false,
  }).sort({ created_at: -1 });

  if (!otpRecord) {
    throw { status: 400, message: 'Invalid OTP' };
  }

  if (otpRecord.expires_at < new Date()) {
    throw { status: 400, message: 'OTP has expired' };
  }

  const user = await User.findOne({ email });
  if (!user) {
    throw { status: 404, message: 'User not found' };
  }

  user.password_hash = newPassword;
  user.password_changed_at = new Date();
  await user.save();

  otpRecord.is_used = true;
  await otpRecord.save();

  return { message: 'Password reset successfully. Please log in with your new password' };
};

exports.googleAuth = async ({ idToken }) => {
  if (!idToken) {
    throw { status: 400, message: 'Google ID token is required' };
  }

  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    payload = ticket.getPayload();
  } catch (err) {
    throw { status: 401, message: 'Invalid Google token' };
  }

  const { email, name, sub: googleId, picture } = payload;

  let user = await User.findOne({ email });

  if (!user) {
    user = await User.create({
      full_name: name,
      email,
      password_hash: googleId,
      auth_provider: 'google',
      google_id: googleId,
      profile_picture: picture,
      is_verified: true,
    });
  } else if (user.auth_provider !== 'google') {
    user.google_id = googleId;
    user.auth_provider = 'google';
    await user.save();
  }

  const token = jwt.sign(
    { id: user._id, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  return {
    token,
    message: 'Google authentication successful',
    user: {
      id: user._id,
      fullName: user.full_name,
      email: user.email,
      isVerified: user.is_verified,
    },
  };
};