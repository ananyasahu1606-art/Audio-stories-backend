const express = require('express');
const router = express.Router();
const {
  getAllEpisodes,
  getEpisodesByStoryId,
  getEpisodeById,
  createEpisode,
  updateEpisode,
  toggleEpisodeStatus,
  deleteEpisode,
  downloadEpisodeAudio,
} = require('../controllers/episode.controller');
const { protect, optionalAuth } = require('../middlewares/auth.middleware');

// Public / Listener Download route (protected dynamically by plan download permissions)
router.get('/:id/download', optionalAuth, downloadEpisodeAudio);

// Protect all other Episode routes with Admin JWT Authentication
router.use(protect);

// Routes
router.get('/', getAllEpisodes);
router.get('/story/:storyId', getEpisodesByStoryId);
router.get('/:id', getEpisodeById);
router.post('/', createEpisode);
router.put('/:id', updateEpisode);
router.patch('/:id/status', toggleEpisodeStatus);
router.delete('/:id', deleteEpisode);

module.exports = router;
