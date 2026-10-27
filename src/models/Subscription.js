const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required for subscription'],
      index: true,
    },
    planId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Plan',
    },
    planSlug: {
      type: String,
      required: [true, 'Plan identifier is required'],
    },
    planName: {
      type: String,
      required: [true, 'Plan name is required'],
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      default: 'INR',
    },
    billingPeriod: {
      type: String,
      enum: ['forever', 'month', 'year'],
      default: 'month',
    },
    status: {
      type: String,
      enum: ['active', 'cancelled', 'expired', 'past_due', 'pending', 'failed'],
      default: 'active',
      index: true,
    },
    startDate: {
      type: Date,
      default: Date.now,
    },
    endDate: {
      type: Date,
    },
    autoRenew: {
      type: Boolean,
      default: true,
    },
    orderId: {
      type: String,
      index: true,
    },
    paymentId: {
      type: String,
    },
    paymentGateway: {
      type: String,
      default: 'Manual',
    },
    paymentStatus: {
      type: String,
      enum: ['pending', 'completed', 'failed', 'refunded'],
      default: 'pending',
    },
    receiptEmail: {
      type: String,
      default: '',
    },
    cardLast4: {
      type: String,
      default: '',
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

module.exports = mongoose.model('Subscription', subscriptionSchema);
