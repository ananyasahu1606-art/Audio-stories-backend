const express = require('express');
const router = express.Router();
const {
  getAllNarrators,
  getNarratorById,
  createNarrator,
  updateNarrator,
  deleteNarrator,
} = require('../controllers/narrator.controller');
const { protect } = require('../middlewares/auth.middleware');

// Protect all Narrator routes with Admin JWT Authentication
router.use(protect);

router.get('/', getAllNarrators);
router.get('/:id', getNarratorById);
router.post('/', createNarrator);
router.put('/:id', updateNarrator);
router.delete('/:id', deleteNarrator);

module.exports = router;
