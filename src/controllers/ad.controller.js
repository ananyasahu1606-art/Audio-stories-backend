const Ad = require('../models/Ad');
const User = require('../models/User');
const Subscription = require('../models/Subscription');
const Plan = require('../models/Plan');
const { sendSuccess, sendError } = require('../utils');

/**
 * Check if the current requesting listener is entitled to Ad-Free listening
 * The plan's saved configuration (planLimits.ads) is the source of truth.
 * - Free plans can be configured to show ads (ads: true) or ad-free (ads: false).
 * - Paid plans support ad-free when their Ads setting is OFF (ads: false).
 * - If Ads is ON (ads: true), even paid subscribers receive advertisements.
 * - Guests follow the Free plan's Ads setting (default: receive ads).
 */
const checkUserAdFreeStatus = async (userPayload) => {
  try {
    const now = new Date();

    // 1. Guest Listener (Unauthenticated)
    if (!userPayload) {
      const freePlan = await Plan.findOne({ $or: [{ slug: 'plan-free' }, { price: 0 }] });
      if (freePlan && freePlan.planLimits && freePlan.planLimits.ads === false) {
        return true;
      }
      return false; // Guests receive ads
    }

    const userId = userPayload.id || userPayload._id;

    // Check if user is suspended in database
    if (userId) {
      const userDoc = await User.findById(userId).select('status plan subscriptionStatus subscriptionExpiresAt subscriptionId');
      if (userDoc && userDoc.status === 'Suspended') {
        return false;
      }
    }

    // Determine effective user subscription status and plan name
    let userPlanName = userPayload.plan || '';
    let subscriptionStatus = userPayload.subscriptionStatus || 'none';
    let expiresAt = userPayload.subscriptionExpiresAt;
    let subscriptionId = userPayload.subscriptionId;

    if (userId) {
      const user = await User.findById(userId).select('plan subscriptionStatus subscriptionExpiresAt subscriptionId status');
      if (user) {
        userPlanName = user.plan || userPlanName;
        subscriptionStatus = user.subscriptionStatus || subscriptionStatus;
        expiresAt = user.subscriptionExpiresAt || expiresAt;
        subscriptionId = user.subscriptionId || subscriptionId;
      }
    }

    const isSubActive =
      subscriptionStatus === 'active' &&
      (!expiresAt || new Date(expiresAt) > now);

    let activePlanDoc = null;

    // 2. Active Subscriber: resolve their active Plan document
    if (isSubActive) {
      // Try resolving Plan via subscription record
      if (subscriptionId) {
        const sub = await Subscription.findById(subscriptionId);
        if (sub) {
          if (sub.planId) activePlanDoc = await Plan.findById(sub.planId);
          if (!activePlanDoc && sub.planSlug) activePlanDoc = await Plan.findOne({ slug: sub.planSlug });
        }
      }

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
        // Plan Limits is the source of truth!
        if (activePlanDoc.planLimits && activePlanDoc.planLimits.ads !== undefined) {
          return !activePlanDoc.planLimits.ads;
        }
        // Legacy fallback: paid plan without explicit planLimits is ad-free
        return activePlanDoc.price > 0;
      }

      // Active subscriber with unresolvable plan doc: fallback to ad-free if not free
      const planLower = (userPlanName || '').toLowerCase().trim();
      const isFree = !planLower || ['free', 'free listener', 'free plan', 'none'].includes(planLower);
      return !isFree;
    }

    // 3. User without an active paid subscription (Free listener or expired)
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

    if (nonPaidPlan && nonPaidPlan.planLimits && nonPaidPlan.planLimits.ads !== undefined) {
      return !nonPaidPlan.planLimits.ads;
    }

    // Default for free listeners: show ads
    return false;
  } catch (err) {
    console.warn('Error checking user ad-free status:', err);
    return false;
  }
};

// ==========================================
// ADMIN CONTROLLERS
// ==========================================

/**
 * @desc    Get all ads with optional filters & search (Admin)
 * @route   GET /api/ads/admin
 * @access  Private (Admin)
 */
const getAllAdsAdmin = async (req, res, next) => {
  try {
    const { search, status, type, placement } = req.query;
    const query = {};

    if (status && status !== 'ALL') {
      query.status = status;
    }

    if (type && type !== 'ALL') {
      query.type = type;
    }

    if (placement && placement !== 'ALL') {
      query.placement = placement;
    }

    if (search && search.trim()) {
      query.$or = [
        { title: { $regex: search.trim(), $options: 'i' } },
        { advertiser: { $regex: search.trim(), $options: 'i' } },
        { description: { $regex: search.trim(), $options: 'i' } },
      ];
    }

    const ads = await Ad.find(query)
      .populate('targetCategories', 'name slug')
      .populate('targetStories', 'title coverImage')
      .sort({ priority: -1, createdAt: -1 });

    return sendSuccess(res, 200, 'Ads retrieved successfully', ads);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get aggregate analytics summary for Admin Dashboard
 * @route   GET /api/ads/admin/stats
 * @access  Private (Admin)
 */
const getAdStatsAdmin = async (req, res, next) => {
  try {
    const now = new Date();
    const allAds = await Ad.find({});

    const totalAds = allAds.length;
    let activeAds = 0;
    let inactiveAds = 0;
    let totalImpressions = 0;
    let totalStarts = 0;
    let totalCompletions = 0;
    let totalClicks = 0;

    allAds.forEach((ad) => {
      const isActive =
        ad.status === 'Active' &&
        (!ad.startDate || new Date(ad.startDate) <= now) &&
        (!ad.endDate || new Date(ad.endDate) >= now);

      if (isActive) {
        activeAds++;
      } else {
        inactiveAds++;
      }

      totalImpressions += Number(ad.impressionsCount) || 0;
      totalStarts += Number(ad.startsCount) || 0;
      totalCompletions += Number(ad.completionsCount) || 0;
      totalClicks += Number(ad.clicksCount) || 0;
    });

    const averageCtr =
      totalImpressions > 0 ? Number(((totalClicks / totalImpressions) * 100).toFixed(2)) : 0;
    const averageCompletionRate =
      totalStarts > 0 ? Number(((totalCompletions / totalStarts) * 100).toFixed(2)) : 0;

    return sendSuccess(res, 200, 'Ad stats retrieved successfully', {
      totalAds,
      activeAds,
      inactiveAds,
      totalImpressions,
      totalStarts,
      totalCompletions,
      totalClicks,
      averageCtr,
      averageCompletionRate,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get single ad details by ID (Admin)
 * @route   GET /api/ads/admin/:id
 * @access  Private (Admin)
 */
const getAdByIdAdmin = async (req, res, next) => {
  try {
    const { id } = req.params;
    const ad = await Ad.findById(id)
      .populate('targetCategories', 'name slug')
      .populate('targetStories', 'title coverImage');

    if (!ad) {
      return sendError(res, 404, 'Advertisement not found');
    }

    return sendSuccess(res, 200, 'Ad details retrieved', ad);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Create a new ad campaign (Admin)
 * @route   POST /api/ads/admin
 * @access  Private (Admin)
 */
const createAdAdmin = async (req, res, next) => {
  try {
    let {
      title,
      advertiser,
      description,
      type = 'audio',
      placement,
      audioUrl,
      audioDuration,
      videoUrl,
      videoDuration,
      imageUrl,
      destinationUrl,
      ctaText = 'Learn More',
      targetAudience = 'free_users',
      targetCategories = [],
      targetStories = [],
      isSkippable = false,
      skipAfterSeconds = 5,
      startDate,
      endDate,
      priority = 1,
      status = 'Active',
    } = req.body;

    // Handle files if uploaded via multipart/form-data
    if (req.files) {
      if (req.files.audio && req.files.audio[0]) {
        audioUrl = `/uploads/${req.files.audio[0].filename}`;
      }
      if (req.files.image && req.files.image[0]) {
        imageUrl = `/uploads/${req.files.image[0].filename}`;
      }
      if (req.files.video && req.files.video[0]) {
        videoUrl = `/uploads/${req.files.video[0].filename}`;
      }
    }

    // Required Field Validations
    if (!title || !title.trim()) {
      return sendError(res, 400, 'Campaign title is required');
    }

    if (!placement) {
      return sendError(res, 400, 'Ad placement is required');
    }

    // Validate placement compatibility with type
    const audioPlacements = ['audio_preroll'];
    const videoPlacements = ['video_preroll', 'video_popup'];
    const bannerPlacements = ['banner_home', 'banner_story_detail', 'banner_explore', 'player_companion'];

    if (type === 'audio' && !audioPlacements.includes(placement)) {
      return sendError(res, 400, `Placement "${placement}" is invalid for audio ads`);
    }
    if (type === 'video' && !videoPlacements.includes(placement)) {
      return sendError(res, 400, `Placement "${placement}" is invalid for video ads`);
    }
    if (type === 'banner' && !bannerPlacements.includes(placement)) {
      return sendError(res, 400, `Placement "${placement}" is invalid for banner ads`);
    }

    if (!destinationUrl || !destinationUrl.trim()) {
      return sendError(res, 400, 'Destination/click-through URL is required');
    }

    // Ensure audio ad has an audio source
    if (type === 'audio' && !audioUrl && !req.files?.audio) {
      return sendError(res, 400, 'Audio ads require an audio file or URL');
    }

    // Ensure video ad has a video source
    if (type === 'video' && !videoUrl && !req.files?.video) {
      return sendError(res, 400, 'Video ads require a video file or video URL');
    }

    // Date validations
    if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
      return sendError(res, 400, 'Campaign end date must be after start date');
    }

    // Parsing JSON string arrays if sent via FormData
    if (typeof targetCategories === 'string') {
      try {
        targetCategories = JSON.parse(targetCategories);
      } catch {
        targetCategories = targetCategories ? [targetCategories] : [];
      }
    }
    if (typeof targetStories === 'string') {
      try {
        targetStories = JSON.parse(targetStories);
      } catch {
        targetStories = targetStories ? [targetStories] : [];
      }
    }

    const newAd = await Ad.create({
      title: title.trim(),
      advertiser: advertiser ? advertiser.trim() : '',
      description: description ? description.trim() : '',
      type,
      placement,
      audioUrl: audioUrl || '',
      audioDuration: Number(audioDuration) || 0,
      videoUrl: videoUrl || '',
      videoDuration: Number(videoDuration) || 0,
      imageUrl: imageUrl || '',
      destinationUrl: destinationUrl.trim(),
      ctaText: ctaText ? ctaText.trim() : 'Learn More',
      targetAudience,
      targetCategories: Array.isArray(targetCategories) ? targetCategories : [],
      targetStories: Array.isArray(targetStories) ? targetStories : [],
      isSkippable: Boolean(isSkippable),
      skipAfterSeconds: Number(skipAfterSeconds) || 5,
      startDate: startDate ? new Date(startDate) : new Date(),
      endDate: endDate ? new Date(endDate) : null,
      priority: Number(priority) || 1,
      status,
    });

    return sendSuccess(res, 201, 'Advertisement campaign created successfully', newAd);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update an existing ad campaign (Admin)
 * @route   PUT /api/ads/admin/:id
 * @access  Private (Admin)
 */
const updateAdAdmin = async (req, res, next) => {
  try {
    const { id } = req.params;
    const ad = await Ad.findById(id);

    if (!ad) {
      return sendError(res, 404, 'Advertisement not found');
    }

    let {
      title,
      advertiser,
      description,
      type,
      placement,
      audioUrl,
      audioDuration,
      videoUrl,
      videoDuration,
      imageUrl,
      destinationUrl,
      ctaText,
      targetAudience,
      targetCategories,
      targetStories,
      isSkippable,
      skipAfterSeconds,
      startDate,
      endDate,
      priority,
      status,
    } = req.body;

    // Handle files if uploaded via multipart/form-data
    if (req.files) {
      if (req.files.audio && req.files.audio[0]) {
        audioUrl = `/uploads/${req.files.audio[0].filename}`;
      }
      if (req.files.image && req.files.image[0]) {
        imageUrl = `/uploads/${req.files.image[0].filename}`;
      }
      if (req.files.video && req.files.video[0]) {
        videoUrl = `/uploads/${req.files.video[0].filename}`;
      }
    }

    const effectiveType = type !== undefined ? type : ad.type;
    const effectivePlacement = placement !== undefined ? placement : ad.placement;

    // Validate placement compatibility if type or placement changed
    const audioPlacements = ['audio_preroll'];
    const videoPlacements = ['video_preroll', 'video_popup'];
    const bannerPlacements = ['banner_home', 'banner_story_detail', 'banner_explore', 'player_companion'];

    if (effectiveType === 'audio' && !audioPlacements.includes(effectivePlacement)) {
      return sendError(res, 400, `Placement "${effectivePlacement}" is invalid for audio ads`);
    }
    if (effectiveType === 'video' && !videoPlacements.includes(effectivePlacement)) {
      return sendError(res, 400, `Placement "${effectivePlacement}" is invalid for video ads`);
    }
    if (effectiveType === 'banner' && !bannerPlacements.includes(effectivePlacement)) {
      return sendError(res, 400, `Placement "${effectivePlacement}" is invalid for banner ads`);
    }

    if (title !== undefined) ad.title = title.trim();
    if (advertiser !== undefined) ad.advertiser = advertiser.trim();
    if (description !== undefined) ad.description = description.trim();
    if (type !== undefined) ad.type = type;
    if (placement !== undefined) ad.placement = placement;
    if (audioUrl !== undefined) ad.audioUrl = audioUrl;
    if (audioDuration !== undefined) ad.audioDuration = Number(audioDuration);
    if (videoUrl !== undefined) ad.videoUrl = videoUrl;
    if (videoDuration !== undefined) ad.videoDuration = Number(videoDuration);
    if (imageUrl !== undefined) ad.imageUrl = imageUrl;
    if (destinationUrl !== undefined) ad.destinationUrl = destinationUrl.trim();
    if (ctaText !== undefined) ad.ctaText = ctaText.trim();
    if (targetAudience !== undefined) ad.targetAudience = targetAudience;
    if (isSkippable !== undefined) ad.isSkippable = Boolean(isSkippable);
    if (skipAfterSeconds !== undefined) ad.skipAfterSeconds = Number(skipAfterSeconds);
    if (startDate !== undefined) ad.startDate = startDate ? new Date(startDate) : new Date();
    if (endDate !== undefined) ad.endDate = endDate ? new Date(endDate) : null;
    if (priority !== undefined) ad.priority = Number(priority) || 1;
    if (status !== undefined) ad.status = status;

    if (targetCategories !== undefined) {
      if (typeof targetCategories === 'string') {
        try {
          targetCategories = JSON.parse(targetCategories);
        } catch {
          targetCategories = targetCategories ? [targetCategories] : [];
        }
      }
      ad.targetCategories = Array.isArray(targetCategories) ? targetCategories : [];
    }

    if (targetStories !== undefined) {
      if (typeof targetStories === 'string') {
        try {
          targetStories = JSON.parse(targetStories);
        } catch {
          targetStories = targetStories ? [targetStories] : [];
        }
      }
      ad.targetStories = Array.isArray(targetStories) ? targetStories : [];
    }

    await ad.save();

    return sendSuccess(res, 200, 'Advertisement campaign updated successfully', ad);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Quick toggle ad status (Active / Inactive) (Admin)
 * @route   PATCH /api/ads/admin/:id/status
 * @access  Private (Admin)
 */
const toggleAdStatusAdmin = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const ad = await Ad.findById(id);
    if (!ad) {
      return sendError(res, 404, 'Advertisement not found');
    }

    ad.status = status || (ad.status === 'Active' ? 'Inactive' : 'Active');
    await ad.save();

    return sendSuccess(res, 200, `Ad status updated to ${ad.status}`, ad);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete an ad campaign (Admin)
 * @route   DELETE /api/ads/admin/:id
 * @access  Private (Admin)
 */
const deleteAdAdmin = async (req, res, next) => {
  try {
    const { id } = req.params;
    const ad = await Ad.findByIdAndDelete(id);

    if (!ad) {
      return sendError(res, 404, 'Advertisement not found');
    }

    return sendSuccess(res, 200, 'Advertisement deleted successfully', { id });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// PUBLIC / LISTENER AD-SERVING & TRACKING
// ==========================================

/**
 * @desc    Serve eligible ads for a placement (Public / Listener)
 * @route   GET /api/ads/serve
 * @access  Public (with optional listener authentication)
 */
const serveAds = async (req, res, next) => {
  try {
    const { placement, storyId, categoryId } = req.query;

    if (!placement) {
      return sendError(res, 400, 'Placement parameter is required');
    }

    // Check if the current user has verified ad-free subscription
    const isAdFree = await checkUserAdFreeStatus(req.user);
    if (isAdFree) {
      return sendSuccess(res, 200, 'User is entitled to ad-free experience', {
        isAdFree: true,
        ad: null,
        ads: [],
      });
    }

    const now = new Date();

    // Query active ads matching placement, campaign window, and audience eligibility
    const query = {
      status: 'Active',
      placement,
      startDate: { $lte: now },
      $or: [{ endDate: null }, { endDate: { $gte: now } }],
      $and: [
        {
          $or: [
            { targetAudience: { $in: ['free_users', 'all_users'] } },
            { targetAudience: { $exists: false } },
            { targetAudience: null },
          ],
        },
      ],
    };

    let eligibleAds = await Ad.find(query).sort({ priority: -1, createdAt: -1 });

    // Filter by story targeting if storyId provided
    if (storyId) {
      const specificMatches = eligibleAds.filter(
        (a) => a.targetStories && a.targetStories.length > 0 && a.targetStories.map(String).includes(String(storyId))
      );
      if (specificMatches.length > 0) {
        eligibleAds = specificMatches;
      } else {
        // Fall back only to general untargeted ads
        eligibleAds = eligibleAds.filter((a) => !a.targetStories || a.targetStories.length === 0);
      }
    } else {
      // Untargeted stories only when no storyId specified
      eligibleAds = eligibleAds.filter((a) => !a.targetStories || a.targetStories.length === 0);
    }

    // Filter by category targeting if categoryId provided
    if (categoryId) {
      const categoryMatches = eligibleAds.filter(
        (a) =>
          a.targetCategories &&
          a.targetCategories.length > 0 &&
          a.targetCategories.map(String).includes(String(categoryId))
      );
      if (categoryMatches.length > 0) {
        eligibleAds = categoryMatches;
      } else {
        // Fall back only to general untargeted ads (never serve ads targeted specifically to other categories!)
        eligibleAds = eligibleAds.filter(
          (a) => !a.targetCategories || a.targetCategories.length === 0
        );
      }
    } else {
      // Untargeted categories only when no categoryId specified
      eligibleAds = eligibleAds.filter(
        (a) => !a.targetCategories || a.targetCategories.length === 0
      );
    }

    if (eligibleAds.length === 0) {
      return sendSuccess(res, 200, 'No active ad available for this placement', {
        isAdFree: false,
        ad: null,
        ads: [],
      });
    }

    // Select top prioritized ad (or pick weighted from top priority)
    const selectedAd = eligibleAds[0];

    return sendSuccess(res, 200, 'Ad served successfully', {
      isAdFree: false,
      ad: selectedAd,
      ads: eligibleAds,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Track Ad Impression / Start
 * @route   POST /api/ads/:id/track-impression
 * @access  Public
 */
const trackImpression = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { isStart } = req.body;

    const updateObj = { $inc: { impressionsCount: 1 } };
    if (isStart) {
      updateObj.$inc.startsCount = 1;
    }

    const ad = await Ad.findByIdAndUpdate(id, updateObj, { new: true });
    if (!ad) {
      return sendError(res, 404, 'Advertisement not found');
    }

    return sendSuccess(res, 200, 'Impression tracked successfully', {
      id: ad._id,
      impressionsCount: ad.impressionsCount,
      startsCount: ad.startsCount,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Track Ad Playback Completion
 * @route   POST /api/ads/:id/track-completion
 * @access  Public
 */
const trackCompletion = async (req, res, next) => {
  try {
    const { id } = req.params;

    const ad = await Ad.findByIdAndUpdate(
      id,
      { $inc: { completionsCount: 1 } },
      { new: true }
    );

    if (!ad) {
      return sendError(res, 404, 'Advertisement not found');
    }

    return sendSuccess(res, 200, 'Completion tracked successfully', {
      id: ad._id,
      completionsCount: ad.completionsCount,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Track Ad Click
 * @route   POST /api/ads/:id/track-click
 * @access  Public
 */
const trackClick = async (req, res, next) => {
  try {
    const { id } = req.params;

    const ad = await Ad.findByIdAndUpdate(
      id,
      { $inc: { clicksCount: 1 } },
      { new: true }
    );

    if (!ad) {
      return sendError(res, 404, 'Advertisement not found');
    }

    return sendSuccess(res, 200, 'Click tracked successfully', {
      id: ad._id,
      clicksCount: ad.clicksCount,
      destinationUrl: ad.destinationUrl,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  // Admin
  getAllAdsAdmin,
  getAdStatsAdmin,
  getAdByIdAdmin,
  createAdAdmin,
  updateAdAdmin,
  toggleAdStatusAdmin,
  deleteAdAdmin,
  // Public / Serving
  serveAds,
  trackImpression,
  trackCompletion,
  trackClick,
};
