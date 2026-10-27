const express = require('express');
const router = express.Router();
const {
  getAllCollections,
  getCollectionById,
  createCollection,
  updateCollection,
  toggleCollectionStatus,
  deleteCollection,
} = require('../controllers/collection.controller');
const { protect, optionalAuth } = require('../middlewares/auth.middleware');

// Public READ routes (with optional auth so Admin gets full draft access)
router.get('/', optionalAuth, getAllCollections);
router.get('/:id', optionalAuth, getCollectionById);

// Admin-protected WRITE / MUTATION routes
router.post('/', protect, createCollection);
router.put('/:id', protect, updateCollection);
router.patch('/:id/status', protect, toggleCollectionStatus);
router.delete('/:id', protect, deleteCollection);

module.exports = router;

