const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    text: {
      type: String,
      required: [true, 'Notification message is required'],
      trim: true,
    },
    type: {
      type: String,
      enum: ['story', 'episode', 'review', 'narrator', 'category', 'collection', 'user', 'media', 'system', 'alert'],
      default: 'system',
    },
    unread: {
      type: Boolean,
      default: true,
    },
    time: {
      type: String,
      default: 'Just now',
    },
    link: {
      type: String,
      default: '',
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
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

module.exports = mongoose.model('Notification', notificationSchema);
