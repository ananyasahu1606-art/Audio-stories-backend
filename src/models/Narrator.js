const mongoose = require('mongoose');

const narratorSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Narrator name is required'],
      trim: true,
      maxlength: [100, 'Narrator name cannot exceed 100 characters'],
    },
    profileImage: {
      type: String,
      default:
        'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&auto=format&fit=crop&q=80',
    },
    bio: {
      type: String,
      default: '',
      trim: true,
    },
    language: {
      type: String,
      default: 'English (British RP)',
      trim: true,
    },
    voiceStyle: {
      type: String,
      required: [true, 'Voice style / persona is required'],
      default: 'Deep, Atmospheric & Dramatic',
      trim: true,
    },
    storyCount: {
      type: Number,
      default: 0,
      min: [0, 'Story count cannot be negative'],
    },
    episodeCount: {
      type: Number,
      default: 0,
      min: [0, 'Episode count cannot be negative'],
    },
    rating: {
      type: Number,
      default: 5.0,
      min: [1.0, 'Rating cannot be lower than 1.0'],
      max: [5.0, 'Rating cannot exceed 5.0'],
    },
    totalListens: {
      type: Number,
      default: 0,
      min: [0, 'Total listens cannot be negative'],
    },
    status: {
      type: String,
      enum: ['Active', 'Inactive'],
      default: 'Active',
    },
    joinedDate: {
      type: String,
      default: () => new Date().toISOString().split('T')[0],
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

const Narrator = mongoose.model('Narrator', narratorSchema);

module.exports = Narrator;
