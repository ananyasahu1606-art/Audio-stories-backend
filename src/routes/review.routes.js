const express = require('express');
const router = express.Router();
const {
  getAllReviews,
  getReviewStats,
  getReviewById,
  createReview,
  updateReview,
  updateReviewStatus,
  deleteReview,
} = require('../controllers/review.controller');
const { protect, optionalAuth, protectAnyAuth } = require('../middlewares/auth.middleware');

// Public/Optional read routes
router.get('/', optionalAuth, getAllReviews);

// Admin-only stats route (before /:id to prevent param collision)
router.get('/stats', protect, getReviewStats);

// Single review detail
router.get('/:id', optionalAuth, getReviewById);

// Authenticated user (Listener or Admin) write routes
router.post('/', protectAnyAuth, createReview);
router.put('/:id', protectAnyAuth, updateReview);
router.delete('/:id', protectAnyAuth, deleteReview);

// Admin-only review moderation route
router.patch('/:id/status', protect, updateReviewStatus);

module.exports = router;
