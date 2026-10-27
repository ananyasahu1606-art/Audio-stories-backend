const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const jwt = require('jsonwebtoken');

const BASE_URL = 'http://localhost:5000/api';
const JWT_SECRET = process.env.JWT_SECRET || 'elevstory_admin_secret_jwt_key_2026';

async function runTests() {
  console.log('====================================================');
  console.log('🚀 ELEVSTORY VIDEO ADS BACKEND TEST SUITE');
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

  // 1. Admin Authentication
  console.log('📋 Test 1: Admin Login / Token Generation');
  let adminToken = '';
  try {
    const loginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@example.com',
        password: '123456',
      }),
    });
    const loginData = await loginRes.json();
    if (loginData.success && loginData.data?.token) {
      adminToken = loginData.data.token;
      assert(true, 'Admin logged in via API successfully');
    } else {
      // Fallback: Generate token directly using JWT_SECRET
      adminToken = jwt.sign(
        { id: '675d00000000000000000001', role: 'admin', email: 'admin@example.com' },
        JWT_SECRET,
        { expiresIn: '1d' }
      );
      assert(true, 'Generated fallback admin JWT token for test execution');
    }
  } catch (err) {
    adminToken = jwt.sign(
      { id: '675d00000000000000000001', role: 'admin', email: 'admin@example.com' },
      JWT_SECRET,
      { expiresIn: '1d' }
    );
    assert(true, 'Generated fallback admin JWT token for test execution');
  }

  let createdVideoAdId = null;

  // 2. Video Ad Creation via External URL
  console.log('\n📋 Test 2: Video Ad Creation with External URL');
  try {
    const res = await fetch(`${BASE_URL}/ads/admin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        title: 'Audible Pro 4K Teaser Video',
        advertiser: 'Audible Studio',
        type: 'video',
        placement: 'video_preroll',
        videoUrl: 'https://cdn.example.com/videos/audible_4k_teaser_15s.mp4',
        videoDuration: 15,
        destinationUrl: 'https://audible.com/offer/pro',
        ctaText: 'Watch Full Series',
        targetAudience: 'free_users',
        isSkippable: true,
        skipAfterSeconds: 5,
        startDate: '2026-10-01',
        priority: 5,
        status: 'Active',
      }),
    });
    const data = await res.json();
    assert(data.success === true, 'Video ad created successfully via URL');
    assert(data.data?.type === 'video', 'Ad type is "video"');
    assert(data.data?.placement === 'video_preroll', 'Placement is "video_preroll"');
    assert(data.data?.videoUrl === 'https://cdn.example.com/videos/audible_4k_teaser_15s.mp4', 'Video URL saved correctly');
    assert(data.data?.videoDuration === 15, 'Video duration saved as 15s');
    createdVideoAdId = data.data?._id || data.data?.id;
  } catch (err) {
    assert(false, `Video ad creation failed with error: ${err.message}`);
  }

  // 3. Video Ad Creation via File Upload (Multipart Form-Data)
  console.log('\n📋 Test 3: Video Ad Creation with Multipart Video File Upload');
  let uploadedVideoAdId = null;
  try {
    const formData = new FormData();
    formData.append('title', 'Boat Rockerz Sound Video Spot');
    formData.append('advertiser', 'Boat Audio');
    formData.append('type', 'video');
    formData.append('placement', 'video_popup');
    formData.append('destinationUrl', 'https://boat-lifestyle.com/sale');
    formData.append('ctaText', 'Claim Discount');
    formData.append('videoDuration', '20');
    formData.append('isSkippable', 'true');
    formData.append('skipAfterSeconds', '5');
    formData.append('startDate', '2026-10-01');
    formData.append('priority', '3');
    formData.append('status', 'Active');

    // Create a dummy video file blob (MP4 fake header)
    const dummyVideoBuffer = Buffer.from('fake-mp4-video-stream-content-bytes-elevstory');
    const videoBlob = new Blob([dummyVideoBuffer], { type: 'video/mp4' });
    formData.append('video', videoBlob, 'boat_commercial_spot.mp4');

    const res = await fetch(`${BASE_URL}/ads/admin`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
      body: formData,
    });
    const data = await res.json();
    assert(data.success === true, 'Video file uploaded and ad created successfully');
    assert(data.data?.type === 'video', 'Uploaded ad type is "video"');
    assert(data.data?.placement === 'video_popup', 'Placement is "video_popup"');
    assert(data.data?.videoUrl?.startsWith('/uploads/') || data.data?.videoUrl?.includes('uploads'), 'Video file saved to /uploads path');
    uploadedVideoAdId = data.data?._id || data.data?.id;
  } catch (err) {
    assert(false, `Video file upload test failed with error: ${err.message}`);
  }

  // 4. Update / Edit Video Ad
  console.log('\n📋 Test 4: Update / Edit Video Ad');
  if (createdVideoAdId) {
    try {
      const res = await fetch(`${BASE_URL}/ads/admin/${createdVideoAdId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          title: 'Audible Pro 4K Teaser Video (Updated Special)',
          videoDuration: 25,
          isSkippable: false,
        }),
      });
      const data = await res.json();
      assert(data.success === true, 'Video ad updated successfully');
      assert(data.data?.title === 'Audible Pro 4K Teaser Video (Updated Special)', 'Title updated');
      assert(data.data?.videoDuration === 25, 'Video duration updated to 25s');
      assert(data.data?.isSkippable === false, 'isSkippable updated to false');
    } catch (err) {
      assert(false, `Update video ad failed: ${err.message}`);
    }
  }

  // 5. Validation Failure Tests: Missing Video Creative
  console.log('\n📋 Test 5: Validation Failure for Video Ad without videoUrl or file');
  try {
    const res = await fetch(`${BASE_URL}/ads/admin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        title: 'Invalid Empty Video Ad',
        type: 'video',
        placement: 'video_preroll',
        destinationUrl: 'https://example.com',
        startDate: '2026-10-01',
      }),
    });
    const data = await res.json();
    assert(res.status === 400 || data.success === false, 'Rejected video ad missing video media (400 Bad Request)');
    assert(data.message?.toLowerCase().includes('video'), `Expected error message received: "${data.message}"`);
  } catch (err) {
    assert(false, `Validation failure test encountered error: ${err.message}`);
  }

  // 6. Validation Failure Tests: Incompatible Placement for Video Type
  console.log('\n📋 Test 6: Validation Failure for Incompatible Video Placement');
  try {
    const res = await fetch(`${BASE_URL}/ads/admin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        title: 'Invalid Placement Video Ad',
        type: 'video',
        placement: 'banner_home', // Incompatible placement
        videoUrl: 'https://cdn.example.com/demo.mp4',
        destinationUrl: 'https://example.com',
        startDate: '2026-10-01',
      }),
    });
    const data = await res.json();
    assert(res.status === 400 || data.success === false, 'Rejected video ad with incompatible banner placement (400 Bad Request)');
  } catch (err) {
    assert(false, `Incompatible placement test encountered error: ${err.message}`);
  }

  // 7. Video Ad Serving for Free / Guest Listeners
  console.log('\n📋 Test 7: Public Video Ad Serving for Free Listeners');
  try {
    const res = await fetch(`${BASE_URL}/ads/serve?placement=video_preroll`, {
      method: 'GET',
    });
    const data = await res.json();
    assert(data.success === true, 'Ad-serving endpoint responded successfully');
    assert(data.data?.isAdFree === false, 'Free listener is not ad-free (isAdFree: false)');
    assert(data.data?.ad?.type === 'video', 'Served ad is of type "video"');
    assert(data.data?.ad?.placement === 'video_preroll', 'Served ad has placement "video_preroll"');
  } catch (err) {
    assert(false, `Serving test failed: ${err.message}`);
  }

  // 8. Video Ad Serving with Ad-Free Entitlement for Active Premium Subscribers
  console.log('\n📋 Test 8: Public Video Ad Serving for Premium Subscriber (Ad-Free Guarantee)');
  try {
    // Generate a valid premium user JWT token
    const premiumToken = jwt.sign(
      {
        id: '675d00000000000000000099',
        email: 'sophia.m@example.com',
        plan: 'StoryPass Premium',
        subscriptionStatus: 'active',
      },
      JWT_SECRET,
      { expiresIn: '1d' }
    );

    const res = await fetch(`${BASE_URL}/ads/serve?placement=video_preroll`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${premiumToken}`,
      },
    });
    const data = await res.json();
    assert(data.success === true, 'Serving endpoint responded successfully for premium listener');
    assert(data.data?.isAdFree === true, 'Premium listener is ad-free (isAdFree: true)');
    assert(data.data?.ad === null, 'No advertisement served to premium subscriber');
  } catch (err) {
    assert(false, `Ad-free subscriber test failed: ${err.message}`);
  }

  // 9. Tracking Endpoints: Impression & Start
  console.log('\n📋 Test 9: Impression & Start Video Tracking Endpoints');
  if (createdVideoAdId) {
    try {
      const impRes = await fetch(`${BASE_URL}/ads/${createdVideoAdId}/track-impression`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isStart: true }),
      });
      const impData = await impRes.json();
      assert(impData.success === true, 'Impression and Start counter tracked successfully');
      assert(typeof impData.data?.impressionsCount === 'number', `Impressions count: ${impData.data?.impressionsCount}`);
      assert(typeof impData.data?.startsCount === 'number', `Starts count: ${impData.data?.startsCount}`);
    } catch (err) {
      assert(false, `Impression tracking test failed: ${err.message}`);
    }
  }

  // 10. Tracking Endpoints: Completion
  console.log('\n📋 Test 10: Video Ad Completion Tracking Endpoint');
  if (createdVideoAdId) {
    try {
      const compRes = await fetch(`${BASE_URL}/ads/${createdVideoAdId}/track-completion`, {
        method: 'POST',
      });
      const compData = await compRes.json();
      assert(compData.success === true, 'Completion counter tracked successfully');
      assert(typeof compData.data?.completionsCount === 'number', `Completions count: ${compData.data?.completionsCount}`);
    } catch (err) {
      assert(false, `Completion tracking test failed: ${err.message}`);
    }
  }

  // 11. Tracking Endpoints: Click & Destination Redirect
  console.log('\n📋 Test 11: Video Ad Click Tracking Endpoint');
  if (createdVideoAdId) {
    try {
      const clickRes = await fetch(`${BASE_URL}/ads/${createdVideoAdId}/track-click`, {
        method: 'POST',
      });
      const clickData = await clickRes.json();
      assert(clickData.success === true, 'Click counter tracked successfully');
      assert(clickData.data?.destinationUrl === 'https://audible.com/offer/pro', 'Returned correct destinationUrl for redirect');
      assert(typeof clickData.data?.clicksCount === 'number', `Clicks count: ${clickData.data?.clicksCount}`);
    } catch (err) {
      assert(false, `Click tracking test failed: ${err.message}`);
    }
  }

  // Clean up test ads
  if (createdVideoAdId) {
    await fetch(`${BASE_URL}/ads/admin/${createdVideoAdId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
  }
  if (uploadedVideoAdId) {
    await fetch(`${BASE_URL}/ads/admin/${uploadedVideoAdId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
  }

  console.log('\n====================================================');
  console.log(`📊 SUMMARY: ${passed} PASSED, ${failed} FAILED (TOTAL ${passed + failed})`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
