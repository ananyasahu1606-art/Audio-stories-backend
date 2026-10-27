const path = require('path');
const fs = require('fs');
const { Readable } = require('stream');
const Story = require('../models/Story');
const Episode = require('../models/Episode');
const Category = require('../models/Category');
const Narrator = require('../models/Narrator');
const { sendSuccess, sendError } = require('../utils');
const { notify } = require('../utils/notification.helper');
const { onStoryPublished } = require('../services/notificationTrigger.service');
const { checkUserDownloadPermission } = require('../services/downloadPermission.service');

/**
 * @desc    Get all stories with search, filtering, sorting and pagination
 * @route   GET /api/stories
 * @access  Public (Guest) / Private (Admin)
 */
const getAllStories = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 10,
      search,
      category,
      status,
      language,
      ageGroup,
      storyType,
      featured,
      sortBy = 'newest',
    } = req.query;

    const filter = {};

    // For public requests (no req.admin), default to Published stories
    if (status && status !== 'ALL') {
      filter.status = status;
    } else if (!req.admin) {
      filter.status = 'Published';
    }

    // Search by title, tags, shortDescription, narratorName, categoryName
    if (search && search.trim()) {
      filter.$or = [
        { title: { $regex: search.trim(), $options: 'i' } },
        { shortDescription: { $regex: search.trim(), $options: 'i' } },
        { narratorName: { $regex: search.trim(), $options: 'i' } },
        { categoryName: { $regex: search.trim(), $options: 'i' } },
        { tags: { $in: [new RegExp(search.trim(), 'i')] } },
      ];
    }

    if (category && category !== 'ALL') {
      if (category.match(/^[0-9a-fA-F]{24}$/)) {
        filter.categoryId = category;
      } else {
        // Also match category by slug or name
        const catDoc = await Category.findOne({
          $or: [
            { slug: category.toLowerCase().trim() },
            { name: { $regex: new RegExp(`^${category.trim()}$`, 'i') } },
          ],
        });
        if (catDoc) {
          filter.categoryId = catDoc._id;
        } else {
          filter.categoryName = { $regex: category.trim(), $options: 'i' };
        }
      }
    }

    if (language && language !== 'ALL') {
      filter.language = { $regex: language.trim(), $options: 'i' };
    }

    if (ageGroup && ageGroup !== 'ALL') {
      filter.ageGroup = ageGroup;
    }

    if (storyType && storyType !== 'ALL') {
      filter.storyType = storyType;
    }

    if (featured === 'true' || featured === true) {
      filter.isFeatured = true;
    }

    // Sorting
    let sortOptions = { createdAt: -1 };
    if (sortBy === 'rating') {
      sortOptions = { rating: -1, createdAt: -1 };
    } else if (sortBy === 'listens' || sortBy === 'popular') {
      sortOptions = { listenCount: -1, createdAt: -1 };
    } else if (sortBy === 'title') {
      sortOptions = { title: 1 };
    } else if (sortBy === 'newest') {
      sortOptions = { createdAt: -1 };
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
    const skip = (pageNum - 1) * limitNum;

    const totalStories = await Story.countDocuments(filter);
    const stories = await Story.find(filter)
      .sort(sortOptions)
      .skip(skip)
      .limit(limitNum);

    return sendSuccess(res, 200, 'Stories retrieved successfully', {
      stories,
      pagination: {
        total: totalStories,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(totalStories / limitNum) || 1,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get single story by ID or Slug
 * @route   GET /api/stories/:id
 * @access  Public (Guest) / Private (Admin)
 */
const getStoryById = async (req, res, next) => {
  try {
    const { id } = req.params;
    let story;

    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      story = await Story.findById(id);
    } else {
      // Find by title slug matching
      const titleRegex = new RegExp(`^${id.replace(/-/g, ' ')}$`, 'i');
      story = await Story.findOne({
        $or: [
          { title: { $regex: titleRegex } },
          { title: { $regex: new RegExp(id.replace(/-/g, '.*'), 'i') } },
        ],
      });
    }

    if (!story) {
      return sendError(res, 404, `Story with identifier "${id}" not found`);
    }

    // Hide draft stories from public guests
    if (!req.admin && story.status !== 'Published') {
      return sendError(res, 404, `Story is not available`);
    }

    return sendSuccess(res, 200, 'Story details retrieved', story);
  } catch (error) {
    next(error);
  }
};


/**
 * @desc    Create a new story
 * @route   POST /api/stories
 * @access  Private (Admin)
 */
const createStory = async (req, res, next) => {
  try {
    const {
      title,
      shortDescription,
      fullDescription,
      coverImage,
      categoryId,
      narratorId,
      language,
      ageGroup,
      storyType,
      tags,
      totalEpisodes,
      totalDuration,
      releaseDate,
      status,
      isFeatured,
    } = req.body;

    if (!title || !title.trim()) {
      return sendError(res, 400, 'Story title is required');
    }

    if (!categoryId || !categoryId.match(/^[0-9a-fA-F]{24}$/)) {
      return sendError(res, 400, 'Valid Category ID is required');
    }

    if (!narratorId || !narratorId.match(/^[0-9a-fA-F]{24}$/)) {
      return sendError(res, 400, 'Valid Narrator ID is required');
    }

    // Verify Category
    const categoryDoc = await Category.findById(categoryId);
    if (!categoryDoc) {
      return sendError(res, 404, 'Selected category does not exist');
    }

    // Verify Narrator
    const narratorDoc = await Narrator.findById(narratorId);
    if (!narratorDoc) {
      return sendError(res, 404, 'Selected narrator does not exist');
    }

    const newStory = await Story.create({
      title: title.trim(),
      shortDescription: shortDescription ? shortDescription.trim() : '',
      fullDescription: fullDescription ? fullDescription.trim() : '',
      coverImage:
        coverImage ||
        'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=600&auto=format&fit=crop&q=80',
      categoryId,
      categoryName: categoryDoc.name,
      narratorId,
      narratorName: narratorDoc.name,
      language: language || 'English',
      ageGroup: ageGroup || 'All Ages',
      storyType: storyType || 'Mystery',
      tags: Array.isArray(tags) ? tags : typeof tags === 'string' ? tags.split(',').map((t) => t.trim()) : [],
      totalEpisodes: Number(totalEpisodes) || 1,
      totalDuration: totalDuration || '45m',
      releaseDate: releaseDate || new Date().toISOString().split('T')[0],
      status: status || 'Published',
      isFeatured: Boolean(isFeatured),
      rating: 5.0,
      listenCount: 0,
    });

    // Increment story count on Category and Narrator
    await Category.findByIdAndUpdate(categoryId, { $inc: { storyCount: 1 } });
    await Narrator.findByIdAndUpdate(narratorId, { $inc: { storyCount: 1 } });

    await notify({
      text: `New story created: "${newStory.title}"`,
      type: 'story',
      link: `/stories/${newStory._id}`,
      metadata: { entityId: newStory._id, title: newStory.title, action: 'create' },
    });

    // Automatic Listener Notification Trigger (Phase 4)
    if (newStory.status === 'Published') {
      onStoryPublished(newStory).catch((err) =>
        console.error('[NotificationTriggerService] Story publish error:', err.message)
      );
    }

    return sendSuccess(
      res,
      201,
      `Story "${newStory.title}" created successfully`,
      newStory
    );
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update story
 * @route   PUT /api/stories/:id
 * @access  Private (Admin)
 */
const updateStory = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return sendError(res, 400, 'Invalid Story ID format');
    }

    const story = await Story.findById(id);
    if (!story) {
      return sendError(res, 404, `Story with ID "${id}" not found`);
    }

    const {
      title,
      shortDescription,
      fullDescription,
      coverImage,
      categoryId,
      narratorId,
      language,
      ageGroup,
      storyType,
      tags,
      totalEpisodes,
      totalDuration,
      releaseDate,
      status,
      isFeatured,
      rating,
      listenCount,
    } = req.body;

    if (title) story.title = title.trim();
    if (shortDescription !== undefined) story.shortDescription = shortDescription.trim();
    if (fullDescription !== undefined) story.fullDescription = fullDescription.trim();
    if (coverImage) story.coverImage = coverImage;

    // Handle Category change if provided
    if (categoryId && categoryId !== String(story.categoryId)) {
      const categoryDoc = await Category.findById(categoryId);
      if (categoryDoc) {
        await Category.findByIdAndUpdate(story.categoryId, { $inc: { storyCount: -1 } });
        await Category.findByIdAndUpdate(categoryId, { $inc: { storyCount: 1 } });
        story.categoryId = categoryId;
        story.categoryName = categoryDoc.name;
      }
    }

    // Handle Narrator change if provided
    if (narratorId && narratorId !== String(story.narratorId)) {
      const narratorDoc = await Narrator.findById(narratorId);
      if (narratorDoc) {
        await Narrator.findByIdAndUpdate(story.narratorId, { $inc: { storyCount: -1 } });
        await Narrator.findByIdAndUpdate(narratorId, { $inc: { storyCount: 1 } });
        story.narratorId = narratorId;
        story.narratorName = narratorDoc.name;
      }
    }

    if (language) story.language = language.trim();
    if (ageGroup) story.ageGroup = ageGroup;
    if (storyType) story.storyType = storyType;
    const prevStatus = story.status;
    if (tags !== undefined) {
      story.tags = Array.isArray(tags) ? tags : typeof tags === 'string' ? tags.split(',').map((t) => t.trim()) : [];
    }
    if (totalEpisodes !== undefined) story.totalEpisodes = Number(totalEpisodes);
    if (totalDuration !== undefined) story.totalDuration = totalDuration;
    if (releaseDate) story.releaseDate = releaseDate;
    if (status) story.status = status;
    if (isFeatured !== undefined) story.isFeatured = Boolean(isFeatured);
    if (rating !== undefined) story.rating = Number(rating);
    if (listenCount !== undefined) story.listenCount = Number(listenCount);

    const updatedStory = await story.save();

    await notify({
      text: `Story updated: "${updatedStory.title}"`,
      type: 'story',
      link: `/stories/${updatedStory._id}`,
      metadata: { entityId: updatedStory._id, title: updatedStory.title, action: 'update' },
    });

    // Automatic Listener Notification Trigger: only on transition to Published
    if (prevStatus !== 'Published' && updatedStory.status === 'Published') {
      onStoryPublished(updatedStory).catch((err) =>
        console.error('[NotificationTriggerService] Story publish transition error:', err.message)
      );
    }

    return sendSuccess(
      res,
      200,
      `Story "${updatedStory.title}" updated successfully`,
      updatedStory
    );
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Toggle story publication status (Published <-> Draft)
 * @route   PATCH /api/stories/:id/status
 * @access  Private (Admin)
 */
const toggleStoryStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return sendError(res, 400, 'Invalid Story ID format');
    }

    const story = await Story.findById(id);
    if (!story) {
      return sendError(res, 404, `Story with ID "${id}" not found`);
    }

    const prevStatus = story.status;
    if (status && ['Published', 'Draft', 'Scheduled', 'Archived'].includes(status)) {
      story.status = status;
    } else {
      story.status = story.status === 'Published' ? 'Draft' : 'Published';
    }

    await story.save();

    await notify({
      text: `Story status changed to ${story.status}: "${story.title}"`,
      type: 'story',
      link: `/stories/${story._id}`,
      metadata: { entityId: story._id, title: story.title, action: 'status_toggle' },
    });

    // Automatic Listener Notification Trigger: only on transition to Published
    if (prevStatus !== 'Published' && story.status === 'Published') {
      onStoryPublished(story).catch((err) =>
        console.error('[NotificationTriggerService] Story publish toggle error:', err.message)
      );
    }

    return sendSuccess(
      res,
      200,
      `Story status changed to ${story.status}`,
      {
        id: story._id,
        status: story.status,
        updatedAt: story.updatedAt,
      }
    );
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete story
 * @route   DELETE /api/stories/:id
 * @access  Private (Admin)
 */
const deleteStory = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return sendError(res, 400, 'Invalid Story ID format');
    }

    const story = await Story.findById(id);
    if (!story) {
      return sendError(res, 404, `Story with ID "${id}" not found`);
    }

    // Decrement story count on Category & Narrator
    await Category.findByIdAndUpdate(story.categoryId, { $inc: { storyCount: -1 } });
    await Narrator.findByIdAndUpdate(story.narratorId, { $inc: { storyCount: -1 } });

    await Story.findByIdAndDelete(id);

    await notify({
      text: `Story deleted: "${story.title}"`,
      type: 'story',
      metadata: { entityId: story._id, title: story.title, action: 'delete' },
    });

    return sendSuccess(
      res,
      200,
      `Story "${story.title}" deleted successfully`
    );
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Download audio narration track for a story (First / Primary Episode)
 *          Enforces planLimits.downloadAllowed as single source of truth.
 * @route   GET /api/stories/:id/download
 * @access  Public / Listener / Plan Permission Protected
 */
const downloadStoryAudio = async (req, res, next) => {
  try {
    const { id } = req.params;

    // 1. Permission check: verify requester's plan allows downloads
    const allowed = await checkUserDownloadPermission(req.user);
    if (!allowed) {
      return sendError(
        res,
        403,
        'Downloads are not permitted for your current subscription plan. Please upgrade your plan to enable offline downloads.'
      );
    }

    // 2. Validate and find Story
    let story = null;
    if (id && id.match(/^[0-9a-fA-F]{24}$/)) {
      story = await Story.findById(id);
    }
    if (!story) {
      story = await Story.findOne({
        title: { $regex: new RegExp(`^${id.replace(/-/g, ' ')}$`, 'i') },
      });
    }

    if (!story) {
      return sendError(res, 404, 'Story not found');
    }

    // 3. Find first episode / chapter for this story
    const episode = await Episode.findOne({ storyId: story._id })
      .sort({ episodeNumber: 1 });

    if (!episode || !episode.audioUrl || !episode.audioUrl.trim()) {
      return sendError(res, 404, 'No downloadable audio track found for this story');
    }

    // Format clean filename for download attachment
    const safeStory = (story.title || 'AudioStory').replace(/[^a-zA-Z0-9_-]/g, '_');
    const safeEpisode = (episode.title || `Episode_${episode.episodeNumber}`).replace(/[^a-zA-Z0-9_-]/g, '_');
    const downloadFilename = `${safeStory}_Ep${episode.episodeNumber}_${safeEpisode}.mp3`;

    // 4. Check if audioUrl is a local uploaded file
    const audioUrl = episode.audioUrl.trim();
    const uploadsMatch = audioUrl.match(/\/uploads\/([^/?#]+)/);

    if (uploadsMatch) {
      const filename = uploadsMatch[1];
      const filePath = path.join(__dirname, '../../uploads', filename);

      if (fs.existsSync(filePath)) {
        res.setHeader('Content-Disposition', `attachment; filename="${downloadFilename}"`);
        res.setHeader('Content-Type', 'audio/mpeg');
        return res.sendFile(filePath);
      }
    }

    // 5. Remote audio URL streaming with fallback
    try {
      const audioResponse = await fetch(audioUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ElevStory/1.0',
        },
      });

      if (audioResponse.ok) {
        const contentType = audioResponse.headers.get('content-type') || 'audio/mpeg';
        res.setHeader('Content-Disposition', `attachment; filename="${downloadFilename}"`);
        res.setHeader('Content-Type', contentType);

        const nodeStream = Readable.fromWeb(audioResponse.body);
        return nodeStream.pipe(res);
      }
    } catch (fetchErr) {
      console.warn('[Download] Remote audio fetch error:', fetchErr.message);
    }

    // Fallback to available local audio narration file if remote link expired
    const uploadsDir = path.join(__dirname, '../../uploads');
    const localAudioFiles = fs.readdirSync(uploadsDir).filter((f) => f.endsWith('.mp3') || f.endsWith('.wav'));
    if (localAudioFiles.length > 0) {
      const fallbackFile = path.join(uploadsDir, localAudioFiles[0]);
      res.setHeader('Content-Disposition', `attachment; filename="${downloadFilename}"`);
      res.setHeader('Content-Type', 'audio/mpeg');
      return res.sendFile(fallbackFile);
    }

    return sendError(res, 404, 'Audio track is not available for download');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAllStories,
  getStoryById,
  createStory,
  updateStory,
  toggleStoryStatus,
  deleteStory,
  downloadStoryAudio,
};

