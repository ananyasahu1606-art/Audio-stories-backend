const mongoose = require('mongoose');
const config = require('./env');
const Admin = require('../models/Admin');
const Category = require('../models/Category');
const Narrator = require('../models/Narrator');
const Story = require('../models/Story');
const Episode = require('../models/Episode');
const Collection = require('../models/Collection');
const User = require('../models/User');
const Review = require('../models/Review');
const Media = require('../models/Media');
const Setting = require('../models/Setting');
const Notification = require('../models/Notification');

const seedDefaultData = async () => {
  try {
    // 1. Seed default admin accounts
    const adminCount = await Admin.countDocuments();
    if (adminCount === 0) {
      await Admin.create([
        {
          name: 'Elena Rostova',
          email: 'admin@example.com',
          password: '123456',
          role: 'Master Story Director',
          avatar:
            'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80',
        },
        {
          name: 'Elena Rostova',
          email: 'admin@elevstory.com',
          password: '123456',
          role: 'Master Story Director',
          avatar:
            'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80',
        },
      ]);
      console.log('[Seed] Default admin accounts created: admin@example.com / 123456');
    }

    // 2. Seed default categories
    let categories = await Category.find();
    if (categories.length === 0) {
      categories = await Category.create([
        {
          name: 'Bedtime Stories',
          slug: 'bedtime-stories',
          description: 'Soothing night-time narratives, ambient rainfall soundscapes, and calming sleep narrations.',
          coverImage: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=600&auto=format&fit=crop&q=80',
          accentColor: '#8b5cf6',
          status: 'Active',
          storyCount: 0,
        },
        {
          name: 'Mystery & Thriller',
          slug: 'mystery-thriller',
          description: 'Atmospheric noir investigations, Victorian suspense, and psychological thriller audiobooks.',
          coverImage: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=600&auto=format&fit=crop&q=80',
          accentColor: '#ec4899',
          status: 'Active',
          storyCount: 0,
        },
        {
          name: "Children's & Moral Stories",
          slug: 'children-moral-stories',
          description: 'Fun, moral fable adaptations, playful character voices, and educational bedtime tales for kids.',
          coverImage: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=600&auto=format&fit=crop&q=80',
          accentColor: '#06b6d4',
          status: 'Active',
          storyCount: 0,
        },
        {
          name: 'Sci-Fi & Cosmic Adventures',
          slug: 'sci-fi-cosmic',
          description: 'Interstellar chronicles, futuristic audio dramas, and deep space exploration narratives.',
          coverImage: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=600&auto=format&fit=crop&q=80',
          accentColor: '#3b82f6',
          status: 'Active',
          storyCount: 0,
        },
      ]);
      console.log('[Seed] Initial sample Categories seeded successfully.');
    }

    // 3. Seed default narrators
    let narrators = await Narrator.find();
    if (narrators.length === 0) {
      narrators = await Narrator.create([
        {
          name: 'Alistair Vance',
          profileImage: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&auto=format&fit=crop&q=80',
          bio: 'Classical Royal Academy trained actor specializing in Victorian mystery, suspense, and dark fantasy audiobooks.',
          language: 'English (British RP)',
          voiceStyle: 'Deep, Atmospheric & Dramatic',
          storyCount: 0,
          episodeCount: 0,
          rating: 4.96,
          totalListens: 184500,
          status: 'Active',
          joinedDate: '2025-01-15',
        },
        {
          name: 'Elena Rostova',
          profileImage: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&auto=format&fit=crop&q=80',
          bio: 'Voice artist and sleep meditation guide. Renowned for hypnotic bedtime stories and soothing ambient soundscapes.',
          language: 'English (US Neutral)',
          voiceStyle: 'Soft, Whispering & Melodic',
          storyCount: 0,
          episodeCount: 0,
          rating: 4.98,
          totalListens: 242100,
          status: 'Active',
          joinedDate: '2025-02-01',
        },
      ]);
      console.log('[Seed] Initial sample Narrators seeded successfully.');
    }

    // 4. Seed default stories
    let stories = await Story.find();
    if (stories.length === 0 && categories.length > 0 && narrators.length > 0) {
      const bedtimeCat = categories.find((c) => c.slug === 'bedtime-stories') || categories[0];
      const mysteryCat = categories.find((c) => c.slug === 'mystery-thriller') || categories[1] || categories[0];
      const narrator1 = narrators[0];
      const narrator2 = narrators[1] || narrators[0];

      stories = await Story.create([
        {
          title: 'The Clockwork Alchemist of Prague',
          shortDescription: 'In the cobblestone alleyways of 1888 Prague, an eccentric horologist uncovers an ancient celestial sphere.',
          fullDescription: 'In the cobblestone alleyways of 1888 Prague, an eccentric horologist uncovers an ancient celestial sphere that can manipulate time intervals. As mysterious alchemists pursue the artifact through foggy streets, he must decode the mechanical gears before midnight.',
          coverImage: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=600&auto=format&fit=crop&q=80',
          categoryId: mysteryCat._id,
          categoryName: mysteryCat.name,
          narratorId: narrator1._id,
          narratorName: narrator1.name,
          language: 'English (British RP)',
          ageGroup: 'Adults (18+)',
          storyType: 'Mystery',
          tags: ['Steampunk', 'Victorian Mystery', 'Clockwork'],
          totalEpisodes: 2,
          totalDuration: '52m',
          releaseDate: '2025-09-15',
          status: 'Published',
          isFeatured: true,
          rating: 4.96,
          listenCount: 42300,
        },
        {
          title: 'Whispers of the Silverwood Glade',
          shortDescription: 'Drift through an enchanted moonlit forest where gentle stream sounds and whispering birch trees guide you to sleep.',
          fullDescription: 'Drift through an enchanted moonlit forest where gentle stream sounds and whispering birch trees guide you into deep, restorative sleep. Designed with binaural ambient rainfall and soothing narrative cadence.',
          coverImage: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=600&auto=format&fit=crop&q=80',
          categoryId: bedtimeCat._id,
          categoryName: bedtimeCat.name,
          narratorId: narrator2._id,
          narratorName: narrator2.name,
          language: 'English (US Neutral)',
          ageGroup: 'All Ages',
          storyType: 'Bedtime Story',
          tags: ['Bedtime', 'Sleep Meditation', 'Rainfall Ambiance'],
          totalEpisodes: 2,
          totalDuration: '48m',
          releaseDate: '2025-09-20',
          status: 'Published',
          isFeatured: true,
          rating: 4.98,
          listenCount: 68100,
        },
      ]);

      console.log('[Seed] Initial sample Stories seeded successfully.');
    }

    // 5. Seed default episodes if none exist
    const episodeCount = await Episode.countDocuments();
    if (episodeCount === 0 && stories.length > 0) {
      const story1 = stories[0];
      const story2 = stories[1] || stories[0];

      await Episode.create([
        {
          storyId: story1._id,
          storyTitle: story1.title,
          episodeNumber: 1,
          title: 'Chapter 1: The Silver Key of Old Town',
          description: 'Alistair arrives at the antique watchmaker workshop near Charles Bridge and finds the hidden basement vault.',
          narratorId: story1.narratorId,
          narratorName: story1.narratorName,
          duration: '26m 15s',
          durationSeconds: 1575,
          audioUrl: 'https://cdn.freesound.org/previews/568/568853_7037-lq.mp3',
          thumbnail: story1.coverImage,
          status: 'Published',
          releaseDate: '2025-09-15',
          fileSize: '36.8 MB',
          listenCount: 24500,
        },
        {
          storyId: story1._id,
          storyTitle: story1.title,
          episodeNumber: 2,
          title: 'Chapter 2: The Alchemist’s Cipher',
          description: 'Decoding the celestial brass dial reveals an encoded message about the lost clock of Prague.',
          narratorId: story1.narratorId,
          narratorName: story1.narratorName,
          duration: '25m 45s',
          durationSeconds: 1545,
          audioUrl: 'https://cdn.freesound.org/previews/568/568853_7037-lq.mp3',
          thumbnail: story1.coverImage,
          status: 'Published',
          releaseDate: '2025-09-18',
          fileSize: '35.4 MB',
          listenCount: 17800,
        },
        {
          storyId: story2._id,
          storyTitle: story2.title,
          episodeNumber: 1,
          title: 'Chapter 1: The Starlight Canopy',
          description: 'Walking beneath the silver birch leaves as twilight settles over the whispering glade.',
          narratorId: story2.narratorId,
          narratorName: story2.narratorName,
          duration: '24m 00s',
          durationSeconds: 1440,
          audioUrl: 'https://cdn.freesound.org/previews/568/568853_7037-lq.mp3',
          thumbnail: story2.coverImage,
          status: 'Published',
          releaseDate: '2025-09-20',
          fileSize: '33.2 MB',
          listenCount: 38200,
        },
        {
          storyId: story2._id,
          storyTitle: story2.title,
          episodeNumber: 2,
          title: 'Chapter 2: Rain Upon the Riverbed',
          description: 'Gentle raindrops fall upon mossy river stones as the night forest softly breathes.',
          narratorId: story2.narratorId,
          narratorName: story2.narratorName,
          duration: '24m 00s',
          durationSeconds: 1440,
          audioUrl: 'https://cdn.freesound.org/previews/568/568853_7037-lq.mp3',
          thumbnail: story2.coverImage,
          status: 'Published',
          releaseDate: '2025-09-22',
          fileSize: '33.5 MB',
          listenCount: 29900,
        },
      ]);

      console.log('[Seed] Initial sample Episodes seeded successfully.');
    }

    // 6. Seed default collections if none exist
    const collectionCount = await Collection.countDocuments();
    if (collectionCount === 0 && stories.length > 0) {
      await Collection.create([
        {
          name: 'Midnight Whispers: Deep Sleep Bedtime Tales',
          description:
            'A curated nighttime anthology of calming, slow-paced bedtime narrations designed to lull listeners into restorative sleep.',
          coverImage:
            'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=600&auto=format&fit=crop&q=80',
          storyIds: stories.length > 1 ? [stories[1]._id] : [stories[0]._id],
          storyCount: 1,
          status: 'Published',
          featuredTag: 'Top Bedtime Pick',
        },
        {
          name: 'Mastermind Mysteries & Noir Investigations',
          description:
            'Intriguing whodunits, clockwork alchemists, and seaside cliffhanger audio chapters for armchair detectives.',
          coverImage:
            'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=600&auto=format&fit=crop&q=80',
          storyIds: [stories[0]._id],
          storyCount: 1,
          status: 'Published',
          featuredTag: 'Binge-Worthy Mystery',
        },
        {
          name: 'Weekend Stories Collection (Quick Listens)',
          description:
            'Curated 15 to 30 minute standalone stories and gripping first chapters for easy weekend binge sessions.',
          coverImage:
            'https://images.unsplash.com/photo-1474932430478-367dbb6832c1?w=600&auto=format&fit=crop&q=80',
          storyIds: stories.map((s) => s._id),
          storyCount: stories.length,
          status: 'Draft',
          featuredTag: 'Coming Soon',
        },
      ]);
      console.log('[Seed] Initial sample Collections seeded successfully.');
    }

    // 7. Seed default users / listeners if none exist
    const userCount = await User.countDocuments();
    if (userCount === 0) {
      await User.create([
        {
          name: 'Sophia Montgomery',
          email: 'sophia.m@example.com',
          avatar:
            'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&auto=format&fit=crop&q=80',
          joinedDate: '2024-11-12',
          storiesListened: 48,
          totalListeningHours: 142.5,
          lastActive: '12 minutes ago',
          status: 'Active',
          plan: 'StoryPass Premium',
          favoriteGenres: ['Mystery & Thriller', 'Bedtime Stories'],
        },
        {
          name: 'Ethan Zhao',
          email: 'ethan.zhao@example.com',
          avatar:
            'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&auto=format&fit=crop&q=80',
          joinedDate: '2024-12-05',
          storiesListened: 29,
          totalListeningHours: 86.0,
          lastActive: '1 hour ago',
          status: 'Active',
          plan: 'StoryPass Premium',
          favoriteGenres: ['Sci-Fi & Cosmic Adventures'],
        },
        {
          name: 'Maya Patel',
          email: 'maya.patel@example.com',
          avatar:
            'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop&q=80',
          joinedDate: '2025-01-08',
          storiesListened: 19,
          totalListeningHours: 54.2,
          lastActive: '3 hours ago',
          status: 'Active',
          plan: 'Family Plan',
          favoriteGenres: ["Children's & Moral Stories", 'Bedtime Stories'],
        },
        {
          name: 'Liam Gallagher',
          email: 'liam.g@example.com',
          avatar:
            'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&auto=format&fit=crop&q=80',
          joinedDate: '2025-01-19',
          storiesListened: 12,
          totalListeningHours: 31.8,
          lastActive: 'Yesterday',
          status: 'Active',
          plan: 'Free',
          favoriteGenres: ['Mystery & Thriller'],
        },
        {
          name: 'Felix Gruber',
          email: 'felix.gruber@example.com',
          avatar:
            'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=200&auto=format&fit=crop&q=80',
          joinedDate: '2024-10-15',
          storiesListened: 5,
          totalListeningHours: 9.2,
          lastActive: '2 weeks ago',
          status: 'Inactive',
          plan: 'Free',
          favoriteGenres: ['Sci-Fi & Cosmic Adventures'],
        },
      ]);
      console.log('[Seed] Initial sample Users seeded successfully.');
    }

    // 8. Seed default reviews if none exist
    const reviewCount = await Review.countDocuments();
    if (reviewCount === 0 && stories.length > 0) {
      const story1 = stories[0];
      const story2 = stories[1] || stories[0];
      const allUsers = await User.find();
      const user1 = allUsers[0];
      const user2 = allUsers[1] || allUsers[0];

      await Review.create([
        {
          userId: user1 ? user1._id : undefined,
          userName: user1 ? user1.name : 'Sophia Montgomery',
          userAvatar: user1
            ? user1.avatar
            : 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200',
          storyId: story1._id,
          storyTitle: story1.title,
          rating: 5,
          comment:
            'Alistair Vance’s voice acting is absolute perfection. The clockwork audio effects in Chapter 3 made me feel like I was right there in the old Gothic workshop. Cannot wait for Season 2!',
          date: '2025-02-18',
          status: 'Approved',
          likes: 42,
        },
        {
          userId: user2 ? user2._id : undefined,
          userName: user2 ? user2.name : 'Maya Patel',
          userAvatar: user2
            ? user2.avatar
            : 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200',
          storyId: story2._id,
          storyTitle: story2.title,
          rating: 5,
          comment:
            'My 5-year-old falls asleep within 10 minutes every single night listening to Elena’s soothing voice. The ambient forest soundscape is gentle and pure magic.',
          date: '2025-02-17',
          status: 'Approved',
          likes: 89,
        },
        {
          userName: 'Liam Gallagher',
          userAvatar:
            'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200',
          storyId: story1._id,
          storyTitle: story1.title,
          rating: 4,
          comment:
            'Great moral takeaway and brilliant pacing. The voice acting for the secondary characters is top notch!',
          date: '2025-02-12',
          status: 'Pending',
          likes: 6,
        },
      ]);
      console.log('[Seed] Initial sample Reviews seeded successfully.');
    }

    // 9. Seed default media assets if none exist
    const mediaCount = await Media.countDocuments();
    if (mediaCount === 0) {
      await Media.create([
        {
          title: 'Clockwork Alchemist Master Artwork',
          type: 'cover',
          url: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=600&auto=format&fit=crop&q=80',
          size: '3.4 MB',
          sizeBytes: 3565158,
          dimensionOrDuration: '2400 x 2400 px',
          storyTitle: 'The Clockwork Alchemist of Prague',
          uploadedAt: '2025-01-15',
        },
        {
          title: 'Silverwood Glade Moonlit Cover',
          type: 'cover',
          url: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=600&auto=format&fit=crop&q=80',
          size: '2.8 MB',
          sizeBytes: 2936012,
          dimensionOrDuration: '2400 x 2400 px',
          storyTitle: 'Whispers of the Silverwood Glade',
          uploadedAt: '2025-01-18',
        },
        {
          title: 'Story Narration: Clockwork Alchemist - Chapter 1',
          type: 'audio',
          url: 'https://cdn.freesound.org/previews/568/568853_7037-lq.mp3',
          size: '36.8 MB',
          sizeBytes: 38587596,
          dimensionOrDuration: '26m 40s (320kbps Lossless)',
          storyTitle: 'The Clockwork Alchemist of Prague',
          uploadedAt: '2025-01-15',
        },
        {
          title: 'Story Narration: Silverwood Glade - Chapter 1 Starlight',
          type: 'audio',
          url: 'https://cdn.freesound.org/previews/568/568853_7037-lq.mp3',
          size: '30.5 MB',
          sizeBytes: 31981568,
          dimensionOrDuration: '22m 10s (320kbps Binaural)',
          storyTitle: 'Whispers of the Silverwood Glade',
          uploadedAt: '2025-01-20',
        },
      ]);
      console.log('[Seed] Initial sample Media assets seeded successfully.');
    }

    // 10. Seed default settings if none exist
    const settingCount = await Setting.countDocuments();
    if (settingCount === 0) {
      await Setting.create({
        general: {
          platformName: 'ElevStory Studio',
          tagline: 'Immersive Audio Stories & Audiobook CMS',
          logoUrl: '',
          defaultLanguage: 'English (US)',
          timezone: 'UTC +05:30 (India Standard Time)',
        },
        story: {
          defaultStatus: 'Draft',
          defaultAgeGroup: 'All Ages',
          enableFeaturedStories: true,
          maxFeaturedStories: 10,
          allowUserReviews: true,
          moderationQueueEnabled: true,
        },
        audio: {
          defaultAudioQuality: '320kbps Studio Lossless',
          enableEpisodeAudioPreview: true,
          defaultPlaybackSpeed: '1.0x',
          binauralSpatialAudioEnabled: true,
          maxUploadFileSizeMB: 150,
        },
        notifications: {
          newStoryNotification: true,
          newEpisodeNotification: true,
          reviewNotification: true,
          systemAlerts: true,
        },
      });
      console.log('[Seed] Default Platform Settings initialized successfully.');
    }

    // 11. Seed default notifications if none exist
    const notificationCount = await Notification.countDocuments();
    if (notificationCount === 0) {
      await Notification.create([
        {
          text: 'New 5-star review on "The Clockwork Alchemist of Prague"',
          type: 'review',
          unread: true,
          time: '10m ago',
        },
        {
          text: 'Elena Rostova finished recording Chapter 3 narration',
          type: 'episode',
          unread: true,
          time: '1h ago',
        },
        {
          text: 'Scheduled story release: "Foggy Hollow Lighthouse" in 3 days',
          type: 'story',
          unread: false,
          time: '5h ago',
        },
      ]);
      console.log('[Seed] Initial sample Notifications seeded successfully.');
    }

    // 12. Seed default subscription plans if none exist
    const Plan = require('../models/Plan');
    const planCount = await Plan.countDocuments();
    if (planCount === 0) {
      await Plan.create([
        {
          slug: 'plan-free',
          name: 'Free Listener',
          tagline: 'Essential Story Access',
          price: 0,
          currency: '₹',
          formattedPrice: '₹0',
          billingPeriod: 'forever',
          durationDays: 0,
          description: 'Explore sample chapters, selected public stories, and essential audio listening.',
          benefits: [
            'Access to selected free stories',
            'Basic listening access',
            'Standard audio quality (128 kbps)',
            'Community reviews & ratings',
            'Public collections browsing',
          ],
          popular: false,
          badge: '',
          ctaText: 'Current Plan',
          isActive: true,
          order: 1,
        },
        {
          slug: 'plan-premium',
          name: 'StoryPass Premium',
          tagline: 'Unlimited Immersion',
          price: 199,
          currency: '₹',
          formattedPrice: '₹199',
          billingPeriod: 'month',
          durationDays: 30,
          description: 'Complete unrestricted access to all premium stories, binaural sound, and early chapter drops.',
          benefits: [
            'Access to all premium stories & audiobooks',
            'Full episode access for every series',
            '100% ad-free uninterrupted listening',
            'Lossless Ultra HD audio (320 kbps)',
            'Continue Listening sync across devices',
            'Favorites and custom library playlists',
            'Unlimited offline chapter saving',
            'Early access to weekly new releases',
            'Exclusive voice artist commentary',
          ],
          popular: true,
          badge: 'Most Popular',
          ctaText: 'Select Premium',
          isActive: true,
          order: 2,
        },
        {
          slug: 'plan-annual',
          name: 'StoryPass Annual',
          tagline: 'Best Value for Avid Listeners',
          price: 1799,
          currency: '₹',
          formattedPrice: '₹1,799',
          billingPeriod: 'year',
          durationDays: 365,
          description: 'Everything in Premium plus 2 months free and VIP priority audio experience.',
          benefits: [
            'All StoryPass Premium benefits included',
            'Save over 25% compared to monthly',
            'Lossless Ultra HD audio (320 kbps)',
            'VIP listener badge on community reviews',
            'Free full transcripts for all episodes',
            'Exclusive seasonal story releases',
          ],
          popular: false,
          badge: 'Save 25%',
          ctaText: 'Select Annual',
          isActive: true,
          order: 3,
        },
      ]);
      console.log('[Seed] Initial Subscription Plans seeded successfully.');
    }
  } catch (error) {
    console.error('[Seed Error]:', error.message);
  }
};

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(config.mongodbUri);
    console.log(`[MongoDB] Connected: ${conn.connection.host}`);
    await seedDefaultData();
  } catch (error) {
    console.error(`[MongoDB Error] ${error.message}`);
    console.log('[MongoDB] Please ensure MongoDB is running locally on ' + config.mongodbUri);
  }
};

module.exports = connectDB;
