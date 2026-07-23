
const User = require('../models/User');
const OTP = require('../models/OTP');
const jwt = require('jsonwebtoken');
const { sendOTPEmail } = require('../services/emailService');

const { OAuth2Client } = require('google-auth-library');
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Helper: generate a 6-digit OTP code
const generateOTPCode = () => Math.floor(100000 + Math.random() * 900000).toString();

// @desc    Register a new user (customer)
// @route   POST /auth/signup
exports.registerUser = async (req, res) => {
  try {
    const { fullName, email, password, confirmPassword } = req.body;

    if (!fullName || !email || !password || !confirmPassword) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ message: 'Passwords do not match' });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ message: 'Email is already registered' });
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

    res.status(201).json({
      message: 'User registered successfully. Please verify your email.',
      user: {
        id: newUser._id,
        fullName: newUser.full_name,
        email: newUser.email,
      },
    });
  } catch (error) {
    console.error('Register error:', error.message);
    res.status(500).json({ message: 'Server error during registration' });
  }
};

// @desc    Verify email using OTP
// @route   POST /auth/verify-otp
exports.verifyOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ message: 'Email and OTP are required' });
    }

    const otpRecord = await OTP.findOne({
      email,
      otp_code: otp,
      purpose: 'registration',
      is_used: false,
    }).sort({ created_at: -1 });

    if (!otpRecord) {
      return res.status(400).json({ message: 'Invalid OTP' });
    }

    if (otpRecord.expires_at < new Date()) {
      return res.status(400).json({ message: 'OTP has expired' });
    }

    otpRecord.is_used = true;
    await otpRecord.save();

    await User.findOneAndUpdate({ email }, { is_verified: true });

    res.status(200).json({ message: 'Email verified successfully' });
  } catch (error) {
    console.error('OTP verification error:', error.message);
    res.status(500).json({ message: 'Server error during OTP verification' });
  }
};

// @desc    Resend OTP for email verification
// @route   POST /auth/resend-otp
exports.resendOTP = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: 'No account found with this email' });
    }

    if (user.is_verified) {
      return res.status(400).json({ message: 'This email is already verified' });
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

    res.status(200).json({ message: 'A new OTP has been sent to your email' });
  } catch (error) {
    console.error('Resend OTP error:', error.message);
    res.status(500).json({ message: 'Server error during OTP resend' });
  }
};

// @desc    Login user
// @route   POST /auth/login
exports.loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    if (!user.is_verified) {
      return res.status(403).json({ message: 'Please verify your email before logging in' });
    }

    if (!user.is_active) {
      return res.status(403).json({ message: 'This account has been deactivated' });
    }

    const token = jwt.sign(
      { id: user._id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.cookie('token', token, {
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.status(200).json({
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        fullName: user.full_name,
        email: user.email,
        isVerified: user.is_verified,
      },
    });
  } catch (error) {
    console.error('Login error:', error.message);
    res.status(500).json({ message: 'Server error during login' });
  }
};

// @desc    Request password reset - sends OTP
// @route   POST /auth/forgot-password
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(200).json({ message: 'If this email is registered, a reset code has been sent' });
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

    res.status(200).json({ message: 'If this email is registered, a reset code has been sent' });
  } catch (error) {
    console.error('Forgot password error:', error.message);
    res.status(500).json({ message: 'Server error during forgot password' });
  }
};

// @desc    Verify password reset OTP
// @route   POST /auth/verify-reset-code
exports.verifyResetCode = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ message: 'Email and OTP are required' });
    }

    const otpRecord = await OTP.findOne({
      email,
      otp_code: otp,
      purpose: 'password_reset',
      is_used: false,
    }).sort({ created_at: -1 });

    if (!otpRecord) {
      return res.status(400).json({ message: 'Invalid OTP' });
    }

    if (otpRecord.expires_at < new Date()) {
      return res.status(400).json({ message: 'OTP has expired' });
    }

    res.status(200).json({ message: 'OTP verified. You can now reset your password' });
  } catch (error) {
    console.error('Verify reset code error:', error.message);
    res.status(500).json({ message: 'Server error during OTP verification' });
  }
};

// @desc    Reset password using verified OTP
// @route   POST /auth/reset-password
exports.resetPassword = async (req, res) => {
  try {
    const { email, otp, newPassword, confirmNewPassword } = req.body;

    if (!email || !otp || !newPassword || !confirmNewPassword) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    if (newPassword !== confirmNewPassword) {
      return res.status(400).json({ message: 'Passwords do not match' });
    }

    const otpRecord = await OTP.findOne({
      email,
      otp_code: otp,
      purpose: 'password_reset',
      is_used: false,
    }).sort({ created_at: -1 });

    if (!otpRecord) {
      return res.status(400).json({ message: 'Invalid OTP' });
    }

    if (otpRecord.expires_at < new Date()) {
      return res.status(400).json({ message: 'OTP has expired' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.password_hash = newPassword;
    user.password_changed_at = new Date();
    await user.save();

    otpRecord.is_used = true;
    await otpRecord.save();

    res.status(200).json({ message: 'Password reset successfully. Please log in with your new password' });
  } catch (error) {
    console.error('Reset password error:', error.message);
    res.status(500).json({ message: 'Server error during password reset' });
  }
};

// @desc    Signup/Login with Google
// @route   POST /auth/google
exports.googleAuth = async (req, res) => {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({ message: 'Google ID token is required' });
    }

    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
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

    res.cookie('token', token, {
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.status(200).json({
      message: 'Google authentication successful',
      token,
      user: {
        id: user._id,
        fullName: user.full_name,
        email: user.email,
        isVerified: user.is_verified,
      },
    });
  } catch (error) {
    console.error('Google auth error:', error.message);
    res.status(401).json({ message: 'Invalid Google token' });
  }
};

// @desc    Logout user
// @route   POST /auth/logout
exports.logoutUser = async (req, res) => {
  try {
    res.clearCookie('token', { httpOnly: true });
    res.status(200).json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error.message);
    res.status(500).json({ message: 'Server error during logout' });
  }
};