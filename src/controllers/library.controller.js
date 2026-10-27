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
 * @desc    Get current listener's saved library stories
 * @route   GET /api/library
 * @access  Private (Listener)
 */
const getSavedLibrary = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.admin?.id;
    const user = await User.findById(userId).populate({
      path: 'savedStories',
      match: { status: 'Published' },
    });

    if (!user) {
      return sendError(res, 404, 'Listener account not found');
    }

    const stories = (user.savedStories || []).filter(Boolean);
    const storyIds = stories.map((s) => String(s._id));

    return sendSuccess(res, 200, 'Saved library retrieved successfully', {
      storyIds,
      stories,
      count: stories.length,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Add story to current listener's saved library
 * @route   POST /api/library
 * @access  Private (Listener)
 */
const addToLibrary = async (req, res, next) => {
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

    if (!user.savedStories) {
      user.savedStories = [];
    }

    const exists = user.savedStories.some((id) => String(id) === String(story._id));
    if (!exists) {
      user.savedStories.push(story._id);
      await user.save();
    }

    // Populate saved stories for response
    await user.populate({
      path: 'savedStories',
      match: { status: 'Published' },
    });

    const stories = (user.savedStories || []).filter(Boolean);
    const storyIds = stories.map((s) => String(s._id));

    return sendSuccess(res, 200, `"${story.title}" added to your library`, {
      storyIds,
      stories,
      count: stories.length,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Remove story from current listener's saved library
 * @route   DELETE /api/library/:storyId
 * @access  Private (Listener)
 */
const removeFromLibrary = async (req, res, next) => {
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

    if (user.savedStories && user.savedStories.length > 0) {
      user.savedStories = user.savedStories.filter((id) => String(id) !== targetIdStr);
      await user.save();
    }

    await user.populate({
      path: 'savedStories',
      match: { status: 'Published' },
    });

    const stories = (user.savedStories || []).filter(Boolean);
    const storyIds = stories.map((s) => String(s._id));

    return sendSuccess(res, 200, 'Story removed from your library', {
      storyIds,
      stories,
      count: stories.length,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Toggle story in current listener's saved library
 * @route   POST /api/library/toggle
 * @access  Private (Listener)
 */
const toggleLibrary = async (req, res, next) => {
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

    if (!user.savedStories) {
      user.savedStories = [];
    }

    const isCurrentlySaved = user.savedStories.some((id) => String(id) === String(story._id));
    let action = 'added';

    if (isCurrentlySaved) {
      user.savedStories = user.savedStories.filter((id) => String(id) !== String(story._id));
      action = 'removed';
    } else {
      user.savedStories.push(story._id);
      action = 'added';
    }

    await user.save();

    await user.populate({
      path: 'savedStories',
      match: { status: 'Published' },
    });

    const stories = (user.savedStories || []).filter(Boolean);
    const storyIds = stories.map((s) => String(s._id));

    return sendSuccess(
      res,
      200,
      action === 'added' ? `"${story.title}" added to your library` : `"${story.title}" removed from your library`,
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
  getSavedLibrary,
  addToLibrary,
  removeFromLibrary,
  toggleLibrary,
};
