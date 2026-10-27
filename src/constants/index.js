const STORY_STATUS = {
  PUBLISHED: 'Published',
  DRAFT: 'Draft',
  SCHEDULED: 'Scheduled',
  ARCHIVED: 'Archived',
};

const EPISODE_STATUS = {
  PUBLISHED: 'Published',
  DRAFT: 'Draft',
  SCHEDULED: 'Scheduled',
};

const CATEGORY_STATUS = {
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
};

const NARRATOR_STATUS = {
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
};

const COLLECTION_STATUS = {
  PUBLISHED: 'Published',
  DRAFT: 'Draft',
};

const USER_STATUS = {
  ACTIVE: 'Active',
  SUSPENDED: 'Suspended',
  INACTIVE: 'Inactive',
};

const REVIEW_STATUS = {
  APPROVED: 'Approved',
  PENDING: 'Pending',
  HIDDEN: 'Hidden',
};

const AGE_GROUPS = [
  'All Ages',
  'Kids (3-7)',
  'Children (8-12)',
  'Teens (13-17)',
  'Adults (18+)',
];

const STORY_TYPES = [
  "Children's Story",
  'Bedtime Story',
  'Moral Story',
  'Fiction',
  'Mystery',
  'Thriller',
  'Romance',
  'Adventure',
  'Fantasy',
  'Educational',
  'Historical',
  'Sci-Fi',
  'Spiritual Stories',
  'Short Stories',
];

module.exports = {
  STORY_STATUS,
  EPISODE_STATUS,
  CATEGORY_STATUS,
  NARRATOR_STATUS,
  COLLECTION_STATUS,
  USER_STATUS,
  REVIEW_STATUS,
  AGE_GROUPS,
  STORY_TYPES,
};
