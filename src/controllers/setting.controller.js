const Setting = require('../models/Setting');
const { sendSuccess, sendError } = require('../utils');

const SECRET_MASK = '••••••••••••••••';

const defaultSettingsData = {
  general: {
    platformName: 'ElevStory Studio',
    tagline: 'Immersive Audio Stories & Audiobook Content Management',
    siteUrl: 'http://localhost:5173',
    contactEmail: 'support@elevstory.com',
    logoUrl: '',
    defaultLanguage: 'English (US)',
    timezone: 'UTC +05:30 (India Standard Time)',
    copyrightText: '© 2026 ElevStory Studio. All rights reserved.',
    maintenanceMode: false,
  },
  storage: {
    provider: 'local',
    bucketName: 'elevstory-audio-spaces',
    region: 'nyc3',
    endpoint: 'https://nyc3.digitaloceanspaces.com',
    cdnUrl: 'http://localhost:5000/uploads',
    accessKeyId: '',
    secretAccessKey: '',
    uploadPath: 'uploads/narrations',
    maxFileSizeMB: 250,
    autoCleanOrphans: false,
  },
  seo: {
    defaultMetaTitle: 'ElevStory Studio | Audio Stories & Audiobook Streaming',
    defaultMetaDescription: 'Discover immersive audio stories, spatial audio chapters, and serialized fiction on ElevStory.',
    keywords: 'audio stories, audiobooks, podcast drama, binaural audio, voice narration',
    ogImageUrl: 'https://images.unsplash.com/photo-1518495973542-4542c06a5843?w=1200&auto=format&fit=crop&q=80',
    canonicalBaseUrl: 'http://localhost:5173',
    enableRobotsIndex: true,
    enableSitemap: true,
  },
  subscription: {
    defaultPlan: 'Free',
    freeTrialDays: 0,
    allowGracePeriod: true,
    gracePeriodDays: 3,
    autoRenewDefault: true,
    allowListenerCancellation: true,
    requireEmailReceipt: true,
    enforceDeviceLimit: true,
    prorateUpgrades: true,
  },
  payment: {
    activeGateway: 'offline_manual',
    currency: 'INR',
    currencySymbol: '₹',
    testMode: true,
    taxRatePercentage: 18,
    invoicePrefix: 'INV-ES-',
    razorpayKeyId: '',
    razorpayKeySecret: '',
    stripePublishableKey: '',
    stripeSecretKey: '',
    webhookSecret: '',
  },
  story: {
    defaultStatus: 'Draft',
    defaultLanguage: 'English',
    defaultAgeGroup: 'All Ages',
    enableFeaturedStories: true,
    maxFeaturedStories: 10,
    allowUserReviews: true,
    moderationQueueEnabled: true,
    allowAnonymousBrowse: true,
  },
  audio: {
    supportedFormats: 'MP3, WAV, FLAC, M4A, AAC, OGG',
    defaultAudioQuality: '320kbps Studio Lossless',
    enableEpisodeAudioPreview: true,
    defaultPlaybackSpeed: '1.0x',
    binauralSpatialAudioEnabled: true,
    maxUploadFileSizeMB: 250,
    defaultVolumeLevel: 80,
    autoPlayNextChapter: true,
  },
  streaming: {
    streamingProtocol: 'Progressive Audio',
    cdnCacheControl: 'public, max-age=31536000, immutable',
    enableAudioBuffering: true,
    bufferAheadSeconds: 30,
    enableAdaptiveBitrate: true,
    enableWaveformVisualizer: true,
  },
  downloads: {
    allowOfflineDownloads: true,
    enforcePlanPermissions: true,
    requireListenerAuthentication: true,
    defaultDownloadAudioQuality: '320kbps',
    maxConcurrentDownloads: 3,
    downloadExpiryDays: 30,
    logDownloadActivity: true,
  },
  notifications: {
    enableAutomaticNotifications: true,
    notifyOnStoryPublished: true,
    notifyOnEpisodePublished: true,
    notifyOnSubscriptionActivated: true,
    notifyOnSubscriptionCancelled: true,
    notifyOnSubscriptionExpired: true,
    notifyAdminOnNewReview: true,
    notifyAdminOnNewReport: true,
    emailNotificationChannel: false,
    newStoryNotification: true,
    newEpisodeNotification: true,
    reviewNotification: true,
    systemAlerts: true,
  },
};

const VALID_SECTIONS = [
  'general',
  'storage',
  'seo',
  'subscription',
  'payment',
  'story',
  'audio',
  'streaming',
  'downloads',
  'notifications',
];

function isMasked(val) {
  return typeof val === 'string' && (val.includes('••') || val === SECRET_MASK);
}

function maskSettingSecrets(doc) {
  if (!doc) return doc;
  const result = typeof doc.toObject === 'function' ? doc.toObject() : JSON.parse(JSON.stringify(doc));

  if (result.storage && result.storage.secretAccessKey) {
    result.storage.secretAccessKey = SECRET_MASK;
  }
  if (result.payment) {
    if (result.payment.razorpayKeySecret) {
      result.payment.razorpayKeySecret = SECRET_MASK;
    }
    if (result.payment.stripeSecretKey) {
      result.payment.stripeSecretKey = SECRET_MASK;
    }
    if (result.payment.webhookSecret) {
      result.payment.webhookSecret = SECRET_MASK;
    }
  }

  return result;
}

/**
 * Ensures existing document has all 10 sections populated with defaults
 */
async function getOrMigrateSettings() {
  let settingDoc = await Setting.findOne();

  if (!settingDoc) {
    settingDoc = await Setting.create(defaultSettingsData);
    return settingDoc;
  }

  let needsSave = false;
  VALID_SECTIONS.forEach((sec) => {
    if (!settingDoc[sec]) {
      settingDoc[sec] = defaultSettingsData[sec];
      needsSave = true;
    } else {
      // Ensure missing nested keys are filled
      const defaultSec = defaultSettingsData[sec];
      Object.keys(defaultSec).forEach((key) => {
        if (settingDoc[sec][key] === undefined) {
          settingDoc[sec][key] = defaultSec[key];
          needsSave = true;
        }
      });
    }
  });

  if (needsSave) {
    await settingDoc.save();
  }

  return settingDoc;
}

/**
 * @desc    Get platform settings (with sensitive secrets masked)
 * @route   GET /api/settings
 * @access  Private (Admin)
 */
const getSettings = async (req, res, next) => {
  try {
    const settingDoc = await getOrMigrateSettings();
    const masked = maskSettingSecrets(settingDoc);
    return sendSuccess(res, 200, 'Platform settings retrieved successfully', masked);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update complete platform settings
 * @route   PUT /api/settings
 * @access  Private (Admin)
 */
const updateSettings = async (req, res, next) => {
  try {
    let settingDoc = await getOrMigrateSettings();

    VALID_SECTIONS.forEach((sec) => {
      if (req.body[sec] && typeof req.body[sec] === 'object') {
        const incoming = { ...req.body[sec] };

        // Protect storage secrets
        if (sec === 'storage') {
          if (isMasked(incoming.secretAccessKey)) {
            incoming.secretAccessKey = settingDoc.storage.secretAccessKey;
          }
        }

        // Protect payment secrets
        if (sec === 'payment') {
          if (isMasked(incoming.razorpayKeySecret)) {
            incoming.razorpayKeySecret = settingDoc.payment.razorpayKeySecret;
          }
          if (isMasked(incoming.stripeSecretKey)) {
            incoming.stripeSecretKey = settingDoc.payment.stripeSecretKey;
          }
          if (isMasked(incoming.webhookSecret)) {
            incoming.webhookSecret = settingDoc.payment.webhookSecret;
          }
        }

        settingDoc[sec] = {
          ...(settingDoc[sec] ? (typeof settingDoc[sec].toObject === 'function' ? settingDoc[sec].toObject() : settingDoc[sec]) : {}),
          ...incoming,
        };
      }
    });

    const updated = await settingDoc.save();
    const masked = maskSettingSecrets(updated);

    return sendSuccess(res, 200, 'Platform settings updated successfully', masked);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update specific setting section
 * @route   PATCH /api/settings/:section
 * @access  Private (Admin)
 */
const updateSectionSettings = async (req, res, next) => {
  try {
    const { section } = req.params;

    if (!VALID_SECTIONS.includes(section)) {
      return sendError(
        res,
        400,
        `Invalid settings section "${section}". Valid sections: ${VALID_SECTIONS.join(', ')}`
      );
    }

    let settingDoc = await getOrMigrateSettings();
    const incoming = { ...req.body };

    if (section === 'storage' && isMasked(incoming.secretAccessKey)) {
      incoming.secretAccessKey = settingDoc.storage.secretAccessKey;
    }

    if (section === 'payment') {
      if (isMasked(incoming.razorpayKeySecret)) {
        incoming.razorpayKeySecret = settingDoc.payment.razorpayKeySecret;
      }
      if (isMasked(incoming.stripeSecretKey)) {
        incoming.stripeSecretKey = settingDoc.payment.stripeSecretKey;
      }
      if (isMasked(incoming.webhookSecret)) {
        incoming.webhookSecret = settingDoc.payment.webhookSecret;
      }
    }

    settingDoc[section] = {
      ...(settingDoc[section] ? (typeof settingDoc[section].toObject === 'function' ? settingDoc[section].toObject() : settingDoc[section]) : {}),
      ...incoming,
    };

    const updated = await settingDoc.save();
    const masked = maskSettingSecrets(updated);

    return sendSuccess(res, 200, `Settings section "${section}" updated successfully`, masked);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Reset platform settings to defaults
 * @route   POST /api/settings/reset
 * @access  Private (Admin)
 */
const resetSettings = async (req, res, next) => {
  try {
    await Setting.deleteMany({});
    const freshSettings = await Setting.create(defaultSettingsData);
    const masked = maskSettingSecrets(freshSettings);

    return sendSuccess(res, 200, 'Settings reset to default configuration', masked);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getSettings,
  updateSettings,
  updateSectionSettings,
  resetSettings,
  defaultSettingsData,
};
