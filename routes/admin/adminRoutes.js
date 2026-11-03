import express from 'express';
const router = express.Router();

import { getLoginPage, postLogin, logout, getDashboard, getDashboardChartData } from '../../controllers/admin/adminController.js';
import { getUsersPage, toggleBlockUser } from '../../controllers/admin/userManagementController.js';
import { listOrders, renderOrderDetail, updateOrderStatus, updateItemStatus } from '../../controllers/admin/orderController.js';
import { listReturns, approveReturn, rejectReturn } from '../../controllers/admin/returnController.js';
import { listCoupons, createCoupon, renderEditCoupon, updateCoupon, deleteCoupon, toggleCoupon } from '../../controllers/admin/couponController.js';
import { listOffers, createOffer, renderEditOffer, updateOffer, deleteOffer, toggleOffer } from '../../controllers/admin/offerController.js';
import { listReferrals, updateSettings as updateReferralSettings } from '../../controllers/admin/referralController.js';
import { getSalesReport, downloadPdf, downloadExcel } from '../../controllers/admin/salesReportController.js';
import { requireAdminAuth, redirectIfAdminLoggedIn } from '../../middleware/adminAuth.js';

import categoryRoutes from './categoryRoutes.js';
import productRoutes from './productRoutes.js';
import variantRoutes from './variantRoutes.js';
import brandRoutes from './brandRoutes.js';

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

export default router;
