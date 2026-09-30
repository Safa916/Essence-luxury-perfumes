const User = require('../../models/user');
const OTP = require('../../models/OTP');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { sendOTPEmail } = require('../../services/emailService');
const { OAuth2Client } = require('google-auth-library');
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const { generateOTPCode } = require('../../utils/otp');
const { isValidName, isValidPassword, suggestEmailCorrection } = require('../../utils/validators');





exports.registerUser = async (req, res) => {
  try {
    const { fullName, email, password, confirmPassword } = req.body;

    if (!fullName || !email || !password || !confirmPassword) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    if (!isValidName(fullName)) {
      return res.status(400).json({ message: 'Please enter a valid full name (letters only)' });
    }

    const normalizedEmail = email.trim().toLowerCase();

    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
      return res.status(400).json({ message: 'Please enter a valid email address' });
    }

    const suggestion = suggestEmailCorrection(normalizedEmail);
    if (suggestion) {
      return res.status(400).json({ message: `Did you mean ${suggestion}? Please double-check your email address.` });
    }

    if (!isValidPassword(password)) {
      return res.status(400).json({ message: 'Password must be at least 8 characters and include a letter and a number' });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ message: 'Passwords do not match' });
    }

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(409).json({ message: 'Email is already registered' });
    }

    const newUser = await User.create({
      full_name: fullName,
      email: normalizedEmail,
      password_hash: password,
        has_password: true, 
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

    if (error.code === 11000) {
      return res.status(409).json({ message: 'Email is already registered' });
    }

    res.status(500).json({ message: 'Server error during registration' });
  }
};

exports.verifyOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ message: 'Email and OTP are required' });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const otpRecord = await OTP.findOne({
      email: normalizedEmail,
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

    await User.findOneAndUpdate({ email: normalizedEmail }, { is_verified: true });

    otpRecord.is_used = true;
    await otpRecord.save();

    res.status(200).json({ message: 'Email verified successfully' });
  } catch (error) {
    console.error('OTP verification error:', error.message);
    res.status(500).json({ message: 'Server error during OTP verification' });
  }
};

exports.resendOTP = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return res.status(404).json({ message: 'No account found with this email' });
    }

    if (user.is_verified) {
      return res.status(400).json({ message: 'This email is already verified' });
    }

    await OTP.updateMany(
      { email: normalizedEmail, purpose: 'registration', is_used: false },
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

exports.loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const normalizedEmail = email.trim().toLowerCase();



   const user = await User.findOne({ email: normalizedEmail });


if (!user) {
  return res.status(401).json({ message: 'Invalid email or password' });
}

// Block only if this account never had a real password set — not based on auth_provider.
if (!user.has_password) {
  return res.status(400).json({ message: 'This account uses Google Sign-In. Please continue with Google.' });
}

const isMatch = await user.comparePassword(password);
if (!isMatch) {
  return res.status(401).json({ message: 'Invalid email or password' });
}

    if (!user.is_verified) {
      return res.status(403).json({ message: 'Please verify your email before logging in' });
    }

    if (!user.is_active) {
      return res.status(403).json({ message: 'Your account has been suspended. Please contact support.' });
    }

    const token = jwt.sign(
      { id: user._id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Cookie-setting is an HTTP concern.
    res.cookie('token', token, {
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.status(200).json({
      token,
      message: 'Login successful',
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

exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });

    // Deliberately the SAME response whether or not the user exists —
    // prevents account enumeration.
    if (!user) {
      return res.status(200).json({ message: 'If this email is registered, a reset code has been sent' });
    }

    // Google-auth accounts have no real password to reset.
    if (user.auth_provider === 'google') {
      return res.status(200).json({ message: 'If this email is registered, a reset code has been sent' });
    }

    await OTP.updateMany(
      { email: normalizedEmail, purpose: 'password_reset', is_used: false },
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

exports.verifyResetCode = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ message: 'Email and OTP are required' });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const otpRecord = await OTP.findOne({
      email: normalizedEmail,
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

exports.resetPassword = async (req, res) => {
  try {
    const { email, otp, newPassword, confirmNewPassword } = req.body;

    if (!email || !otp || !newPassword || !confirmNewPassword) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    if (!isValidPassword(newPassword)) {
      return res.status(400).json({ message: 'Password must be at least 8 characters and include a letter and a number' });
    }

    if (newPassword !== confirmNewPassword) {
      return res.status(400).json({ message: 'Passwords do not match' });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const otpRecord = await OTP.findOne({
      email: normalizedEmail,
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

    const user = await User.findOne({ email: normalizedEmail });
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

exports.googleAuth = async (req, res) => {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({ message: 'Google ID token is required' });
    }

    let payload;
    try {
      const ticket = await googleClient.verifyIdToken({
        idToken,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      payload = ticket.getPayload();
    } catch (err) {
      return res.status(401).json({ message: 'Invalid Google token' });
    }

    const { email, name, sub: googleId, picture } = payload;
    const normalizedEmail = email.trim().toLowerCase();


let user = await User.findOne({ email: normalizedEmail });

if (!user) {
  user = await User.create({
    full_name: name,
    email: normalizedEmail,
    password_hash: crypto.randomBytes(32).toString('hex'),
    auth_provider: 'google',
    google_id: googleId,
    profile_picture: picture,
    is_verified: true,
    has_password: false,          // ← explicit, this account has no real password
  });
} else if (!user.google_id) {
  // Just link the Google account — never touch password_hash, has_password, or auth_provider
  user.google_id = googleId;
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
      token,
      message: 'Google authentication successful',
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

exports.logoutUser = async (req, res) => {
  try {
    res.clearCookie('token', { httpOnly: true });
    res.status(200).json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error.message);
    res.status(500).json({ message: 'Server error during logout' });
  }
};

 exports.searchUser=async (req,res)=>{

  const search = req.query.search ||" ";
  const users = await  userService.searchUsers(search)

    res.render("admin/users",{
      users,
      search
    })


 }