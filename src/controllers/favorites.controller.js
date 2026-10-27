const User = require('../models/User');
const Story = require('../models/Story');
const { sendSuccess, sendError } = require('../utils');

/**
 * Helper to find story by ID or slug
 */
const findStoryDoc = async (identifier) => {
  if (!identifier) return null;
  const idStr = String(identifier).trim();
  if (idStr.match(/^[0-9a-fA-F]{24}$/)) {
    return await Story.findById(idStr);
  }
  const titleRegex = new RegExp(`^${idStr.replace(/-/g, ' ')}$`, 'i');
  return await Story.findOne({
    $or: [
      { title: { $regex: titleRegex } },
      { title: { $regex: new RegExp(idStr.replace(/-/g, '.*'), 'i') } },
    ],
  });
};

/**
 * @desc    Get current listener's favorite stories
 * @route   GET /api/favorites
 * @access  Private (Listener)
 */
const getFavorites = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.admin?.id;
    const user = await User.findById(userId).populate({
      path: 'favorites',
      match: { status: 'Published' },
    });

    if (!user) {
      return sendError(res, 404, 'Listener account not found');
    }

    const stories = (user.favorites || []).filter(Boolean);
    const storyIds = stories.map((s) => String(s._id));

    return sendSuccess(res, 200, 'Favorites retrieved successfully', {
      storyIds,
      stories,
      count: stories.length,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Add story to current listener's favorites
 * @route   POST /api/favorites
 * @access  Private (Listener)
 */
const addToFavorites = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.admin?.id;
    const { storyId } = req.body;

    if (!storyId) {
      return sendError(res, 400, 'Story ID or slug is required');
    }

    const story = await findStoryDoc(storyId);
    if (!story) {
      return sendError(res, 404, 'Story not found');
    }

    const user = await User.findById(userId);
    if (!user) {
      return sendError(res, 404, 'Listener account not found');
    }

    if (!user.favorites) {
      user.favorites = [];
    }

    const exists = user.favorites.some((id) => String(id) === String(story._id));
    if (!exists) {
      user.favorites.push(story._id);
      await user.save();
    }

    await user.populate({
      path: 'favorites',
      match: { status: 'Published' },
    });

    const stories = (user.favorites || []).filter(Boolean);
    const storyIds = stories.map((s) => String(s._id));

    return sendSuccess(res, 200, `"${story.title}" added to your favorites`, {
      storyIds,
      stories,
      count: stories.length,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Remove story from current listener's favorites
 * @route   DELETE /api/favorites/:storyId
 * @access  Private (Listener)
 */
const removeFromFavorites = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.admin?.id;
    const { storyId } = req.params;

    if (!storyId) {
      return sendError(res, 400, 'Story ID or slug is required');
    }

    const story = await findStoryDoc(storyId);
    const targetIdStr = story ? String(story._id) : String(storyId);

    const user = await User.findById(userId);
    if (!user) {
      return sendError(res, 404, 'Listener account not found');
    }

    if (user.favorites && user.favorites.length > 0) {
      user.favorites = user.favorites.filter((id) => String(id) !== targetIdStr);
      await user.save();
    }

    await user.populate({
      path: 'favorites',
      match: { status: 'Published' },
    });

    const stories = (user.favorites || []).filter(Boolean);
    const storyIds = stories.map((s) => String(s._id));

    return sendSuccess(res, 200, 'Story removed from your favorites', {
      storyIds,
      stories,
      count: stories.length,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Toggle story in current listener's favorites
 * @route   POST /api/favorites/toggle
 * @access  Private (Listener)
 */
const toggleFavorites = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.admin?.id;
    const { storyId } = req.body;

    if (!storyId) {
      return sendError(res, 400, 'Story ID or slug is required');
    }

    const story = await findStoryDoc(storyId);
    if (!story) {
      return sendError(res, 404, 'Story not found');
    }

    const user = await User.findById(userId);
    if (!user) {
      return sendError(res, 404, 'Listener account not found');
    }

    if (!user.favorites) {
      user.favorites = [];
    }

    const isCurrentlyFav = user.favorites.some((id) => String(id) === String(story._id));
    let action = 'added';

    if (isCurrentlyFav) {
      user.favorites = user.favorites.filter((id) => String(id) !== String(story._id));
      action = 'removed';
    } else {
      user.favorites.push(story._id);
      action = 'added';
    }

    await user.save();

    await user.populate({
      path: 'favorites',
      match: { status: 'Published' },
    });

    const stories = (user.favorites || []).filter(Boolean);
    const storyIds = stories.map((s) => String(s._id));

    return sendSuccess(
      res,
      200,
      action === 'added' ? `"${story.title}" added to your favorites` : `"${story.title}" removed from your favorites`,
      {
        action,
        storyIds,
        stories,
        count: stories.length,
      }
    );
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getFavorites,
  addToFavorites,
  removeFromFavorites,
  toggleFavorites,
};
