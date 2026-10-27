const mongoose = require('mongoose');
const UserNotification = require('../models/UserNotification');
const { sendSuccess, sendError } = require('../utils');

/**
 * Helper to extract authenticated listener ID safely
 */
function getListenerId(req) {
  return req.user?.id || req.user?._id || null;
}

/**
 * @desc    Get current listener's notification inbox with pagination and unread filter
 * @route   GET /api/listener/notifications
 * @access  Private (Listener)
 */
const getListenerNotifications = async (req, res, next) => {
  try {
    const listenerId = getListenerId(req);
    if (!listenerId) {
      return sendError(res, 401, 'Listener authentication required');
    }

    const {
      page = 1,
      limit = 20,
      unreadOnly,
      type,
    } = req.query;

    // Strictly enforce listener isolation: only query documents belonging to this listener
    const filter = {
      userId: new mongoose.Types.ObjectId(listenerId),
    };

    if (unreadOnly === 'true' || unreadOnly === true) {
      filter.isRead = false;
    }

    if (type && type !== 'ALL') {
      filter.type = type;
    }

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
    const skip = (pageNum - 1) * limitNum;

    const total = await UserNotification.countDocuments(filter);
    const unreadCount = await UserNotification.countDocuments({
      userId: new mongoose.Types.ObjectId(listenerId),
      isRead: false,
    });

    const notifications = await UserNotification.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    return sendSuccess(res, 200, 'Listener notifications retrieved successfully', {
      notifications,
      unreadCount,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum) || 1,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get current listener's unread notification count (fast polling endpoint)
 * @route   GET /api/listener/notifications/unread-count
 * @access  Private (Listener)
 */
const getUnreadCount = async (req, res, next) => {
  try {
    const listenerId = getListenerId(req);
    if (!listenerId) {
      return sendError(res, 401, 'Listener authentication required');
    }

    const unreadCount = await UserNotification.countDocuments({
      userId: new mongoose.Types.ObjectId(listenerId),
      isRead: false,
    });

    return sendSuccess(res, 200, 'Unread notification count retrieved', {
      unreadCount,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Mark a single notification as read (scoped to authenticated listener)
 * @route   PATCH /api/listener/notifications/:id/read
 * @access  Private (Listener)
 */
const markNotificationAsRead = async (req, res, next) => {
  try {
    const listenerId = getListenerId(req);
    if (!listenerId) {
      return sendError(res, 401, 'Listener authentication required');
    }

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return sendError(res, 400, 'Invalid notification ID format');
    }

    // Must match both the notification ID and the authenticated listener's userId
    const notification = await UserNotification.findOne({
      _id: id,
      userId: new mongoose.Types.ObjectId(listenerId),
    });

    if (!notification) {
      return sendError(res, 404, 'Notification not found in your inbox');
    }

    if (!notification.isRead) {
      notification.isRead = true;
      notification.readAt = new Date();
      await notification.save();
    }

    const unreadCount = await UserNotification.countDocuments({
      userId: new mongoose.Types.ObjectId(listenerId),
      isRead: false,
    });

    return sendSuccess(res, 200, 'Notification marked as read', {
      notification,
      unreadCount,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Mark all notifications as read for current listener
 * @route   PATCH /api/listener/notifications/read-all
 * @access  Private (Listener)
 */
const markAllNotificationsAsRead = async (req, res, next) => {
  try {
    const listenerId = getListenerId(req);
    if (!listenerId) {
      return sendError(res, 401, 'Listener authentication required');
    }

    const result = await UserNotification.updateMany(
      {
        userId: new mongoose.Types.ObjectId(listenerId),
        isRead: false,
      },
      {
        $set: {
          isRead: true,
          readAt: new Date(),
        },
      }
    );

    return sendSuccess(res, 200, 'All notifications marked as read', {
      modifiedCount: result.modifiedCount,
      unreadCount: 0,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Dismiss / delete a single notification from listener inbox
 * @route   DELETE /api/listener/notifications/:id
 * @access  Private (Listener)
 */
const deleteNotification = async (req, res, next) => {
  try {
    const listenerId = getListenerId(req);
    if (!listenerId) {
      return sendError(res, 401, 'Listener authentication required');
    }

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return sendError(res, 400, 'Invalid notification ID format');
    }

    const deleted = await UserNotification.findOneAndDelete({
      _id: id,
      userId: new mongoose.Types.ObjectId(listenerId),
    });

    if (!deleted) {
      return sendError(res, 404, 'Notification not found in your inbox');
    }

    const unreadCount = await UserNotification.countDocuments({
      userId: new mongoose.Types.ObjectId(listenerId),
      isRead: false,
    });

    return sendSuccess(res, 200, 'Notification dismissed successfully', {
      id,
      unreadCount,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getListenerNotifications,
  getUnreadCount,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
};
