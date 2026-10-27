const mongoose = require('mongoose');
const assert = require('assert');
const jwt = require('jsonwebtoken');
const config = require('../src/config/env');
const User = require('../src/models/User');
const Plan = require('../src/models/Plan');
const Episode = require('../src/models/Episode');
const Story = require('../src/models/Story');

async function runEndToEndVerification() {
  console.log('====================================================');
  console.log('🚀 ElevStory Audio Stories Download Permissions E2E Test');
  console.log('====================================================');

  await mongoose.connect('mongodb://localhost:27017/audio_stories_db');
  const app = require('../src/app');
  const http = require('http');
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  try {
    const episode = await Episode.findOne();
    const story = await Story.findOne();
    assert(episode, 'Test episode should exist');
    assert(story, 'Test story should exist');

    // ──────────────────────────────────────────────────────────────────
    // CASE 1: Free plan — Download Allowed OFF
    // ──────────────────────────────────────────────────────────────────
    console.log('\n--- Case 1: Free plan — Download Allowed OFF ---');
    const freePlan = await Plan.findOne({ $or: [{ slug: 'plan-free' }, { price: 0 }] });
    assert(freePlan, 'Free plan exists');
    assert.strictEqual(Boolean(freePlan.planLimits?.downloadAllowed), false, 'Free plan downloadAllowed is OFF');

    const freeUser = await User.findOne({ plan: 'Free', role: 'listener' });
    assert(freeUser, 'Free listener user exists');
    const freeToken = jwt.sign({ id: freeUser._id, email: freeUser.email, role: 'listener' }, config.jwtSecret);

    // Verify /api/auth/listener/me
    const freeMeRes = await fetch(`${baseUrl}/api/auth/listener/me`, {
      headers: { Authorization: `Bearer ${freeToken}` },
    });
    const freeMeData = await freeMeRes.json();
    console.log(`[Case 1] /api/auth/listener/me downloadAllowed: ${freeMeData.data.downloadAllowed}`);
    assert.strictEqual(freeMeData.data.downloadAllowed, false, 'Free user profile must have downloadAllowed: false');

    // Verify /api/subscriptions/download-permission
    const freePermRes = await fetch(`${baseUrl}/api/subscriptions/download-permission`, {
      headers: { Authorization: `Bearer ${freeToken}` },
    });
    const freePermData = await freePermRes.json();
    console.log(`[Case 1] /api/subscriptions/download-permission downloadAllowed: ${freePermData.data.downloadAllowed}`);
    assert.strictEqual(freePermData.data.downloadAllowed, false, 'Free user permission endpoint must have downloadAllowed: false');

    // Verify direct API download blocked with 403 Forbidden
    const freeEpDl = await fetch(`${baseUrl}/api/episodes/${episode._id}/download`, {
      headers: { Authorization: `Bearer ${freeToken}` },
    });
    console.log(`[Case 1] Direct episode download status: ${freeEpDl.status}`);
    assert.strictEqual(freeEpDl.status, 403, 'Free user episode download must return 403 Forbidden');

    const freeStoryDl = await fetch(`${baseUrl}/api/stories/${story._id}/download`, {
      headers: { Authorization: `Bearer ${freeToken}` },
    });
    console.log(`[Case 1] Direct story download status: ${freeStoryDl.status}`);
    assert.strictEqual(freeStoryDl.status, 403, 'Free user story download must return 403 Forbidden');
    console.log('✅ Case 1 Verified: Free plan user blocked from downloading, downloadAllowed is false.');

    // ──────────────────────────────────────────────────────────────────
    // CASE 2: Standard plan — Download Allowed ON
    // ──────────────────────────────────────────────────────────────────
    console.log('\n--- Case 2: Standard plan — Download Allowed ON ---');
    const standardUser = await User.findOne({ plan: 'standard', subscriptionStatus: 'active', role: 'listener' });
    assert(standardUser, 'Standard subscriber exists');
    const standardToken = jwt.sign({ id: standardUser._id, email: standardUser.email, role: 'listener' }, config.jwtSecret);

    const standardMeRes = await fetch(`${baseUrl}/api/auth/listener/me`, {
      headers: { Authorization: `Bearer ${standardToken}` },
    });
    const standardMeData = await standardMeRes.json();
    console.log(`[Case 2] Standard user downloadAllowed: ${standardMeData.data.downloadAllowed}`);
    assert.strictEqual(standardMeData.data.downloadAllowed, true, 'Standard subscriber must have downloadAllowed: true');

    const standardDlRes = await fetch(`${baseUrl}/api/episodes/${episode._id}/download`, {
      headers: { Authorization: `Bearer ${standardToken}` },
    });
    console.log(`[Case 2] Standard user episode download status: ${standardDlRes.status}`);
    assert.strictEqual(standardDlRes.status, 200, 'Standard subscriber download must succeed with 200');
    assert(standardDlRes.headers.get('content-disposition').includes('attachment'), 'Attachment header present');
    console.log('✅ Case 2 Verified: Standard plan user has downloadAllowed = true and download succeeds.');

    // ──────────────────────────────────────────────────────────────────
    // CASE 3: Premium plan — Download Allowed ON
    // ──────────────────────────────────────────────────────────────────
    console.log('\n--- Case 3: Premium plan — Download Allowed ON ---');
    const premiumUser = await User.findOne({ plan: 'StoryPass Premium', subscriptionStatus: 'active', role: 'listener' });
    assert(premiumUser, 'Premium subscriber exists');
    const premiumToken = jwt.sign({ id: premiumUser._id, email: premiumUser.email, role: 'listener' }, config.jwtSecret);

    const premiumMeRes = await fetch(`${baseUrl}/api/auth/listener/me`, {
      headers: { Authorization: `Bearer ${premiumToken}` },
    });
    const premiumMeData = await premiumMeRes.json();
    console.log(`[Case 3] Premium user downloadAllowed: ${premiumMeData.data.downloadAllowed}`);
    assert.strictEqual(premiumMeData.data.downloadAllowed, true, 'Premium subscriber must have downloadAllowed: true');

    const premiumDlRes = await fetch(`${baseUrl}/api/episodes/${episode._id}/download`, {
      headers: { Authorization: `Bearer ${premiumToken}` },
    });
    console.log(`[Case 3] Premium user episode download status: ${premiumDlRes.status}`);
    assert.strictEqual(premiumDlRes.status, 200, 'Premium subscriber download must succeed with 200');
    console.log('✅ Case 3 Verified: Premium plan user has downloadAllowed = true and download succeeds.');

    // ──────────────────────────────────────────────────────────────────
    // CASE 4: Turning downloads OFF for a plan removes permission & blocks downloads
    // ──────────────────────────────────────────────────────────────────
    console.log('\n--- Case 4: Turning downloads OFF for a plan ---');
    const planStandardDoc = await Plan.findOne({ name: 'standard' });
    assert(planStandardDoc, 'standard plan doc found');

    // Admin turns downloads OFF
    planStandardDoc.planLimits.downloadAllowed = false;
    planStandardDoc.markModified('planLimits');
    await planStandardDoc.save();

    const standardMeAfterOff = await fetch(`${baseUrl}/api/auth/listener/me`, {
      headers: { Authorization: `Bearer ${standardToken}` },
    });
    const standardOffData = await standardMeAfterOff.json();
    console.log(`[Case 4] After turning OFF, downloadAllowed: ${standardOffData.data.downloadAllowed}`);
    assert.strictEqual(standardOffData.data.downloadAllowed, false, 'downloadAllowed must now be false');

    const standardDlAfterOff = await fetch(`${baseUrl}/api/episodes/${episode._id}/download`, {
      headers: { Authorization: `Bearer ${standardToken}` },
    });
    console.log(`[Case 4] Direct download status after turning OFF: ${standardDlAfterOff.status}`);
    assert.strictEqual(standardDlAfterOff.status, 403, 'Must return 403 Forbidden after turning downloads OFF');
    console.log('✅ Case 4 Verified: Turning downloads OFF immediately revokes permission and blocks downloads.');

    // ──────────────────────────────────────────────────────────────────
    // CASE 5: Turning downloads ON restores permission & download functionality
    // ──────────────────────────────────────────────────────────────────
    console.log('\n--- Case 5: Turning downloads ON restores permission ---');
    // Admin turns downloads back ON
    planStandardDoc.planLimits.downloadAllowed = true;
    planStandardDoc.markModified('planLimits');
    await planStandardDoc.save();

    const standardMeAfterOn = await fetch(`${baseUrl}/api/auth/listener/me`, {
      headers: { Authorization: `Bearer ${standardToken}` },
    });
    const standardOnData = await standardMeAfterOn.json();
    console.log(`[Case 5] After restoring ON, downloadAllowed: ${standardOnData.data.downloadAllowed}`);
    assert.strictEqual(standardOnData.data.downloadAllowed, true, 'downloadAllowed must now be true');

    const standardDlAfterOn = await fetch(`${baseUrl}/api/episodes/${episode._id}/download`, {
      headers: { Authorization: `Bearer ${standardToken}` },
    });
    console.log(`[Case 5] Direct download status after restoring ON: ${standardDlAfterOn.status}`);
    assert.strictEqual(standardDlAfterOn.status, 200, 'Must return 200 OK after restoring downloads ON');
    console.log('✅ Case 5 Verified: Turning downloads ON immediately restores permission and downloads work.');

    // ──────────────────────────────────────────────────────────────────
    // CASE 6: Direct API requests cannot bypass the plan restriction
    // ──────────────────────────────────────────────────────────────────
    console.log('\n--- Case 6: Direct API requests cannot bypass restriction ---');
    // 6a: Unauthenticated guest request
    const guestReq = await fetch(`${baseUrl}/api/episodes/${episode._id}/download`);
    console.log(`[Case 6a] Unauthenticated request status: ${guestReq.status}`);
    assert.strictEqual(guestReq.status, 403, 'Unauthenticated direct download is blocked with 403');

    // 6b: Request with expired token / fake token
    const fakeTokenReq = await fetch(`${baseUrl}/api/episodes/${episode._id}/download`, {
      headers: { Authorization: 'Bearer invalid.fake.token' },
    });
    console.log(`[Case 6b] Invalid token request status: ${fakeTokenReq.status}`);
    assert.strictEqual(fakeTokenReq.status, 403, 'Invalid token direct download is blocked with 403');

    // 6c: Free user attempting to hit story download URL
    const bypassStoryReq = await fetch(`${baseUrl}/api/stories/${story._id}/download`, {
      headers: { Authorization: `Bearer ${freeToken}` },
    });
    console.log(`[Case 6c] Free user hitting story download status: ${bypassStoryReq.status}`);
    assert.strictEqual(bypassStoryReq.status, 403, 'Free user story download is blocked with 403');
    console.log('✅ Case 6 Verified: Direct API requests strictly blocked; cannot bypass plan limits.');

    console.log('\n====================================================');
    console.log('🎉 ALL 6 VERIFICATION TEST CASES PASSED FLAWLESSLY!');
    console.log('====================================================');

    server.close();
  } catch (err) {
    console.error('❌ E2E Verification failed:', err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

runEndToEndVerification();
