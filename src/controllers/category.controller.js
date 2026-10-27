const Category = require('../models/Category');
const { sendSuccess, sendError } = require('../utils');
const { notify } = require('../utils/notification.helper');

/**
 * @desc    Get all categories (with optional search and status filter)
 * @route   GET /api/categories
 * @access  Public / Admin
 */
const getAllCategories = async (req, res, next) => {
  try {
    const { search, status } = req.query;
    const filter = {};

    if (search && search.trim()) {
      filter.$or = [
        { name: { $regex: search.trim(), $options: 'i' } },
        { description: { $regex: search.trim(), $options: 'i' } },
      ];
    }

    if (status && ['Active', 'Inactive'].includes(status)) {
      filter.status = status;
    } else if (!req.admin) {
      filter.status = 'Active';
    }

    const categories = await Category.find(filter).sort({ createdAt: -1 });

    return sendSuccess(res, 200, 'Categories retrieved successfully', {
      count: categories.length,
      categories,
    });
  } catch (error) {
    next(error);
  }
};


/**
 * @desc    Get single category by ID or Slug
 * @route   GET /api/categories/:id
 * @access  Public / Admin
 */
const getCategoryById = async (req, res, next) => {
  try {
    const { id } = req.params;
    let category;

    // Check if ID is a valid MongoDB ObjectId or search by slug/name
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      category = await Category.findById(id);
    } else {
      const cleanSlug = id.toLowerCase().trim();
      category = await Category.findOne({
        $or: [
          { slug: cleanSlug },
          { slug: { $regex: `^${cleanSlug}`, $options: 'i' } },
          { slug: { $regex: cleanSlug, $options: 'i' } },
          { name: { $regex: new RegExp(`^${cleanSlug.replace(/-/g, ' ')}$`, 'i') } },
          { name: { $regex: cleanSlug.replace(/-/g, '.*'), $options: 'i' } },
        ],
      });
    }

    if (!category) {
      return sendError(res, 404, `Category with identifier "${id}" not found`);
    }

    return sendSuccess(res, 200, 'Category details retrieved', category);
  } catch (error) {
    next(error);
  }
};


/**
 * @desc    Create a new story category
 * @route   POST /api/categories
 * @access  Private (Admin)
 */
const createCategory = async (req, res, next) => {
  try {
    const { name, slug, description, coverImage, accentColor, status } = req.body;

    if (!name || !name.trim()) {
      return sendError(res, 400, 'Category name is required');
    }

    // Generate or format slug
    const formattedSlug = (slug || name)
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '');

    // Check if slug/name already exists
    const existingCategory = await Category.findOne({ slug: formattedSlug });
    if (existingCategory) {
      return sendError(
        res,
        400,
        `Category with slug "${formattedSlug}" already exists`
      );
    }

    const newCategory = await Category.create({
      name: name.trim(),
      slug: formattedSlug,
      description: description ? description.trim() : '',
      coverImage:
        coverImage ||
        'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=600&auto=format&fit=crop&q=80',
      accentColor: accentColor || '#8b5cf6',
      status: status || 'Active',
      storyCount: 0,
    });

    await notify({
      text: `New category created: "${newCategory.name}"`,
      type: 'category',
      link: '/categories',
      metadata: { entityId: newCategory._id, name: newCategory.name, action: 'create' },
    });

    return sendSuccess(
      res,
      201,
      `Category "${newCategory.name}" created successfully`,
      newCategory
    );
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update an existing category
 * @route   PUT /api/categories/:id
 * @access  Private (Admin)
 */
const updateCategory = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, slug, description, coverImage, accentColor, status } = req.body;

    const category = await Category.findById(id);
    if (!category) {
      return sendError(res, 404, `Category with ID "${id}" not found`);
    }

    if (name) category.name = name.trim();

    if (slug) {
      const formattedSlug = slug
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, '')
        .replace(/[\s_-]+/g, '-')
        .replace(/^-+|-+$/g, '');

      const slugExists = await Category.findOne({
        slug: formattedSlug,
        _id: { $ne: id },
      });

      if (slugExists) {
        return sendError(
          res,
          400,
          `Category with slug "${formattedSlug}" already exists`
        );
      }
      category.slug = formattedSlug;
    }

    if (description !== undefined) category.description = description.trim();
    if (coverImage) category.coverImage = coverImage;
    if (accentColor) category.accentColor = accentColor;
    if (status && ['Active', 'Inactive'].includes(status)) category.status = status;

    const updatedCategory = await category.save();

    await notify({
      text: `Category updated: "${updatedCategory.name}"`,
      type: 'category',
      link: '/categories',
      metadata: { entityId: updatedCategory._id, name: updatedCategory.name, action: 'update' },
    });

    return sendSuccess(
      res,
      200,
      `Category "${updatedCategory.name}" updated successfully`,
      updatedCategory
    );
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete a category
 * @route   DELETE /api/categories/:id
 * @access  Private (Admin)
 */
const deleteCategory = async (req, res, next) => {
  try {
    const { id } = req.params;

    const category = await Category.findById(id);
    if (!category) {
      return sendError(res, 404, `Category with ID "${id}" not found`);
    }

    await Category.findByIdAndDelete(id);

    await notify({
      text: `Category deleted: "${category.name}"`,
      type: 'category',
      metadata: { entityId: category._id, name: category.name, action: 'delete' },
    });

    return sendSuccess(
      res,
      200,
      `Category "${category.name}" deleted successfully`
    );
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAllCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory,
};
