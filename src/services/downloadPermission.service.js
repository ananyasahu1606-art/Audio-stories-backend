const User = require('../models/User');
const Subscription = require('../models/Subscription');
const Plan = require('../models/Plan');
const Setting = require('../models/Setting');

/**
 * Check if the requesting user or listener is entitled to download audio stories / episodes.
 *
 * Source of truth: The active plan's saved `planLimits.downloadAllowed` in MongoDB.
 * - Dynamic for all plans (Free, Standard, Premium, Custom, etc.) - no hardcoded IDs or names.
 * - Active subscribers use their active subscription plan's setting.
 * - Free / expired / non-subscribed users use the Free plan's setting.
 * - Guests (unauthenticated) use the Free plan's setting.
 * - Respects global Setting.downloads.allowOfflineDownloads toggle.
 *
 * @param {Object|null} userPayload - decoded JWT user payload or mongoose User doc
 * @returns {Promise<boolean>}
 */
const checkUserDownloadPermission = async (userPayload) => {
  try {
    const setting = await Setting.findOne();
    if (setting?.downloads?.allowOfflineDownloads === false) {
      return false;
    }

    const details = await getUserEffectiveDownloadDetails(userPayload);
    return details.downloadAllowed;
  } catch (err) {
    console.warn('[DownloadPermission] Error checking user download permission:', err);
    return false;
  }
};

/**
 * Resolve effective plan and download permission details for a user.
 *
 * @param {Object|null} userPayload
 * @returns {Promise<{ downloadAllowed: boolean, planName: string, subscriptionStatus: string, planLimits: Object|null }>}
 */
const getUserEffectiveDownloadDetails = async (userPayload) => {
  const now = new Date();

  // 1. Guest Listener (Unauthenticated)
  if (!userPayload) {
    const freePlan = await Plan.findOne({ $or: [{ slug: 'plan-free' }, { price: 0 }] });
    const downloadAllowed = Boolean(freePlan?.planLimits?.downloadAllowed);
    return {
      downloadAllowed,
      planName: freePlan?.name || 'Free Listener',
      subscriptionStatus: 'none',
      planLimits: freePlan?.planLimits || null,
    };
  }

  const userId = userPayload.id || userPayload._id;

  // 2. Fetch fresh user doc from DB to ensure subscription & plan aren't stale
  let userDoc = null;
  if (userId) {
    userDoc = await User.findById(userId).select(
      'status plan subscriptionStatus subscriptionExpiresAt subscriptionId'
    );
    if (userDoc && userDoc.status === 'Suspended') {
      return {
        downloadAllowed: false,
        planName: userDoc.plan || 'Suspended',
        subscriptionStatus: 'suspended',
        planLimits: null,
      };
    }
  }

  let userPlanName = userDoc?.plan || userPayload.plan || '';
  let subscriptionStatus = userDoc?.subscriptionStatus || userPayload.subscriptionStatus || 'none';
  let expiresAt = userDoc?.subscriptionExpiresAt || userPayload.subscriptionExpiresAt;
  let subscriptionId = userDoc?.subscriptionId || userPayload.subscriptionId;

  const isSubActive =
    subscriptionStatus === 'active' &&
    (!expiresAt || new Date(expiresAt) > now);

  let activePlanDoc = null;

  // 3. Active Subscriber: resolve their active Plan document
  if (isSubActive) {
    // Try resolving Plan via subscription ID
    if (subscriptionId) {
      const sub = await Subscription.findById(subscriptionId);
      if (sub) {
        if (sub.planId) activePlanDoc = await Plan.findById(sub.planId);
        if (!activePlanDoc && sub.planSlug) activePlanDoc = await Plan.findOne({ slug: sub.planSlug });
      }
    }

    // Try resolving Plan via active Subscription record by userId
    if (!activePlanDoc && userId) {
      const activeSub = await Subscription.findOne({
        userId,
        status: 'active',
        $or: [{ endDate: null }, { endDate: { $gt: now } }],
      }).sort({ createdAt: -1 });

      if (activeSub) {
        if (activeSub.planId) activePlanDoc = await Plan.findById(activeSub.planId);
        if (!activePlanDoc && activeSub.planSlug) activePlanDoc = await Plan.findOne({ slug: activeSub.planSlug });
      }
    }

    // Try resolving by plan name or slug
    if (!activePlanDoc && userPlanName) {
      activePlanDoc = await Plan.findOne({
        $or: [
          { slug: userPlanName.toLowerCase().trim() },
          { name: { $regex: new RegExp(`^${userPlanName.trim()}$`, 'i') } },
        ],
      });
    }

    if (activePlanDoc) {
      const downloadAllowed =
        activePlanDoc.planLimits && activePlanDoc.planLimits.downloadAllowed !== undefined
          ? Boolean(activePlanDoc.planLimits.downloadAllowed)
          : activePlanDoc.price > 0;

      return {
        downloadAllowed,
        planName: activePlanDoc.name,
        subscriptionStatus: 'active',
        planLimits: activePlanDoc.planLimits || null,
      };
    }

    // If active subscriber but plan doc could not be resolved
    return {
      downloadAllowed: false,
      planName: userPlanName || 'Subscriber',
      subscriptionStatus: 'active',
      planLimits: null,
    };
  }

  // 4. Free listener or expired subscription
  let nonPaidPlan = null;
  if (userPlanName) {
    nonPaidPlan = await Plan.findOne({
      $or: [
        { slug: userPlanName.toLowerCase().trim() },
        { name: { $regex: new RegExp(`^${userPlanName.trim()}$`, 'i') } },
      ],
    });
  }

  if (!nonPaidPlan) {
    nonPaidPlan = await Plan.findOne({ $or: [{ slug: 'plan-free' }, { price: 0 }] });
  }

  if (nonPaidPlan && nonPaidPlan.planLimits && nonPaidPlan.planLimits.downloadAllowed !== undefined) {
    return {
      downloadAllowed: Boolean(nonPaidPlan.planLimits.downloadAllowed),
      planName: nonPaidPlan.name,
      subscriptionStatus: subscriptionStatus === 'active' ? 'expired' : subscriptionStatus,
      planLimits: nonPaidPlan.planLimits,
    };
  }

  return {
    downloadAllowed: false,
    planName: userPlanName || 'Free Listener',
    subscriptionStatus: subscriptionStatus,
    planLimits: null,
  };
};

module.exports = {
  checkUserDownloadPermission,
  getUserEffectiveDownloadDetails,
};
