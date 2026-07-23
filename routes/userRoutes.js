const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');

const { registerUser,
     verifyOTP,
     resendOTP,
     loginUser,
     forgotPassword,
     verifyResetCode,
     resetPassword,
     logoutUser,
     googleAuth } = require('../controllers/userController');

// Page route — shows the signup page in the browser
router.get('/signup', (req, res) => {
  res.render('user/auth/userSignup');
});
router.get('/verify-otp-page', (req, res) => {
  res.render('user/auth/otp-verification', { email: req.query.email });
});

router.get('/login', (req, res) => {
  res.render('user/auth/user-login');
});
// API routes — handle form submissions
router.post('/signup', registerUser);
router.post('/verify-otp', verifyOTP);
router.post('/resend-otp', resendOTP);
router.post('/login', loginUser);
router.post('/forgot-password', forgotPassword);
router.post('/verify-reset-code', verifyResetCode);
router.post('/reset-password', resetPassword);
router.post('/google', googleAuth);
router.post('/logout', logoutUser);

module.exports = router;