const mongoose = require('mongoose');

const adSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Ad campaign title is required'],
      trim: true,
      maxlength: [120, 'Title cannot exceed 120 characters'],
    },
    advertiser: {
      type: String,
      trim: true,
      default: '',
      maxlength: [80, 'Advertiser name cannot exceed 80 characters'],
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    type: {
      type: String,
      enum: {
        values: ['audio', 'banner', 'video'],
        message: '{VALUE} is not a valid ad type (must be audio, banner, or video)',
      },
      required: [true, 'Ad type is required'],
      default: 'audio',
      index: true,
    },
    placement: {
      type: String,
      enum: {
        values: [
          'audio_preroll',
          'video_preroll',
          'video_popup',
          'banner_home',
          'banner_story_detail',
          'banner_explore',
          'player_companion',
        ],
        message: '{VALUE} is not a recognized placement',
      },
      required: [true, 'Ad placement is required'],
      index: true,
    },
    // Media Assets
    audioUrl: {
      type: String,
      trim: true,
      default: '',
    },
    audioDuration: {
      type: Number,
      default: 0,
      min: [0, 'Audio duration cannot be negative'],
    },
    videoUrl: {
      type: String,
      trim: true,
      default: '',
    },
    videoDuration: {
      type: Number,
      default: 0,
      min: [0, 'Video duration cannot be negative'],
    },
    imageUrl: {
      type: String,
      trim: true,
      default: '',
    },
    destinationUrl: {
      type: String,
      required: [true, 'Destination/click-through URL is required'],
      trim: true,
    },
    ctaText: {
      type: String,
      trim: true,
      default: 'Learn More',
      maxlength: [30, 'CTA text cannot exceed 30 characters'],
    },

    // Targeting & Playback Rules
    targetAudience: {
      type: String,
      enum: ['free_users', 'all_users'],
      default: 'free_users',
    },
    targetCategories: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Category',
      },
    ],
    targetStories: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Story',
      },
    ],
    isSkippable: {
      type: Boolean,
      default: false,
    },
    skipAfterSeconds: {
      type: Number,
      default: 5,
      min: [0, 'Skip time cannot be negative'],
    },

    // Campaign Schedule & Delivery
    startDate: {
      type: Date,
      default: Date.now,
    },
    endDate: {
      type: Date,
      default: null,
    },
    priority: {
      type: Number,
      default: 1,
      min: [1, 'Priority must be at least 1'],
    },
    status: {
      type: String,
      enum: ['Active', 'Inactive', 'Draft', 'Expired'],
      default: 'Active',
      index: true,
    },

    // Analytics Metrics (atomic increment counters)
    impressionsCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    startsCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    completionsCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    clicksCount: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: function (doc, ret) {
        ret.id = ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Virtual for dynamic active state considering dates
adSchema.virtual('isCurrentlyActive').get(function () {
  if (this.status !== 'Active') return false;
  const now = new Date();
  if (this.startDate && new Date(this.startDate) > now) return false;
  if (this.endDate && new Date(this.endDate) < now) return false;
  return true;
});

module.exports = mongoose.model('Ad', adSchema);
