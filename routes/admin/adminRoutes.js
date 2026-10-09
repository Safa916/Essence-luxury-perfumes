const express = require('express');
const router = express.Router();

const { getLoginPage, postLogin, logout, getDashboard } = require('../../controllers/admin/adminController');
const { getUsersPage, toggleBlockUser, getActiveUsers } = require('../../controllers/admin/userManagementController');
const { listOrders, renderOrderDetail, updateOrderStatus, updateItemStatus, getProductBuyers } = require('../../controllers/admin/orderController');
const { listReturns, approveReturn, rejectReturn } = require('../../controllers/admin/returnController');
const { requireAdminAuth, redirectIfAdminLoggedIn } = require('../../middleware/adminAuth');

const categoryRoutes = require('./categoryRoutes');
const productRoutes  = require('./productRoutes');
const variantRoutes  = require('./variantRoutes');

// Auth
router.get('/login',  redirectIfAdminLoggedIn, getLoginPage);
router.post('/login', redirectIfAdminLoggedIn, postLogin);
router.get('/logout', logout);

// Dashboard
router.get('/dashboard', requireAdminAuth, getDashboard);

// User management
router.get('/users',                    requireAdminAuth, getUsersPage);
router.post('/users/:id/toggle-block',  requireAdminAuth, toggleBlockUser);

// Order management
router.get('/orders',                                    requireAdminAuth, listOrders);
router.get('/orders/:id',                                requireAdminAuth, renderOrderDetail);

router.post('/orders/:id/status',                        requireAdminAuth, updateOrderStatus);
router.post('/orders/:id/items/:itemId/status',          requireAdminAuth, updateItemStatus);



// Return management
router.get('/returns',                                   requireAdminAuth, listReturns);
router.post('/returns/:id/approve',                      requireAdminAuth, approveReturn);
router.post('/returns/:id/reject',                       requireAdminAuth, rejectReturn);

// Category Management
router.use('/categories', requireAdminAuth, categoryRoutes);

// Product Management
router.use('/products', requireAdminAuth, productRoutes);
 
 
// Variant Manager
router.use('/variants', requireAdminAuth, variantRoutes);

module.exports = router;
