const express = require('express');
const router = express.Router();
const {
  getAllUsers,
  getUserStats,
  getUserById,
  createUser,
  updateUser,
  updateUserStatus,
  deleteUser,
} = require('../controllers/user.controller');
const { protect } = require('../middlewares/auth.middleware');

// Protect all User routes with Admin JWT Authentication
router.use(protect);

// Routes
router.get('/', getAllUsers);
router.get('/stats', getUserStats);
router.get('/:id', getUserById);
router.post('/', createUser);
router.put('/:id', updateUser);
router.patch('/:id/status', updateUserStatus);
router.delete('/:id', deleteUser);

module.exports = router;
