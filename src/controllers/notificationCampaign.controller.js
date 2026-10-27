const mongoose = require('mongoose');
const NotificationCampaign = require('../models/NotificationCampaign');
const UserNotification = require('../models/UserNotification');
const { sendSuccess, sendError } = require('../utils');
const {
  validateActionLink,
  checkSensitiveContent,
  resolveAudience,
} = require('../utils/notificationValidator');

/**
 * Dispatches UserNotification records in safe batches
 */
async function batchDispatchInbox({ recipients, campaign, title, message, type, actionLink, metadata }) {
  const BATCH_SIZE = 500;
  let totalDispatched = 0;

  for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
    const chunk = recipients.slice(i, i + BATCH_SIZE);
    const notificationsToInsert = chunk.map((user) => ({
      userId: user._id,
      campaignId: campaign ? campaign._id : null,
      title,
      message,
      type: type || 'announcement',
      actionLink: actionLink || '',
      isRead: false,
      readAt: null,
      metadata: metadata || {},
    }));

    await UserNotification.insertMany(notificationsToInsert, { ordered: false });
    totalDispatched += notificationsToInsert.length;
  }

  return totalDispatched;
}

/**
 * @desc    Create and send a notification campaign (or save as draft)
 * @route   POST /api/admin/notifications/send or POST /api/admin/notifications/campaigns
 * @access  Private (Admin)
 */
const createAndSendCampaign = async (req, res, next) => {
  return sendError(
    res,
    403,
    'Manual notification creation is disabled. The Notifications section is dedicated to automatic event-based listener notifications.'
  );
};

const _unused_createAndSendCampaign = async (req, res, next) => {
  try {
    const {
      title,
      message,
      type = 'announcement',
      actionLink = '',
      audience = 'all',
      targetTier,
      targetGenre,
      targetUserId,
      targetUserIds,
      sendImmediately = true,
      metadata = {},
    } = req.body;

    // 1. Basic field validation
    if (!title || typeof title !== 'string' || !title.trim()) {
      return sendError(res, 400, 'Campaign title is required');
    }

    if (!message || typeof message !== 'string' || !message.trim()) {
      return sendError(res, 400, 'Campaign message body is required');
    }

    const trimmedTitle = title.trim();
    const trimmedMessage = message.trim();

    if (trimmedTitle.length > 150) {
      return sendError(res, 400, 'Campaign title cannot exceed 150 characters');
    }

    if (trimmedMessage.length > 2000) {
      return sendError(res, 400, 'Campaign message cannot exceed 2000 characters');
    }

    // 2. Action link validation
    const linkValidation = validateActionLink(actionLink);
    if (!linkValidation.isValid) {
      return sendError(res, 400, linkValidation.message);
    }
    const sanitizedLink = linkValidation.sanitized;

    // 3. Sensitive data checks
    const titleCheck = checkSensitiveContent(trimmedTitle);
    if (!titleCheck.isSafe) {
      return sendError(res, 400, titleCheck.message);
    }

    const messageCheck = checkSensitiveContent(trimmedMessage);
    if (!messageCheck.isSafe) {
      return sendError(res, 400, messageCheck.message);
    }

    // 4. Resolve audience criteria
    let audienceResult;
    try {
      audienceResult = await resolveAudience({
        audience,
        targetTier,
        targetGenre,
        targetUserId,
        targetUserIds,
      });
    } catch (err) {
      return sendError(res, 400, err.message);
    }

    const { recipients, targetTierName } = audienceResult;

    // 5. Duplicate dispatch prevention check (within 15 seconds for same title & audience)
    if (sendImmediately) {
      const recentDuplicate = await NotificationCampaign.findOne({
        title: trimmedTitle,
        audience,
        status: { $in: ['sending', 'sent'] },
        createdAt: { $gte: new Date(Date.now() - 15000) },
      });

      if (recentDuplicate) {
        return sendError(
          res,
          409,
          'Duplicate campaign detected: an identical campaign was sent within the last 15 seconds'
        );
      }
    }

    const adminId = req.admin?.id || req.admin?._id || null;
    const adminEmail = req.admin?.email || '';

    // 6. Draft handling
    if (!sendImmediately) {
      const draftCampaign = await NotificationCampaign.create({
        title: trimmedTitle,
        message: trimmedMessage,
        type,
        actionLink: sanitizedLink,
        audience,
        targetTier: targetTier || '',
        targetTierName: targetTierName || '',
        targetGenre: targetGenre || '',
        targetUserId: targetUserId || null,
        targetUserIds: Array.isArray(targetUserIds) ? targetUserIds : [],
        status: 'draft',
        recipientCount: recipients.length,
        sentAt: null,
        createdByAdmin: adminId,
        adminEmail,
        metadata,
      });

      return sendSuccess(res, 201, 'Notification campaign saved as draft', {
        campaign: draftCampaign,
        estimatedRecipients: recipients.length,
      });
    }

    // 7. Immediate dispatch handling
    if (recipients.length === 0) {
      return sendError(
        res,
        422,
        'No eligible active listeners match the selected audience criteria'
      );
    }

    // Create campaign in 'sending' state
    const campaign = await NotificationCampaign.create({
      title: trimmedTitle,
      message: trimmedMessage,
      type,
      actionLink: sanitizedLink,
      audience,
      targetTier: targetTier || '',
      targetTierName: targetTierName || '',
      targetGenre: targetGenre || '',
      targetUserId: targetUserId || null,
      targetUserIds: Array.isArray(targetUserIds) ? targetUserIds : [],
      status: 'sending',
      recipientCount: 0,
      sentAt: null,
      createdByAdmin: adminId,
      adminEmail,
      metadata,
    });

    // Batch insert into listener inboxes
    const dispatchedCount = await batchDispatchInbox({
      recipients,
      campaign,
      title: trimmedTitle,
      message: trimmedMessage,
      type,
      actionLink: sanitizedLink,
      metadata,
    });

    // Mark campaign as sent
    campaign.status = 'sent';
    campaign.recipientCount = dispatchedCount;
    campaign.sentAt = new Date();
    await campaign.save();

    return sendSuccess(res, 201, `Notification sent successfully to ${dispatchedCount} listener(s)`, {
      campaign,
      recipientCount: dispatchedCount,
      sentAt: campaign.sentAt,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get notification campaigns history with stats and pagination
 * @route   GET /api/admin/notifications/campaigns
 * @access  Private (Admin)
 */
const getCampaignHistory = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      type,
      audience,
      search,
    } = req.query;

    const filter = {};

    if (status && status !== 'ALL') {
      filter.status = status;
    }

    if (type && type !== 'ALL') {
      filter.type = type;
    }

    if (audience && audience !== 'ALL') {
      filter.audience = audience;
    }

    if (search && search.trim()) {
      filter.$or = [
        { title: { $regex: search.trim(), $options: 'i' } },
        { message: { $regex: search.trim(), $options: 'i' } },
      ];
    }

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 20;
    const skip = (pageNum - 1) * limitNum;

    const totalCampaigns = await NotificationCampaign.countDocuments(filter);
    const campaigns = await NotificationCampaign.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    // Summary metrics
    const statsAgg = await NotificationCampaign.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalRecipients: { $sum: '$recipientCount' },
        },
      },
    ]);

    const stats = {
      total: totalCampaigns,
      sent: 0,
      draft: 0,
      totalRecipients: 0,
    };

    statsAgg.forEach((item) => {
      if (item._id === 'sent') {
        stats.sent = item.count;
        stats.totalRecipients = item.totalRecipients;
      } else if (item._id === 'draft') {
        stats.draft = item.count;
      }
    });

    return sendSuccess(res, 200, 'Campaign history retrieved successfully', {
      campaigns,
      stats,
      pagination: {
        total: totalCampaigns,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(totalCampaigns / limitNum) || 1,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get single campaign by ID
 * @route   GET /api/admin/notifications/campaigns/:id
 * @access  Private (Admin)
 */
const getCampaignById = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return sendError(res, 400, 'Invalid campaign ID format');
    }

    const campaign = await NotificationCampaign.findById(id);
    if (!campaign) {
      return sendError(res, 404, `Campaign with ID "${id}" not found`);
    }

    // Get read metrics for this campaign
    const readCount = await UserNotification.countDocuments({
      campaignId: campaign._id,
      isRead: true,
    });

    const unreadCount = await UserNotification.countDocuments({
      campaignId: campaign._id,
      isRead: false,
    });

    return sendSuccess(res, 200, 'Campaign details retrieved', {
      campaign,
      deliveryMetrics: {
        totalDelivered: campaign.recipientCount,
        readCount,
        unreadCount,
        readPercentage:
          campaign.recipientCount > 0
            ? Math.round((readCount / campaign.recipientCount) * 100)
            : 0,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Dispatch an existing draft campaign
 * @route   POST /api/admin/notifications/campaigns/:id/send
 * @access  Private (Admin)
 */
const sendDraftCampaign = async (req, res, next) => {
  return sendError(
    res,
    403,
    'Manual campaign dispatch is disabled. The Notifications section is dedicated to automatic event-based listener notifications.'
  );
};

const _unused_sendDraftCampaign = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return sendError(res, 400, 'Invalid campaign ID format');
    }

    // Atomic status transition from draft to sending to prevent double dispatch
    const campaign = await NotificationCampaign.findOneAndUpdate(
      {
        _id: id,
        status: { $in: ['draft', 'cancelled'] },
      },
      {
        $set: { status: 'sending' },
      },
      { new: true }
    );

    if (!campaign) {
      const existing = await NotificationCampaign.findById(id);
      if (!existing) {
        return sendError(res, 404, `Campaign with ID "${id}" not found`);
      }
      if (existing.status === 'sent' || existing.status === 'sending') {
        return sendError(
          res,
          409,
          'Campaign has already been sent or is currently being dispatched'
        );
      }
      return sendError(res, 400, `Cannot send campaign with status "${existing.status}"`);
    }

    // Resolve audience fresh at time of dispatch
    let audienceResult;
    try {
      audienceResult = await resolveAudience({
        audience: campaign.audience,
        targetTier: campaign.targetTier,
        targetGenre: campaign.targetGenre,
        targetUserId: campaign.targetUserId,
        targetUserIds: campaign.targetUserIds,
      });
    } catch (err) {
      campaign.status = 'failed';
      await campaign.save();
      return sendError(res, 400, err.message);
    }

    const { recipients } = audienceResult;

    if (recipients.length === 0) {
      campaign.status = 'draft';
      await campaign.save();
      return sendError(
        res,
        422,
        'No eligible active listeners match this campaign audience'
      );
    }

    const dispatchedCount = await batchDispatchInbox({
      recipients,
      campaign,
      title: campaign.title,
      message: campaign.message,
      type: campaign.type,
      actionLink: campaign.actionLink,
      metadata: campaign.metadata,
    });

    campaign.status = 'sent';
    campaign.recipientCount = dispatchedCount;
    campaign.sentAt = new Date();
    await campaign.save();

    return sendSuccess(res, 200, `Draft campaign sent to ${dispatchedCount} listener(s)`, {
      campaign,
      recipientCount: dispatchedCount,
      sentAt: campaign.sentAt,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete campaign (and optionally purge delivered inbox notifications)
 * @route   DELETE /api/admin/notifications/campaigns/:id
 * @access  Private (Admin)
 */
const deleteCampaign = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { purgeInbox } = req.query;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return sendError(res, 400, 'Invalid campaign ID format');
    }

    const campaign = await NotificationCampaign.findById(id);
    if (!campaign) {
      return sendError(res, 404, `Campaign with ID "${id}" not found`);
    }

    await NotificationCampaign.findByIdAndDelete(id);

    let purgedCount = 0;
    if (purgeInbox === 'true' || purgeInbox === true) {
      const purgeResult = await UserNotification.deleteMany({ campaignId: id });
      purgedCount = purgeResult.deletedCount;
    }

    return sendSuccess(res, 200, 'Campaign deleted successfully', {
      id,
      purgedInboxCount: purgedCount,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createAndSendCampaign,
  getCampaignHistory,
  getCampaignById,
  sendDraftCampaign,
  deleteCampaign,
};
