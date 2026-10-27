const express = require('express');
const router = express.Router();
const {
  getAllCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory,
} = require('../controllers/category.controller');
const { protect, optionalAuth } = require('../middlewares/auth.middleware');

// Public READ routes
router.get('/', optionalAuth, getAllCategories);
router.get('/:id', optionalAuth, getCategoryById);

// Admin-protected WRITE / MUTATION routes
router.post('/', protect, createCategory);
router.put('/:id', protect, updateCategory);
router.delete('/:id', protect, deleteCategory);

module.exports = router;


