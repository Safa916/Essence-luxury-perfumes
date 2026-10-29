import express from 'express';
const router = express.Router();
import rateLimit from 'express-rate-limit';
import { checkUser } from '../../middleware/authMiddleware.js';

const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, 
  message: 'Too many OTP requests, please try again after 15 minutes'
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, 
  message: 'Too many login attempts, please try again after 15 minutes'
});




import { registerUser, verifyOTP, resendOTP, loginUser, forgotPassword, verifyResetCode, resetPassword, logoutUser, googleAuth } from '../../controllers/user/userController.js';



  router.get('/verify-otp-page', (req, res) => {
  res.render('user/auth/otp-verification', {
    email: req.query.email,
    purpose: req.query.purpose 
  });
});

router.get('/login', checkUser, (req, res) => {
  if (req.user) {
    return res.redirect('/');
  }

  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');

  res.render('user/auth/user-login');
});


router.get('/user-signup', checkUser, (req, res) => {
  if (req.user) {
    return res.redirect('/');
  }

  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');

  res.render('user/auth/user-signup', { refCode: req.query.ref || '' });
});




router.get('/forgot-password', (req, res) => {
  res.render('user/auth/reset-password');
});

router.get('/new-password', (req, res) => {
  res.render('user/auth/new-password', {
    email: req.query.email,
    otp: req.query.otp,
  });
});

router.get('/reset-success', (req, res) => {
  res.render('user/auth/reset-success');
});


// API routes — handle form submissions
router.post('/signup', registerUser);
router.post('/verify-otp', otpLimiter, verifyOTP);
router.post('/resend-otp', otpLimiter, resendOTP);
router.post('/login', loginLimiter, loginUser);
router.post('/forgot-password', forgotPassword);
router.post('/verify-reset-code', verifyResetCode);
router.post('/reset-password', resetPassword);
router.post('/google', googleAuth);
router.post('/logout', logoutUser);



export default router;