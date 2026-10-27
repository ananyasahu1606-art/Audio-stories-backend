const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'User full name is required'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'User email address is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [
        /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
        'Please provide a valid email address',
      ],
    },
    password: {
      type: String,
      minlength: [6, 'Password must be at least 6 characters long'],
      select: false,
    },
    avatar: {
      type: String,
      default:
        'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop&q=80',
    },
    bio: {
      type: String,
      default: '',
    },
    phone: {
      type: String,
      default: '',
    },
    role: {
      type: String,
      default: 'listener',
    },
    joinedDate: {
      type: String,
      default: () => new Date().toISOString().split('T')[0],
    },
    storiesListened: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalListeningHours: {
      type: Number,
      default: 0,
      min: 0,
    },
    lastActive: {
      type: String,
      default: 'Just now',
    },
    status: {
      type: String,
      enum: ['Active', 'Suspended', 'Inactive'],
      default: 'Active',
    },
    plan: {
      type: String,
      default: 'Free',
      trim: true,
    },
    subscriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subscription',
    },
    subscriptionExpiresAt: {
      type: Date,
    },
    subscriptionStatus: {
      type: String,
      enum: ['active', 'cancelled', 'expired', 'past_due', 'none'],
      default: 'none',
    },
    favoriteGenres: {
      type: [String],
      default: ['Bedtime Stories', 'Mystery & Thriller'],
    },
    savedStories: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Story',
      },
    ],
    favorites: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Story',
      },
    ],
  },
  {
    timestamps: true,
    toJSON: {
      transform: function (doc, ret) {
        ret.id = ret._id;
        delete ret.password;
        return ret;
      },
    },
  }
);

// Encrypt password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password') || !this.password) {
    return next();
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Compare entered password with hashed password in database
userSchema.methods.matchPassword = async function (enteredPassword) {
  if (!this.password) return false;
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
