/**
 * ElevStory Advertisement Module Comprehensive Audit & Verification Suite
 */
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const config = require('../src/config/env');
const Ad = require('../src/models/Ad');
const User = require('../src/models/User');
const Subscription = require('../src/models/Subscription');
const Plan = require('../src/models/Plan');

const BASE_URL = 'http://localhost:5000/api';

let adminToken = '';
let freeUserToken = '';
let premiumUserToken = '';
let expiredUserToken = '';

let freeUserId = '';
let premiumUserId = '';
let expiredUserId = '';

let testAdId = '';

const runAudit = async () => {
  console.log('================================================================');
  console.log('🔍 ELEVSTORY ADVERTISEMENT MODULE FULL AUDIT & VERIFICATION');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  const assert = (condition, message) => {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      failed++;
    }
  };

  try {
    const mongoUri = config.mongodbUri || 'mongodb://localhost:27017/audio_stories_db';
    await mongoose.connect(mongoUri);
    console.log(' Connected to MongoDB for audit verification.\n');

    // ─────────────────────────────────────────────────────────────
    // SETUP: Seed test users and plans if needed
    // ─────────────────────────────────────────────────────────────
    console.log('📋 Phase 1 & Setup: User & Subscription State Setup');

    // Generate Admin Token
    adminToken = jwt.sign(
      { id: 'admin123', email: 'admin@elevstory.com', role: 'admin' },
      config.jwtSecret,
      { expiresIn: '1d' }
    );
    assert(Boolean(adminToken), 'Admin token generated successfully');

    // Create Free User
    let freeUser = await User.findOne({ email: 'audit.free@elevstory.com' });
    if (!freeUser) {
      freeUser = await User.create({
        name: 'Audit Free Listener',
        email: 'audit.free@elevstory.com',
        role: 'listener',
        plan: 'Free',
        subscriptionStatus: 'none',
      });
    } else {
      freeUser.plan = 'Free';
      freeUser.subscriptionStatus = 'none';
      freeUser.subscriptionExpiresAt = null;
      await freeUser.save();
    }
    freeUserId = freeUser._id;
    freeUserToken = jwt.sign(
      { id: freeUser._id, email: freeUser.email, role: 'listener', plan: 'Free', subscriptionStatus: 'none' },
      config.jwtSecret,
      { expiresIn: '1d' }
    );
    assert(Boolean(freeUserToken), 'Free listener seeded and token generated');

    // Create Premium User
    const futureDate = new Date();
    futureDate.setFullYear(futureDate.getFullYear() + 1);

    let premiumUser = await User.findOne({ email: 'audit.premium@elevstory.com' });
    if (!premiumUser) {
      premiumUser = await User.create({
        name: 'Audit Premium Listener',
        email: 'audit.premium@elevstory.com',
        role: 'listener',
        plan: 'Pro Member',
        subscriptionStatus: 'active',
        subscriptionExpiresAt: futureDate,
      });
    } else {
      premiumUser.plan = 'Pro Member';
      premiumUser.subscriptionStatus = 'active';
      premiumUser.subscriptionExpiresAt = futureDate;
      await premiumUser.save();
    }
    premiumUserId = premiumUser._id;
    premiumUserToken = jwt.sign(
      { id: premiumUser._id, email: premiumUser.email, role: 'listener', plan: 'Pro Member', subscriptionStatus: 'active', subscriptionExpiresAt: futureDate },
      config.jwtSecret,
      { expiresIn: '1d' }
    );
    assert(Boolean(premiumUserToken), 'Premium listener seeded with active subscription');

    // Create Expired User
    const pastDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    let expiredUser = await User.findOne({ email: 'audit.expired@elevstory.com' });
    if (!expiredUser) {
      expiredUser = await User.create({
        name: 'Audit Expired Listener',
        email: 'audit.expired@elevstory.com',
        role: 'listener',
        plan: 'Pro Member',
        subscriptionStatus: 'expired',
        subscriptionExpiresAt: pastDate,
      });
    } else {
      expiredUser.plan = 'Pro Member';
      expiredUser.subscriptionStatus = 'expired';
      expiredUser.subscriptionExpiresAt = pastDate;
      await expiredUser.save();
    }
    expiredUserId = expiredUser._id;
    expiredUserToken = jwt.sign(
      { id: expiredUser._id, email: expiredUser.email, role: 'listener', plan: 'Pro Member', subscriptionStatus: 'expired', subscriptionExpiresAt: pastDate },
      config.jwtSecret,
      { expiresIn: '1d' }
    );
    assert(Boolean(expiredUserToken), 'Expired listener seeded with expired subscription');

    // ─────────────────────────────────────────────────────────────
    // Phase 2: Verify Ad Campaign Management & CRUD Validations
    // ─────────────────────────────────────────────────────────────
    console.log('\n📋 Phase 2: Ad Campaign Management & Validation Rules');

    // Test 2.1: Create video ad campaign
    const createRes = await fetch(`${BASE_URL}/ads/admin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        title: 'Audit Video Pre-Roll Campaign',
        advertiser: 'AudioPro Sound',
        description: 'Premium wireless earbuds for audiophiles',
        type: 'video',
        placement: 'video_preroll',
        videoUrl: 'https://www.w3schools.com/html/mov_bbb.mp4',
        videoDuration: 10,
        destinationUrl: 'https://example.com/audiopro',
        isSkippable: true,
        skipAfterSeconds: 3,
        priority: 10,
        status: 'Active',
      }),
    });
    const createData = await createRes.json();
    assert(createRes.status === 201 && createData.success, 'Admin creates video pre-roll ad');
    assert(createData.data.type === 'video', 'Ad type is video');
    assert(createData.data.placement === 'video_preroll', 'Ad placement is video_preroll');
    assert(createData.data.isSkippable === true, 'isSkippable flag saved');
    assert(createData.data.skipAfterSeconds === 3, 'skipAfterSeconds saved as 3');
    testAdId = createData.data.id || createData.data._id;

    // Test 2.2: Reject video ad with incompatible placement
    const badPlacementRes = await fetch(`${BASE_URL}/ads/admin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        title: 'Invalid Placement Campaign',
        type: 'video',
        placement: 'banner_home', // invalid for video
        videoUrl: 'https://example.com/video.mp4',
        destinationUrl: 'https://example.com',
      }),
    });
    assert(badPlacementRes.status === 400, 'Rejects video ad with incompatible banner_home placement');

    // Test 2.3: Reject audio ad with no audio source
    const badAudioRes = await fetch(`${BASE_URL}/ads/admin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        title: 'Missing Audio Source Ad',
        type: 'audio',
        placement: 'audio_preroll',
        destinationUrl: 'https://example.com',
      }),
    });
    assert(badAudioRes.status === 400, 'Rejects audio ad when audio source is missing');

    // Test 2.4: Reject campaign with end date before start date
    const badDateRes = await fetch(`${BASE_URL}/ads/admin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        title: 'Bad Date Ad',
        type: 'video',
        placement: 'video_preroll',
        videoUrl: 'https://example.com/vid.mp4',
        destinationUrl: 'https://example.com',
        startDate: '2026-10-15',
        endDate: '2026-10-10', // earlier than start date
      }),
    });
    assert(badDateRes.status === 400, 'Rejects campaign where endDate is before startDate');

    // Test 2.5: Admin List Ads with Filters
    const listRes = await fetch(`${BASE_URL}/ads/admin?type=video&status=Active`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const listData = await listRes.json();
    assert(listRes.status === 200 && listData.success, 'Admin fetches filtered ad list');
    assert(Array.isArray(listData.data) && listData.data.length > 0, 'Ad list contains active video ads');

    // Test 2.6: Admin Toggle Status
    const toggleRes = await fetch(`${BASE_URL}/ads/admin/${testAdId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ status: 'Inactive' }),
    });
    const toggleData = await toggleRes.json();
    assert(toggleRes.status === 200 && toggleData.data.status === 'Inactive', 'Admin toggles ad status to Inactive');

    // Switch back to Active for public serving tests
    await fetch(`${BASE_URL}/ads/admin/${testAdId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ status: 'Active' }),
    });

    // ─────────────────────────────────────────────────────────────
    // Phase 3 & 5: Listener Ad Serving & Premium Protection
    // ─────────────────────────────────────────────────────────────
    console.log('\n📋 Phase 3 & 5: Public Ad Serving & Subscription Entitlements');

    // Test 3.1: Guest listener receives eligible ad
    const guestServeRes = await fetch(`${BASE_URL}/ads/serve?placement=video_preroll`);
    const guestServeData = await guestServeRes.json();
    assert(guestServeRes.status === 200 && guestServeData.success, 'Guest listener requests video_preroll ad');
    assert(guestServeData.data.isAdFree === false, 'Guest is not ad-free');
    assert(guestServeData.data.ad !== null && guestServeData.data.ad.id === testAdId, 'Guest receives active video pre-roll ad');

    // Test 3.2: Free authenticated listener receives ad
    const freeServeRes = await fetch(`${BASE_URL}/ads/serve?placement=video_preroll`, {
      headers: { Authorization: `Bearer ${freeUserToken}` },
    });
    const freeServeData = await freeServeRes.json();
    assert(freeServeRes.status === 200 && freeServeData.data.isAdFree === false, 'Free registered listener receives ad (isAdFree: false)');

    // Test 3.3: Active Premium listener is 100% Ad-Free
    const premServeRes = await fetch(`${BASE_URL}/ads/serve?placement=video_preroll`, {
      headers: { Authorization: `Bearer ${premiumUserToken}` },
    });
    const premServeData = await premServeRes.json();
    assert(premServeRes.status === 200 && premServeData.data.isAdFree === true, 'Active premium subscriber is ad-free (isAdFree: true)');
    assert(premServeData.data.ad === null, 'No advertisement is served to premium subscriber');

    // Test 3.4: Expired subscription listener receives ads
    const expServeRes = await fetch(`${BASE_URL}/ads/serve?placement=video_preroll`, {
      headers: { Authorization: `Bearer ${expiredUserToken}` },
    });
    const expServeData = await expServeRes.json();
    assert(expServeRes.status === 200 && expServeData.data.isAdFree === false, 'Expired subscriber is NOT ad-free (isAdFree: false)');
    assert(expServeData.data.ad !== null, 'Expired subscriber receives active ad');

    // Test 3.5: Malformed / Invalid JWT token fails safely to guest (no ad-free leak)
    const tamperedTokenRes = await fetch(`${BASE_URL}/ads/serve?placement=video_preroll`, {
      headers: { Authorization: 'Bearer invalid.tampered.token' },
    });
    const tamperedData = await tamperedTokenRes.json();
    assert(tamperedTokenRes.status === 200 && tamperedData.data.isAdFree === false, 'Tampered token safely treated as guest (isAdFree: false)');

    // Test 3.6: Non-existent placement returns empty ad gracefully
    const emptyPlacementRes = await fetch(`${BASE_URL}/ads/serve?placement=video_popup`);
    const emptyData = await emptyPlacementRes.json();
    assert(emptyPlacementRes.status === 200 && emptyData.data.ad === null, 'Returns null ad cleanly when no ad matches placement');

    // ─────────────────────────────────────────────────────────────
    // Phase 4: Verify Ad Tracking Metrics
    // ─────────────────────────────────────────────────────────────
    console.log('\n📋 Phase 4: Metric Tracking Endpoints');

    // Test 4.1: Track Start Impression
    const startImpRes = await fetch(`${BASE_URL}/ads/${testAdId}/track-impression`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isStart: true }),
    });
    const startImpData = await startImpRes.json();
    assert(startImpRes.status === 200 && startImpData.data.impressionsCount >= 1, 'Tracks impression counter');
    assert(startImpData.data.startsCount >= 1, 'Tracks start counter when isStart: true');

    // Test 4.2: Track Completion
    const compRes = await fetch(`${BASE_URL}/ads/${testAdId}/track-completion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const compData = await compRes.json();
    assert(compRes.status === 200 && compData.data.completionsCount >= 1, 'Tracks completion counter');

    // Test 4.3: Track Click
    const clickRes = await fetch(`${BASE_URL}/ads/${testAdId}/track-click`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const clickData = await clickRes.json();
    assert(clickRes.status === 200 && clickData.data.clicksCount >= 1, 'Tracks click counter');
    assert(clickData.data.destinationUrl === 'https://example.com/audiopro', 'Returns destination URL on click');

    // Test 4.4: 404 for tracking non-existent ad
    const fakeId = new mongoose.Types.ObjectId();
    const notFoundTrackRes = await fetch(`${BASE_URL}/ads/${fakeId}/track-impression`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isStart: true }),
    });
    assert(notFoundTrackRes.status === 404, 'Returns 404 when tracking invalid ad ID');

    // ─────────────────────────────────────────────────────────────
    // Phase 6: Admin Analytics Stats
    // ─────────────────────────────────────────────────────────────
    console.log('\n📋 Phase 6: Admin Analytics Stats Aggregation');

    const statsRes = await fetch(`${BASE_URL}/ads/admin/stats`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const statsData = await statsRes.json();
    assert(statsRes.status === 200 && statsData.success, 'Admin fetches aggregate analytics stats');
    assert(statsData.data.totalAds >= 1, 'Total ads count verified in stats');
    assert(statsData.data.totalImpressions >= 1, 'Total impressions count aggregated');
    assert(statsData.data.totalCompletions >= 1, 'Total completions count aggregated');

    // Cleanup test ad
    await fetch(`${BASE_URL}/ads/admin/${testAdId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });

  } catch (err) {
    console.error('Audit execution error:', err);
    failed++;
  } finally {
    try {
      await mongoose.disconnect();
    } catch {}
    console.log('\n================================================================');
    console.log(`📊 AUDIT SUMMARY: ${passed} PASSED, ${failed} FAILED (TOTAL ${passed + failed})`);
    console.log('================================================================');
    if (failed > 0) {
      process.exitCode = 1;
    }
  }
};

runAudit();
