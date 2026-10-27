const mongoose = require('mongoose');

const listeningHistorySchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User/Listener ID is required'],
      index: true,
    },
    story: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Story',
      required: [true, 'Story ID is required'],
    },
    episode: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Episode',
      required: [true, 'Episode ID is required'],
    },
    currentTime: {
      type: Number,
      default: 0,
      min: [0, 'Current time cannot be negative'],
    },
    duration: {
      type: Number,
      default: 0,
      min: [0, 'Duration cannot be negative'],
    },
    progressPercent: {
      type: Number,
      default: 0,
      min: [0, 'Progress percent cannot be negative'],
      max: [100, 'Progress percent cannot exceed 100'],
    },
    status: {
      type: String,
      enum: ['in_progress', 'completed'],
      default: 'in_progress',
    },
    lastListenedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Compound index to ensure uniqueness per user and episode
listeningHistorySchema.index({ user: 1, episode: 1 }, { unique: true });
listeningHistorySchema.index({ user: 1, lastListenedAt: -1 });

const ListeningHistory = mongoose.model('ListeningHistory', listeningHistorySchema);

module.exports = ListeningHistory;
