const Review = require('../models/Review');
const Story = require('../models/Story');
const User = require('../models/User');
const { sendSuccess, sendError } = require('../utils');
const { notify } = require('../utils/notification.helper');

/**
 * Helper to recalculate and persist average rating on Story model
 */
const recalculateStoryRating = async (storyId) => {
  try {
    if (!storyId) return;
    const approvedReviews = await Review.find({ storyId, status: 'Approved' });
    if (approvedReviews.length > 0) {
      const sum = approvedReviews.reduce((acc, r) => acc + (Number(r.rating) || 0), 0);
      const avg = Math.round((sum / approvedReviews.length) * 10) / 10;
      await Story.findByIdAndUpdate(storyId, { rating: Math.max(1.0, Math.min(5.0, avg)) });
    }
  } catch (err) {
    console.warn('Error recalculating story rating:', err.message);
  }
};

/**
 * @desc    Get all reviews with filtering (storyId, rating, status, search) & pagination
 * @route   GET /api/reviews
 * @access  Public (Guest) / Private (Admin/Listener)
 */
const getAllReviews = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 20,
      search,
      storyId,
      rating,
      status,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = req.query;

    const filter = {};

    // For public requests (non-admin), default to status 'Approved' unless caller explicitly filters
    if (status && status !== 'ALL') {
      filter.status = status;
    } else if (!req.admin || req.admin.role === 'listener') {
      filter.status = 'Approved';
    }

    if (search) {
      filter.$or = [
        { userName: { $regex: search, $options: 'i' } },
        { storyTitle: { $regex: search, $options: 'i' } },
        { comment: { $regex: search, $options: 'i' } },
      ];
    }

    if (storyId && storyId !== 'ALL') {
      if (storyId.match(/^[0-9a-fA-F]{24}$/)) {
        filter.storyId = storyId;
      }
    }

    if (rating && rating !== 'ALL') {
      const numRating = Number(rating);
      if (!isNaN(numRating)) {
        filter.rating = numRating;
      }
    }

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 20;
    const skip = (pageNum - 1) * limitNum;

    const sortOption = {};
    sortOption[sortBy] = sortOrder === 'asc' ? 1 : -1;

    const totalReviews = await Review.countDocuments(filter);
    const reviews = await Review.find(filter)
      .populate('userId', 'name email avatar plan')
      .populate('storyId', 'title coverImage categoryName narratorName')
      .sort(sortOption)
      .skip(skip)
      .limit(limitNum);

    return sendSuccess(res, 200, 'Reviews retrieved successfully', {
      reviews,
      pagination: {
        total: totalReviews,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(totalReviews / limitNum) || 1,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get review moderation stats (Approved, Pending, Hidden counts, average rating)
 * @route   GET /api/reviews/stats
 * @access  Private (Admin)
 */
const getReviewStats = async (req, res, next) => {
  try {
    const totalReviews = await Review.countDocuments();
    const approvedCount = await Review.countDocuments({ status: 'Approved' });
    const pendingCount = await Review.countDocuments({ status: 'Pending' });
    const hiddenCount = await Review.countDocuments({ status: 'Hidden' });

    const fiveStars = await Review.countDocuments({ rating: 5 });
    const fourStars = await Review.countDocuments({ rating: 4 });
    const threeStars = await Review.countDocuments({ rating: 3 });
    const lowStars = await Review.countDocuments({ rating: { $lte: 2 } });

    // Calculate average rating
    const avgResult = await Review.aggregate([
      {
        $group: {
          _id: null,
          avgRating: { $avg: '$rating' },
        },
      },
    ]);

    const averageRating = avgResult[0]?.avgRating
      ? Math.round(avgResult[0].avgRating * 100) / 100
      : 5.0;

    return sendSuccess(res, 200, 'Review moderation statistics retrieved', {
      totalReviews,
      approvedCount,
      pendingCount,
      hiddenCount,
      averageRating,
      starDistribution: {
        fiveStar: fiveStars,
        fourStar: fourStars,
        threeStar: threeStars,
        twoOrLess: lowStars,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get single review details by ID
 * @route   GET /api/reviews/:id
 * @access  Public / Private
 */
const getReviewById = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return sendError(res, 400, 'Invalid Review ID format');
    }

    const review = await Review.findById(id)
      .populate('userId', 'name email avatar')
      .populate('storyId', 'title coverImage categoryName narratorName');

    if (!review) {
      return sendError(res, 404, `Review with ID "${id}" not found`);
    }

    return sendSuccess(res, 200, 'Review details retrieved', review);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Create a new story review / feedback (or update existing review for user/story)
 * @route   POST /api/reviews
 * @access  Private (Listener / Admin)
 */
const createReview = async (req, res, next) => {
  try {
    const {
      userId,
      userName,
      userAvatar,
      storyId,
      rating,
      comment,
      status = 'Approved',
      likes = 0,
    } = req.body;

    if (!storyId || !storyId.match(/^[0-9a-fA-F]{24}$/)) {
      return sendError(res, 400, 'Valid Story ID is required');
    }

    if (!comment || !comment.trim()) {
      return sendError(res, 400, 'Review comment cannot be empty');
    }

    const numRating = Number(rating);
    if (!numRating || numRating < 1 || numRating > 5) {
      return sendError(res, 400, 'Valid rating (1 to 5) is required');
    }

    // Verify story exists
    const story = await Story.findById(storyId);
    if (!story) {
      return sendError(res, 404, 'Story does not exist');
    }

    // Authenticated user determination
    let finalUserId = req.user?.id || req.admin?.id || userId;
    let finalUserName = userName;
    let finalUserAvatar = userAvatar;

    if (finalUserId && String(finalUserId).match(/^[0-9a-fA-F]{24}$/)) {
      const user = await User.findById(finalUserId);
      if (user) {
        finalUserName = user.name;
        finalUserAvatar = user.avatar;
      }
    }

    if (!finalUserName || !finalUserName.trim()) {
      finalUserName = 'Verified Listener';
    }

    // If a listener is submitting, enforce one review per listener per story (update if already exists)
    if (finalUserId && String(finalUserId).match(/^[0-9a-fA-F]{24}$/)) {
      const existingReview = await Review.findOne({
        storyId,
        userId: finalUserId,
      });

      if (existingReview) {
        existingReview.rating = numRating;
        existingReview.comment = comment.trim();
        existingReview.date = new Date().toISOString().split('T')[0];
        existingReview.status = status || 'Approved';
        if (finalUserName) existingReview.userName = finalUserName.trim();
        if (finalUserAvatar) existingReview.userAvatar = finalUserAvatar;

        await existingReview.save();
        await recalculateStoryRating(storyId);

        return sendSuccess(
          res,
          200,
          'Your review has been updated successfully',
          existingReview
        );
      }
    }

    const newReview = await Review.create({
      userId: finalUserId && String(finalUserId).match(/^[0-9a-fA-F]{24}$/) ? finalUserId : undefined,
      userName: finalUserName.trim(),
      userAvatar:
        finalUserAvatar ||
        'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop&q=80',
      storyId,
      storyTitle: story.title,
      rating: numRating,
      comment: comment.trim(),
      date: new Date().toISOString().split('T')[0],
      status: status || 'Approved',
      likes: Number(likes) || 0,
    });

    await recalculateStoryRating(storyId);

    await notify({
      text: `New review submitted by ${newReview.userName} for "${story.title}" (${newReview.rating}★)`,
      type: 'review',
      link: '/reviews',
      metadata: { reviewId: newReview._id, storyId: story._id, rating: newReview.rating, action: 'create' },
    });

    return sendSuccess(
      res,
      201,
      'Story review posted successfully',
      newReview
    );
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update review contents
 * @route   PUT /api/reviews/:id
 * @access  Private (Listener / Admin)
 */
const updateReview = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return sendError(res, 400, 'Invalid Review ID format');
    }

    const review = await Review.findById(id);
    if (!review) {
      return sendError(res, 404, `Review with ID "${id}" not found`);
    }

    // Ownership check for non-admin listeners
    const isListener = req.user && req.user.role !== 'admin';
    if (isListener && review.userId && String(review.userId) !== String(req.user.id)) {
      return sendError(res, 403, 'You are not authorized to edit this review');
    }

    const { rating, comment, status, likes } = req.body;

    if (rating !== undefined) {
      const r = Number(rating);
      if (r >= 1 && r <= 5) review.rating = r;
    }

    if (comment !== undefined && comment.trim()) {
      review.comment = comment.trim();
    }

    if (status && ['Approved', 'Pending', 'Hidden'].includes(status) && !isListener) {
      review.status = status;
    }

    if (likes !== undefined) {
      review.likes = Number(likes);
    }

    const updatedReview = await review.save();
    await recalculateStoryRating(review.storyId);

    return sendSuccess(
      res,
      200,
      'Review updated successfully',
      updatedReview
    );
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Moderate / Change review status (Approved, Pending, Hidden)
 * @route   PATCH /api/reviews/:id/status
 * @access  Private (Admin)
 */
const updateReviewStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return sendError(res, 400, 'Invalid Review ID format');
    }

    if (!status || !['Approved', 'Pending', 'Hidden'].includes(status)) {
      return sendError(
        res,
        400,
        'Valid status required: "Approved", "Pending", or "Hidden"'
      );
    }

    const review = await Review.findById(id);
    if (!review) {
      return sendError(res, 404, `Review with ID "${id}" not found`);
    }

    review.status = status;
    await review.save();
    await recalculateStoryRating(review.storyId);

    await notify({
      text: `Review from "${review.userName}" for "${review.storyTitle}" status changed to ${status}`,
      type: 'review',
      link: '/reviews',
      metadata: { reviewId: review._id, status, action: 'status_update' },
    });

    return sendSuccess(
      res,
      200,
      `Review status updated to ${status}`,
      {
        id: review._id,
        storyTitle: review.storyTitle,
        userName: review.userName,
        status: review.status,
        updatedAt: review.updatedAt,
      }
    );
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete / Remove review
 * @route   DELETE /api/reviews/:id
 * @access  Private (Listener / Admin)
 */
const deleteReview = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return sendError(res, 400, 'Invalid Review ID format');
    }

    const review = await Review.findById(id);
    if (!review) {
      return sendError(res, 404, `Review with ID "${id}" not found`);
    }

    // Ownership check for non-admin listeners
    const isListener = req.user && req.user.role !== 'admin';
    if (isListener && review.userId && String(review.userId) !== String(req.user.id)) {
      return sendError(res, 403, 'You are not authorized to delete this review');
    }

    const storyId = review.storyId;
    await Review.findByIdAndDelete(id);
    await recalculateStoryRating(storyId);

    await notify({
      text: `Review from "${review.userName}" was deleted`,
      type: 'review',
      link: '/reviews',
      metadata: { reviewId: review._id, action: 'delete' },
    });

    return sendSuccess(
      res,
      200,
      `Review from "${review.userName}" deleted successfully`
    );
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAllReviews,
  getReviewStats,
  getReviewById,
  createReview,
  updateReview,
  updateReviewStatus,
  deleteReview,
};
