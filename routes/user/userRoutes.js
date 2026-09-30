const express = require('express');
const router = express.Router();
const { protect,checkUser } = require('../../middleware/authMiddleware');




const { registerUser,
     verifyOTP,
     resendOTP,
     loginUser,
     forgotPassword,
     verifyResetCode,
     resetPassword,
     logoutUser,
     googleAuth } = require('../../controllers/user/userController');



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

  res.render('user/auth/user-signup');
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
router.post('/verify-otp', verifyOTP);
router.post('/resend-otp', resendOTP);
router.post('/login', loginUser);
router.post('/forgot-password', forgotPassword);
router.post('/verify-reset-code', verifyResetCode);
router.post('/reset-password', resetPassword);
router.post('/google', googleAuth);
router.post('/logout', logoutUser);



module.exports = router;