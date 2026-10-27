const express = require('express');
const router = express.Router();
const {
  getAllNotifications,
  getNotificationStats,
  createNotification,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
  clearAllNotifications,
} = require('../controllers/notification.controller');
const { protect } = require('../middlewares/auth.middleware');

// Protect all Notification endpoints with Admin JWT Authentication
router.use(protect);

// Routes
router.get('/', getAllNotifications);
router.get('/stats', getNotificationStats);
router.post('/', createNotification);
router.patch('/read-all', markAllNotificationsAsRead);
router.patch('/:id/read', markNotificationAsRead);
router.delete('/clear-all', clearAllNotifications);
router.delete('/:id', deleteNotification);

module.exports = router;
