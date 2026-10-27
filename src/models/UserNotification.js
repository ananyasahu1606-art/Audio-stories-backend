const mongoose = require('mongoose');

const userNotificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Recipient user ID is required'],
      index: true,
    },
    campaignId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'NotificationCampaign',
      index: true,
      default: null,
    },
    title: {
      type: String,
      required: [true, 'Notification title is required'],
      trim: true,
      maxlength: [150, 'Notification title cannot exceed 150 characters'],
    },
    message: {
      type: String,
      required: [true, 'Notification message is required'],
      trim: true,
      maxlength: [2000, 'Notification message cannot exceed 2000 characters'],
    },
    type: {
      type: String,
      enum: ['announcement', 'story', 'episode', 'subscription', 'promotion', 'system', 'alert'],
      default: 'announcement',
    },
    actionLink: {
      type: String,
      default: '',
      trim: true,
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
    readAt: {
      type: Date,
      default: null,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    eventId: {
      type: String,
      default: null,
      trim: true,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: function (doc, ret) {
        ret.id = ret._id;
        return ret;
      },
    },
  }
);

// High-performance compound indexes for listener inboxes
userNotificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });
userNotificationSchema.index({ userId: 1, createdAt: -1 });
userNotificationSchema.index({ userId: 1, campaignId: 1 });
// Reliable deduplication constraint for event-based triggers (partial index on eventId string)
userNotificationSchema.index(
  { userId: 1, eventId: 1 },
  { unique: true, partialFilterExpression: { eventId: { $type: 'string' } } }
);

module.exports = mongoose.model('UserNotification', userNotificationSchema);
