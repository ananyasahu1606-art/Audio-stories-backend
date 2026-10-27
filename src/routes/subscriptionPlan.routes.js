const express = require('express');
const router = express.Router();
const {
  getAllSubscriptionPlans,
  getSubscriptionPlanById,
  createSubscriptionPlan,
  updateSubscriptionPlan,
  deleteSubscriptionPlan,
} = require('../controllers/subscriptionPlan.controller');
const { protect, optionalAuth } = require('../middlewares/auth.middleware');

// Public / Admin Read Routes
router.get('/', optionalAuth, getAllSubscriptionPlans);
router.get('/:id', optionalAuth, getSubscriptionPlanById);

// Admin-Only Write Routes (Requires Admin JWT Token)
router.post('/', protect, createSubscriptionPlan);
router.put('/:id', protect, updateSubscriptionPlan);
router.patch('/:id', protect, updateSubscriptionPlan);
router.delete('/:id', protect, deleteSubscriptionPlan);

module.exports = router;
