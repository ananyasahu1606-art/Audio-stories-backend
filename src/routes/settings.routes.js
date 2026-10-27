const express = require('express');
const router = express.Router();
const {
  getSettings,
  updateSettings,
  updateSectionSettings,
  resetSettings,
} = require('../controllers/setting.controller');
const { protect } = require('../middlewares/auth.middleware');

// Protect all Settings routes with Admin JWT Authentication
router.use(protect);

// Routes
router.get('/', getSettings);
router.put('/', updateSettings);
router.patch('/:section', updateSectionSettings);
router.post('/reset', resetSettings);

module.exports = router;
