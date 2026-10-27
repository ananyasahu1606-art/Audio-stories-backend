const express = require('express');
const router = express.Router();
const {
  getDashboardStats,
  getDashboardActivities,
  getQuickSummary,
} = require('../controllers/dashboard.controller');
const { protect } = require('../middlewares/auth.middleware');

// Protect all Dashboard endpoints with Admin JWT Authentication
router.use(protect);

// Routes
router.get('/stats', getDashboardStats);
router.get('/activities', getDashboardActivities);
router.get('/quick-summary', getQuickSummary);

module.exports = router;
