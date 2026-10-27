const express = require('express');
const router = express.Router();
const {
  getAllStories,
  getStoryById,
  createStory,
  updateStory,
  toggleStoryStatus,
  deleteStory,
  downloadStoryAudio,
} = require('../controllers/story.controller');
const { getEpisodesByStoryId } = require('../controllers/episode.controller');
const { protect, optionalAuth } = require('../middlewares/auth.middleware');

// Public READ routes (with optional auth so Admin gets full access if authenticated)
router.get('/', optionalAuth, getAllStories);
router.get('/:id', optionalAuth, getStoryById);
router.get('/:id/episodes', optionalAuth, getEpisodesByStoryId);
router.get('/:id/download', optionalAuth, downloadStoryAudio);

// Admin-protected WRITE / MUTATION routes
router.post('/', protect, createStory);
router.put('/:id', protect, updateStory);
router.patch('/:id/status', protect, toggleStoryStatus);
router.delete('/:id', protect, deleteStory);

module.exports = router;

