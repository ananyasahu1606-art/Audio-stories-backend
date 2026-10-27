const mongoose = require('mongoose');
const { EPISODE_STATUS } = require('../constants');

const episodeSchema = new mongoose.Schema(
  {
    storyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Story',
      required: [true, 'Parent Story ID is required'],
    },
    storyTitle: {
      type: String,
      default: 'Audio Story',
      trim: true,
    },
    episodeNumber: {
      type: Number,
      required: [true, 'Episode / Chapter number is required'],
      min: [1, 'Episode number must be at least 1'],
    },
    title: {
      type: String,
      required: [true, 'Episode title is required'],
      trim: true,
      maxlength: [200, 'Episode title cannot exceed 200 characters'],
    },
    description: {
      type: String,
      default: '',
      trim: true,
    },
    narratorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Narrator',
      required: [true, 'Narrator ID is required'],
    },
    narratorName: {
      type: String,
      default: 'Voice Narrator',
      trim: true,
    },
    duration: {
      type: String,
      default: '25m 30s',
      trim: true,
    },
    durationSeconds: {
      type: Number,
      default: 1530,
      min: [0, 'Duration in seconds cannot be negative'],
    },
    audioUrl: {
      type: String,
      required: [true, 'Audio narration URL or file reference is required'],
      trim: true,
    },
    thumbnail: {
      type: String,
      default:
        'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=400&auto=format&fit=crop&q=80',
    },
    status: {
      type: String,
      enum: Object.values(EPISODE_STATUS),
      default: EPISODE_STATUS.PUBLISHED,
    },
    releaseDate: {
      type: String,
      default: () => new Date().toISOString().split('T')[0],
    },
    listenCount: {
      type: Number,
      default: 0,
      min: [0, 'Listen count cannot be negative'],
    },
    fileSize: {
      type: String,
      default: '32.4 MB',
      trim: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Compound index to ensure uniqueness of episode number per story
episodeSchema.index({ storyId: 1, episodeNumber: 1 });

const Episode = mongoose.model('Episode', episodeSchema);

module.exports = Episode;
