const mongoose = require('mongoose');

const planSchema = new mongoose.Schema(
  {
    slug: {
      type: String,
      required: [true, 'Plan slug/identifier is required'],
      unique: true,
      trim: true,
      lowercase: true,
    },
    name: {
      type: String,
      required: [true, 'Plan name is required'],
      trim: true,
    },
    tagline: {
      type: String,
      default: '',
      trim: true,
    },
    description: {
      type: String,
      default: '',
    },
    price: {
      type: Number,
      required: [true, 'Plan price is required'],
      min: [0, 'Price cannot be negative'],
    },
    currency: {
      type: String,
      default: '₹',
    },
    formattedPrice: {
      type: String,
      default: '₹0',
    },
    duration: {
      type: Number,
      default: 1,
      min: [0, 'Duration cannot be negative'],
    },
    durationUnit: {
      type: String,
      enum: ['day', 'month', 'year', 'forever'],
      default: 'month',
    },
    durationDays: {
      type: Number,
      default: 30,
    },
    billingPeriod: {
      type: String,
      enum: ['forever', 'month', 'year'],
      default: 'month',
    },
    features: {
      type: [String],
      default: [],
    },
    benefits: {
      type: [String],
      default: [],
    },
    status: {
      type: String,
      enum: ['Active', 'Inactive'],
      default: 'Active',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    displayOrder: {
      type: Number,
      default: 0,
    },
    order: {
      type: Number,
      default: 0,
    },
    popular: {
      type: Boolean,
      default: false,
    },
    badge: {
      type: String,
      default: '',
    },
    ctaText: {
      type: String,
      default: 'Select Plan',
    },
    planLimits: {
      ads: {
        type: Boolean,
        default: true,
      },
      videoCast: {
        type: Boolean,
        default: false,
      },
      downloadAllowed: {
        type: Boolean,
        default: false,
      },
      deviceLimitEnabled: {
        type: Boolean,
        default: false,
      },
      maxDevices: {
        type: Number,
        default: 1,
        min: [1, 'Max devices must be a positive integer'],
      },
      profileLimitEnabled: {
        type: Boolean,
        default: false,
      },
      maxProfiles: {
        type: Number,
        default: 1,
        min: [1, 'Max profiles must be a positive integer'],
      },
      supportedDeviceTypesEnabled: {
        type: Boolean,
        default: false,
      },
      supportedDeviceTypes: {
        type: [String],
        default: ['Mobile', 'Tablet', 'TV', 'Desktop'],
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

// Pre-save synchronization hook
planSchema.pre('save', function (next) {
  // Sync planLimits defaults for legacy records
  if (!this.planLimits) {
    this.planLimits = {};
  }
  if (this.planLimits.ads === undefined) {
    this.planLimits.ads = this.price === 0;
  }
  if (this.planLimits.videoCast === undefined) {
    this.planLimits.videoCast = this.price > 0;
  }
  if (this.planLimits.downloadAllowed === undefined) {
    this.planLimits.downloadAllowed = this.price > 0;
  }
  if (this.planLimits.deviceLimitEnabled === undefined) {
    this.planLimits.deviceLimitEnabled = false;
  }
  if (this.planLimits.maxDevices === undefined || this.planLimits.maxDevices < 1) {
    this.planLimits.maxDevices = 1;
  }
  if (this.planLimits.profileLimitEnabled === undefined) {
    this.planLimits.profileLimitEnabled = false;
  }
  if (this.planLimits.maxProfiles === undefined || this.planLimits.maxProfiles < 1) {
    this.planLimits.maxProfiles = 1;
  }
  if (this.planLimits.supportedDeviceTypesEnabled === undefined) {
    this.planLimits.supportedDeviceTypesEnabled = false;
  }
  if (!Array.isArray(this.planLimits.supportedDeviceTypes) || this.planLimits.supportedDeviceTypes.length === 0) {
    this.planLimits.supportedDeviceTypes = ['Mobile', 'Tablet', 'TV', 'Desktop'];
  }

  // Sync features and benefits
  if (this.features && this.features.length > 0 && (!this.benefits || this.benefits.length === 0)) {
    this.benefits = [...this.features];
  } else if (this.benefits && this.benefits.length > 0 && (!this.features || this.features.length === 0)) {
    this.features = [...this.benefits];
  }

  // Sync status and isActive
  if (this.isModified('status')) {
    this.isActive = this.status === 'Active';
  } else if (this.isModified('isActive')) {
    this.status = this.isActive ? 'Active' : 'Inactive';
  }

  // Sync displayOrder and order
  if (this.isModified('displayOrder')) {
    this.order = this.displayOrder;
  } else if (this.isModified('order')) {
    this.displayOrder = this.order;
  }

  // Sync formatted price
  if (this.isModified('price') || !this.formattedPrice || this.formattedPrice === '₹0') {
    this.formattedPrice = `${this.currency || '₹'}${this.price.toLocaleString('en-IN')}`;
  }

  // Sync durationUnit and billingPeriod
  if (this.durationUnit === 'forever') {
    this.billingPeriod = 'forever';
    this.durationDays = 0;
  } else if (this.durationUnit === 'year') {
    this.billingPeriod = 'year';
    this.durationDays = (this.duration || 1) * 365;
  } else {
    this.billingPeriod = 'month';
    this.durationDays = (this.duration || 1) * 30;
  }

  next();
});

module.exports = mongoose.model('Plan', planSchema);
