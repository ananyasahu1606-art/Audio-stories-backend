const Notification = require('../models/Notification');

/**
 * Safely creates an admin notification in MongoDB
 * @param {Object} options
 * @param {string} options.text - Notification title / message
 * @param {string} options.type - 'story' | 'episode' | 'category' | 'narrator' | 'collection' | 'user' | 'review' | 'media' | 'system' | 'alert'
 * @param {string} [options.time] - 'Just now'
 * @param {string} [options.link] - optional frontend route link
 * @param {Object} [options.metadata] - related entity info (entityId, name, action, etc.)
 */
const notify = async ({ text, type = 'system', time = 'Just now', link = '', metadata = {} }) => {
  try {
    if (!text || !text.trim()) return null;
    return await Notification.create({
      text: text.trim(),
      type,
      unread: true,
      time,
      link,
      metadata,
    });
  } catch (error) {
    console.error('[Notification Helper Error]:', error.message);
    return null;
  }
};

module.exports = { notify };
