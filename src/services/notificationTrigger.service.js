const mongoose = require('mongoose');
const UserNotification = require('../models/UserNotification');
const NotificationCampaign = require('../models/NotificationCampaign');
const User = require('../models/User');
const Story = require('../models/Story');
const ListeningHistory = require('../models/ListeningHistory');
const Setting = require('../models/Setting');

/**
 * Checks platform notification settings to see if an automatic trigger is enabled
 */
async function isNotificationEnabled(eventType) {
  try {
    const setting = await Setting.findOne();
    if (!setting || !setting.notifications) return true;
    if (setting.notifications.enableAutomaticNotifications === false) return false;

    switch (eventType) {
      case 'story':
        return setting.notifications.notifyOnStoryPublished !== false;
      case 'episode':
        return setting.notifications.notifyOnEpisodePublished !== false;
      case 'subscription_activated':
        return setting.notifications.notifyOnSubscriptionActivated !== false;
      case 'subscription_cancelled':
        return setting.notifications.notifyOnSubscriptionCancelled !== false;
      case 'subscription_expired':
        return setting.notifications.notifyOnSubscriptionExpired !== false;
      default:
        return true;
    }
  } catch {
    return true;
  }
}

/**
 * Helper to escape regex special characters
 */
function escapeRegex(str) {
  return typeof str === 'string' ? str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : '';
}

/**
 * Format a Date object into human-readable date (e.g., "Oct 25, 2026")
 */
function formatDate(date) {
  if (!date) return '';
  try {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return String(date);
  }
}

/**
 * Safely creates or retrieves an automatic NotificationCampaign record.
 * This links automatic backend event notifications into the Admin Notifications view.
 */
async function getOrCreateAutomaticCampaign({
  title,
  message,
  type,
  actionLink,
  audience,
  targetGenre,
  targetTierName,
  targetUserId,
  recipientCount,
  eventId,
  metadata,
}) {
  try {
    let campaign = await NotificationCampaign.findOne({ eventId });
    if (!campaign) {
      campaign = await NotificationCampaign.create({
        title,
        message,
        type,
        actionLink: actionLink || '',
        audience: audience || 'all',
        targetGenre: targetGenre || '',
        targetTierName: targetTierName || '',
        targetUserId: targetUserId || null,
        status: 'sent',
        recipientCount: recipientCount || 0,
        sentAt: new Date(),
        eventId,
        isAutomatic: true,
        metadata: {
          ...metadata,
          isAutomatic: true,
          eventId,
        },
      });
    } else if (recipientCount && campaign.recipientCount !== recipientCount) {
      campaign.recipientCount = recipientCount;
      await campaign.save();
    }
    return campaign;
  } catch (err) {
    if (err.code === 11000) {
      return await NotificationCampaign.findOne({ eventId });
    }
    console.error('[NotificationTriggerService] Error recording automatic campaign:', err.message);
    return null;
  }
}

/**
 * Safely inserts listener notifications in batches with duplicate prevention
 */
async function insertListenerNotificationsSafely(notifications) {
  if (!notifications || !Array.isArray(notifications) || notifications.length === 0) {
    return 0;
  }

  try {
    const inserted = await UserNotification.insertMany(notifications, { ordered: false });
    return inserted.length;
  } catch (error) {
    // If some notifications were duplicates (Mongo code 11000), insertMany with ordered:false
    // still inserts the non-duplicates. We extract insertedCount safely.
    if (error.code === 11000 || error.writeErrors) {
      const insertedCount = error.insertedDocs ? error.insertedDocs.length : 0;
      return insertedCount;
    }
    console.error('[NotificationTriggerService] Error inserting notifications:', error.message);
    return 0;
  }
}

/**
 * Trigger: Story Publication
 * Runs when a story is published for the first time or transitions from Draft to Published.
 * Notifies listeners matching the story's genre or category in User.favoriteGenres.
 */
async function onStoryPublished(story) {
  try {
    if (!story || !story._id || story.status !== 'Published') {
      return 0;
    }

    if (!(await isNotificationEnabled('story'))) {
      return 0;
    }

    const storyId = story._id.toString();
    const eventId = `story:publish:${storyId}`;

    // Collect genre keywords from the story
    const candidateKeywords = [
      story.categoryName,
      story.storyType,
      ...(Array.isArray(story.tags) ? story.tags : []),
    ]
      .filter((k) => typeof k === 'string' && k.trim().length > 0)
      .map((k) => k.trim());

    if (candidateKeywords.length === 0) {
      return 0;
    }

    // Build regex filters for candidate genres
    const genreRegexes = candidateKeywords.map(
      (kw) => new RegExp(`^${escapeRegex(kw)}$`, 'i')
    );

    // Query active listeners whose favoriteGenres include any of the candidate keywords
    const matchingListeners = await User.find({
      status: { $ne: 'Suspended' },
      favoriteGenres: { $in: genreRegexes },
    }).select('_id name email favoriteGenres');

    if (matchingListeners.length === 0) {
      return 0;
    }

    const candidateUserIds = matchingListeners.map((u) => u._id);

    // Filter out users who have already received this specific story publication event
    const alreadyNotified = await UserNotification.find({
      eventId,
      userId: { $in: candidateUserIds },
    }).distinct('userId');

    const alreadyNotifiedSet = new Set(alreadyNotified.map((id) => id.toString()));
    const targetListeners = matchingListeners.filter(
      (u) => !alreadyNotifiedSet.has(u._id.toString())
    );

    if (targetListeners.length === 0) {
      return 0;
    }

    const storyCategory = story.categoryName || story.storyType || 'your favorite genre';
    const actionLink = `/stories/${story.slug || storyId}`;

    // Record automatic event in NotificationCampaign for Admin Notifications view
    const campaign = await getOrCreateAutomaticCampaign({
      title: `New Story: "${story.title}"`,
      message: `A new audio story in ${storyCategory} has just been released: "${story.title}". Listen now on ElevStory!`,
      type: 'story',
      actionLink,
      audience: 'genre',
      targetGenre: storyCategory,
      targetTierName: `Genre: ${storyCategory}`,
      recipientCount: targetListeners.length,
      eventId,
      metadata: {
        storyId: story._id,
        categoryName: story.categoryName,
        storyType: story.storyType,
        trigger: 'story_published',
      },
    });

    const notificationsToInsert = targetListeners.map((listener) => ({
      userId: listener._id,
      campaignId: campaign ? campaign._id : null,
      title: `New Story: "${story.title}"`,
      message: `A new audio story in ${storyCategory} has just been released: "${story.title}". Listen now on ElevStory!`,
      type: 'story',
      actionLink,
      eventId,
      metadata: {
        storyId: story._id,
        categoryName: story.categoryName,
        storyType: story.storyType,
        trigger: 'story_published',
      },
    }));

    return await insertListenerNotificationsSafely(notificationsToInsert);
  } catch (error) {
    console.error('[NotificationTriggerService] onStoryPublished failure:', error.message);
    return 0;
  }
}

/**
 * Trigger: Episode Publication
 * Runs when an episode is published or transitions from Draft to Published.
 * Notifies listeners who favorited/saved the parent story or previously listened to it.
 * Deduplicates recipient IDs so each listener receives only one notification.
 */
async function onEpisodePublished(episode) {
  try {
    if (!episode || !episode._id || episode.status !== 'Published') {
      return 0;
    }

    if (!(await isNotificationEnabled('episode'))) {
      return 0;
    }

    const episodeId = episode._id.toString();
    const storyId = episode.storyId?.toString ? episode.storyId.toString() : String(episode.storyId);
    const eventId = `episode:publish:${episodeId}`;

    if (!storyId || !mongoose.Types.ObjectId.isValid(storyId)) {
      return 0;
    }

    // 1. Find listeners who favorited or saved the parent story
    const interestedUsers = await User.find({
      status: { $ne: 'Suspended' },
      $or: [
        { favorites: new mongoose.Types.ObjectId(storyId) },
        { savedStories: new mongoose.Types.ObjectId(storyId) },
      ],
    }).select('_id');

    // 2. Find listeners who have listening history for this story
    const historyUserIds = await ListeningHistory.find({
      story: new mongoose.Types.ObjectId(storyId),
    }).distinct('user');

    // Deduplicate recipient user IDs across favorites, saved stories, and listening history
    const recipientIdSet = new Set();
    interestedUsers.forEach((u) => recipientIdSet.add(u._id.toString()));
    historyUserIds.forEach((id) => {
      if (id) recipientIdSet.add(id.toString());
    });

    if (recipientIdSet.size === 0) {
      return 0;
    }

    const candidateIds = Array.from(recipientIdSet).map((id) => new mongoose.Types.ObjectId(id));

    // Exclude listeners who already received this exact episode notification
    const alreadyNotified = await UserNotification.find({
      eventId,
      userId: { $in: candidateIds },
    }).distinct('userId');

    const alreadyNotifiedSet = new Set(alreadyNotified.map((id) => id.toString()));
    const finalRecipientIds = candidateIds.filter((id) => !alreadyNotifiedSet.has(id.toString()));

    if (finalRecipientIds.length === 0) {
      return 0;
    }

    const storyTitle = episode.storyTitle || 'your saved story';
    const epNumLabel = episode.episodeNumber ? `Episode ${episode.episodeNumber}` : 'A new chapter';
    const actionLink = `/stories/${storyId}`;

    // Record automatic event in NotificationCampaign for Admin Notifications view
    const campaign = await getOrCreateAutomaticCampaign({
      title: `New Chapter: "${episode.title}"`,
      message: `${epNumLabel} of "${storyTitle}" is now streaming: "${episode.title}". Jump in and continue listening!`,
      type: 'episode',
      actionLink,
      audience: 'individual',
      targetTierName: `Story: ${storyTitle}`,
      recipientCount: finalRecipientIds.length,
      eventId,
      metadata: {
        episodeId: episode._id,
        storyId: episode.storyId,
        episodeNumber: episode.episodeNumber,
        trigger: 'episode_published',
      },
    });

    const notificationsToInsert = finalRecipientIds.map((userId) => ({
      userId,
      campaignId: campaign ? campaign._id : null,
      title: `New Chapter: "${episode.title}"`,
      message: `${epNumLabel} of "${storyTitle}" is now streaming: "${episode.title}". Jump in and continue listening!`,
      type: 'episode',
      actionLink,
      eventId,
      metadata: {
        episodeId: episode._id,
        storyId: episode.storyId,
        episodeNumber: episode.episodeNumber,
        trigger: 'episode_published',
      },
    }));

    return await insertListenerNotificationsSafely(notificationsToInsert);
  } catch (error) {
    console.error('[NotificationTriggerService] onEpisodePublished failure:', error.message);
    return 0;
  }
}

/**
 * Trigger: Subscription Activated
 * Runs after successful payment verification or legitimate admin activation.
 */
async function onSubscriptionActivated(subscription, user) {
  try {
    if (!subscription || !subscription._id) {
      return null;
    }

    if (!(await isNotificationEnabled('subscription_activated'))) {
      return null;
    }

    const rawUserId = subscription.userId || user?._id || user?.id;
    if (!rawUserId) return null;
    const userId = rawUserId.toString();
    const subId = subscription._id.toString();
    const eventId = `sub:activate:${subId}`;

    const planName = subscription.planName || 'StoryPass Premium';
    const endDateFormatted = subscription.endDate ? formatDate(subscription.endDate) : null;
    const dateText = endDateFormatted ? ` (valid until ${endDateFormatted})` : '';

    // Record automatic event in NotificationCampaign for Admin Notifications view
    const campaign = await getOrCreateAutomaticCampaign({
      title: `StoryPass Activated: ${planName}`,
      message: `Your subscription to ${planName} is now active${dateText}! Enjoy uninterrupted, ad-free listening and all premium chapters.`,
      type: 'subscription',
      actionLink: '/subscription',
      audience: 'individual',
      targetUserId: userId,
      targetTierName: `${user?.name || 'Listener'} (${planName})`,
      recipientCount: 1,
      eventId,
      metadata: {
        subscriptionId: subscription._id,
        planName,
        endDate: subscription.endDate,
        trigger: 'subscription_activated',
      },
    });

    // Reliable deduplication check
    const existing = await UserNotification.findOne({ userId, eventId });
    if (existing) {
      if (campaign && !existing.campaignId) {
        existing.campaignId = campaign._id;
        await existing.save();
      }
      return existing;
    }

    return await UserNotification.create({
      userId,
      campaignId: campaign ? campaign._id : null,
      title: `StoryPass Activated: ${planName}`,
      message: `Your subscription to ${planName} is now active${dateText}! Enjoy uninterrupted, ad-free listening and all premium chapters.`,
      type: 'subscription',
      actionLink: '/subscription',
      eventId,
      metadata: {
        subscriptionId: subscription._id,
        planName,
        endDate: subscription.endDate,
        trigger: 'subscription_activated',
      },
    });
  } catch (error) {
    if (error.code === 11000) {
      // Caught duplicate index error safely
      return null;
    }
    console.error('[NotificationTriggerService] onSubscriptionActivated failure:', error.message);
    return null;
  }
}

/**
 * Trigger: Subscription Cancelled
 * Runs after successful cancellation of a listener's active subscription.
 */
async function onSubscriptionCancelled(subscription, user) {
  try {
    if (!subscription || !subscription._id) {
      return null;
    }

    if (!(await isNotificationEnabled('subscription_cancelled'))) {
      return null;
    }

    const rawUserId = subscription.userId || user?._id || user?.id;
    if (!rawUserId) return null;
    const userId = rawUserId.toString();
    const subId = subscription._id.toString();
    const eventId = `sub:cancel:${subId}`;

    const planName = subscription.planName || 'StoryPass Premium';
    const endDateFormatted = subscription.endDate ? formatDate(subscription.endDate) : null;
    const accessText = endDateFormatted
      ? `You will retain full access until your billing cycle ends on ${endDateFormatted}.`
      : 'You will retain access until the end of your billing period.';

    // Record automatic event in NotificationCampaign for Admin Notifications view
    const campaign = await getOrCreateAutomaticCampaign({
      title: `Subscription Cancelled: ${planName}`,
      message: `Your auto-renewal for ${planName} has been cancelled. ${accessText}`,
      type: 'subscription',
      actionLink: '/subscription',
      audience: 'individual',
      targetUserId: userId,
      targetTierName: `${user?.name || 'Listener'} (${planName})`,
      recipientCount: 1,
      eventId,
      metadata: {
        subscriptionId: subscription._id,
        planName,
        endDate: subscription.endDate,
        trigger: 'subscription_cancelled',
      },
    });

    // Reliable deduplication check
    const existing = await UserNotification.findOne({ userId, eventId });
    if (existing) {
      if (campaign && !existing.campaignId) {
        existing.campaignId = campaign._id;
        await existing.save();
      }
      return existing;
    }

    return await UserNotification.create({
      userId,
      campaignId: campaign ? campaign._id : null,
      title: `Subscription Cancelled: ${planName}`,
      message: `Your auto-renewal for ${planName} has been cancelled. ${accessText}`,
      type: 'subscription',
      actionLink: '/subscription',
      eventId,
      metadata: {
        subscriptionId: subscription._id,
        planName,
        endDate: subscription.endDate,
        trigger: 'subscription_cancelled',
      },
    });
  } catch (error) {
    if (error.code === 11000) {
      return null;
    }
    console.error('[NotificationTriggerService] onSubscriptionCancelled failure:', error.message);
    return null;
  }
}

/**
 * Trigger: Subscription Expired
 * Runs when a subscription transitions to expired state.
 */
async function onSubscriptionExpired(subscription, user) {
  try {
    if (!subscription || !subscription._id) {
      return null;
    }

    if (!(await isNotificationEnabled('subscription_expired'))) {
      return null;
    }

    const rawUserId = subscription.userId || user?._id || user?.id;
    if (!rawUserId) return null;
    const userId = rawUserId.toString();
    const subId = subscription._id.toString();
    const eventId = `sub:expire:${subId}`;

    const planName = subscription.planName || 'StoryPass Premium';

    // Record automatic event in NotificationCampaign for Admin Notifications view
    const campaign = await getOrCreateAutomaticCampaign({
      title: `StoryPass Expired: ${planName}`,
      message: `Your ${planName} subscription has expired. Upgrade or renew today to restore unrestricted access to premium audio fiction.`,
      type: 'subscription',
      actionLink: '/subscription',
      audience: 'individual',
      targetUserId: userId,
      targetTierName: `${user?.name || 'Listener'} (${planName})`,
      recipientCount: 1,
      eventId,
      metadata: {
        subscriptionId: subscription._id,
        planName,
        endDate: subscription.endDate,
        trigger: 'subscription_expired',
      },
    });

    // Reliable deduplication check
    const existing = await UserNotification.findOne({ userId, eventId });
    if (existing) {
      if (campaign && !existing.campaignId) {
        existing.campaignId = campaign._id;
        await existing.save();
      }
      return existing;
    }

    return await UserNotification.create({
      userId,
      campaignId: campaign ? campaign._id : null,
      title: `StoryPass Expired: ${planName}`,
      message: `Your ${planName} subscription has expired. Upgrade or renew today to restore unrestricted access to premium audio fiction.`,
      type: 'subscription',
      actionLink: '/subscription',
      eventId,
      metadata: {
        subscriptionId: subscription._id,
        planName,
        endDate: subscription.endDate,
        trigger: 'subscription_expired',
      },
    });
  } catch (error) {
    if (error.code === 11000) {
      return null;
    }
    console.error('[NotificationTriggerService] onSubscriptionExpired failure:', error.message);
    return null;
  }
}

module.exports = {
  onStoryPublished,
  onEpisodePublished,
  onSubscriptionActivated,
  onSubscriptionCancelled,
  onSubscriptionExpired,
};
