const mongoose = require('mongoose');

const notificationCampaignSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Campaign title is required'],
      trim: true,
      maxlength: [150, 'Campaign title cannot exceed 150 characters'],
    },
    message: {
      type: String,
      required: [true, 'Campaign message is required'],
      trim: true,
      maxlength: [2000, 'Campaign message cannot exceed 2000 characters'],
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
    audience: {
      type: String,
      enum: ['all', 'tier', 'genre', 'individual'],
      default: 'all',
    },
    targetTier: {
      type: String,
      default: '',
      trim: true,
    },
    targetTierName: {
      type: String,
      default: '',
      trim: true,
    },
    targetGenre: {
      type: String,
      default: '',
      trim: true,
    },
    targetUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    targetUserIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    status: {
      type: String,
      enum: ['draft', 'sending', 'sent', 'cancelled', 'failed'],
      default: 'draft',
      index: true,
    },
    recipientCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    sentAt: {
      type: Date,
      default: null,
    },
    createdByAdmin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      default: null,
    },
    adminEmail: {
      type: String,
      default: '',
      trim: true,
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
    isAutomatic: {
      type: Boolean,
      default: false,
      index: true,
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

notificationCampaignSchema.index({ createdAt: -1 });
notificationCampaignSchema.index({ status: 1, createdAt: -1 });
notificationCampaignSchema.index(
  { eventId: 1 },
  { unique: true, partialFilterExpression: { eventId: { $type: 'string' } } }
);

module.exports = mongoose.model('NotificationCampaign', notificationCampaignSchema);
