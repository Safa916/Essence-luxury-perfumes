const express = require('express');
const router = express.Router();

const { getLoginPage, postLogin, logout, getDashboard } = require('../controllers/admin/adminController');
const { getUsersPage, toggleBlockUser } = require('../controllers/admin/userManagementController');
const { requireAdminAuth, redirectIfAdminLoggedIn } = require('../middleware/adminAuth');
const categoryRoutes = require('./categoryRoutes');

// Auth
router.get('/login', redirectIfAdminLoggedIn, getLoginPage);
router.post('/login', redirectIfAdminLoggedIn, postLogin);
router.get('/logout', logout);



// Dashboard
router.get('/dashboard', requireAdminAuth, getDashboard);

// User management
router.get('/users', requireAdminAuth, getUsersPage);
router.post('/users/:id/toggle-block', requireAdminAuth, toggleBlockUser);

//category Management
router.use('/categories', requireAdminAuth, categoryRoutes)


module.exports = router;
