const mongoose = require('mongoose');
const User = require('../models/User');
const Plan = require('../models/Plan');

function escapeRegex(text) {
  return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
}

/**
 * Validates action link:
 * - Must start with '/' for internal application route, or be empty.
 * - Prevents protocol-relative URLs ('//evil.com') and external URLs ('http://', etc.).
 * - Prevents unsafe schemes ('javascript:', 'data:', etc.).
 */
function validateActionLink(link) {
  if (!link || typeof link !== 'string' || !link.trim()) {
    return { isValid: true, sanitized: '' };
  }
  const trimmed = link.trim();

  // Disallow control characters or newlines
  if (/[\r\n\t\0]/.test(trimmed)) {
    return {
      isValid: false,
      message: 'Action link contains invalid control characters',
    };
  }

  // Must be an internal path
  if (!trimmed.startsWith('/')) {
    return {
      isValid: false,
      message: 'Action link must be an internal path starting with "/" (e.g. "/stories/the-alchemist", "/subscription")',
    };
  }

  // Prevent protocol-relative URLs
  if (trimmed.startsWith('//')) {
    return {
      isValid: false,
      message: 'Protocol-relative external links ("//...") are strictly forbidden',
    };
  }

  // Prevent dangerous schemes embedded after slash
  if (/^\/(?:javascript|data|vbscript):/i.test(trimmed)) {
    return {
      isValid: false,
      message: 'Unsafe script scheme detected in action link',
    };
  }

  return { isValid: true, sanitized: trimmed };
}

/**
 * Checks for sensitive data leaks (credit card numbers, CVVs, passwords) in message content
 */
function checkSensitiveContent(text) {
  if (!text || typeof text !== 'string') return { isSafe: true };

  // Credit card pattern: 13 to 19 digits with optional hyphens/spaces
  const ccRegex = /\b(?:\d[ -]*?){13,19}\b/;
  if (ccRegex.test(text)) {
    const rawDigits = text.match(ccRegex)[0].replace(/\D/g, '');
    if (rawDigits.length >= 13 && rawDigits.length <= 19) {
      return {
        isSafe: false,
        message: 'Notification content appears to contain a credit card number or sensitive account credential',
      };
    }
  }

  // Password / CVV / API Key pattern
  if (/\b(?:cvv|cvv2|card\s*number|password\s*[:=]|secret\s*key)\b/i.test(text)) {
    return {
      isSafe: false,
      message: 'Notification content contains prohibited sensitive keywords (e.g. CVV, password, card number)',
    };
  }

  return { isSafe: true };
}

/**
 * Resolves recipient audience dynamically using existing database source of truth
 */
async function resolveAudience({ audience, targetTier, targetGenre, targetUserId, targetUserIds }) {
  const baseFilter = {
    role: 'listener',
    status: { $ne: 'Suspended' },
  };

  switch (audience) {
    case 'all': {
      const recipients = await User.find(baseFilter).select('_id name email plan');
      return { recipients, targetTierName: 'All Listeners' };
    }

    case 'tier': {
      if (!targetTier || typeof targetTier !== 'string' || !targetTier.trim()) {
        throw new Error('targetTier is required when audience is set to "tier"');
      }

      const normalizedTier = targetTier.trim().toLowerCase();

      // Case 1: Generic "free" tier
      if (normalizedTier === 'free' || normalizedTier === 'free listener' || normalizedTier === 'plan-free') {
        const freePlanDocs = await Plan.find({ price: 0 });
        const freeNames = freePlanDocs.map((p) => p.name);

        const recipients = await User.find({
          ...baseFilter,
          $or: [
            { plan: { $regex: /^free/i } },
            { plan: { $in: [...freeNames, 'Free', 'Free Listener', 'none', '', null] } },
            { subscriptionStatus: { $in: ['none', 'expired'] } },
          ],
        }).select('_id name email plan');

        return { recipients, targetTierName: 'Free Tier Listeners' };
      }

      // Case 2: Generic "paid" tier
      if (normalizedTier === 'paid' || normalizedTier === 'all-paid') {
        const recipients = await User.find({
          ...baseFilter,
          plan: { $not: /^free/i },
        }).select('_id name email plan');

        return { recipients, targetTierName: 'All Paid Subscribers' };
      }

      // Case 3: Specific Plan from database
      let planDoc = null;
      if (mongoose.Types.ObjectId.isValid(targetTier)) {
        planDoc = await Plan.findById(targetTier);
      }
      if (!planDoc) {
        planDoc = await Plan.findOne({
          $or: [
            { slug: normalizedTier },
            { name: { $regex: `^${escapeRegex(targetTier.trim())}$`, $options: 'i' } },
          ],
        });
      }

      if (!planDoc) {
        throw new Error(`Subscription plan "${targetTier}" does not exist in subscription plans`);
      }

      const query = {
        ...baseFilter,
        $or: [
          { plan: { $regex: `^${escapeRegex(planDoc.name)}$`, $options: 'i' } },
          { plan: { $regex: `^${escapeRegex(planDoc.slug)}$`, $options: 'i' } },
        ],
      };

      const recipients = await User.find(query).select('_id name email plan');
      return { recipients, targetTierName: planDoc.name };
    }

    case 'genre': {
      if (!targetGenre || typeof targetGenre !== 'string' || !targetGenre.trim()) {
        throw new Error('targetGenre is required when audience is set to "genre"');
      }

      const recipients = await User.find({
        ...baseFilter,
        favoriteGenres: { $regex: `^${escapeRegex(targetGenre.trim())}$`, $options: 'i' },
      }).select('_id name email plan favoriteGenres');

      return { recipients, targetTierName: `Genre: ${targetGenre.trim()}` };
    }

    case 'individual': {
      if (targetUserIds && Array.isArray(targetUserIds) && targetUserIds.length > 0) {
        const validIds = targetUserIds.filter((id) => mongoose.Types.ObjectId.isValid(id));
        if (validIds.length === 0) {
          throw new Error('No valid listener user IDs provided in targetUserIds');
        }

        const recipients = await User.find({
          _id: { $in: validIds },
          ...baseFilter,
        }).select('_id name email plan');

        return { recipients, targetTierName: `${recipients.length} Selected Listeners` };
      }

      if (!targetUserId) {
        throw new Error('targetUserId is required when audience is set to "individual"');
      }

      if (!mongoose.Types.ObjectId.isValid(targetUserId)) {
        throw new Error('Invalid targetUserId format');
      }

      const user = await User.findOne({
        _id: targetUserId,
        ...baseFilter,
      }).select('_id name email plan');

      if (!user) {
        throw new Error(`Listener with ID "${targetUserId}" not found or account is suspended`);
      }

      return { recipients: [user], targetTierName: `Individual: ${user.name} (${user.email})` };
    }

    default:
      throw new Error(`Invalid audience criteria: "${audience}". Allowed: 'all', 'tier', 'genre', 'individual'`);
  }
}

module.exports = {
  validateActionLink,
  checkSensitiveContent,
  resolveAudience,
};
