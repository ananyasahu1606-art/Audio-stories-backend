const mongoose = require('mongoose');
const assert = require('assert');
const jwt = require('jsonwebtoken');
const config = require('../src/config/env');
const User = require('../src/models/User');
const Plan = require('../src/models/Plan');
const Episode = require('../src/models/Episode');
const Story = require('../src/models/Story');
const { checkUserDownloadPermission, getUserEffectiveDownloadDetails } = require('../src/services/downloadPermission.service');

async function runTests() {
  console.log('🧪 Starting Download Permissions Automated Test Suite...');
  await mongoose.connect('mongodb://localhost:27017/audio_stories_db');

  try {
    // 1. Verify Free plan download permission
    const freePlan = await Plan.findOne({ $or: [{ slug: 'plan-free' }, { price: 0 }] });
    assert(freePlan, 'Free plan should exist');
    console.log(`[Test 1] Free plan "${freePlan.name}" downloadAllowed setting: ${freePlan.planLimits.downloadAllowed}`);

    const guestPerm = await checkUserDownloadPermission(null);
    assert.strictEqual(guestPerm, Boolean(freePlan.planLimits.downloadAllowed), 'Guest permission matches free plan setting');
    console.log('✅ [Test 1 Passed] Guest permission properly reflects Free plan downloadAllowed setting.');

    // 2. Free Listener User test
    const freeUser = await User.findOne({ plan: 'Free', role: 'listener' });
    if (freeUser) {
      const freeUserPerm = await checkUserDownloadPermission(freeUser);
      assert.strictEqual(freeUserPerm, Boolean(freePlan.planLimits.downloadAllowed), 'Free user permission matches free plan setting');
      console.log(`✅ [Test 2 Passed] Free user "${freeUser.name}" has downloadAllowed = ${freeUserPerm}.`);
    }

    // 3. Paid Subscriber User test (StoryPass Premium or Standard)
    const paidUser = await User.findOne({ subscriptionStatus: 'active', role: 'listener' });
    if (paidUser) {
      console.log(`[Test 3] Testing paid subscriber "${paidUser.name}" (Plan: ${paidUser.plan})...`);
      const paidPerm = await checkUserDownloadPermission(paidUser);
      console.log(`Paid user download allowed: ${paidPerm}`);
      assert.strictEqual(paidPerm, true, 'Active paid subscriber on plan with downloadAllowed:true should have permission true');
      console.log('✅ [Test 3 Passed] Paid subscriber has download permission granted.');
    }

    // 4. Test Dynamic Plan Toggle (Admin switching downloadAllowed OFF and ON)
    console.log('[Test 4] Testing dynamic toggle of downloadAllowed on a plan...');
    const testTimestamp = Date.now();
    const testPlanSlug = 'plan-test-toggle-' + testTimestamp;
    const testPlanName = 'Dynamic Toggle Plan ' + testTimestamp;
    const testPlan = await Plan.create({
      name: testPlanName,
      slug: testPlanSlug,
      price: 299,
      currency: '₹',
      billingPeriod: 'month',
      durationDays: 30,
      description: 'Test plan for dynamic toggle',
      isActive: true,
      planLimits: {
        ads: false,
        videoCast: true,
        downloadAllowed: true, // Initially ON
      },
    });

    const testUser = await User.create({
      name: 'Toggle Test User',
      email: `toggle_${Date.now()}@example.com`,
      password: 'password123',
      role: 'listener',
      plan: testPlan.name,
      subscriptionStatus: 'active',
      subscriptionExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });

    // Check with downloadAllowed: true
    let perm = await checkUserDownloadPermission(testUser);
    assert.strictEqual(perm, true, 'User should have downloadAllowed: true when plan setting is ON');
    console.log('   - downloadAllowed is ON -> User download permission is TRUE');

    // Admin turns downloadAllowed OFF
    testPlan.planLimits.downloadAllowed = false;
    testPlan.markModified('planLimits');
    await testPlan.save();

    perm = await checkUserDownloadPermission(testUser);
    assert.strictEqual(perm, false, 'User should have downloadAllowed: false when plan setting is turned OFF');
    console.log('   - downloadAllowed turned OFF -> User download permission is FALSE');

    // Admin turns downloadAllowed back ON
    testPlan.planLimits.downloadAllowed = true;
    testPlan.markModified('planLimits');
    await testPlan.save();

    perm = await checkUserDownloadPermission(testUser);
    assert.strictEqual(perm, true, 'User should have downloadAllowed: true when plan setting is restored to ON');
    console.log('   - downloadAllowed restored ON -> User download permission is TRUE');
    console.log('✅ [Test 4 Passed] Dynamic plan toggle instantly updates user permissions with zero hardcoding.');

    // 5. Test Direct HTTP API requests
    console.log('[Test 5] Testing direct API endpoint authorization...');
    const anyEpisode = await Episode.findOne();
    assert(anyEpisode, 'An episode should exist for testing');

    const app = require('../src/app');
    const http = require('http');
    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;

    const freeToken = jwt.sign({ id: freeUser ? freeUser._id : 'dummy', role: 'listener' }, config.jwtSecret);
    const paidToken = paidUser ? jwt.sign({ id: paidUser._id, role: 'listener' }, config.jwtSecret) : '';

    // Direct request with Free user (downloads disabled for Free plan)
    const freeRes = await fetch(`http://localhost:${port}/api/episodes/${anyEpisode._id}/download`, {
      headers: { Authorization: `Bearer ${freeToken}` },
    });
    console.log(`   - Free user direct download request status: ${freeRes.status}`);
    assert.strictEqual(freeRes.status, 403, 'Free user must be rejected with 403 Forbidden');
    const freeBody = await freeRes.json();
    console.log(`   - Free user blocked message: "${freeBody.message}"`);
    assert(freeBody.message.includes('not permitted'), 'Blocked message explains plan restriction');

    // Direct request with no auth / guest
    const guestRes = await fetch(`http://localhost:${port}/api/episodes/${anyEpisode._id}/download`);
    console.log(`   - Guest user direct download request status: ${guestRes.status}`);
    assert.strictEqual(guestRes.status, 403, 'Guest user must be rejected with 403 Forbidden when Free plan has downloadAllowed:false');

    // Direct request with Paid user (downloads enabled for paid plan)
    if (paidToken) {
      const paidRes = await fetch(`http://localhost:${port}/api/episodes/${anyEpisode._id}/download`, {
        headers: { Authorization: `Bearer ${paidToken}` },
      });
      console.log(`   - Paid user direct download request status: ${paidRes.status}`);
      assert.strictEqual(paidRes.status, 200, 'Eligible subscriber must receive 200 OK');
      const disp = paidRes.headers.get('content-disposition');
      console.log(`   - Paid user Content-Disposition header: "${disp}"`);
      assert(disp && disp.includes('attachment'), 'Response must have attachment Content-Disposition header');
    }

    console.log('✅ [Test 5 Passed] Direct API endpoints enforce plan permissions and reject unauthorized requests.');

    // Cleanup test plan and test user
    await Plan.findByIdAndDelete(testPlan._id);
    await User.findByIdAndDelete(testUser._id);
    server.close();

    console.log('🎉 All Download Permission Tests PASSED Successfully!');
  } catch (err) {
    console.error('❌ Test failed:', err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

runTests();
