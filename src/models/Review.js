const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: false,
    },
    userName: {
      type: String,
      required: [true, 'Reviewer name is required'],
      trim: true,
    },
    userAvatar: {
      type: String,
      default:
        'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop&q=80',
    },
    storyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Story',
      required: [true, 'Story ID is required'],
    },
    storyTitle: {
      type: String,
      required: [true, 'Story title is required'],
      trim: true,
    },
    rating: {
      type: Number,
      required: [true, 'Rating (1 to 5) is required'],
      min: [1, 'Rating must be at least 1'],
      max: [5, 'Rating cannot exceed 5'],
    },
    comment: {
      type: String,
      required: [true, 'Review comment is required'],
      trim: true,
    },
    date: {
      type: String,
      default: () => new Date().toISOString().split('T')[0],
    },
    status: {
      type: String,
      enum: ['Approved', 'Pending', 'Hidden'],
      default: 'Pending',
    },
    likes: {
      type: Number,
      default: 0,
      min: 0,
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

// Indexes for query performance
reviewSchema.index({ storyId: 1, status: 1, createdAt: -1 });
reviewSchema.index({ storyId: 1, userId: 1 });

module.exports = mongoose.model('Review', reviewSchema);

