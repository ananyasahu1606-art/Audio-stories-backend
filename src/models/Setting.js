const mongoose = require('mongoose');

const settingSchema = new mongoose.Schema(
  {
    // 1. General Settings
    general: {
      platformName: {
        type: String,
        default: 'ElevStory Studio',
        trim: true,
      },
      tagline: {
        type: String,
        default: 'Immersive Audio Stories & Audiobook Content Management',
        trim: true,
      },
      siteUrl: {
        type: String,
        default: 'http://localhost:5173',
        trim: true,
      },
      contactEmail: {
        type: String,
        default: 'support@elevstory.com',
        trim: true,
      },
      logoUrl: {
        type: String,
        default: '',
        trim: true,
      },
      defaultLanguage: {
        type: String,
        default: 'English (US)',
      },
      timezone: {
        type: String,
        default: 'UTC +05:30 (India Standard Time)',
      },
      copyrightText: {
        type: String,
        default: '© 2026 ElevStory Studio. All rights reserved.',
      },
      maintenanceMode: {
        type: Boolean,
        default: false,
      },
    },

    // 2. Storage Settings
    storage: {
      provider: {
        type: String,
        enum: ['local', 'digitalocean', 's3', 'custom'],
        default: 'local',
      },
      bucketName: {
        type: String,
        default: 'elevstory-audio-spaces',
        trim: true,
      },
      region: {
        type: String,
        default: 'nyc3',
        trim: true,
      },
      endpoint: {
        type: String,
        default: 'https://nyc3.digitaloceanspaces.com',
        trim: true,
      },
      cdnUrl: {
        type: String,
        default: 'http://localhost:5000/uploads',
        trim: true,
      },
      accessKeyId: {
        type: String,
        default: '',
        trim: true,
      },
      secretAccessKey: {
        type: String,
        default: '',
        trim: true,
      },
      uploadPath: {
        type: String,
        default: 'uploads/narrations',
        trim: true,
      },
      maxFileSizeMB: {
        type: Number,
        default: 250,
      },
      autoCleanOrphans: {
        type: Boolean,
        default: false,
      },
    },

    // 3. SEO Settings
    seo: {
      defaultMetaTitle: {
        type: String,
        default: 'ElevStory Studio | Audio Stories & Audiobook Streaming',
        trim: true,
      },
      defaultMetaDescription: {
        type: String,
        default: 'Discover immersive audio stories, spatial audio chapters, and serialized fiction on ElevStory.',
        trim: true,
      },
      keywords: {
        type: String,
        default: 'audio stories, audiobooks, podcast drama, binaural audio, voice narration',
        trim: true,
      },
      ogImageUrl: {
        type: String,
        default: 'https://images.unsplash.com/photo-1518495973542-4542c06a5843?w=1200&auto=format&fit=crop&q=80',
        trim: true,
      },
      canonicalBaseUrl: {
        type: String,
        default: 'http://localhost:5173',
        trim: true,
      },
      enableRobotsIndex: {
        type: Boolean,
        default: true,
      },
      enableSitemap: {
        type: Boolean,
        default: true,
      },
    },

    // 4. Subscription Settings
    subscription: {
      defaultPlan: {
        type: String,
        default: 'Free',
        trim: true,
      },
      freeTrialDays: {
        type: Number,
        default: 0,
      },
      allowGracePeriod: {
        type: Boolean,
        default: true,
      },
      gracePeriodDays: {
        type: Number,
        default: 3,
      },
      autoRenewDefault: {
        type: Boolean,
        default: true,
      },
      allowListenerCancellation: {
        type: Boolean,
        default: true,
      },
      requireEmailReceipt: {
        type: Boolean,
        default: true,
      },
      enforceDeviceLimit: {
        type: Boolean,
        default: true,
      },
      prorateUpgrades: {
        type: Boolean,
        default: true,
      },
    },

    // 5. Payment Settings
    payment: {
      activeGateway: {
        type: String,
        enum: ['offline_manual', 'razorpay', 'stripe'],
        default: 'offline_manual',
      },
      currency: {
        type: String,
        default: 'INR',
        trim: true,
      },
      currencySymbol: {
        type: String,
        default: '₹',
        trim: true,
      },
      testMode: {
        type: Boolean,
        default: true,
      },
      taxRatePercentage: {
        type: Number,
        default: 18,
      },
      invoicePrefix: {
        type: String,
        default: 'INV-ES-',
        trim: true,
      },
      razorpayKeyId: {
        type: String,
        default: '',
        trim: true,
      },
      razorpayKeySecret: {
        type: String,
        default: '',
        trim: true,
      },
      stripePublishableKey: {
        type: String,
        default: '',
        trim: true,
      },
      stripeSecretKey: {
        type: String,
        default: '',
        trim: true,
      },
      webhookSecret: {
        type: String,
        default: '',
        trim: true,
      },
    },

    // 6. Story Defaults
    story: {
      defaultStatus: {
        type: String,
        enum: ['Draft', 'Published'],
        default: 'Draft',
      },
      defaultLanguage: {
        type: String,
        default: 'English',
      },
      defaultAgeGroup: {
        type: String,
        default: 'All Ages',
      },
      enableFeaturedStories: {
        type: Boolean,
        default: true,
      },
      maxFeaturedStories: {
        type: Number,
        default: 10,
      },
      allowUserReviews: {
        type: Boolean,
        default: true,
      },
      moderationQueueEnabled: {
        type: Boolean,
        default: true,
      },
      allowAnonymousBrowse: {
        type: Boolean,
        default: true,
      },
    },

    // 7. Audio & Narration Settings
    audio: {
      supportedFormats: {
        type: String,
        default: 'MP3, WAV, FLAC, M4A, AAC, OGG',
        trim: true,
      },
      defaultAudioQuality: {
        type: String,
        default: '320kbps Studio Lossless',
      },
      enableEpisodeAudioPreview: {
        type: Boolean,
        default: true,
      },
      defaultPlaybackSpeed: {
        type: String,
        default: '1.0x',
      },
      binauralSpatialAudioEnabled: {
        type: Boolean,
        default: true,
      },
      maxUploadFileSizeMB: {
        type: Number,
        default: 250,
      },
      defaultVolumeLevel: {
        type: Number,
        default: 80,
      },
      autoPlayNextChapter: {
        type: Boolean,
        default: true,
      },
    },

    // 8. Streaming Settings
    streaming: {
      streamingProtocol: {
        type: String,
        enum: ['Progressive Audio', 'HLS', 'Direct Stream'],
        default: 'Progressive Audio',
      },
      cdnCacheControl: {
        type: String,
        default: 'public, max-age=31536000, immutable',
        trim: true,
      },
      enableAudioBuffering: {
        type: Boolean,
        default: true,
      },
      bufferAheadSeconds: {
        type: Number,
        default: 30,
      },
      enableAdaptiveBitrate: {
        type: Boolean,
        default: true,
      },
      enableWaveformVisualizer: {
        type: Boolean,
        default: true,
      },
    },

    // 9. Download Settings
    downloads: {
      allowOfflineDownloads: {
        type: Boolean,
        default: true,
      },
      enforcePlanPermissions: {
        type: Boolean,
        default: true,
      },
      requireListenerAuthentication: {
        type: Boolean,
        default: true,
      },
      defaultDownloadAudioQuality: {
        type: String,
        default: '320kbps',
      },
      maxConcurrentDownloads: {
        type: Number,
        default: 3,
      },
      downloadExpiryDays: {
        type: Number,
        default: 30,
      },
      logDownloadActivity: {
        type: Boolean,
        default: true,
      },
    },

    // 10. Notification Settings
    notifications: {
      enableAutomaticNotifications: {
        type: Boolean,
        default: true,
      },
      notifyOnStoryPublished: {
        type: Boolean,
        default: true,
      },
      notifyOnEpisodePublished: {
        type: Boolean,
        default: true,
      },
      notifyOnSubscriptionActivated: {
        type: Boolean,
        default: true,
      },
      notifyOnSubscriptionCancelled: {
        type: Boolean,
        default: true,
      },
      notifyOnSubscriptionExpired: {
        type: Boolean,
        default: true,
      },
      notifyAdminOnNewReview: {
        type: Boolean,
        default: true,
      },
      notifyAdminOnNewReport: {
        type: Boolean,
        default: true,
      },
      emailNotificationChannel: {
        type: Boolean,
        default: false,
      },
      // Backward compatibility with legacy toggles
      newStoryNotification: {
        type: Boolean,
        default: true,
      },
      newEpisodeNotification: {
        type: Boolean,
        default: true,
      },
      reviewNotification: {
        type: Boolean,
        default: true,
      },
      systemAlerts: {
        type: Boolean,
        default: true,
      },
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: function (doc, ret) {
        ret.id = ret._id;
        return ret;
      },
    },
  }
);

module.exports = mongoose.model('Setting', settingSchema);
