const express = require('express');
const router = express.Router();
const {
  createAndSendCampaign,
  getCampaignHistory,
  getCampaignById,
  sendDraftCampaign,
  deleteCampaign,
} = require('../controllers/notificationCampaign.controller');
const { protect } = require('../middlewares/auth.middleware');

// Protect all Admin Notification Campaign routes with Admin JWT
router.use(protect);

router.post('/send', createAndSendCampaign);
router.route('/campaigns')
  .post(createAndSendCampaign)
  .get(getCampaignHistory);

router.route('/campaigns/:id')
  .get(getCampaignById)
  .delete(deleteCampaign);

router.post('/campaigns/:id/send', sendDraftCampaign);

module.exports = router;
