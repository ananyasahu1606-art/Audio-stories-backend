const path = require('path');
const fs = require('fs');
const Media = require('../models/Media');
const { sendSuccess, sendError } = require('../utils');
const { notify } = require('../utils/notification.helper');
const config = require('../config/env');

/**
 * Helper to format file size in human-readable string
 */
const formatBytes = (bytes) => {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

/**
 * @desc    Get all media assets with search, type filter & pagination
 * @route   GET /api/media
 * @access  Private (Admin)
 */
const getAllMedia = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 20,
      search,
      type,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = req.query;

    const filter = {};

    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { storyTitle: { $regex: search, $options: 'i' } },
        { dimensionOrDuration: { $regex: search, $options: 'i' } },
      ];
    }

    if (type && type !== 'ALL') {
      filter.type = type;
    }

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 20;
    const skip = (pageNum - 1) * limitNum;

    const sortOption = {};
    sortOption[sortBy] = sortOrder === 'asc' ? 1 : -1;

    const totalMedia = await Media.countDocuments(filter);
    const mediaItems = await Media.find(filter)
      .sort(sortOption)
      .skip(skip)
      .limit(limitNum);

    return sendSuccess(res, 200, 'Media assets retrieved successfully', {
      mediaItems,
      pagination: {
        total: totalMedia,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(totalMedia / limitNum) || 1,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get media statistics (counts of covers, audios, banners, total size)
 * @route   GET /api/media/stats
 * @access  Private (Admin)
 */
const getMediaStats = async (req, res, next) => {
  try {
    const totalItems = await Media.countDocuments();
    const coverCount = await Media.countDocuments({ type: 'cover' });
    const audioCount = await Media.countDocuments({ type: 'audio' });
    const bannerCount = await Media.countDocuments({ type: 'banner' });

    const totalBytesResult = await Media.aggregate([
      {
        $group: {
          _id: null,
          totalBytes: { $sum: '$sizeBytes' },
        },
      },
    ]);

    const totalBytes = totalBytesResult[0]?.totalBytes || 0;

    return sendSuccess(res, 200, 'Media library statistics retrieved', {
      totalItems,
      coverCount,
      audioCount,
      bannerCount,
      totalStorageBytes: totalBytes,
      formattedStorage: formatBytes(totalBytes),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get single media asset by ID
 * @route   GET /api/media/:id
 * @access  Private (Admin)
 */
const getMediaById = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return sendError(res, 400, 'Invalid Media ID format');
    }

    const media = await Media.findById(id);

    if (!media) {
      return sendError(res, 404, `Media item with ID "${id}" not found`);
    }

    return sendSuccess(res, 200, 'Media asset retrieved', media);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Upload physical media file (Image Cover, Audio MP3/WAV, Banner)
 * @route   POST /api/media/upload
 * @access  Private (Admin)
 */
const uploadMediaFile = async (req, res, next) => {
  try {
    if (!req.file) {
      return sendError(res, 400, 'No file uploaded. Please attach a file.');
    }

    const { title, type, storyTitle, dimensionOrDuration } = req.body;

    // Detect media type from MIME if not explicitly passed
    let detectedType = type;
    if (!detectedType) {
      if (req.file.mimetype.startsWith('audio/')) {
        detectedType = 'audio';
      } else if (req.file.mimetype.startsWith('image/')) {
        detectedType = 'cover';
      } else {
        detectedType = 'cover';
      }
    }

    // Build accessible URL for the uploaded file
    const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;

    const newMedia = await Media.create({
      title: title || req.file.originalname,
      type: detectedType,
      url: fileUrl,
      size: formatBytes(req.file.size),
      sizeBytes: req.file.size,
      dimensionOrDuration:
        dimensionOrDuration ||
        (detectedType === 'audio' ? 'Lossless Audio Master' : 'Original Resolution'),
      storyTitle: storyTitle ? storyTitle.trim() : '',
      mimetype: req.file.mimetype,
      uploadedAt: new Date().toISOString().split('T')[0],
    });

    await notify({
      text: `New media uploaded: "${newMedia.title}" (${newMedia.type})`,
      type: 'media',
      link: '/media',
      metadata: { mediaId: newMedia._id, title: newMedia.title, type: newMedia.type, action: 'upload' },
    });

    return sendSuccess(
      res,
      201,
      `Media asset "${newMedia.title}" uploaded successfully`,
      newMedia
    );
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Create / Add media asset record from external CDN URL (S3, Cloudinary, Freesound, Unsplash)
 * @route   POST /api/media
 * @access  Private (Admin)
 */
const createMediaRecord = async (req, res, next) => {
  try {
    const {
      title,
      type = 'cover',
      url,
      size = '3.0 MB',
      dimensionOrDuration = '',
      storyTitle = '',
    } = req.body;

    if (!title || !title.trim()) {
      return sendError(res, 400, 'Media title is required');
    }

    if (!url || !url.trim()) {
      return sendError(res, 400, 'Media URL is required');
    }

    const newMedia = await Media.create({
      title: title.trim(),
      type,
      url: url.trim(),
      size,
      dimensionOrDuration,
      storyTitle: storyTitle ? storyTitle.trim() : '',
      uploadedAt: new Date().toISOString().split('T')[0],
    });

    await notify({
      text: `New media added: "${newMedia.title}" (${newMedia.type})`,
      type: 'media',
      link: '/media',
      metadata: { mediaId: newMedia._id, title: newMedia.title, type: newMedia.type, action: 'create' },
    });

    return sendSuccess(
      res,
      201,
      `Media item "${newMedia.title}" added to library`,
      newMedia
    );
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update media metadata (title, type, dimension, story association)
 * @route   PUT /api/media/:id
 * @access  Private (Admin)
 */
const updateMedia = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return sendError(res, 400, 'Invalid Media ID format');
    }

    const media = await Media.findById(id);
    if (!media) {
      return sendError(res, 404, `Media asset with ID "${id}" not found`);
    }

    const { title, type, dimensionOrDuration, storyTitle, size, url } = req.body;

    if (title) media.title = title.trim();
    if (type) media.type = type;
    if (dimensionOrDuration !== undefined) media.dimensionOrDuration = dimensionOrDuration;
    if (storyTitle !== undefined) media.storyTitle = storyTitle.trim();
    if (size) media.size = size;
    if (url) media.url = url.trim();

    const updatedMedia = await media.save();

    return sendSuccess(
      res,
      200,
      `Media asset "${updatedMedia.title}" updated successfully`,
      updatedMedia
    );
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete media asset (and unlink physical local file if applicable)
 * @route   DELETE /api/media/:id
 * @access  Private (Admin)
 */
const deleteMedia = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return sendError(res, 400, 'Invalid Media ID format');
    }

    const media = await Media.findById(id);
    if (!media) {
      return sendError(res, 404, `Media asset with ID "${id}" not found`);
    }

    // If file is stored locally in /uploads/, delete it from disk
    if (media.url && media.url.includes('/uploads/')) {
      const filename = media.url.split('/uploads/').pop();
      const localFilePath = path.join(__dirname, '../../uploads', filename);
      if (fs.existsSync(localFilePath)) {
        try {
          fs.unlinkSync(localFilePath);
        } catch (e) {
          console.warn('[Media Delete] Could not unlink local file:', e.message);
        }
      }
    }

    await Media.findByIdAndDelete(id);

    await notify({
      text: `Media asset "${media.title}" was deleted`,
      type: 'media',
      link: '/media',
      metadata: { mediaId: media._id, title: media.title, action: 'delete' },
    });

    return sendSuccess(res, 200, `Media asset "${media.title}" deleted successfully`);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAllMedia,
  getMediaStats,
  getMediaById,
  uploadMediaFile,
  createMediaRecord,
  updateMedia,
  deleteMedia,
};
