const express = require('express');
const router = express.Router();

const { getLoginPage, postLogin, logout, getDashboard, getDashboardChartData } = require('../../controllers/admin/adminController');
const { getUsersPage, toggleBlockUser, getActiveUsers } = require('../../controllers/admin/userManagementController');
const { listOrders, renderOrderDetail, updateOrderStatus, updateItemStatus, getProductBuyers } = require('../../controllers/admin/orderController');
const { listReturns, approveReturn, rejectReturn } = require('../../controllers/admin/returnController');
const { listCoupons, createCoupon, renderEditCoupon, updateCoupon, deleteCoupon, toggleCoupon } = require('../../controllers/admin/couponController');
const { listOffers, createOffer, renderEditOffer, updateOffer, deleteOffer, toggleOffer } = require('../../controllers/admin/offerController');
const { listReferrals, updateSettings: updateReferralSettings } = require('../../controllers/admin/referralController');
const { getSalesReport, downloadPdf, downloadExcel } = require('../../controllers/admin/salesReportController');
const { requireAdminAuth, redirectIfAdminLoggedIn } = require('../../middleware/adminAuth');

const categoryRoutes = require('./categoryRoutes');
const productRoutes  = require('./productRoutes');
const variantRoutes  = require('./variantRoutes');
const brandRoutes    = require('./brandRoutes');

// Auth
router.get('/login',  redirectIfAdminLoggedIn, getLoginPage);
router.post('/login', redirectIfAdminLoggedIn, postLogin);
router.get('/logout', logout);

// Dashboard
router.get('/dashboard',            requireAdminAuth, getDashboard);
router.get('/api/dashboard/chart',  requireAdminAuth, getDashboardChartData);

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

// Brand Management
router.use('/brands', requireAdminAuth, brandRoutes);
router.use('/brand',  requireAdminAuth, brandRoutes);

// Offers management
router.get('/offers',              requireAdminAuth, listOffers);
router.post('/offers',             requireAdminAuth, createOffer);
router.get('/offers/:id/edit',     requireAdminAuth, renderEditOffer);
router.post('/offers/:id/edit',    requireAdminAuth, updateOffer);
router.post('/offers/:id/delete',  requireAdminAuth, deleteOffer);
router.post('/offers/:id/toggle',  requireAdminAuth, toggleOffer);

// Coupon management
router.get('/coupons',              requireAdminAuth, listCoupons);
router.post('/coupons',             requireAdminAuth, createCoupon);
router.get('/coupons/:id/edit',     requireAdminAuth, renderEditCoupon);
router.post('/coupons/:id/edit',    requireAdminAuth, updateCoupon);
router.delete('/coupons/:id',       requireAdminAuth, deleteCoupon);
router.post('/coupons/:id/toggle',  requireAdminAuth, toggleCoupon);

// Referral management
router.get('/referrals',            requireAdminAuth, listReferrals);
router.post('/referrals/settings',   requireAdminAuth, updateReferralSettings);

// Sales report
router.get('/sales-report',                requireAdminAuth, getSalesReport);
router.get('/sales-report/download/pdf',   requireAdminAuth, downloadPdf);
router.get('/sales-report/download/excel', requireAdminAuth, downloadExcel);

module.exports = router;
