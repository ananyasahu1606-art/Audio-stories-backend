const express = require('express');
const router = express.Router();
const {
  getAllMedia,
  getMediaStats,
  getMediaById,
  uploadMediaFile,
  createMediaRecord,
  updateMedia,
  deleteMedia,
} = require('../controllers/media.controller');
const upload = require('../middlewares/upload.middleware');
const { protect } = require('../middlewares/auth.middleware');

// Protect all Media Library routes with Admin JWT Authentication
router.use(protect);

// Routes
router.get('/', getAllMedia);
router.get('/stats', getMediaStats);
router.get('/:id', getMediaById);
router.post('/upload', upload.single('file'), uploadMediaFile);
router.post('/', createMediaRecord);
router.put('/:id', updateMedia);
router.delete('/:id', deleteMedia);

module.exports = router;
