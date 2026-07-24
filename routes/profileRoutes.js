const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/authMiddleware');
const { getProfile } = require('../controllers/profileController');

router.get('/', requireAuth, getProfile);

module.exports = router;