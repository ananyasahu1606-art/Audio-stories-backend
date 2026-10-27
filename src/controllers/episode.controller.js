const path = require('path');
const fs = require('fs');
const { Readable } = require('stream');
const Episode = require('../models/Episode');
const Story = require('../models/Story');
const Narrator = require('../models/Narrator');
const { sendSuccess, sendError } = require('../utils');
const { notify } = require('../utils/notification.helper');
const { onEpisodePublished } = require('../services/notificationTrigger.service');
const { checkUserDownloadPermission } = require('../services/downloadPermission.service');

/**
 * @desc    Get all episodes with search, storyId filter & status filter
 * @route   GET /api/episodes
 * @access  Private (Admin)
 */
const getAllEpisodes = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 20,
      search,
      storyId,
      status,
      narratorId,
    } = req.query;

    const filter = {};

    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { storyTitle: { $regex: search, $options: 'i' } },
        { narratorName: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }

    if (storyId && storyId !== 'ALL') {
      if (storyId.match(/^[0-9a-fA-F]{24}$/)) {
        filter.storyId = storyId;
      }
    }

    if (narratorId && narratorId !== 'ALL') {
      if (narratorId.match(/^[0-9a-fA-F]{24}$/)) {
        filter.narratorId = narratorId;
      }
    }

    if (status && status !== 'ALL') {
      filter.status = status;
    }

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 20;
    const skip = (pageNum - 1) * limitNum;

    const totalEpisodes = await Episode.countDocuments(filter);
    const episodes = await Episode.find(filter)
      .sort({ createdAt: -1, episodeNumber: 1 })
      .skip(skip)
      .limit(limitNum);

    return sendSuccess(res, 200, 'Episodes retrieved successfully', {
      episodes,
      pagination: {
        total: totalEpisodes,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(totalEpisodes / limitNum) || 1,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get all episodes for a specific parent Story ID
 * @route   GET /api/episodes/story/:storyId (or GET /api/stories/:storyId/episodes)
 * @access  Private (Admin)
 */
const getEpisodesByStoryId = async (req, res, next) => {
  try {
    const storyId = req.params.storyId || req.params.id;

    if (!storyId || !storyId.match(/^[0-9a-fA-F]{24}$/)) {
      return sendError(res, 400, 'Invalid Story ID format');
    }

    const episodes = await Episode.find({ storyId }).sort({ episodeNumber: 1 });

    return sendSuccess(res, 200, 'Story episodes retrieved', {
      count: episodes.length,
      episodes,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get single episode details by ID
 * @route   GET /api/episodes/:id
 * @access  Private (Admin)
 */
const getEpisodeById = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return sendError(res, 400, 'Invalid Episode ID format');
    }

    const episode = await Episode.findById(id);

    if (!episode) {
      return sendError(res, 404, `Episode with ID "${id}" not found`);
    }

    return sendSuccess(res, 200, 'Episode details retrieved', episode);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Create / Add new narration episode to story
 * @route   POST /api/episodes
 * @access  Private (Admin)
 */
const createEpisode = async (req, res, next) => {
  try {
    const {
      storyId,
      episodeNumber,
      title,
      description,
      narratorId,
      duration,
      durationSeconds,
      audioUrl,
      thumbnail,
      status,
      releaseDate,
      fileSize,
    } = req.body;

    if (!storyId || !storyId.match(/^[0-9a-fA-F]{24}$/)) {
      return sendError(res, 400, 'Valid parent Story ID is required');
    }

    if (!title || !title.trim()) {
      return sendError(res, 400, 'Episode title is required');
    }

    if (!audioUrl || !audioUrl.trim()) {
      return sendError(res, 400, 'Audio narration track URL / file is required');
    }

    // Verify parent Story
    const story = await Story.findById(storyId);
    if (!story) {
      return sendError(res, 404, 'Parent Story does not exist');
    }

    // Determine Narrator
    const finalNarratorId = narratorId || story.narratorId;
    const narrator = await Narrator.findById(finalNarratorId);

    // Calculate episode index if not provided
    let finalEpNumber = Number(episodeNumber);
    if (!finalEpNumber || isNaN(finalEpNumber)) {
      const existingCount = await Episode.countDocuments({ storyId });
      finalEpNumber = existingCount + 1;
    }

    const newEpisode = await Episode.create({
      storyId,
      storyTitle: story.title,
      episodeNumber: finalEpNumber,
      title: title.trim(),
      description: description ? description.trim() : '',
      narratorId: finalNarratorId,
      narratorName: narrator ? narrator.name : story.narratorName,
      duration: duration || '25m 30s',
      durationSeconds: Number(durationSeconds) || 1530,
      audioUrl: audioUrl.trim(),
      thumbnail: thumbnail || story.coverImage,
      status: status || 'Published',
      releaseDate: releaseDate || new Date().toISOString().split('T')[0],
      fileSize: fileSize || '32.4 MB',
      listenCount: 0,
    });

    // Update Story totalEpisodes count
    const totalEpCount = await Episode.countDocuments({ storyId });
    await Story.findByIdAndUpdate(storyId, { totalEpisodes: totalEpCount });

    // Update Narrator episodeCount
    if (narrator) {
      await Narrator.findByIdAndUpdate(finalNarratorId, { $inc: { episodeCount: 1 } });
    }

    await notify({
      text: `New episode added: "${newEpisode.title}" (${newEpisode.storyTitle})`,
      type: 'episode',
      link: '/episodes',
      metadata: { entityId: newEpisode._id, title: newEpisode.title, storyTitle: newEpisode.storyTitle, action: 'create' },
    });

    // Automatic Listener Notification Trigger (Phase 4)
    if (newEpisode.status === 'Published') {
      onEpisodePublished(newEpisode).catch((err) =>
        console.error('[NotificationTriggerService] Episode publish error:', err.message)
      );
    }

    return sendSuccess(
      res,
      201,
      `Episode "${newEpisode.title}" created successfully`,
      newEpisode
    );
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update episode details
 * @route   PUT /api/episodes/:id
 * @access  Private (Admin)
 */
const updateEpisode = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return sendError(res, 400, 'Invalid Episode ID format');
    }

    const episode = await Episode.findById(id);
    if (!episode) {
      return sendError(res, 404, `Episode with ID "${id}" not found`);
    }

    const {
      storyId,
      episodeNumber,
      title,
      description,
      narratorId,
      duration,
      durationSeconds,
      audioUrl,
      thumbnail,
      status,
      releaseDate,
      fileSize,
      listenCount,
    } = req.body;

    if (storyId && storyId !== String(episode.storyId)) {
      const newStory = await Story.findById(storyId);
      if (newStory) {
        episode.storyId = storyId;
        episode.storyTitle = newStory.title;
      }
    }

    if (narratorId && narratorId !== String(episode.narratorId)) {
      const newNarrator = await Narrator.findById(narratorId);
      if (newNarrator) {
        episode.narratorId = narratorId;
        episode.narratorName = newNarrator.name;
      }
    }

    const prevStatus = episode.status;
    if (episodeNumber !== undefined) episode.episodeNumber = Number(episodeNumber);
    if (title) episode.title = title.trim();
    if (description !== undefined) episode.description = description.trim();
    if (duration) episode.duration = duration;
    if (durationSeconds !== undefined) episode.durationSeconds = Number(durationSeconds);
    if (audioUrl) episode.audioUrl = audioUrl.trim();
    if (thumbnail) episode.thumbnail = thumbnail;
    if (status) episode.status = status;
    if (releaseDate) episode.releaseDate = releaseDate;
    if (fileSize) episode.fileSize = fileSize;
    if (listenCount !== undefined) episode.listenCount = Number(listenCount);

    const updatedEpisode = await episode.save();

    await notify({
      text: `Episode updated: "${updatedEpisode.title}"`,
      type: 'episode',
      link: '/episodes',
      metadata: { entityId: updatedEpisode._id, title: updatedEpisode.title, action: 'update' },
    });

    // Automatic Listener Notification Trigger: only on transition to Published
    if (prevStatus !== 'Published' && updatedEpisode.status === 'Published') {
      onEpisodePublished(updatedEpisode).catch((err) =>
        console.error('[NotificationTriggerService] Episode publish transition error:', err.message)
      );
    }

    return sendSuccess(
      res,
      200,
      `Episode "${updatedEpisode.title}" updated successfully`,
      updatedEpisode
    );
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Toggle episode publication status (Published <-> Draft)
 * @route   PATCH /api/episodes/:id/status
 * @access  Private (Admin)
 */
const toggleEpisodeStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return sendError(res, 400, 'Invalid Episode ID format');
    }

    const episode = await Episode.findById(id);
    if (!episode) {
      return sendError(res, 404, `Episode with ID "${id}" not found`);
    }

    const prevStatus = episode.status;
    if (status && ['Published', 'Draft', 'Scheduled'].includes(status)) {
      episode.status = status;
    } else {
      episode.status = episode.status === 'Published' ? 'Draft' : 'Published';
    }

    await episode.save();

    await notify({
      text: `Episode status changed to ${episode.status}: "${episode.title}"`,
      type: 'episode',
      link: '/episodes',
      metadata: { entityId: episode._id, title: episode.title, action: 'status_toggle' },
    });

    // Automatic Listener Notification Trigger: only on transition to Published
    if (prevStatus !== 'Published' && episode.status === 'Published') {
      onEpisodePublished(episode).catch((err) =>
        console.error('[NotificationTriggerService] Episode publish toggle error:', err.message)
      );
    }

    return sendSuccess(
      res,
      200,
      `Episode status changed to ${episode.status}`,
      {
        id: episode._id,
        status: episode.status,
        updatedAt: episode.updatedAt,
      }
    );
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete episode
 * @route   DELETE /api/episodes/:id
 * @access  Private (Admin)
 */
const deleteEpisode = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return sendError(res, 400, 'Invalid Episode ID format');
    }

    const episode = await Episode.findById(id);
    if (!episode) {
      return sendError(res, 404, `Episode with ID "${id}" not found`);
    }

    const parentStoryId = episode.storyId;
    const narratorId = episode.narratorId;

    await Episode.findByIdAndDelete(id);

    // Update parent story totalEpisodes
    const remainingCount = await Episode.countDocuments({ storyId: parentStoryId });
    await Story.findByIdAndUpdate(parentStoryId, { totalEpisodes: remainingCount });

    // Decrement narrator episodeCount
    if (narratorId) {
      await Narrator.findByIdAndUpdate(narratorId, { $inc: { episodeCount: -1 } });
    }

    await notify({
      text: `Episode deleted: "${episode.title}"`,
      type: 'episode',
      metadata: { entityId: episode._id, title: episode.title, action: 'delete' },
    });

    return sendSuccess(
      res,
      200,
      `Episode "${episode.title}" deleted successfully`
    );
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Download audio narration track for an episode
 *          Enforces planLimits.downloadAllowed as single source of truth.
 * @route   GET /api/episodes/:id/download
 * @access  Public / Listener / Plan Permission Protected
 */
const downloadEpisodeAudio = async (req, res, next) => {
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

    // 2. Validate Episode ID
    if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
      return sendError(res, 400, 'Invalid Episode ID format');
    }

    const episode = await Episode.findById(id);
    if (!episode) {
      return sendError(res, 404, 'Episode not found');
    }

    if (!episode.audioUrl || !episode.audioUrl.trim()) {
      return sendError(res, 404, 'Audio track is not available for this episode');
    }

    // Format clean filename for download attachment
    const safeStory = (episode.storyTitle || 'AudioStory').replace(/[^a-zA-Z0-9_-]/g, '_');
    const safeTitle = (episode.title || `Episode_${episode.episodeNumber}`).replace(/[^a-zA-Z0-9_-]/g, '_');
    const downloadFilename = `${safeStory}_Ep${episode.episodeNumber}_${safeTitle}.mp3`;

    // 3. Check if audioUrl is a local uploaded file
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

    // 4. Remote audio URL streaming with fallback
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

    // 5. Fallback to available local audio narration file if remote third-party URL expired
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
  getAllEpisodes,
  getEpisodesByStoryId,
  getEpisodeById,
  createEpisode,
  updateEpisode,
  toggleEpisodeStatus,
  deleteEpisode,
  downloadEpisodeAudio,
};

