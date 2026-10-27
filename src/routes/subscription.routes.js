const express = require('express');
const router = express.Router();
const {
  getPlans,
  getPlanById,
  getMySubscription,
  checkDownloadPermissionEndpoint,
  createCheckoutOrder,
  verifyPaymentAndActivate,
  cancelSubscription,
  getAllSubscriptionsAdmin,
  getSubscriptionStatsAdmin,
  getSubscriptionByIdAdmin,
  updateSubscriptionStatusAdmin,
} = require('../controllers/subscription.controller');
const { protect, protectListener, optionalAuth } = require('../middlewares/auth.middleware');

// Public Plan & Download Permission Routes
router.get('/plans', optionalAuth, getPlans);
router.get('/plans/:idOrSlug', optionalAuth, getPlanById);
router.get('/download-permission', optionalAuth, checkDownloadPermissionEndpoint);

// Listener-Protected Subscription & Checkout Routes
router.get('/me', protectListener, getMySubscription);
router.post('/create-order', protectListener, createCheckoutOrder);
router.post('/verify-payment', protectListener, verifyPaymentAndActivate);
router.post('/cancel', protectListener, cancelSubscription);

// Admin-Protected Subscription Management Routes (Requires Admin JWT Token)
router.get('/admin', protect, getAllSubscriptionsAdmin);
router.get('/admin/stats', protect, getSubscriptionStatsAdmin);
router.get('/admin/:id', protect, getSubscriptionByIdAdmin);
router.patch('/admin/:id/status', protect, updateSubscriptionStatusAdmin);

module.exports = router;

