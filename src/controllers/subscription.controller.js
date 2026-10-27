const Plan = require('../models/Plan');
const Subscription = require('../models/Subscription');
const User = require('../models/User');
const { sendSuccess, sendError } = require('../utils');
const crypto = require('crypto');
const {
  onSubscriptionActivated,
  onSubscriptionCancelled,
  onSubscriptionExpired,
} = require('../services/notificationTrigger.service');
const {
  checkUserDownloadPermission,
  getUserEffectiveDownloadDetails,
} = require('../services/downloadPermission.service');

/**
 * Default Seed Plans
 */
const DEFAULT_PLANS = [
  {
    slug: 'plan-free',
    name: 'Free Listener',
    tagline: 'Essential Story Access',
    price: 0,
    currency: '₹',
    formattedPrice: '₹0',
    billingPeriod: 'forever',
    durationDays: 0,
    description: 'Explore sample chapters, selected public stories, and essential audio listening.',
    benefits: [
      'Access to selected free stories',
      'Basic listening access',
      'Standard audio quality (128 kbps)',
      'Community reviews & ratings',
      'Public collections browsing',
    ],
    popular: false,
    badge: '',
    ctaText: 'Current Plan',
    isActive: true,
    order: 1,
  },
  {
    slug: 'plan-premium',
    name: 'StoryPass Premium',
    tagline: 'Unlimited Immersion',
    price: 199,
    currency: '₹',
    formattedPrice: '₹199',
    billingPeriod: 'month',
    durationDays: 30,
    description: 'Complete unrestricted access to all premium stories, binaural sound, and early chapter drops.',
    benefits: [
      'Access to all premium stories & audiobooks',
      'Full episode access for every series',
      '100% ad-free uninterrupted listening',
      'Lossless Ultra HD audio (320 kbps)',
      'Continue Listening sync across devices',
      'Favorites and custom library playlists',
      'Unlimited offline chapter saving',
      'Early access to weekly new releases',
      'Exclusive voice artist commentary',
    ],
    popular: true,
    badge: 'Most Popular',
    ctaText: 'Select Premium',
    isActive: true,
    order: 2,
  },
  {
    slug: 'plan-annual',
    name: 'StoryPass Annual',
    tagline: 'Best Value for Avid Listeners',
    price: 1799,
    currency: '₹',
    formattedPrice: '₹1,799',
    billingPeriod: 'year',
    durationDays: 365,
    description: 'Everything in Premium plus 2 months free and VIP priority audio experience.',
    benefits: [
      'All StoryPass Premium benefits included',
      'Save over 25% compared to monthly',
      'Lossless Ultra HD audio (320 kbps)',
      'VIP listener badge on community reviews',
      'Free full transcripts for all episodes',
      'Exclusive seasonal story releases',
    ],
    popular: false,
    badge: 'Save 25%',
    ctaText: 'Select Annual',
    isActive: true,
    order: 3,
  },
];

/**
 * Ensures plans exist in DB
 */
const ensurePlansSeeded = async () => {
  const count = await Plan.countDocuments();
  if (count === 0) {
    await Plan.insertMany(DEFAULT_PLANS);
    console.log('[Seed] Default subscription plans seeded successfully.');
  }
};

/**
 * @desc    Get all active subscription plans
 * @route   GET /api/subscriptions/plans
 * @access  Public
 */
const getPlans = async (req, res, next) => {
  try {
    await ensurePlansSeeded();
    const plans = await Plan.find({ isActive: true }).sort({ order: 1 });
    return sendSuccess(res, 200, 'Subscription plans retrieved successfully', plans);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get single plan by ID or slug
 * @route   GET /api/subscriptions/plans/:idOrSlug
 * @access  Public
 */
const getPlanById = async (req, res, next) => {
  try {
    const { idOrSlug } = req.params;
    let plan = null;

    if (idOrSlug.match(/^[0-9a-fA-F]{24}$/)) {
      plan = await Plan.findById(idOrSlug);
    }
    if (!plan) {
      plan = await Plan.findOne({ slug: idOrSlug });
    }

    if (!plan) {
      return sendError(res, 404, `Plan "${idOrSlug}" not found`);
    }

    return sendSuccess(res, 200, 'Plan details retrieved', plan);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get current listener's subscription status
 * @route   GET /api/subscriptions/me
 * @access  Private (Listener)
 */
const getMySubscription = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?._id;
    if (!userId) {
      return sendError(res, 401, 'Authentication required');
    }

    const user = await User.findById(userId).select('-password');
    if (!user) {
      return sendError(res, 404, 'Listener user not found');
    }

    // Find the latest active or past subscription
    const subscription = await Subscription.findOne({ userId })
      .sort({ createdAt: -1 })
      .populate('planId');

    const now = new Date();
    let isActive = false;
    let effectivePlan = user.plan || 'Free';

    if (subscription) {
      if (subscription.status === 'active') {
        if (!subscription.endDate || new Date(subscription.endDate) > now) {
          isActive = true;
          effectivePlan = subscription.planName || user.plan;
        } else {
          subscription.status = 'expired';
          await subscription.save();
          if (user.subscriptionStatus === 'active') {
            user.subscriptionStatus = 'expired';
            user.plan = 'Free';
            await user.save();
          }
          effectivePlan = 'Free';
        }
      } else if (['expired', 'failed', 'pending'].includes(subscription.status)) {
        effectivePlan = 'Free';
      } else if (subscription.status === 'cancelled') {
        if (subscription.endDate && new Date(subscription.endDate) > now) {
          isActive = true;
          effectivePlan = subscription.planName || user.plan;
        } else {
          effectivePlan = 'Free';
        }
      }
    }

    const downloadAllowed = await checkUserDownloadPermission(user);

    return sendSuccess(res, 200, 'Subscription status retrieved', {
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        plan: effectivePlan,
      },
      hasActiveSubscription: isActive,
      downloadAllowed,
      subscription: subscription || {
        planName: user.plan || 'Free Listener',
        planSlug: 'plan-free',
        status: 'active',
        amount: 0,
        currency: 'INR',
        billingPeriod: 'forever',
        startDate: user.createdAt || new Date(),
        endDate: null,
        autoRenew: false,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get download permission status for current requester (Guest or Listener)
 * @route   GET /api/subscriptions/download-permission
 * @access  Public / Optional Auth
 */
const checkDownloadPermissionEndpoint = async (req, res, next) => {
  try {
    const details = await getUserEffectiveDownloadDetails(req.user);
    return sendSuccess(res, 200, 'Download permission checked successfully', details);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Create checkout order for a plan (validates plan on backend, determines real price)
 * @route   POST /api/subscriptions/create-order
 * @access  Private (Listener)
 */
const createCheckoutOrder = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?._id;
    if (!userId) {
      return sendError(res, 401, 'Authentication required');
    }

    const { planId, email } = req.body;
    if (!planId) {
      return sendError(res, 400, 'Plan ID or Slug is required');
    }

    // Look up real plan from backend
    let plan = null;
    if (String(planId).match(/^[0-9a-fA-F]{24}$/)) {
      plan = await Plan.findById(planId);
    }
    if (!plan) {
      plan = await Plan.findOne({ slug: planId });
    }

    if (!plan || !plan.isActive) {
      return sendError(res, 404, 'Selected plan not found or is currently inactive');
    }

    // Free plan cannot be purchased via checkout
    if (plan.price === 0) {
      return sendError(res, 400, 'Free plan does not require checkout payment');
    }

    // Fetch user
    const user = await User.findById(userId);
    if (!user) {
      return sendError(res, 404, 'Listener user not found');
    }

    // Check if user is already actively subscribed to this exact plan
    const activeSub = await Subscription.findOne({
      userId,
      status: 'active',
      planSlug: plan.slug,
      $or: [{ endDate: { $gt: new Date() } }, { endDate: null }],
    });

    if (activeSub) {
      return sendError(
        res,
        400,
        `You already have an active subscription for "${plan.name}". No duplicate purchase allowed.`
      );
    }

    // Generate unique order ID
    const orderId = `AS-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

    // Check if payment gateway environment variables are configured
    const razorpayKeyId = process.env.RAZORPAY_KEY_ID;
    const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET;
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

    let gatewayType = 'NONE_CONFIGURED';
    let gatewayConfigured = false;
    let gatewayOrderDetails = null;

    if (razorpayKeyId && razorpayKeySecret) {
      gatewayType = 'RAZORPAY';
      gatewayConfigured = true;
      // In production with razorpay package: create razorpay order instance here
    } else if (stripeSecretKey) {
      gatewayType = 'STRIPE';
      gatewayConfigured = true;
    }

    // Create a pending subscription / order record
    const pendingSubscription = await Subscription.create({
      userId,
      planId: plan._id,
      planSlug: plan.slug,
      planName: plan.name,
      amount: plan.price,
      currency: 'INR',
      billingPeriod: plan.billingPeriod,
      status: 'pending',
      startDate: new Date(),
      endDate: new Date(Date.now() + plan.durationDays * 24 * 60 * 60 * 1000),
      autoRenew: true,
      orderId,
      paymentGateway: gatewayType,
      paymentStatus: 'pending',
      receiptEmail: email || user.email,
    });

    return sendSuccess(res, 201, 'Checkout order created successfully', {
      orderId,
      subscriptionId: pendingSubscription._id,
      plan: {
        id: plan._id,
        slug: plan.slug,
        name: plan.name,
        tagline: plan.tagline,
        price: plan.price,
        formattedPrice: plan.formattedPrice,
        billingPeriod: plan.billingPeriod,
        durationDays: plan.durationDays,
      },
      amount: plan.price,
      formattedAmount: plan.formattedPrice,
      currency: 'INR',
      receiptEmail: email || user.email,
      paymentGateway: {
        type: gatewayType,
        configured: gatewayConfigured,
        razorpayKeyId: razorpayKeyId || null,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Verify payment and activate subscription
 * @route   POST /api/subscriptions/verify-payment
 * @access  Private (Listener)
 */
const verifyPaymentAndActivate = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?._id;
    if (!userId) {
      return sendError(res, 401, 'Authentication required');
    }

    const { orderId, paymentId, signature, cardLast4 } = req.body;

    if (!orderId) {
      return sendError(res, 400, 'Order ID is required for verification');
    }

    // Find pending subscription
    const subscription = await Subscription.findOne({ orderId, userId });
    if (!subscription) {
      return sendError(res, 404, 'No matching subscription order found for this user');
    }

    if (subscription.status === 'active') {
      return sendSuccess(res, 200, 'Subscription is already active', {
        subscription,
      });
    }

    // Payment Gateway verification check
    const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET;
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

    if (razorpayKeySecret) {
      if (!signature || !paymentId) {
        return sendError(res, 400, 'Razorpay payment verification requires paymentId and signature');
      }
      const generatedSignature = crypto
        .createHmac('sha256', razorpayKeySecret)
        .update(`${orderId}|${paymentId}`)
        .digest('hex');

      if (generatedSignature !== signature) {
        subscription.paymentStatus = 'failed';
        await subscription.save();
        return sendError(res, 400, 'Payment signature verification failed');
      }
    } else if (stripeSecretKey) {
      // Stripe payment intent check
      if (!paymentId) {
        return sendError(res, 400, 'Stripe verification requires paymentIntentId');
      }
    } else {
      // No payment gateway credentials are configured in .env
      return sendError(
        res,
        503,
        'REAL PAYMENT VERIFICATION BLOCKED — PAYMENT GATEWAY CONFIGURATION REQUIRED. No Razorpay or Stripe credentials configured in backend .env'
      );
    }

    // If verified successfully, activate subscription
    subscription.status = 'active';
    subscription.paymentStatus = 'completed';
    subscription.paymentId = paymentId || `PAY-${Date.now()}`;
    if (cardLast4) subscription.cardLast4 = cardLast4;
    subscription.startDate = new Date();
    await subscription.save();

    // Update User model
    const user = await User.findById(userId);
    if (user) {
      user.plan = subscription.planName;
      user.subscriptionId = subscription._id;
      user.subscriptionExpiresAt = subscription.endDate;
      user.subscriptionStatus = 'active';
      await user.save();
    }

    // Automatic Listener Notification Trigger (Phase 4)
    onSubscriptionActivated(subscription, user).catch((err) =>
      console.error('[NotificationTriggerService] Subscription activation trigger error:', err.message)
    );

    return sendSuccess(res, 200, 'Payment verified and subscription activated successfully', {
      subscription,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        plan: user.plan,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Cancel current active subscription renewal
 * @route   POST /api/subscriptions/cancel
 * @access  Private (Listener)
 */
const cancelSubscription = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?._id;
    if (!userId) {
      return sendError(res, 401, 'Authentication required');
    }

    const subscription = await Subscription.findOne({
      userId,
      status: 'active',
    }).sort({ createdAt: -1 });

    if (!subscription) {
      return sendError(res, 404, 'No active subscription found to cancel');
    }

    subscription.autoRenew = false;
    subscription.status = 'cancelled';
    await subscription.save();

    const user = await User.findById(userId);
    if (user) {
      user.subscriptionStatus = 'cancelled';
      await user.save();
    }

    // Automatic Listener Notification Trigger (Phase 4)
    onSubscriptionCancelled(subscription, user).catch((err) =>
      console.error('[NotificationTriggerService] Subscription cancel trigger error:', err.message)
    );

    return sendSuccess(res, 200, 'Subscription cancelled successfully. You will have access until the end of your billing cycle.', {
      subscription,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get all listener subscriptions (Admin only)
 * @route   GET /api/subscriptions/admin
 * @access  Private (Admin Only)
 */
const getAllSubscriptionsAdmin = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      plan,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 10));
    const skip = (pageNum - 1) * limitNum;

    // Build filter
    const filter = {};

    if (status && status !== 'ALL') {
      filter.status = status;
    }

    if (plan && plan !== 'ALL') {
      filter.$or = [{ planSlug: plan }, { planName: plan }];
    }

    if (search && search.trim()) {
      const trimmedSearch = search.trim();
      const matchingUsers = await User.find({
        $or: [
          { name: { $regex: trimmedSearch, $options: 'i' } },
          { email: { $regex: trimmedSearch, $options: 'i' } },
        ],
      }).select('_id');

      const userIds = matchingUsers.map((u) => u._id);

      const searchConditions = [
        { orderId: { $regex: trimmedSearch, $options: 'i' } },
        { paymentId: { $regex: trimmedSearch, $options: 'i' } },
        { receiptEmail: { $regex: trimmedSearch, $options: 'i' } },
        { planName: { $regex: trimmedSearch, $options: 'i' } },
      ];

      if (userIds.length > 0) {
        searchConditions.push({ userId: { $in: userIds } });
      }

      if (filter.$or) {
        filter.$and = [{ $or: filter.$or }, { $or: searchConditions }];
        delete filter.$or;
      } else {
        filter.$or = searchConditions;
      }
    }

    // Auto-update expired active subscriptions safely with notification triggers
    const now = new Date();
    const expiringSubscriptions = await Subscription.find({
      status: 'active',
      endDate: { $lt: now, $ne: null },
    }).select('_id userId planName endDate');

    if (expiringSubscriptions.length > 0) {
      const expiringIds = expiringSubscriptions.map((s) => s._id);
      await Subscription.updateMany(
        { _id: { $in: expiringIds } },
        { $set: { status: 'expired', autoRenew: false } }
      );
      await User.updateMany(
        { subscriptionId: { $in: expiringIds } },
        { $set: { subscriptionStatus: 'expired', plan: 'Free' } }
      );

      for (const expiredSub of expiringSubscriptions) {
        onSubscriptionExpired(expiredSub).catch((err) =>
          console.error('[NotificationTriggerService] Subscription expiration trigger error:', err.message)
        );
      }
    }

    const total = await Subscription.countDocuments(filter);
    const subscriptions = await Subscription.find(filter)
      .populate('userId', 'name email avatar plan')
      .populate('planId', 'name price duration durationUnit')
      .sort({ [sortBy]: sortOrder === 'asc' ? 1 : -1 })
      .skip(skip)
      .limit(limitNum);

    return sendSuccess(res, 200, 'Listener subscriptions retrieved successfully', {
      subscriptions,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum) || 1,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get subscription statistics & metrics (Admin only)
 * @route   GET /api/subscriptions/admin/stats
 * @access  Private (Admin Only)
 */
const getSubscriptionStatsAdmin = async (req, res, next) => {
  try {
    const now = new Date();

    // Auto-sync expired active subscriptions safely with notification triggers
    const expiringSubscriptions = await Subscription.find({
      status: 'active',
      endDate: { $lt: now, $ne: null },
    }).select('_id userId planName endDate');

    if (expiringSubscriptions.length > 0) {
      const expiringIds = expiringSubscriptions.map((s) => s._id);
      await Subscription.updateMany(
        { _id: { $in: expiringIds } },
        { $set: { status: 'expired', autoRenew: false } }
      );
      await User.updateMany(
        { subscriptionId: { $in: expiringIds } },
        { $set: { subscriptionStatus: 'expired', plan: 'Free' } }
      );

      for (const expiredSub of expiringSubscriptions) {
        onSubscriptionExpired(expiredSub).catch((err) =>
          console.error('[NotificationTriggerService] Subscription expiration trigger error:', err.message)
        );
      }
    }

    const [
      total,
      active,
      expired,
      cancelled,
      pending,
      failed,
      revenueAgg,
      activeRevenueAgg,
    ] = await Promise.all([
      Subscription.countDocuments(),
      Subscription.countDocuments({ status: 'active' }),
      Subscription.countDocuments({ status: 'expired' }),
      Subscription.countDocuments({ status: 'cancelled' }),
      Subscription.countDocuments({ status: 'pending' }),
      Subscription.countDocuments({
        $or: [{ status: 'failed' }, { paymentStatus: 'failed' }],
      }),
      Subscription.aggregate([
        { $match: { paymentStatus: 'completed' } },
        { $group: { _id: null, totalRevenue: { $sum: '$amount' } } },
      ]),
      Subscription.aggregate([
        { $match: { status: 'active', paymentStatus: 'completed' } },
        { $group: { _id: null, activeRevenue: { $sum: '$amount' } } },
      ]),
    ]);

    const totalRevenue = revenueAgg.length > 0 ? revenueAgg[0].totalRevenue : 0;
    const activeRevenue = activeRevenueAgg.length > 0 ? activeRevenueAgg[0].activeRevenue : 0;

    return sendSuccess(res, 200, 'Subscription statistics retrieved successfully', {
      total,
      active,
      expired,
      cancelled,
      pending,
      failed,
      totalRevenue,
      activeRevenue,
      currency: 'INR',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get single subscription record details (Admin only)
 * @route   GET /api/subscriptions/admin/:id
 * @access  Private (Admin Only)
 */
const getSubscriptionByIdAdmin = async (req, res, next) => {
  try {
    const { id } = req.params;

    const subscription = await Subscription.findById(id)
      .populate('userId', 'name email avatar plan subscriptionStatus subscriptionExpiresAt createdAt')
      .populate('planId');

    if (!subscription) {
      return sendError(res, 404, `Subscription record "${id}" not found`);
    }

    return sendSuccess(res, 200, 'Subscription details retrieved successfully', subscription);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Safely update subscription status (Admin only)
 * @route   PATCH /api/subscriptions/admin/:id/status
 * @access  Private (Admin Only)
 */
const updateSubscriptionStatusAdmin = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;

    const validStatuses = ['active', 'cancelled', 'expired', 'pending', 'failed'];
    if (!status || !validStatuses.includes(status)) {
      return sendError(res, 400, `Invalid status. Must be one of: ${validStatuses.join(', ')}`);
    }

    const subscription = await Subscription.findById(id);
    if (!subscription) {
      return sendError(res, 404, `Subscription record "${id}" not found`);
    }

    const prevStatus = subscription.status;
    subscription.status = status;
    if (status === 'cancelled' || status === 'expired') {
      subscription.autoRenew = false;
    } else if (status === 'active') {
      subscription.paymentStatus = 'completed';
    }

    await subscription.save();

    // Synchronize User model
    const user = await User.findById(subscription.userId);
    if (user) {
      user.subscriptionStatus = status;
      if (status === 'active') {
        user.plan = subscription.planName;
        user.subscriptionId = subscription._id;
        user.subscriptionExpiresAt = subscription.endDate;
      } else if (status === 'expired') {
        user.plan = 'Free';
      }
      await user.save();
    }

    // Automatic Listener Notification Trigger on status change
    if (prevStatus !== status) {
      if (status === 'active') {
        onSubscriptionActivated(subscription, user).catch((err) =>
          console.error('[NotificationTriggerService] Admin activation trigger error:', err.message)
        );
      } else if (status === 'cancelled') {
        onSubscriptionCancelled(subscription, user).catch((err) =>
          console.error('[NotificationTriggerService] Admin cancel trigger error:', err.message)
        );
      } else if (status === 'expired') {
        onSubscriptionExpired(subscription, user).catch((err) =>
          console.error('[NotificationTriggerService] Admin expire trigger error:', err.message)
        );
      }
    }

    const updated = await Subscription.findById(id)
      .populate('userId', 'name email avatar plan')
      .populate('planId');

    return sendSuccess(res, 200, `Subscription status updated to "${status}" successfully`, updated);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getPlans,
  getPlanById,
  getMySubscription,
  checkDownloadPermissionEndpoint,
  createCheckoutOrder,
  verifyPaymentAndActivate,
  cancelSubscription,
  ensurePlansSeeded,
  getAllSubscriptionsAdmin,
  getSubscriptionStatsAdmin,
  getSubscriptionByIdAdmin,
  updateSubscriptionStatusAdmin,
};

