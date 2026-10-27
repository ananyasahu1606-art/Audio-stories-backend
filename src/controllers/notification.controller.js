const Notification = require('../models/Notification');
const { sendSuccess, sendError } = require('../utils');

/**
 * @desc    Get all admin notifications with filter (unread, type) & pagination
 * @route   GET /api/notifications
 * @access  Private (Admin)
 */
const getAllNotifications = async (req, res, next) => {
  try {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    const {
      page = 1,
      limit = 20,
      unread,
      type,
    } = req.query;

    const filter = {};

    if (unread !== undefined && unread !== 'ALL') {
      filter.unread = unread === 'true' || unread === true;
    }

    if (type && type !== 'ALL') {
      filter.type = type;
    }

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 20;
    const skip = (pageNum - 1) * limitNum;

    const totalNotifications = await Notification.countDocuments(filter);
    const unreadCount = await Notification.countDocuments({ unread: true });

    const notifications = await Notification.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    return sendSuccess(res, 200, 'Notifications retrieved successfully', {
      unreadCount,
      notifications,
      pagination: {
        total: totalNotifications,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(totalNotifications / limitNum) || 1,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get notification counts (unread count, total count)
 * @route   GET /api/notifications/stats
 * @access  Private (Admin)
 */
const getNotificationStats = async (req, res, next) => {
  try {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    const totalCount = await Notification.countDocuments();
    const unreadCount = await Notification.countDocuments({ unread: true });

    return sendSuccess(res, 200, 'Notification statistics retrieved', {
      totalCount,
      unreadCount,
      readCount: totalCount - unreadCount,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Create new notification / system alert
 * @route   POST /api/notifications
 * @access  Private (Admin)
 */
const createNotification = async (req, res, next) => {
  try {
    const { text, type = 'system', time, link, metadata } = req.body;

    if (!text || !text.trim()) {
      return sendError(res, 400, 'Notification message text is required');
    }

    const newNotification = await Notification.create({
      text: text.trim(),
      type,
      unread: true,
      time: time || 'Just now',
      link: link || '',
      metadata: metadata || {},
    });

    return sendSuccess(
      res,
      201,
      'Notification created successfully',
      newNotification
    );
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Mark a single notification as read
 * @route   PATCH /api/notifications/:id/read
 * @access  Private (Admin)
 */
const markNotificationAsRead = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return sendError(res, 400, 'Invalid Notification ID format');
    }

    const notification = await Notification.findById(id);
    if (!notification) {
      return sendError(res, 404, `Notification with ID "${id}" not found`);
    }

    notification.unread = false;
    await notification.save();

    return sendSuccess(
      res,
      200,
      'Notification marked as read',
      notification
    );
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Mark all notifications as read
 * @route   PATCH /api/notifications/read-all
 * @access  Private (Admin)
 */
const markAllNotificationsAsRead = async (req, res, next) => {
  try {
    await Notification.updateMany({ unread: true }, { unread: false });

    return sendSuccess(res, 200, 'All notifications marked as read', {
      unreadCount: 0,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete single notification
 * @route   DELETE /api/notifications/:id
 * @access  Private (Admin)
 */
const deleteNotification = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return sendError(res, 400, 'Invalid Notification ID format');
    }

    const notification = await Notification.findById(id);
    if (!notification) {
      return sendError(res, 404, `Notification with ID "${id}" not found`);
    }

    await Notification.findByIdAndDelete(id);

    return sendSuccess(res, 200, 'Notification deleted successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Clear all notifications
 * @route   DELETE /api/notifications/clear-all
 * @access  Private (Admin)
 */
const clearAllNotifications = async (req, res, next) => {
  try {
    await Notification.deleteMany({});

    return sendSuccess(res, 200, 'All notifications cleared successfully');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAllNotifications,
  getNotificationStats,
  createNotification,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
  clearAllNotifications,
};
