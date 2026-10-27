const express = require('express');
const router = express.Router();
const {
  getAnalyticsSummary,
  getListeningTrends,
  getGenreBreakdown,
  getTopEpisodes,
  getRecentActivities,
} = require('../controllers/analytics.controller');
const { protect } = require('../middlewares/auth.middleware');

// Protect all Analytics endpoints with Admin JWT Authentication
router.use(protect);

// Routes
router.get('/summary', getAnalyticsSummary);
router.get('/trends', getListeningTrends);
router.get('/genres', getGenreBreakdown);
router.get('/top-episodes', getTopEpisodes);
router.get('/activities', getRecentActivities);

module.exports = router;
