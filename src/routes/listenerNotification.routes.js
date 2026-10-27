const express = require('express');
const router = express.Router();
const {
  getListenerNotifications,
  getUnreadCount,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
} = require('../controllers/userNotification.controller');
const { protectListener } = require('../middlewares/auth.middleware');

// Protect all Listener Inbox routes with Listener JWT
router.use(protectListener);

router.get('/', getListenerNotifications);
router.get('/unread-count', getUnreadCount);
router.patch('/read-all', markAllNotificationsAsRead);
router.patch('/:id/read', markNotificationAsRead);
router.delete('/:id', deleteNotification);

module.exports = router;
