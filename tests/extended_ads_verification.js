const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const config = require('../src/config/env');
const Ad = require('../src/models/Ad');

const BASE_URL = 'http://localhost:5000/api';

async function runExtendedVerification() {
  console.log('====================================================');
  console.log('🧪 EXTENDED ADS TARGETING & INTEGRATION VERIFICATION');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      failed++;
    }
  }

  await mongoose.connect(config.mongodbUri);

  const adminToken = jwt.sign(
    { id: 'admin_test_123', email: 'admin@test.com', role: 'admin' },
    config.jwtSecret,
    { expiresIn: '1d' }
  );
  const listenerToken = jwt.sign(
    { id: 'listener_test_123', email: 'free@test.com', role: 'listener', plan: 'Free' },
    config.jwtSecret,
    { expiresIn: '1d' }
  );

  const catA = new mongoose.Types.ObjectId();
  const catB = new mongoose.Types.ObjectId();
  const storyA = new mongoose.Types.ObjectId();
  const storyB = new mongoose.Types.ObjectId();

  // Test 1: Category Targeting Isolation
  console.log('📋 Test 1: Category Targeting Strict Isolation');
  const catAd = await Ad.create({
    title: 'Category A Exclusive Campaign',
    type: 'banner',
    placement: 'banner_story_detail',
    destinationUrl: 'https://cat-a.com',
    targetCategories: [catA],
    status: 'Active',
    priority: 10,
  });

  const resCatB = await fetch(`${BASE_URL}/ads/serve?placement=banner_story_detail&categoryId=${catB}`);
  const dataCatB = await resCatB.json();
  const servedAdBTitle = dataCatB.data?.ad?.title;
  assert(servedAdBTitle !== 'Category A Exclusive Campaign', 'Ad targeted to Category A is NOT served to Category B');

  const resCatA = await fetch(`${BASE_URL}/ads/serve?placement=banner_story_detail&categoryId=${catA}`);
  const dataCatA = await resCatA.json();
  assert(dataCatA.data?.ad?.title === 'Category A Exclusive Campaign', 'Ad targeted to Category A IS served to Category A');

  // Test 2: Story Targeting Strict Isolation
  console.log('\n📋 Test 2: Story Targeting Strict Isolation');
  const storyAd = await Ad.create({
    title: 'Story A Exclusive Campaign',
    type: 'video',
    placement: 'video_preroll',
    destinationUrl: 'https://story-a.com',
    videoUrl: 'https://example.com/story-a.mp4',
    targetStories: [storyA],
    status: 'Active',
    priority: 50,
  });

  const resStoryB = await fetch(`${BASE_URL}/ads/serve?placement=video_preroll&storyId=${storyB}`);
  const dataStoryB = await resStoryB.json();
  assert(dataStoryB.data?.ad?.title !== 'Story A Exclusive Campaign', 'Story A ad is NOT served on Story B');

  const resStoryA = await fetch(`${BASE_URL}/ads/serve?placement=video_preroll&storyId=${storyA}`);
  const dataStoryA = await resStoryA.json();
  assert(dataStoryA.data?.ad?.title === 'Story A Exclusive Campaign', 'Story A ad IS served on Story A');

  // Test 3: Priority Ordering
  console.log('\n📋 Test 3: Priority Weight Ordering');
  const lowPriorityAd = await Ad.create({
    title: 'Low Priority Story Ad',
    type: 'video',
    placement: 'video_preroll',
    destinationUrl: 'https://example.com/low',
    videoUrl: 'https://example.com/low.mp4',
    targetStories: [storyA],
    status: 'Active',
    priority: 5,
  });

  const resPriority = await fetch(`${BASE_URL}/ads/serve?placement=video_preroll&storyId=${storyA}`);
  const dataPriority = await resPriority.json();
  assert(dataPriority.data?.ad?.title === 'Story A Exclusive Campaign', 'Higher priority ad (50) is chosen over lower priority (5)');

  // Test 4: Inactive and Out of Schedule Campaigns
  console.log('\n📋 Test 4: Inactive and Out of Schedule Campaigns');
  const pastDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
  const expiredAd = await Ad.create({
    title: 'Expired Campaign',
    type: 'banner',
    placement: 'banner_home',
    destinationUrl: 'https://example.com',
    status: 'Active',
    startDate: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000),
    endDate: pastDate,
  });

  const resExpired = await fetch(`${BASE_URL}/ads/serve?placement=banner_home`);
  const dataExpired = await resExpired.json();
  assert(dataExpired.data?.ad?.title !== 'Expired Campaign', 'Expired campaign is not served');

  const inactiveAd = await Ad.create({
    title: 'Inactive Campaign',
    type: 'banner',
    placement: 'banner_home',
    destinationUrl: 'https://example.com',
    status: 'Inactive',
  });
  const resInactive = await fetch(`${BASE_URL}/ads/serve?placement=banner_home`);
  const dataInactive = await resInactive.json();
  assert(dataInactive.data?.ad?.title !== 'Inactive Campaign', 'Inactive campaign is not served');

  // Test 5: Click Tracking Increments
  console.log('\n📋 Test 5: Click Tracking Increments');
  const initialClicks = storyAd.clicksCount || 0;
  const clickRes = await fetch(`${BASE_URL}/ads/${storyAd._id}/track-click`, { method: 'POST' });
  const clickData = await clickRes.json();
  assert(clickRes.status === 200 && clickData.data?.clicksCount === initialClicks + 1, 'Click tracking increments clicksCount');

  // Test 6: RBAC Protection
  console.log('\n📋 Test 6: Admin Endpoint RBAC Protection');
  const unauthRes = await fetch(`${BASE_URL}/ads/admin`);
  assert(unauthRes.status === 401, 'Unauthenticated request to /ads/admin returns 401');

  const listenerRes = await fetch(`${BASE_URL}/ads/admin`, {
    headers: { Authorization: `Bearer ${listenerToken}` },
  });
  assert(listenerRes.status === 403, 'Listener request to /ads/admin returns 403 Forbidden');

  const adminRes = await fetch(`${BASE_URL}/ads/admin`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert(adminRes.status === 200, 'Admin request to /ads/admin returns 200 OK');

  // Cleanup test documents
  await Ad.deleteMany({
    _id: { $in: [catAd._id, storyAd._id, lowPriorityAd._id, expiredAd._id, inactiveAd._id] },
  });

  await mongoose.disconnect();

  console.log('\n====================================================');
  console.log(`📊 EXTENDED SUITE SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================');

  if (failed > 0) process.exit(1);
}

runExtendedVerification().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
