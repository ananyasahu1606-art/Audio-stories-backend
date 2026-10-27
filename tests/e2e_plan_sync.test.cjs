const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const config = require('../src/config/env');

const JWT_SECRET = config.jwtSecret;

async function runPlanSyncTests() {
  console.log('====================================================');
  console.log('🚀 ElevStory Subscription Plan Synchronization E2E Test');
  console.log('====================================================\n');

  await mongoose.connect('mongodb://localhost:27017/audio_stories_db');
  const Plan = mongoose.model('Plan', new mongoose.Schema({}, { strict: false }));
  const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }));
  const Subscription = mongoose.model('Subscription', new mongoose.Schema({}, { strict: false }));

  // Find plans
  const premiumPlan = await Plan.findOne({ $or: [{ slug: 'plan-premium' }, { name: 'StoryPass Premium' }, { name: 'premium' }] });
  const standardPlan = await Plan.findOne({ $or: [{ slug: 'plan-standard' }, { name: 'standard' }] });
  const freePlan = await Plan.findOne({ $or: [{ slug: 'plan-free' }, { price: 0 }] });

  if (!premiumPlan || !standardPlan || !freePlan) {
    console.error('❌ Could not find required plans in DB');
    process.exit(1);
  }

  console.log('Found plans:', {
    premium: { id: premiumPlan._id.toString(), name: premiumPlan.name, slug: premiumPlan.slug },
    standard: { id: standardPlan._id.toString(), name: standardPlan.name, slug: standardPlan.slug },
    free: { id: freePlan._id.toString(), name: freePlan.name, slug: freePlan.slug },
  });

  // Ensure two test users exist
  let testUserA = await User.findOne({ email: 'test.sync.user.a@example.com' });
  if (!testUserA) {
    testUserA = await User.create({
      name: 'User Alpha',
      email: 'test.sync.user.a@example.com',
      password: 'Password123!',
      role: 'listener',
      plan: 'Free',
      status: 'Active',
      joinedDate: '2026-10-13',
    });
  }

  let testUserB = await User.findOne({ email: 'test.sync.user.b@example.com' });
  if (!testUserB) {
    testUserB = await User.create({
      name: 'User Beta',
      email: 'test.sync.user.b@example.com',
      password: 'Password123!',
      role: 'listener',
      plan: 'Free',
      status: 'Active',
      joinedDate: '2026-10-13',
    });
  }

  const adminToken = jwt.sign({ id: 'admin123', role: 'admin' }, JWT_SECRET, { expiresIn: '1d' });
  const tokenA = jwt.sign({ id: testUserA._id.toString(), email: testUserA.email, role: 'listener' }, JWT_SECRET, { expiresIn: '1d' });
  const tokenB = jwt.sign({ id: testUserB._id.toString(), email: testUserB.email, role: 'listener' }, JWT_SECRET, { expiresIn: '1d' });

  // Helper to update plan via Admin API
  async function adminAssignPlan(userId, planId, planName, status = 'active') {
    const res = await fetch(`http://localhost:5000/api/users/${userId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + adminToken,
      },
      body: JSON.stringify({
        plan: planName,
        planId: planId,
        subscriptionStatus: status,
      }),
    });
    return res.json();
  }

  // Helper to fetch listener profile
  async function fetchListenerMe(token) {
    const res = await fetch('http://localhost:5000/api/auth/listener/me', {
      headers: { Authorization: 'Bearer ' + token },
    });
    return res.json();
  }

  // Helper to fetch listener subscription
  async function fetchListenerSub(token) {
    const res = await fetch('http://localhost:5000/api/subscriptions/me', {
      headers: { Authorization: 'Bearer ' + token },
    });
    return res.json();
  }

  // TEST 1: Assign Premium to User A
  console.log('\n--- TEST 1: Admin Assigns Premium to User A ---');
  const assignPremiumRes = await adminAssignPlan(testUserA._id, premiumPlan._id.toString(), premiumPlan.name, 'active');
  if (!assignPremiumRes.success) throw new Error('Failed to assign Premium: ' + assignPremiumRes.message);

  const meAfterPremium = await fetchListenerMe(tokenA);
  const subAfterPremium = await fetchListenerSub(tokenA);

  console.log('User A Profile (me):', meAfterPremium.data?.plan);
  console.log('User A Subscription (sub):', subAfterPremium.data?.user?.plan, 'Status active?', subAfterPremium.data?.hasActiveSubscription);

  if (
    !meAfterPremium.data?.plan.toLowerCase().includes('premium') ||
    !subAfterPremium.data?.user?.plan.toLowerCase().includes('premium') ||
    !subAfterPremium.data?.hasActiveSubscription
  ) {
    throw new Error('Test 1 Failed: Premium plan not reflected on listener endpoints!');
  }
  console.log('✅ TEST 1 PASSED: Admin assigns Premium -> Listener Profile & Navbar reflect Premium.');

  // TEST 2: Assign Standard to User A
  console.log('\n--- TEST 2: Admin Assigns Standard to User A ---');
  const assignStandardRes = await adminAssignPlan(testUserA._id, standardPlan._id.toString(), standardPlan.name, 'active');
  if (!assignStandardRes.success) throw new Error('Failed to assign Standard: ' + assignStandardRes.message);

  const meAfterStandard = await fetchListenerMe(tokenA);
  const subAfterStandard = await fetchListenerSub(tokenA);

  console.log('User A Profile (me):', meAfterStandard.data?.plan);
  console.log('User A Subscription (sub):', subAfterStandard.data?.user?.plan, 'Status active?', subAfterStandard.data?.hasActiveSubscription);

  if (
    !meAfterStandard.data?.plan.toLowerCase().includes('standard') ||
    !subAfterStandard.data?.user?.plan.toLowerCase().includes('standard') ||
    !subAfterStandard.data?.hasActiveSubscription
  ) {
    throw new Error('Test 2 Failed: Standard plan not reflected on listener endpoints!');
  }
  console.log('✅ TEST 2 PASSED: Admin assigns Standard -> Listener Profile & Navbar reflect Standard.');

  // TEST 3: Assign Free to User A
  console.log('\n--- TEST 3: Admin Assigns Free to User A ---');
  const assignFreeRes = await adminAssignPlan(testUserA._id, freePlan._id.toString(), freePlan.name, 'active');
  if (!assignFreeRes.success) throw new Error('Failed to assign Free: ' + assignFreeRes.message);

  const meAfterFree = await fetchListenerMe(tokenA);
  const subAfterFree = await fetchListenerSub(tokenA);

  console.log('User A Profile (me):', meAfterFree.data?.plan);
  console.log('User A Subscription (sub):', subAfterFree.data?.user?.plan);

  if (
    meAfterFree.data?.plan !== 'Free' ||
    (subAfterFree.data?.user?.plan !== 'Free' && !subAfterFree.data?.user?.plan.toLowerCase().includes('free'))
  ) {
    throw new Error('Test 3 Failed: Free plan not reflected on listener endpoints!');
  }
  console.log('✅ TEST 3 PASSED: Admin assigns Free -> Listener Profile & Navbar reflect Free.');

  // TEST 4: Isolation — Changing User A does NOT affect User B
  console.log('\n--- TEST 4: User Isolation Check ---');
  const userBBefore = await fetchListenerMe(tokenB);
  console.log('User B before modifying User A again:', userBBefore.data?.plan);

  // Now change User A to Premium
  await adminAssignPlan(testUserA._id, premiumPlan._id.toString(), premiumPlan.name, 'active');

  const userAAfter = await fetchListenerMe(tokenA);
  const userBAfter = await fetchListenerMe(tokenB);

  console.log('User A plan now:', userAAfter.data?.plan);
  console.log('User B plan now:', userBAfter.data?.plan);

  if (!userAAfter.data?.plan.toLowerCase().includes('premium')) {
    throw new Error('Test 4 Failed: User A was not updated to Premium');
  }
  if (userBAfter.data?.plan !== userBBefore.data?.plan) {
    throw new Error('Test 4 Failed: User B plan was unexpectedly modified!');
  }
  console.log('✅ TEST 4 PASSED: Changing User A did NOT affect User B.');

  // TEST 5: Non-active statuses do NOT grant paid benefits
  console.log('\n--- TEST 5: Non-active status verification ---');
  await adminAssignPlan(testUserA._id, premiumPlan._id.toString(), premiumPlan.name, 'expired');
  const meExpired = await fetchListenerMe(tokenA);
  const subExpired = await fetchListenerSub(tokenA);
  console.log('User A with status expired -> Profile plan:', meExpired.data?.plan, 'Active sub?', subExpired.data?.hasActiveSubscription);

  if (meExpired.data?.plan !== 'Free' || subExpired.data?.hasActiveSubscription) {
    throw new Error('Test 5 Failed: Expired subscription granted paid plan!');
  }
  console.log('✅ TEST 5 PASSED: Expired/failed status safely revokes paid plan.');

  console.log('\n====================================================');
  console.log('🎉 ALL PLAN SYNCHRONIZATION TESTS PASSED SUCCESSFULLY!');
  console.log('====================================================');
  process.exit(0);
}

runPlanSyncTests().catch((err) => {
  console.error('\n❌ Test Execution Failed:', err);
  process.exit(1);
});
