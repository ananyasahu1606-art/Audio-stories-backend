const express = require('express');
const router = express.Router();
const {
  loginAdmin,
  getAdminProfile,
  logoutAdmin,
  registerListener,
  loginListener,
  getListenerProfile,
  updateListenerProfile,
  forgotPasswordListener,
  changePasswordListener,
} = require('../controllers/auth.controller');
const { protect, protectListener } = require('../middlewares/auth.middleware');

// ================= ADMIN AUTH ROUTES (Unchanged) =================
router.post('/login', loginAdmin);
router.get('/me', protect, getAdminProfile);
router.post('/logout', protect, logoutAdmin);

// ================= LISTENER / USER AUTH ROUTES (Step 4) =================
router.post('/listener/register', registerListener);
router.post('/listener/login', loginListener);
router.get('/listener/me', protectListener, getListenerProfile);
router.patch('/listener/profile', protectListener, updateListenerProfile);
router.put('/listener/profile', protectListener, updateListenerProfile);
router.post('/listener/forgot-password', forgotPasswordListener);
router.post('/listener/change-password', protectListener, changePasswordListener);

module.exports = router;
