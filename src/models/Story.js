const mongoose = require('mongoose');
const { AGE_GROUPS, STORY_TYPES, STORY_STATUS } = require('../constants');

const storySchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Story title is required'],
      trim: true,
      maxlength: [200, 'Story title cannot exceed 200 characters'],
    },
    shortDescription: {
      type: String,
      default: '',
      trim: true,
      maxlength: [300, 'Short description cannot exceed 300 characters'],
    },
    fullDescription: {
      type: String,
      default: '',
      trim: true,
    },
    coverImage: {
      type: String,
      default:
        'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=600&auto=format&fit=crop&q=80',
    },
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: [true, 'Category is required'],
    },
    categoryName: {
      type: String,
      default: 'General Story',
      trim: true,
    },
    narratorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Narrator',
      required: [true, 'Narrator is required'],
    },
    narratorName: {
      type: String,
      default: 'Story Narrator',
      trim: true,
    },
    language: {
      type: String,
      default: 'English',
      trim: true,
    },
    ageGroup: {
      type: String,
      enum: AGE_GROUPS,
      default: 'All Ages',
    },
    storyType: {
      type: String,
      enum: STORY_TYPES,
      default: 'Mystery',
    },
    tags: {
      type: [String],
      default: ['Audio Story', 'Narration'],
    },
    totalEpisodes: {
      type: Number,
      default: 1,
      min: [1, 'Total episodes must be at least 1'],
    },
    totalDuration: {
      type: String,
      default: '45m',
      trim: true,
    },
    releaseDate: {
      type: String,
      default: () => new Date().toISOString().split('T')[0],
    },
    status: {
      type: String,
      enum: Object.values(STORY_STATUS),
      default: STORY_STATUS.PUBLISHED,
    },
    isFeatured: {
      type: Boolean,
      default: false,
    },
    rating: {
      type: Number,
      default: 5.0,
      min: [1.0, 'Rating cannot be lower than 1.0'],
      max: [5.0, 'Rating cannot exceed 5.0'],
    },
    listenCount: {
      type: Number,
      default: 0,
      min: [0, 'Listen count cannot be negative'],
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

const Story = mongoose.model('Story', storySchema);

module.exports = Story;
