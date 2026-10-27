const express = require('express');
const router = express.Router();
const upload = require('../middlewares/upload.middleware');
const { protect, optionalAuth } = require('../middlewares/auth.middleware');
const {
  getAllAdsAdmin,
  getAdStatsAdmin,
  getAdByIdAdmin,
  createAdAdmin,
  updateAdAdmin,
  toggleAdStatusAdmin,
  deleteAdAdmin,
  serveAds,
  trackImpression,
  trackCompletion,
  trackClick,
} = require('../controllers/ad.controller');

// Media upload configuration for Ads (accepts audio, image, and video fields)
const adMediaUpload = upload.fields([
  { name: 'audio', maxCount: 1 },
  { name: 'image', maxCount: 1 },
  { name: 'video', maxCount: 1 },
]);

// ==========================================
// PUBLIC & LISTENER AD-SERVING & TRACKING ROUTES
// ==========================================

// Serve eligible ads (respects optional listener authentication & active subscriptions)
router.get('/serve', optionalAuth, serveAds);

// Real metric event tracking routes
router.post('/:id/track-impression', trackImpression);
router.post('/:id/track-completion', trackCompletion);
router.post('/:id/track-click', trackClick);

// ==========================================
// PROTECTED ADMIN MANAGEMENT ROUTES
// ==========================================

// Get aggregate dashboard statistics for ads
router.get('/admin/stats', protect, getAdStatsAdmin);

// Admin CRUD routes
router.get('/admin', protect, getAllAdsAdmin);
router.get('/admin/:id', protect, getAdByIdAdmin);
router.post('/admin', protect, adMediaUpload, createAdAdmin);
router.put('/admin/:id', protect, adMediaUpload, updateAdAdmin);
router.patch('/admin/:id/status', protect, toggleAdStatusAdmin);
router.delete('/admin/:id', protect, deleteAdAdmin);

module.exports = router;
