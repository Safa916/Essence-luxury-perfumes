import express from 'express';
const router = express.Router();
import { requireAuth } from '../../middleware/authMiddleware.js';
import uploadAvatar from '../../config/upload.js';
import { getProfile, getEditProfileForm, updateProfile, getChangeEmailForm, requestEmailChange, verifyEmailChange } from '../../controllers/user/profileController.js';

import { getChangePasswordForm, updatePassword } from '../../controllers/user/profileController.js';


router.get('/security/email', requireAuth, getChangeEmailForm);

router.post('/security/email', requireAuth, requestEmailChange);

router.post('/security/email/verify', requireAuth, verifyEmailChange)

router.get('/', requireAuth, getProfile);

router.get('/edit', requireAuth, getEditProfileForm);

router.post('/edit', requireAuth, (req, res, next) => {
  uploadAvatar.single('avatar')(req, res, (err) => {
    
    if (err) {
      return res.redirect('/profile/edit?error=' + encodeURIComponent(err.message));
    }
    next();
  });
}, updateProfile);

router.get('/security/password', requireAuth, getChangePasswordForm);
router.post('/security/password', requireAuth, updatePassword);

export default router;



