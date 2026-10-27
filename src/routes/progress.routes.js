const express = require('express');
const router = express.Router();
const historyController = require('../controllers/history.controller');
const { protectListener } = require('../middlewares/auth.middleware');

// All progress routes require authenticated listener
router.use(protectListener);

// Route: /api/progress
router.post('/', historyController.saveProgress);
router.get('/:episodeId', historyController.getProgress);

module.exports = router;
