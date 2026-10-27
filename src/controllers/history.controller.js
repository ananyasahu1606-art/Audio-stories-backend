const mongoose = require('mongoose');
const ListeningHistory = require('../models/ListeningHistory');
const Story = require('../models/Story');
const Episode = require('../models/Episode');
const User = require('../models/User');

/**
 * @desc    Get current listener's listening history
 * @route   GET /api/history
 * @access  Private (Listener)
 */
exports.getHistory = async (req, res) => {
  try {
    const userId = req.user.id;

    const history = await ListeningHistory.find({ user: userId })
      .populate({
        path: 'story',
        select: 'title coverImage categoryId categoryName narratorId narratorName totalDuration totalEpisodes rating releaseDate status',
      })
      .populate({
        path: 'episode',
        select: 'title episodeNumber narratorName duration durationSeconds audioUrl thumbnail releaseDate status',
      })
      .sort({ lastListenedAt: -1 });

    // Filter out items where referenced story or episode might have been removed
    const validHistory = history.filter((item) => item.story && item.episode);

    res.status(200).json({
      success: true,
      count: validHistory.length,
      data: validHistory,
    });
  } catch (error) {
    console.error('Error in getHistory:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch listening history',
      error: error.message,
    });
  }
};

/**
 * @desc    Save or update listening progress / history entry
 * @route   POST /api/history/progress or POST /api/history
 * @access  Private (Listener)
 */
exports.saveProgress = async (req, res) => {
  try {
    const userId = req.user.id;
    const { storyId, episodeId, currentTime = 0, duration = 0, status } = req.body;

    if (!storyId || !episodeId) {
      return res.status(400).json({
        success: false,
        message: 'storyId and episodeId are required',
      });
    }

    // Verify story and episode exist
    if (!mongoose.Types.ObjectId.isValid(storyId) || !mongoose.Types.ObjectId.isValid(episodeId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid storyId or episodeId format',
      });
    }

    const curTimeSec = Math.max(0, Math.round(Number(currentTime) || 0));
    const durSec = Math.max(0, Math.round(Number(duration) || 0));

    let calcPercent = 0;
    if (durSec > 0) {
      calcPercent = Math.min(100, Math.round((curTimeSec / durSec) * 100));
    }

    let finalStatus = status || (calcPercent >= 95 ? 'completed' : 'in_progress');
    if (finalStatus === 'completed') {
      calcPercent = 100;
    }

    const record = await ListeningHistory.findOneAndUpdate(
      { user: userId, episode: episodeId },
      {
        user: userId,
        story: storyId,
        episode: episodeId,
        currentTime: curTimeSec,
        duration: durSec,
        progressPercent: calcPercent,
        status: finalStatus,
        lastListenedAt: new Date(),
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    )
      .populate('story')
      .populate('episode');

    // Update user's lastActive
    await User.findByIdAndUpdate(userId, {
      lastActive: 'Just now',
    }).catch(() => {});

    res.status(200).json({
      success: true,
      message: 'Listening progress saved successfully',
      data: record,
    });
  } catch (error) {
    console.error('Error in saveProgress:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to save listening progress',
      error: error.message,
    });
  }
};

/**
 * @desc    Get listening progress for a specific episode
 * @route   GET /api/history/progress/:episodeId or GET /api/progress/:episodeId
 * @access  Private (Listener)
 */
exports.getProgress = async (req, res) => {
  try {
    const userId = req.user.id;
    const { episodeId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(episodeId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid episodeId format',
      });
    }

    const record = await ListeningHistory.findOne({
      user: userId,
      episode: episodeId,
    })
      .populate('story')
      .populate('episode');

    res.status(200).json({
      success: true,
      data: record || null,
    });
  } catch (error) {
    console.error('Error in getProgress:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get episode progress',
      error: error.message,
    });
  }
};

/**
 * @desc    Remove single history item
 * @route   DELETE /api/history/:id
 * @access  Private (Listener)
 */
exports.removeHistoryItem = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid history item ID',
      });
    }

    // Try finding by _id or by episode ID
    const deleted = await ListeningHistory.findOneAndDelete({
      $or: [{ _id: id }, { episode: id }],
      user: userId,
    });

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: 'History item not found or unauthorized',
      });
    }

    res.status(200).json({
      success: true,
      message: 'History item removed successfully',
      data: { id },
    });
  } catch (error) {
    console.error('Error in removeHistoryItem:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove history item',
      error: error.message,
    });
  }
};

/**
 * @desc    Clear all listening history for current listener
 * @route   DELETE /api/history
 * @access  Private (Listener)
 */
exports.clearHistory = async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await ListeningHistory.deleteMany({ user: userId });

    res.status(200).json({
      success: true,
      message: 'Listening history cleared successfully',
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    console.error('Error in clearHistory:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to clear listening history',
      error: error.message,
    });
  }
};
