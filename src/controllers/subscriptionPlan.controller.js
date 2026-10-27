const Plan = require('../models/Plan');
const Subscription = require('../models/Subscription');
const { sendSuccess, sendError } = require('../utils');

/**
 * Generate clean URL-friendly slug
 */
const generateSlug = (name) => {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
};

/**
 * @desc    Get all subscription plans (Admin & Public)
 * @route   GET /api/subscription-plans
 * @access  Private (Admin) / Public Read
 */
const getAllSubscriptionPlans = async (req, res, next) => {
  try {
    const { status, search } = req.query;
    const filter = {};

    if (status && status !== 'ALL') {
      filter.status = status;
    }

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { slug: { $regex: search, $options: 'i' } },
      ];
    }

    const plans = await Plan.find(filter).sort({ displayOrder: 1, order: 1, createdAt: 1 });

    return sendSuccess(res, 200, 'Subscription plans retrieved successfully', plans);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get single subscription plan by ID or slug
 * @route   GET /api/subscription-plans/:id
 * @access  Private (Admin) / Public Read
 */
const getSubscriptionPlanById = async (req, res, next) => {
  try {
    const { id } = req.params;
    let plan = null;

    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      plan = await Plan.findById(id);
    }
    if (!plan) {
      plan = await Plan.findOne({ slug: id });
    }

    if (!plan) {
      return sendError(res, 404, `Subscription plan "${id}" not found`);
    }

    return sendSuccess(res, 200, 'Subscription plan details retrieved', plan);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Create a new subscription plan
 * @route   POST /api/subscription-plans
 * @access  Private (Admin Only)
 */
const createSubscriptionPlan = async (req, res, next) => {
  try {
    const {
      name,
      slug,
      tagline,
      description,
      price,
      currency = '₹',
      duration = 1,
      durationUnit = 'month',
      features,
      benefits,
      status = 'Active',
      displayOrder = 0,
      popular = false,
      badge = '',
      ctaText = 'Select Plan',
      planLimits,
    } = req.body;

    if (!name || !name.trim()) {
      return sendError(res, 400, 'Plan name is required');
    }

    if (price === undefined || price === null || isNaN(Number(price)) || Number(price) < 0) {
      return sendError(res, 400, 'Valid plan price (0 or higher) is required');
    }

    if (duration !== undefined && (isNaN(Number(duration)) || Number(duration) < 0)) {
      return sendError(res, 400, 'Valid plan duration (0 or higher) is required');
    }

    // Determine slug
    let finalSlug = slug ? generateSlug(slug) : generateSlug(name);
    if (!finalSlug) finalSlug = `plan-${Date.now()}`;

    // Ensure slug uniqueness
    const existing = await Plan.findOne({ slug: finalSlug });
    if (existing) {
      finalSlug = `${finalSlug}-${Date.now().toString().slice(-4)}`;
    }

    // Process features/benefits list
    let featureList = [];
    if (Array.isArray(features)) {
      featureList = features.map((f) => String(f).trim()).filter(Boolean);
    } else if (typeof features === 'string' && features.trim()) {
      featureList = features
        .split('\n')
        .map((f) => f.trim())
        .filter(Boolean);
    } else if (Array.isArray(benefits)) {
      featureList = benefits.map((b) => String(b).trim()).filter(Boolean);
    }

    const numPrice = Number(price);
    const numDuration = Number(duration) || 1;
    const numOrder = Number(displayOrder) || 0;

    // Process Plan Limits
    const limitsInput = planLimits || {};

    let maxDev = 1;
    if (limitsInput.maxDevices !== undefined) {
      const parsed = parseInt(limitsInput.maxDevices, 10);
      if (isNaN(parsed) || parsed < 1) {
        return sendError(res, 400, 'Max devices must be a positive integer (at least 1)');
      }
      maxDev = parsed;
    }

    let maxProf = 1;
    if (limitsInput.maxProfiles !== undefined) {
      const parsed = parseInt(limitsInput.maxProfiles, 10);
      if (isNaN(parsed) || parsed < 1) {
        return sendError(res, 400, 'Max profiles must be a positive integer (at least 1)');
      }
      maxProf = parsed;
    }

    const deviceTypes =
      Array.isArray(limitsInput.supportedDeviceTypes) && limitsInput.supportedDeviceTypes.length > 0
        ? limitsInput.supportedDeviceTypes
        : ['Mobile', 'Tablet', 'TV', 'Desktop'];

    const formattedPlanLimits = {
      ads: limitsInput.ads !== undefined ? Boolean(limitsInput.ads) : numPrice === 0,
      videoCast: limitsInput.videoCast !== undefined ? Boolean(limitsInput.videoCast) : numPrice > 0,
      downloadAllowed:
        limitsInput.downloadAllowed !== undefined ? Boolean(limitsInput.downloadAllowed) : numPrice > 0,
      deviceLimitEnabled: Boolean(limitsInput.deviceLimitEnabled),
      maxDevices: maxDev,
      profileLimitEnabled: Boolean(limitsInput.profileLimitEnabled),
      maxProfiles: maxProf,
      supportedDeviceTypesEnabled: Boolean(limitsInput.supportedDeviceTypesEnabled),
      supportedDeviceTypes: deviceTypes,
    };

    const newPlan = await Plan.create({
      name: name.trim(),
      slug: finalSlug,
      tagline: tagline ? tagline.trim() : '',
      description: description ? description.trim() : '',
      price: numPrice,
      currency: currency || '₹',
      formattedPrice: `${currency || '₹'}${numPrice.toLocaleString('en-IN')}`,
      duration: numDuration,
      durationUnit: ['day', 'month', 'year', 'forever'].includes(durationUnit)
        ? durationUnit
        : 'month',
      features: featureList,
      benefits: featureList,
      status: status === 'Inactive' ? 'Inactive' : 'Active',
      isActive: status !== 'Inactive',
      displayOrder: numOrder,
      order: numOrder,
      popular: Boolean(popular),
      badge: badge ? badge.trim() : '',
      ctaText: ctaText ? ctaText.trim() : 'Select Plan',
      planLimits: formattedPlanLimits,
    });

    return sendSuccess(res, 201, `Subscription plan "${newPlan.name}" created successfully`, newPlan);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update an existing subscription plan
 * @route   PUT /api/subscription-plans/:id
 * @route   PATCH /api/subscription-plans/:id
 * @access  Private (Admin Only)
 */
const updateSubscriptionPlan = async (req, res, next) => {
  try {
    const { id } = req.params;

    let plan = null;
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      plan = await Plan.findById(id);
    }
    if (!plan) {
      plan = await Plan.findOne({ slug: id });
    }

    if (!plan) {
      return sendError(res, 404, `Subscription plan "${id}" not found`);
    }

    const {
      name,
      slug,
      tagline,
      description,
      price,
      currency,
      duration,
      durationUnit,
      features,
      benefits,
      status,
      displayOrder,
      popular,
      badge,
      ctaText,
      planLimits,
    } = req.body;

    if (name !== undefined) {
      if (!name.trim()) return sendError(res, 400, 'Plan name cannot be empty');
      plan.name = name.trim();
    }

    if (slug !== undefined && slug.trim()) {
      const formattedSlug = generateSlug(slug);
      if (formattedSlug !== plan.slug) {
        const slugExists = await Plan.findOne({ slug: formattedSlug, _id: { $ne: plan._id } });
        if (slugExists) {
          return sendError(res, 400, `Slug "${formattedSlug}" is already taken by another plan`);
        }
        plan.slug = formattedSlug;
      }
    }

    if (tagline !== undefined) plan.tagline = tagline.trim();
    if (description !== undefined) plan.description = description.trim();

    if (price !== undefined) {
      const numPrice = Number(price);
      if (isNaN(numPrice) || numPrice < 0) {
        return sendError(res, 400, 'Valid plan price (0 or higher) is required');
      }
      plan.price = numPrice;
      plan.formattedPrice = `${plan.currency || currency || '₹'}${numPrice.toLocaleString('en-IN')}`;
    }

    if (currency !== undefined) {
      plan.currency = currency;
      plan.formattedPrice = `${currency}${plan.price.toLocaleString('en-IN')}`;
    }

    if (duration !== undefined) {
      const numDur = Number(duration);
      if (isNaN(numDur) || numDur < 0) {
        return sendError(res, 400, 'Valid duration is required');
      }
      plan.duration = numDur;
    }

    if (durationUnit !== undefined) {
      if (['day', 'month', 'year', 'forever'].includes(durationUnit)) {
        plan.durationUnit = durationUnit;
      }
    }

    if (features !== undefined || benefits !== undefined) {
      let featureList = [];
      const raw = features !== undefined ? features : benefits;
      if (Array.isArray(raw)) {
        featureList = raw.map((f) => String(f).trim()).filter(Boolean);
      } else if (typeof raw === 'string') {
        featureList = raw
          .split('\n')
          .map((f) => f.trim())
          .filter(Boolean);
      }
      plan.features = featureList;
      plan.benefits = featureList;
    }

    if (status !== undefined) {
      plan.status = status === 'Inactive' ? 'Inactive' : 'Active';
      plan.isActive = plan.status === 'Active';
    }

    if (displayOrder !== undefined) {
      const numOrder = Number(displayOrder) || 0;
      plan.displayOrder = numOrder;
      plan.order = numOrder;
    }

    if (popular !== undefined) plan.popular = Boolean(popular);
    if (badge !== undefined) plan.badge = badge.trim();
    if (ctaText !== undefined) plan.ctaText = ctaText.trim();

    if (planLimits !== undefined) {
      if (!plan.planLimits) plan.planLimits = {};
      if (planLimits.ads !== undefined) plan.planLimits.ads = Boolean(planLimits.ads);
      if (planLimits.videoCast !== undefined) plan.planLimits.videoCast = Boolean(planLimits.videoCast);
      if (planLimits.downloadAllowed !== undefined) plan.planLimits.downloadAllowed = Boolean(planLimits.downloadAllowed);
      if (planLimits.deviceLimitEnabled !== undefined) {
        plan.planLimits.deviceLimitEnabled = Boolean(planLimits.deviceLimitEnabled);
      }
      if (planLimits.maxDevices !== undefined) {
        const numDev = parseInt(planLimits.maxDevices, 10);
        if (isNaN(numDev) || numDev < 1) {
          return sendError(res, 400, 'Max devices must be a positive integer (at least 1)');
        }
        plan.planLimits.maxDevices = numDev;
      }
      if (planLimits.profileLimitEnabled !== undefined) {
        plan.planLimits.profileLimitEnabled = Boolean(planLimits.profileLimitEnabled);
      }
      if (planLimits.maxProfiles !== undefined) {
        const numProf = parseInt(planLimits.maxProfiles, 10);
        if (isNaN(numProf) || numProf < 1) {
          return sendError(res, 400, 'Max profiles must be a positive integer (at least 1)');
        }
        plan.planLimits.maxProfiles = numProf;
      }
      if (planLimits.supportedDeviceTypesEnabled !== undefined) {
        plan.planLimits.supportedDeviceTypesEnabled = Boolean(planLimits.supportedDeviceTypesEnabled);
      }
      if (Array.isArray(planLimits.supportedDeviceTypes) && planLimits.supportedDeviceTypes.length > 0) {
        plan.planLimits.supportedDeviceTypes = planLimits.supportedDeviceTypes;
      }
      plan.markModified('planLimits');
    }

    await plan.save();

    return sendSuccess(res, 200, `Subscription plan "${plan.name}" updated successfully`, plan);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete a subscription plan
 * @route   DELETE /api/subscription-plans/:id
 * @access  Private (Admin Only)
 */
const deleteSubscriptionPlan = async (req, res, next) => {
  try {
    const { id } = req.params;

    let plan = null;
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      plan = await Plan.findById(id);
    }
    if (!plan) {
      plan = await Plan.findOne({ slug: id });
    }

    if (!plan) {
      return sendError(res, 404, `Subscription plan "${id}" not found`);
    }

    // Safety check: count active subscriptions on this plan
    const activeSubs = await Subscription.countDocuments({
      planSlug: plan.slug,
      status: 'active',
    });

    if (activeSubs > 0) {
      return sendError(
        res,
        400,
        `Cannot delete plan "${plan.name}" because it currently has ${activeSubs} active subscriber(s). Please deactivate the plan instead.`
      );
    }

    await Plan.findByIdAndDelete(plan._id);

    return sendSuccess(res, 200, `Subscription plan "${plan.name}" deleted successfully`, {
      id: plan._id,
      slug: plan.slug,
      name: plan.name,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAllSubscriptionPlans,
  getSubscriptionPlanById,
  createSubscriptionPlan,
  updateSubscriptionPlan,
  deleteSubscriptionPlan,
};
