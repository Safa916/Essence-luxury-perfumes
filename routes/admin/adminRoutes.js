const express = require('express');
const router = express.Router();

const { getLoginPage, postLogin, logout, getDashboard } = require('../../controllers/admin/adminController');
const { getUsersPage, toggleBlockUser,getActiveUsers} = require('../../controllers/admin/userManagementController');
const { requireAdminAuth, redirectIfAdminLoggedIn } = require('../../middleware/adminAuth');


const categoryRoutes = require('./categoryRoutes');
const productRoutes = require('./productRoutes');
const variantRoutes = require('./variantRoutes');

// Auth
router.get('/login', redirectIfAdminLoggedIn, getLoginPage);
router.post('/login', redirectIfAdminLoggedIn, postLogin);
router.get('/logout', logout);


// Dashboard
router.get('/dashboard', requireAdminAuth, getDashboard);


// User management
router.get('/users', requireAdminAuth, getUsersPage);
router.post('/users/:id/toggle-block', requireAdminAuth, toggleBlockUser);


// Category Management
router.use('/categories', requireAdminAuth, categoryRoutes);

// Product Management (list, add, edit, soft-delete, view/variant-manager entry)
router.use('/products', requireAdminAuth, productRoutes);

// Variant Manager (Add/Edit/Delete variant popups — JSON endpoints)
router.use('/variants', requireAdminAuth, variantRoutes);

module.exports = router;
