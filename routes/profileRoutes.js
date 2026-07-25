const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/authMiddleware');
const uploadAvatar = require('../config/upload');
const {
  getProfile,
  getEditProfileForm,
  updateProfile,
  getChangeEmailForm,
  requestEmailChange,
  verifyEmailChange,
} = require('../controllers/profileController');

const { getChangePasswordForm, updatePassword } = require('../controllers/profileController');


router.get('/security/email', requireAuth, getChangeEmailForm);
router.post('/security/email', requireAuth, requestEmailChange);
router.post('/security/email/verify', requireAuth, verifyEmailChange)

router.get('/', requireAuth, getProfile);
router.get('/edit', requireAuth, getEditProfileForm);
router.post('/edit', requireAuth, uploadAvatar.single('avatar'), updateProfile);

router.get('/security/password', requireAuth, getChangePasswordForm);
router.post('/security/password', requireAuth, updatePassword);

module.exports = router;



