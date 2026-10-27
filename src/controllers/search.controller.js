const Story = require('../models/Story');
const Episode = require('../models/Episode');
const Narrator = require('../models/Narrator');
const Category = require('../models/Category');
const Collection = require('../models/Collection');
const { sendSuccess, sendError } = require('../utils');

/**
 * @desc    Global Omnisearch across Stories, Episodes, Narrators, Categories & Collections
 * @route   GET /api/search
 * @access  Private (Admin)
 */
const globalSearch = async (req, res, next) => {
  try {
    const { q, query, limit = 5 } = req.query;
    const searchTerm = q || query;

    if (!searchTerm || !searchTerm.trim()) {
      return sendSuccess(res, 200, 'Empty search query', {
        query: '',
        totalResults: 0,
        results: {
          stories: [],
          episodes: [],
          narrators: [],
          categories: [],
          collections: [],
        },
      });
    }

    const regex = { $regex: searchTerm.trim(), $options: 'i' };
    const limitNum = parseInt(limit, 10) || 5;

    const [stories, episodes, narrators, categories, collections] = await Promise.all([
      Story.find({
        $or: [
          { title: regex },
          { shortDescription: regex },
          { categoryName: regex },
          { narratorName: regex },
          { tags: regex },
        ],
      })
        .select('title coverImage categoryName narratorName rating totalEpisodes listenCount')
        .limit(limitNum),

      Episode.find({
        $or: [
          { title: regex },
          { storyTitle: regex },
          { narratorName: regex },
          { description: regex },
        ],
      })
        .select('title storyTitle narratorName duration episodeNumber status')
        .limit(limitNum),

      Narrator.find({
        $or: [
          { name: regex },
          { bio: regex },
          { language: regex },
          { voiceStyle: regex },
        ],
      })
        .select('name profileImage language voiceStyle rating storyCount')
        .limit(limitNum),

      Category.find({
        $or: [{ name: regex }, { description: regex }, { slug: regex }],
      })
        .select('name slug coverImage accentColor storyCount')
        .limit(limitNum),

      Collection.find({
        $or: [{ name: regex }, { description: regex }, { featuredTag: regex }],
      })
        .select('name coverImage storyCount status featuredTag')
        .limit(limitNum),
    ]);

    const totalResults =
      stories.length +
      episodes.length +
      narrators.length +
      categories.length +
      collections.length;

    return sendSuccess(res, 200, `Search results for "${searchTerm}"`, {
      query: searchTerm.trim(),
      totalResults,
      results: {
        stories,
        episodes,
        narrators,
        categories,
        collections,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  globalSearch,
};
