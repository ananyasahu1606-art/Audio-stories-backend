const mongoose = require('mongoose');

const mediaSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Media title is required'],
      trim: true,
    },
    type: {
      type: String,
      enum: ['cover', 'audio', 'banner'],
      default: 'cover',
    },
    url: {
      type: String,
      required: [true, 'Media URL or file path is required'],
      trim: true,
    },
    size: {
      type: String,
      default: '2.5 MB',
    },
    sizeBytes: {
      type: Number,
      default: 0,
    },
    dimensionOrDuration: {
      type: String,
      default: '',
    },
    storyTitle: {
      type: String,
      default: '',
      trim: true,
    },
    mimetype: {
      type: String,
      default: '',
    },
    uploadedAt: {
      type: String,
      default: () => new Date().toISOString().split('T')[0],
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

module.exports = mongoose.model('Media', mediaSchema);
