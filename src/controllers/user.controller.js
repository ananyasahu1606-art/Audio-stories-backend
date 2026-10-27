const User = require('../models/User');
const Plan = require('../models/Plan');
const Subscription = require('../models/Subscription');
const { sendSuccess, sendError } = require('../utils');
const { notify } = require('../utils/notification.helper');

/**
 * @desc    Get all users / listeners with search, filter and pagination
 * @route   GET /api/users
 * @access  Private (Admin)
 */
const getAllUsers = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 20,
      search,
      status,
      plan,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = req.query;

    const filter = {};

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { favoriteGenres: { $regex: search, $options: 'i' } },
      ];
    }

    if (status && status !== 'ALL') {
      filter.status = status;
    }

    if (plan && plan !== 'ALL') {
      filter.plan = plan;
    }

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 20;
    const skip = (pageNum - 1) * limitNum;

    const sortOption = {};
    sortOption[sortBy] = sortOrder === 'asc' ? 1 : -1;

    const totalUsers = await User.countDocuments(filter);
    const users = await User.find(filter)
      .sort(sortOption)
      .skip(skip)
      .limit(limitNum);

    return sendSuccess(res, 200, 'Users retrieved successfully', {
      users,
      pagination: {
        total: totalUsers,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(totalUsers / limitNum) || 1,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get high-level statistics about listeners & subscription tiers
 * @route   GET /api/users/stats
 * @access  Private (Admin)
 */
const getUserStats = async (req, res, next) => {
  try {
    const totalUsers = await User.countDocuments();
    const activeUsers = await User.countDocuments({ status: 'Active' });
    const suspendedUsers = await User.countDocuments({ status: 'Suspended' });
    const inactiveUsers = await User.countDocuments({ status: 'Inactive' });

    const premiumUsers = await User.countDocuments({ plan: 'StoryPass Premium' });
    const familyUsers = await User.countDocuments({ plan: 'Family Plan' });
    const freeUsers = await User.countDocuments({ plan: 'Free' });

    // Aggregate total listening hours & total stories listened
    const statsAggregation = await User.aggregate([
      {
        $group: {
          _id: null,
          totalListeningHours: { $sum: '$totalListeningHours' },
          totalStoriesListened: { $sum: '$storiesListened' },
        },
      },
    ]);

    const aggregateData = statsAggregation[0] || {
      totalListeningHours: 0,
      totalStoriesListened: 0,
    };

    return sendSuccess(res, 200, 'User statistics retrieved successfully', {
      totalUsers,
      activeUsers,
      suspendedUsers,
      inactiveUsers,
      plans: {
        premium: premiumUsers,
        family: familyUsers,
        free: freeUsers,
      },
      totalListeningHours: Math.round(aggregateData.totalListeningHours * 10) / 10,
      totalStoriesListened: aggregateData.totalStoriesListened,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get single user / listener profile by ID
 * @route   GET /api/users/:id
 * @access  Private (Admin)
 */
const getUserById = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return sendError(res, 400, 'Invalid User ID format');
    }

    const user = await User.findById(id).populate('subscriptionId');

    if (!user) {
      return sendError(res, 404, `User with ID "${id}" not found`);
    }

    // Auto-check expiry
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

    // Also look up latest subscription record
    let subscription = user.subscriptionId;
    if (!subscription || !subscription.planName) {
      subscription = await Subscription.findOne({ userId: id })
        .sort({ createdAt: -1 })
        .populate('planId');
      if (subscription && !user.subscriptionId) {
        user.subscriptionId = subscription._id;
        await user.save();
      }
    }

    const userObj = user.toObject();
    userObj.subscription = subscription || null;

    return sendSuccess(res, 200, 'User profile retrieved', userObj);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Create a new user / listener account (Admin invite / create)
 * @route   POST /api/users
 * @access  Private (Admin)
 */
const createUser = async (req, res, next) => {
  try {
    const {
      name,
      email,
      avatar,
      plan = 'Free',
      status = 'Active',
      favoriteGenres = [],
      storiesListened = 0,
      totalListeningHours = 0,
    } = req.body;

    if (!name || !name.trim()) {
      return sendError(res, 400, 'User name is required');
    }

    if (!email || !email.trim()) {
      return sendError(res, 400, 'User email is required');
    }

    const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
    if (existingUser) {
      return sendError(res, 409, `User with email "${email}" already exists`);
    }

    const newUser = await User.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      avatar:
        avatar ||
        'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop&q=80',
      plan,
      status,
      favoriteGenres: Array.isArray(favoriteGenres) ? favoriteGenres : [],
      storiesListened: Number(storiesListened) || 0,
      totalListeningHours: Number(totalListeningHours) || 0,
      joinedDate: new Date().toISOString().split('T')[0],
      lastActive: 'Just now',
    });

    await notify({
      text: `New user account created for "${newUser.name}" (${newUser.plan})`,
      type: 'user',
      link: '/users',
      metadata: { userId: newUser._id, name: newUser.name, action: 'create' },
    });

    return sendSuccess(
      res,
      201,
      `User "${newUser.name}" created successfully`,
      newUser
    );
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update user / listener profile
 * @route   PUT /api/users/:id
 * @access  Private (Admin)
 */
const updateUser = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return sendError(res, 400, 'Invalid User ID format');
    }

    const user = await User.findById(id);
    if (!user) {
      return sendError(res, 404, `User with ID "${id}" not found`);
    }

    const {
      name,
      email,
      phone,
      avatar,
      plan,
      planId,
      subscriptionStatus,
      status,
      favoriteGenres,
      storiesListened,
      totalListeningHours,
      lastActive,
      auditReason,
    } = req.body;

    if (email && email.toLowerCase().trim() !== user.email) {
      const emailInUse = await User.findOne({
        email: email.toLowerCase().trim(),
        _id: { $ne: id },
      });
      if (emailInUse) {
        return sendError(res, 409, `Email "${email}" is already in use by another listener`);
      }
      user.email = email.toLowerCase().trim();
    }

    if (name) user.name = name.trim();
    if (phone !== undefined) user.phone = String(phone).trim();
    if (avatar) user.avatar = avatar;
    if (status) user.status = status;
    if (favoriteGenres !== undefined && Array.isArray(favoriteGenres)) {
      user.favoriteGenres = favoriteGenres;
    }
    if (storiesListened !== undefined) user.storiesListened = Number(storiesListened);
    if (totalListeningHours !== undefined) {
      user.totalListeningHours = Number(totalListeningHours);
    }
    if (lastActive) user.lastActive = lastActive;

    // Handle Subscription & Plan Assignment
    if (planId || plan) {
      let targetPlan = null;
      if (planId) {
        if (planId.match(/^[0-9a-fA-F]{24}$/)) {
          targetPlan = await Plan.findById(planId);
        }
        if (!targetPlan) {
          targetPlan = await Plan.findOne({ slug: planId });
        }
      }
      if (!targetPlan && plan) {
        targetPlan = await Plan.findOne({
          $or: [
            { name: { $regex: `^${plan}$`, $options: 'i' } },
            { slug: { $regex: `^${plan}$`, $options: 'i' } },
          ],
        });
      }
      if (!targetPlan && (plan === 'Free' || planId === 'Free' || (plan && plan.toLowerCase().includes('free')))) {
        targetPlan = await Plan.findOne({
          $or: [{ price: 0 }, { slug: 'plan-free' }, { name: { $regex: 'free', $options: 'i' } }],
        });
      }
      if (!targetPlan && plan) {
        targetPlan = await Plan.findOne({
          $or: [
            { name: { $regex: plan, $options: 'i' } },
            { slug: { $regex: plan, $options: 'i' } },
          ],
        });
      }

      if (!targetPlan && planId) {
        return sendError(res, 404, `Subscription plan not found`);
      }

      if (targetPlan) {
        const isFree = targetPlan.price === 0;
        const rawName = targetPlan.name || '';
        const formattedPlanName = isFree
          ? 'Free'
          : (rawName.length > 0 ? (rawName[0].toUpperCase() + rawName.slice(1)) : 'Premium');
        const desiredStatus = subscriptionStatus || (isFree ? 'active' : 'active');

        if (isFree) {
          user.plan = formattedPlanName;
          user.subscriptionStatus = 'active';
          user.subscriptionExpiresAt = null;

          // Check existing active subscription and cancel renewal
          await Subscription.updateMany(
            { userId: user._id, status: 'active' },
            { $set: { status: 'cancelled', autoRenew: false } }
          );

          const freeSub = await Subscription.create({
            userId: user._id,
            planId: targetPlan._id,
            planSlug: targetPlan.slug,
            planName: formattedPlanName,
            amount: 0,
            currency: 'INR',
            billingPeriod: 'forever',
            status: 'active',
            startDate: new Date(),
            endDate: null,
            autoRenew: false,
            orderId: `FREE-${Date.now()}`,
            paymentGateway: 'Free Listener Tier',
            paymentStatus: 'completed',
            receiptEmail: user.email,
          });
          user.subscriptionId = freeSub._id;
        } else {
          // Paid Plan assignment by Admin
          if (desiredStatus === 'active') {
            const durationDays = targetPlan.durationDays || (targetPlan.durationUnit === 'year' ? 365 : 30);
            const startDate = new Date();
            const endDate = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000);

            await Subscription.updateMany(
              { userId: user._id, status: 'active' },
              { $set: { status: 'cancelled', autoRenew: false } }
            );

            // Create explicit admin assignment record with audit details
            const adminGrantSub = await Subscription.create({
              userId: user._id,
              planId: targetPlan._id,
              planSlug: targetPlan.slug,
              planName: formattedPlanName,
              amount: targetPlan.price,
              currency: targetPlan.currency || 'INR',
              billingPeriod: targetPlan.billingPeriod || 'month',
              status: 'active',
              startDate,
              endDate,
              autoRenew: false,
              orderId: `ADMIN-GRANT-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`,
              paymentId: `ADMIN-${req.admin?.id || 'STAFF'}-${Date.now()}`,
              paymentGateway: 'Admin Manual Assignment',
              paymentStatus: 'completed',
              receiptEmail: user.email,
            });

            user.subscriptionId = adminGrantSub._id;
            user.plan = formattedPlanName;
            user.subscriptionStatus = 'active';
            user.subscriptionExpiresAt = endDate;
          } else if (desiredStatus === 'cancelled') {
            user.subscriptionStatus = 'cancelled';
            user.plan = formattedPlanName;
            await Subscription.updateMany(
              { userId: user._id, status: 'active' },
              { $set: { status: 'cancelled', autoRenew: false } }
            );
          } else if (desiredStatus === 'expired') {
            user.subscriptionStatus = 'expired';
            user.plan = 'Free';
            user.subscriptionExpiresAt = new Date();
            await Subscription.updateMany(
              { userId: user._id, status: 'active' },
              { $set: { status: 'expired', autoRenew: false } }
            );
          } else if (desiredStatus === 'pending' || desiredStatus === 'failed') {
            user.subscriptionStatus = desiredStatus;
            user.plan = 'Free'; // No paid benefits for pending/failed
            await Subscription.updateMany(
              { userId: user._id, status: 'active' },
              { $set: { status: desiredStatus, autoRenew: false } }
            );
          }
        }
      } else if (subscriptionStatus) {
        user.subscriptionStatus = subscriptionStatus;
        if (subscriptionStatus === 'expired') user.plan = 'Free';
      }
    } else if (subscriptionStatus) {
      user.subscriptionStatus = subscriptionStatus;
      if (subscriptionStatus === 'expired') user.plan = 'Free';
    }

    const updatedUser = await user.save();
    const populatedUser = await User.findById(updatedUser._id).populate('subscriptionId');
    const latestSub = await Subscription.findOne({ userId: user._id }).sort({ createdAt: -1 }).populate('planId');

    const resultObj = populatedUser.toObject();
    resultObj.subscription = latestSub || populatedUser.subscriptionId || null;

    return sendSuccess(
      res,
      200,
      `User "${updatedUser.name}" profile and subscription updated successfully`,
      resultObj
    );
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Change user status (Active, Suspended, Inactive)
 * @route   PATCH /api/users/:id/status
 * @access  Private (Admin)
 */
const updateUserStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return sendError(res, 400, 'Invalid User ID format');
    }

    if (!status || !['Active', 'Suspended', 'Inactive'].includes(status)) {
      return sendError(
        res,
        400,
        'Valid status is required: "Active", "Suspended", or "Inactive"'
      );
    }

    const user = await User.findById(id);
    if (!user) {
      return sendError(res, 404, `User with ID "${id}" not found`);
    }

    user.status = status;
    await user.save();

    await notify({
      text: `User "${user.name}" status updated to ${status}`,
      type: 'user',
      link: '/users',
      metadata: { userId: user._id, name: user.name, status, action: 'status_update' },
    });

    return sendSuccess(
      res,
      200,
      `User "${user.name}" status updated to ${status}`,
      {
        id: user._id,
        name: user.name,
        status: user.status,
        updatedAt: user.updatedAt,
      }
    );
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete user / listener account
 * @route   DELETE /api/users/:id
 * @access  Private (Admin)
 */
const deleteUser = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return sendError(res, 400, 'Invalid User ID format');
    }

    const user = await User.findById(id);
    if (!user) {
      return sendError(res, 404, `User with ID "${id}" not found`);
    }

    await User.findByIdAndDelete(id);

    await notify({
      text: `User "${user.name}" account was deleted`,
      type: 'user',
      link: '/users',
      metadata: { userId: user._id, name: user.name, action: 'delete' },
    });

    return sendSuccess(res, 200, `User "${user.name}" deleted successfully`);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAllUsers,
  getUserStats,
  getUserById,
  createUser,
  updateUser,
  updateUserStatus,
  deleteUser,
};
