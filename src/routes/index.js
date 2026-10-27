const express = require('express');
const router = express.Router();

const authRoutes = require('./auth.routes');
const dashboardRoutes = require('./dashboard.routes');
const storyRoutes = require('./story.routes');
const episodeRoutes = require('./episode.routes');
const categoryRoutes = require('./category.routes');
const narratorRoutes = require('./narrator.routes');
const collectionRoutes = require('./collection.routes');
const userRoutes = require('./user.routes');
const reviewRoutes = require('./review.routes');
const mediaRoutes = require('./media.routes');
const analyticsRoutes = require('./analytics.routes');
const settingsRoutes = require('./settings.routes');
const notificationRoutes = require('./notification.routes');
const searchRoutes = require('./search.routes');
const libraryRoutes = require('./library.routes');
const favoritesRoutes = require('./favorites.routes');
const historyRoutes = require('./history.routes');
const progressRoutes = require('./progress.routes');
const subscriptionRoutes = require('./subscription.routes');
const subscriptionPlanRoutes = require('./subscriptionPlan.routes');
const adRoutes = require('./ad.routes');
const campaignRoutes = require('./campaign.routes');
const listenerNotificationRoutes = require('./listenerNotification.routes');

// Health check endpoint
router.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Audio Stories API is healthy and running',
    timestamp: new Date().toISOString(),
  });
});

// Section routes
router.use('/auth', authRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/stories', storyRoutes);
router.use('/episodes', episodeRoutes);
router.use('/categories', categoryRoutes);
router.use('/narrators', narratorRoutes);
router.use('/collections', collectionRoutes);
router.use('/users', userRoutes);
router.use('/reviews', reviewRoutes);
router.use('/media', mediaRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/settings', settingsRoutes);
router.use('/notifications', notificationRoutes);
router.use('/search', searchRoutes);
router.use('/library', libraryRoutes);
router.use('/favorites', favoritesRoutes);
router.use('/history', historyRoutes);
router.use('/progress', progressRoutes);
router.use('/subscriptions', subscriptionRoutes);
router.use('/subscription-plans', subscriptionPlanRoutes);
router.use('/ads', adRoutes);
router.use('/admin/notifications', campaignRoutes);
router.use('/listener/notifications', listenerNotificationRoutes);

module.exports = router;
