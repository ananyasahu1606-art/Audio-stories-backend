const Narrator = require('../models/Narrator');
const { sendSuccess, sendError } = require('../utils');
const { notify } = require('../utils/notification.helper');

/**
 * @desc    Get all narrators (with search, language & status filters)
 * @route   GET /api/narrators
 * @access  Public / Admin
 */
const getAllNarrators = async (req, res, next) => {
  try {
    const { search, language, status } = req.query;
    const filter = {};

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { voiceStyle: { $regex: search, $options: 'i' } },
        { bio: { $regex: search, $options: 'i' } },
      ];
    }

    if (language) {
      filter.language = { $regex: language, $options: 'i' };
    }

    if (status && ['Active', 'Inactive'].includes(status)) {
      filter.status = status;
    }

    const narrators = await Narrator.find(filter).sort({ rating: -1, createdAt: -1 });

    return sendSuccess(res, 200, 'Narrators retrieved successfully', {
      count: narrators.length,
      narrators,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get single narrator details
 * @route   GET /api/narrators/:id
 * @access  Public / Admin
 */
const getNarratorById = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return sendError(res, 400, 'Invalid Narrator ID format');
    }

    const narrator = await Narrator.findById(id);

    if (!narrator) {
      return sendError(res, 404, `Narrator with ID "${id}" not found`);
    }

    return sendSuccess(res, 200, 'Narrator portfolio retrieved', narrator);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Onboard / Create a new narrator
 * @route   POST /api/narrators
 * @access  Private (Admin)
 */
const createNarrator = async (req, res, next) => {
  try {
    const { name, profileImage, bio, language, voiceStyle, status } = req.body;

    if (!name || !name.trim()) {
      return sendError(res, 400, 'Narrator name is required');
    }

    if (!voiceStyle || !voiceStyle.trim()) {
      return sendError(res, 400, 'Voice style description is required');
    }

    const newNarrator = await Narrator.create({
      name: name.trim(),
      profileImage:
        profileImage ||
        'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&auto=format&fit=crop&q=80',
      bio: bio ? bio.trim() : '',
      language: language ? language.trim() : 'English (British RP)',
      voiceStyle: voiceStyle.trim(),
      status: status || 'Active',
      storyCount: 0,
      episodeCount: 0,
      rating: 5.0,
      totalListens: 0,
      joinedDate: new Date().toISOString().split('T')[0],
    });

    await notify({
      text: `New narrator onboarded: ${newNarrator.name}`,
      type: 'narrator',
      link: '/narrators',
      metadata: { entityId: newNarrator._id, name: newNarrator.name, action: 'create' },
    });

    return sendSuccess(
      res,
      201,
      `Narrator "${newNarrator.name}" onboarded successfully`,
      newNarrator
    );
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update narrator profile
 * @route   PUT /api/narrators/:id
 * @access  Private (Admin)
 */
const updateNarrator = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, profileImage, bio, language, voiceStyle, status, rating, totalListens } = req.body;

    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return sendError(res, 400, 'Invalid Narrator ID format');
    }

    const narrator = await Narrator.findById(id);
    if (!narrator) {
      return sendError(res, 404, `Narrator with ID "${id}" not found`);
    }

    if (name) narrator.name = name.trim();
    if (profileImage) narrator.profileImage = profileImage;
    if (bio !== undefined) narrator.bio = bio.trim();
    if (language) narrator.language = language.trim();
    if (voiceStyle) narrator.voiceStyle = voiceStyle.trim();
    if (status && ['Active', 'Inactive'].includes(status)) narrator.status = status;
    if (rating !== undefined) narrator.rating = Number(rating);
    if (totalListens !== undefined) narrator.totalListens = Number(totalListens);

    const updatedNarrator = await narrator.save();

    await notify({
      text: `Narrator profile updated: ${updatedNarrator.name}`,
      type: 'narrator',
      link: '/narrators',
      metadata: { entityId: updatedNarrator._id, name: updatedNarrator.name, action: 'update' },
    });

    return sendSuccess(
      res,
      200,
      `Narrator "${updatedNarrator.name}" profile updated successfully`,
      updatedNarrator
    );
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete a narrator profile
 * @route   DELETE /api/narrators/:id
 * @access  Private (Admin)
 */
const deleteNarrator = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return sendError(res, 400, 'Invalid Narrator ID format');
    }

    const narrator = await Narrator.findById(id);
    if (!narrator) {
      return sendError(res, 404, `Narrator with ID "${id}" not found`);
    }

    await Narrator.findByIdAndDelete(id);

    await notify({
      text: `Narrator removed: ${narrator.name}`,
      type: 'narrator',
      metadata: { entityId: narrator._id, name: narrator.name, action: 'delete' },
    });

    return sendSuccess(
      res,
      200,
      `Narrator "${narrator.name}" removed successfully`
    );
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAllNarrators,
  getNarratorById,
  createNarrator,
  updateNarrator,
  deleteNarrator,
};
