const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');
const User = require('../models/User');
const config = require('../config/env');
const { sendSuccess, sendError } = require('../utils');
const { checkUserDownloadPermission } = require('../services/downloadPermission.service');

/**
 * Generate JWT Token
 */
const generateToken = (id, email, role) => {
  return jwt.sign({ id, email, role }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });
};

/**
 * @desc    Login Admin & get token
 * @route   POST /api/auth/login
 * @access  Public
 */
const loginAdmin = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Validate request body
    if (!email || !password) {
      return sendError(res, 400, 'Please provide both email and password');
    }

    // Find admin by email (include password for comparison)
    const admin = await Admin.findOne({ email: email.toLowerCase() }).select('+password');

    if (!admin) {
      return sendError(res, 401, 'Invalid email or password');
    }

    // Check if password matches
    const isMatch = await admin.matchPassword(password);
    if (!isMatch) {
      return sendError(res, 401, 'Invalid email or password');
    }

    // Generate JWT token
    const token = generateToken(admin._id, admin.email, admin.role);

    return sendSuccess(res, 200, 'Login successful', {
      token,
      admin: {
        id: admin._id,
        name: admin.name,
        email: admin.email,
        avatar: admin.avatar,
        role: admin.role,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get logged in admin profile
 * @route   GET /api/auth/me
 * @access  Private (Admin)
 */
const getAdminProfile = async (req, res, next) => {
  try {
    const admin = await Admin.findById(req.admin.id);

    if (!admin) {
      return sendError(res, 404, 'Admin profile not found');
    }

    return sendSuccess(res, 200, 'Admin profile retrieved', {
      id: admin._id,
      name: admin.name,
      email: admin.email,
      avatar: admin.avatar,
      role: admin.role,
      createdAt: admin.createdAt,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Logout admin
 * @route   POST /api/auth/logout
 * @access  Private (Admin)
 */
const logoutAdmin = async (req, res, next) => {
  try {
    return sendSuccess(res, 200, 'Logged out successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * ================================================================
 * LISTENER / USER AUTHENTICATION CONTROLLERS (Step 4)
 * ================================================================
 */

/**
 * @desc    Register a new listener
 * @route   POST /api/auth/listener/register
 * @access  Public
 */
const registerListener = async (req, res, next) => {
  try {
    const { name, email, password, phone, avatar } = req.body;

    if (!name || !name.trim()) {
      return sendError(res, 400, 'Full name is required');
    }

    if (!email || !email.trim()) {
      return sendError(res, 400, 'Email address is required');
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return sendError(res, 400, 'Please provide a valid email address');
    }

    if (!password || password.length < 6) {
      return sendError(res, 400, 'Password must be at least 6 characters long');
    }

    const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
    if (existingUser) {
      return sendError(res, 409, 'An account with this email address already exists');
    }

    const newUser = await User.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password,
      phone: phone ? phone.trim() : '',
      avatar:
        avatar ||
        'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop&q=80',
      role: 'listener',
      status: 'Active',
      plan: req.body.plan || 'Free',
      joinedDate: new Date().toISOString().split('T')[0],
      lastActive: 'Just now',
    });

    const token = generateToken(newUser._id, newUser.email, newUser.role || 'listener');
    const downloadAllowed = await checkUserDownloadPermission(newUser);

    return sendSuccess(res, 201, 'Listener account registered successfully', {
      token,
      user: {
        id: newUser._id,
        name: newUser.name,
        email: newUser.email,
        avatar: newUser.avatar,
        phone: newUser.phone,
        bio: newUser.bio,
        plan: newUser.plan,
        role: newUser.role,
        joinedDate: newUser.joinedDate,
        storiesListened: newUser.storiesListened,
        totalListeningHours: newUser.totalListeningHours,
        downloadAllowed,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Login listener
 * @route   POST /api/auth/listener/login
 * @access  Public
 */
const loginListener = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return sendError(res, 400, 'Please provide both email and password');
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+password');

    if (!user) {
      return sendError(res, 401, 'Invalid email or password');
    }

    if (user.status === 'Suspended') {
      return sendError(res, 403, 'Your account has been suspended. Please contact support.');
    }

    // Check password
    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return sendError(res, 401, 'Invalid email or password');
    }

    // Update last active timestamp
    user.lastActive = 'Just now';
    await user.save({ validateBeforeSave: false });

    const token = generateToken(user._id, user.email, user.role || 'listener');
    const downloadAllowed = await checkUserDownloadPermission(user);

    return sendSuccess(res, 200, 'Signed in successfully', {
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        phone: user.phone,
        bio: user.bio,
        plan: user.plan,
        subscriptionStatus: user.subscriptionStatus,
        subscriptionExpiresAt: user.subscriptionExpiresAt,
        status: user.status,
        role: user.role || 'listener',
        joinedDate: user.joinedDate,
        storiesListened: user.storiesListened,
        totalListeningHours: user.totalListeningHours,
        downloadAllowed,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get current listener profile
 * @route   GET /api/auth/listener/me
 * @access  Private (Listener)
 */
const getListenerProfile = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.admin?.id;
    const user = await User.findById(userId);

    if (!user) {
      return sendError(res, 404, 'Listener account not found');
    }

    // Auto-check subscription expiry
    const now = new Date();
    if (
      user.subscriptionExpiresAt &&
      new Date(user.subscriptionExpiresAt) < now &&
      user.subscriptionStatus === 'active'
    ) {
      user.subscriptionStatus = 'expired';
      user.plan = 'Free';
      await user.save();
    }

    const downloadAllowed = await checkUserDownloadPermission(user);

    return sendSuccess(res, 200, 'Listener profile retrieved', {
      id: user._id,
      name: user.name,
      email: user.email,
      avatar: user.avatar,
      phone: user.phone,
      bio: user.bio,
      plan: user.plan,
      subscriptionStatus: user.subscriptionStatus,
      subscriptionExpiresAt: user.subscriptionExpiresAt,
      status: user.status,
      role: user.role || 'listener',
      joinedDate: user.joinedDate,
      storiesListened: user.storiesListened,
      totalListeningHours: user.totalListeningHours,
      favoriteGenres: user.favoriteGenres,
      createdAt: user.createdAt,
      downloadAllowed,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update listener profile
 * @route   PATCH /api/auth/listener/profile
 * @access  Private (Listener)
 */
const updateListenerProfile = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.admin?.id;
    const user = await User.findById(userId);

    if (!user) {
      return sendError(res, 404, 'Listener account not found');
    }

    const { name, avatar, bio, phone, email, favoriteGenres } = req.body;

    if (email && email.toLowerCase().trim() !== user.email) {
      const emailInUse = await User.findOne({
        email: email.toLowerCase().trim(),
        _id: { $ne: user._id },
      });
      if (emailInUse) {
        return sendError(res, 409, 'Email address is already in use by another account');
      }
      user.email = email.toLowerCase().trim();
    }

    if (name && name.trim()) user.name = name.trim();
    if (avatar) user.avatar = avatar;
    if (bio !== undefined) user.bio = bio;
    if (phone !== undefined) user.phone = phone;
    if (Array.isArray(favoriteGenres)) user.favoriteGenres = favoriteGenres;

    const updated = await user.save();

    return sendSuccess(res, 200, 'Profile updated successfully', {
      id: updated._id,
      name: updated.name,
      email: updated.email,
      avatar: updated.avatar,
      phone: updated.phone,
      bio: updated.bio,
      plan: updated.plan,
      role: updated.role,
      joinedDate: updated.joinedDate,
      storiesListened: updated.storiesListened,
      totalListeningHours: updated.totalListeningHours,
      favoriteGenres: updated.favoriteGenres,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Forgot Password Request
 * @route   POST /api/auth/listener/forgot-password
 * @access  Public
 */
const forgotPasswordListener = async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email || !email.trim()) {
      return sendError(res, 400, 'Email address is required');
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      // Return 200 for security so accounts cannot be enumerated
      return sendSuccess(
        res,
        200,
        'If an account exists with this email address, password reset instructions have been dispatched.'
      );
    }

    return sendSuccess(
      res,
      200,
      'If an account exists with this email address, password reset instructions have been dispatched.'
    );
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Change listener password
 * @route   POST /api/auth/listener/change-password
 * @access  Private (Listener)
 */
const changePasswordListener = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.admin?.id;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return sendError(res, 400, 'Please provide both current and new password');
    }

    if (newPassword.length < 6) {
      return sendError(res, 400, 'New password must be at least 6 characters long');
    }

    const user = await User.findById(userId).select('+password');
    if (!user) {
      return sendError(res, 404, 'User account not found');
    }

    const isMatch = await user.matchPassword(currentPassword);
    if (!isMatch) {
      return sendError(res, 401, 'Current password does not match');
    }

    user.password = newPassword;
    await user.save();

    return sendSuccess(res, 200, 'Password changed successfully');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  loginAdmin,
  getAdminProfile,
  logoutAdmin,
  registerListener,
  loginListener,
  getListenerProfile,
  updateListenerProfile,
  forgotPasswordListener,
  changePasswordListener,
};
