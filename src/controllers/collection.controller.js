const Collection = require('../models/Collection');
const Story = require('../models/Story');
const { sendSuccess, sendError } = require('../utils');
const { notify } = require('../utils/notification.helper');

/**
 * @desc    Get all curated story collections
 * @route   GET /api/collections
 * @access  Public (Guest) / Private (Admin)
 */
const getAllCollections = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 50,
      search,
      status,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = req.query;

    const filter = {};

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { featuredTag: { $regex: search, $options: 'i' } },
      ];
    }

    if (status && status !== 'ALL') {
      filter.status = status;
    } else if (!req.admin) {
      // Public guest users only see Published collections
      filter.status = 'Published';
    }

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 50;
    const skip = (pageNum - 1) * limitNum;

    const sortOption = {};
    sortOption[sortBy] = sortOrder === 'asc' ? 1 : -1;

    const totalCollections = await Collection.countDocuments(filter);
    const collections = await Collection.find(filter)
      .populate('storyIds', 'title shortDescription coverImage categoryName narratorName rating totalEpisodes totalDuration duration storyType language releaseDate listenCount status')
      .sort(sortOption)
      .skip(skip)
      .limit(limitNum);

    return sendSuccess(res, 200, 'Collections retrieved successfully', {
      collections,
      pagination: {
        total: totalCollections,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(totalCollections / limitNum) || 1,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get single collection by ID or Slug with full populated stories
 * @route   GET /api/collections/:id
 * @access  Public (Guest) / Private (Admin)
 */
const getCollectionById = async (req, res, next) => {
  try {
    const { id } = req.params;
    let collection;

    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      collection = await Collection.findById(id).populate(
        'storyIds',
        'title shortDescription fullDescription coverImage categoryName narratorName rating totalEpisodes totalDuration duration storyType language releaseDate listenCount status'
      );
    } else {
      // Find by slug or title regex
      const nameRegex = new RegExp(`^${id.replace(/-/g, ' ')}$`, 'i');
      collection = await Collection.findOne({
        $or: [
          { slug: id.toLowerCase() },
          { name: { $regex: nameRegex } },
          { name: { $regex: new RegExp(id.replace(/-/g, '.*'), 'i') } },
        ],
      }).populate(
        'storyIds',
        'title shortDescription fullDescription coverImage categoryName narratorName rating totalEpisodes totalDuration duration storyType language releaseDate listenCount status'
      );
    }

    if (!collection) {
      return sendError(res, 404, `Collection with identifier "${id}" not found`);
    }

    // Hide draft collections from public guests
    if (!req.admin && collection.status !== 'Published') {
      return sendError(res, 404, 'Collection is not available');
    }

    return sendSuccess(res, 200, 'Collection details retrieved', collection);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Create a new story collection
 * @route   POST /api/collections
 * @access  Private (Admin)
 */
const createCollection = async (req, res, next) => {
  try {
    const {
      name,
      description,
      coverImage,
      storyIds = [],
      status = 'Published',
      featuredTag,
    } = req.body;

    if (!name || !name.trim()) {
      return sendError(res, 400, 'Collection name is required');
    }

    // Validate storyIds if provided
    let validStoryIds = [];
    if (Array.isArray(storyIds) && storyIds.length > 0) {
      validStoryIds = storyIds.filter((sId) =>
        typeof sId === 'string' && sId.match(/^[0-9a-fA-F]{24}$/)
      );
    }

    const newCollection = await Collection.create({
      name: name.trim(),
      description: description ? description.trim() : '',
      coverImage:
        coverImage ||
        'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=600&auto=format&fit=crop&q=80',
      storyIds: validStoryIds,
      storyCount: validStoryIds.length,
      status: status || 'Published',
      featuredTag: featuredTag ? featuredTag.trim() : '',
    });

    const populatedCollection = await Collection.findById(newCollection._id).populate(
      'storyIds',
      'title coverImage categoryName narratorName rating totalEpisodes'
    );

    await notify({
      text: `Curated collection created: "${newCollection.name}"`,
      type: 'collection',
      link: '/collections',
      metadata: { entityId: newCollection._id, name: newCollection.name, action: 'create' },
    });

    return sendSuccess(
      res,
      201,
      `Collection "${newCollection.name}" created successfully`,
      populatedCollection
    );
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update collection details
 * @route   PUT /api/collections/:id
 * @access  Private (Admin)
 */
const updateCollection = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return sendError(res, 400, 'Invalid Collection ID format');
    }

    const collection = await Collection.findById(id);
    if (!collection) {
      return sendError(res, 404, `Collection with ID "${id}" not found`);
    }

    const { name, description, coverImage, storyIds, status, featuredTag } = req.body;

    if (name) collection.name = name.trim();
    if (description !== undefined) collection.description = description.trim();
    if (coverImage) collection.coverImage = coverImage;
    if (status) collection.status = status;
    if (featuredTag !== undefined) collection.featuredTag = featuredTag.trim();

    if (storyIds !== undefined && Array.isArray(storyIds)) {
      collection.storyIds = storyIds.filter((sId) =>
        typeof sId === 'string' && sId.match(/^[0-9a-fA-F]{24}$/)
      );
      collection.storyCount = collection.storyIds.length;
    }

    await collection.save();

    const updatedCollection = await Collection.findById(id).populate(
      'storyIds',
      'title coverImage categoryName narratorName rating totalEpisodes'
    );

    await notify({
      text: `Collection updated: "${collection.name}"`,
      type: 'collection',
      link: '/collections',
      metadata: { entityId: collection._id, name: collection.name, action: 'update' },
    });

    return sendSuccess(
      res,
      200,
      `Collection "${collection.name}" updated successfully`,
      updatedCollection
    );
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Toggle collection status (Published <-> Draft)
 * @route   PATCH /api/collections/:id/status
 * @access  Private (Admin)
 */
const toggleCollectionStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return sendError(res, 400, 'Invalid Collection ID format');
    }

    const collection = await Collection.findById(id);
    if (!collection) {
      return sendError(res, 404, `Collection with ID "${id}" not found`);
    }

    if (status && ['Published', 'Draft'].includes(status)) {
      collection.status = status;
    } else {
      collection.status = collection.status === 'Published' ? 'Draft' : 'Published';
    }

    await collection.save();

    await notify({
      text: `Collection status changed to ${collection.status}: "${collection.name}"`,
      type: 'collection',
      link: '/collections',
      metadata: { entityId: collection._id, name: collection.name, action: 'status_toggle' },
    });

    return sendSuccess(
      res,
      200,
      `Collection status changed to ${collection.status}`,
      {
        id: collection._id,
        status: collection.status,
        updatedAt: collection.updatedAt,
      }
    );
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete collection
 * @route   DELETE /api/collections/:id
 * @access  Private (Admin)
 */
const deleteCollection = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return sendError(res, 400, 'Invalid Collection ID format');
    }

    const collection = await Collection.findById(id);
    if (!collection) {
      return sendError(res, 404, `Collection with ID "${id}" not found`);
    }

    await Collection.findByIdAndDelete(id);

    await notify({
      text: `Collection deleted: "${collection.name}"`,
      type: 'collection',
      metadata: { entityId: collection._id, name: collection.name, action: 'delete' },
    });

    return sendSuccess(
      res,
      200,
      `Collection "${collection.name}" deleted successfully`
    );
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAllCollections,
  getCollectionById,
  createCollection,
  updateCollection,
  toggleCollectionStatus,
  deleteCollection,
};
