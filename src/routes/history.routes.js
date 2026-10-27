const express = require('express');
const router = express.Router();
const historyController = require('../controllers/history.controller');
const { protectListener } = require('../middlewares/auth.middleware');

// All history routes require authenticated listener
router.use(protectListener);

// Route: /api/history
router
  .route('/')
  .get(historyController.getHistory)
  .post(historyController.saveProgress)
  .delete(historyController.clearHistory);

// Route: /api/history/progress (save progress alias)
router.post('/progress', historyController.saveProgress);

// Route: /api/history/progress/:episodeId (get progress)
router.get('/progress/:episodeId', historyController.getProgress);

// Route: /api/history/:id (delete single item by history ID or episode ID)
router.delete('/:id', historyController.removeHistoryItem);

module.exports = router;
