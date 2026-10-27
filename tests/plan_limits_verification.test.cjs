const http = require('http');

function request(options, data) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, raw: body });
        }
      });
    });
    req.on('error', reject);
    if (data) {
      req.write(typeof data === 'string' ? data : JSON.stringify(data));
    }
    req.end();
  });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion Failed: ${message}`);
  }
}

async function runTests() {
  console.log('=== STARTING ELEVSTORY PLAN LIMITS AUTOMATED VERIFICATION ===\n');

  // 1. Authenticate Admin
  console.log('1. Authenticating Admin...');
  let adminLogin = await request(
    {
      hostname: 'localhost',
      port: 5000,
      path: '/api/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    },
    { email: 'admin@example.com', password: 'password123' }
  );

  let adminToken = adminLogin.data?.data?.token;
  if (!adminToken) {
    adminLogin = await request(
      {
        hostname: 'localhost',
        port: 5000,
        path: '/api/auth/login',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
      { email: 'admin@example.com', password: '123456' }
    );
    adminToken = adminLogin.data?.data?.token;
  }
  assert(adminToken, 'Admin token acquired');
  console.log('✔ Admin authenticated successfully.');

  // 2. Fetch existing plans and verify legacy data safety
  console.log('\n2. Fetching existing plans and validating legacy planLimits defaults...');
  const plansRes = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/subscription-plans',
    method: 'GET',
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert(plansRes.status === 200, 'Plans fetched successfully');
  const existingPlans = plansRes.data?.data || [];
  assert(existingPlans.length > 0, 'Found existing plans in database');
  console.log(`✔ Found ${existingPlans.length} existing plans.`);

  for (const p of existingPlans) {
    assert(p.planLimits !== undefined, `Plan ${p.name} has planLimits defined`);
    assert(typeof p.planLimits.ads === 'boolean', `Plan ${p.name} has boolean ads limit`);
    console.log(`   - ${p.name} (${p.slug}): Ads=${p.planLimits.ads}, VideoCast=${p.planLimits.videoCast}, Download=${p.planLimits.downloadAllowed}`);
  }

  // 3. Create a Plan WITHOUT features / benefits, WITH Plan Limits
  console.log('\n3. Creating new plan with Plan Limits (No features provided)...');
  const testPlanSlug = `test-limits-${Date.now()}`;
  const createPlanPayload = {
    name: 'Pro Limits Tier',
    slug: testPlanSlug,
    tagline: 'High tier with custom limits',
    description: 'Testing plan limits creation without any included features',
    price: 349,
    currency: '₹',
    duration: 1,
    durationUnit: 'month',
    status: 'Active',
    displayOrder: 99,
    planLimits: {
      ads: false, // Ad-Free
      videoCast: true,
      downloadAllowed: true,
      deviceLimitEnabled: true,
      maxDevices: 4,
      profileLimitEnabled: true,
      maxProfiles: 3,
      supportedDeviceTypesEnabled: true,
      supportedDeviceTypes: ['Mobile', 'Tablet', 'TV'],
    },
  };

  const createRes = await request(
    {
      hostname: 'localhost',
      port: 5000,
      path: '/api/subscription-plans',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
    },
    createPlanPayload
  );

  assert(createRes.status === 201 || createRes.status === 200, `Create plan returned 201/200 (Got ${createRes.status}): ${JSON.stringify(createRes.data)}`);
  const createdPlan = createRes.data?.data;
  assert(createdPlan, 'Created plan data exists');
  assert(createdPlan.planLimits.ads === false, 'Ads limit is false (Ad-free)');
  assert(createdPlan.planLimits.videoCast === true, 'Video Cast limit is true');
  assert(createdPlan.planLimits.downloadAllowed === true, 'Download Allowed is true');
  assert(createdPlan.planLimits.deviceLimitEnabled === true, 'Device Limit is enabled');
  assert(createdPlan.planLimits.maxDevices === 4, 'Max Devices is 4');
  assert(createdPlan.planLimits.profileLimitEnabled === true, 'Profile Limit is enabled');
  assert(createdPlan.planLimits.maxProfiles === 3, 'Max Profiles is 3');
  assert(createdPlan.planLimits.supportedDeviceTypesEnabled === true, 'Device types enabled');
  assert(createdPlan.planLimits.supportedDeviceTypes.includes('TV'), 'TV is in supported devices');
  console.log('✔ Plan created successfully without features and all Plan Limits persisted.');

  // 4. Test Validation on Plan Limits (Numeric validation)
  console.log('\n4. Testing backend validation for numeric inputs...');
  
  // Test invalid maxDevices = 0
  const invalidDevicesRes = await request(
    {
      hostname: 'localhost',
      port: 5000,
      path: `/api/subscription-plans/${createdPlan._id || createdPlan.id}`,
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
    },
    {
      planLimits: {
        deviceLimitEnabled: true,
        maxDevices: 0,
      },
    }
  );
  assert(invalidDevicesRes.status === 400, `Setting maxDevices=0 returned status 400 (Got ${invalidDevicesRes.status})`);
  console.log('✔ Correctly rejected maxDevices = 0 with HTTP 400.');

  // Test invalid maxProfiles = -5
  const invalidProfilesRes = await request(
    {
      hostname: 'localhost',
      port: 5000,
      path: `/api/subscription-plans/${createdPlan._id || createdPlan.id}`,
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
    },
    {
      planLimits: {
        profileLimitEnabled: true,
        maxProfiles: -5,
      },
    }
  );
  assert(invalidProfilesRes.status === 400, `Setting maxProfiles=-5 returned status 400 (Got ${invalidProfilesRes.status})`);
  console.log('✔ Correctly rejected negative maxProfiles with HTTP 400.');

  // 5. Update Plan Limits (toggle Ads to ON, change device types and limits)
  console.log('\n5. Updating Plan Limits: Ads: ON, Max Devices: 2, Device Types: Desktop, Mobile...');
  const updateRes = await request(
    {
      hostname: 'localhost',
      port: 5000,
      path: `/api/subscription-plans/${createdPlan._id || createdPlan.id}`,
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
    },
    {
      planLimits: {
        ads: true, // Now show ads!
        videoCast: false,
        downloadAllowed: true,
        deviceLimitEnabled: true,
        maxDevices: 2,
        profileLimitEnabled: false,
        maxProfiles: 1,
        supportedDeviceTypesEnabled: true,
        supportedDeviceTypes: ['Desktop', 'Mobile'],
      },
    }
  );
  assert(updateRes.status === 200, 'Plan updated successfully');
  const updatedPlan = updateRes.data?.data;
  assert(updatedPlan.planLimits.ads === true, 'Ads toggle updated to true');
  assert(updatedPlan.planLimits.maxDevices === 2, 'Max devices updated to 2');
  assert(updatedPlan.planLimits.supportedDeviceTypes.includes('Desktop'), 'Supported device includes Desktop');
  assert(!updatedPlan.planLimits.supportedDeviceTypes.includes('TV'), 'TV removed from supported devices');
  console.log('✔ Plan updated and changes verified in response.');

  // 6. Test GET single plan to verify persistence
  console.log('\n6. Verifying persistence via GET /api/subscription-plans/:id...');
  const getSingleRes = await request({
    hostname: 'localhost',
    port: 5000,
    path: `/api/subscription-plans/${createdPlan._id || createdPlan.id}`,
    method: 'GET',
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert(getSingleRes.status === 200, 'Single plan fetched successfully');
  const fetchedPlan = getSingleRes.data?.data;
  assert(fetchedPlan.planLimits.ads === true, 'Persisted Ads is true');
  assert(fetchedPlan.planLimits.maxDevices === 2, 'Persisted Max Devices is 2');
  console.log('✔ Persisted settings confirmed after reload.');

  // 7. Test Ad-Free Enforcement Logic
  console.log('\n7. Testing Ads enforcement via /api/ads/serve...');

  // A. Guest User (No Authorization header) -> Ads should be served (isAdFree: false)
  const guestAdRes = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/ads/serve?placement=audio_preroll',
    method: 'GET',
  });
  assert(guestAdRes.status === 200, 'Guest ad serving returned 200');
  assert(guestAdRes.data?.data?.isAdFree === false, 'Guest is NOT ad-free');
  console.log('✔ Guest listener receives ads (isAdFree: false) as expected.');

  // B. Paid subscriber with Ads: OFF (Ad-Free plan)
  // Let's toggle our test plan back to Ads: OFF
  await request(
    {
      hostname: 'localhost',
      port: 5000,
      path: `/api/subscription-plans/${createdPlan._id || createdPlan.id}`,
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
    },
    {
      planLimits: {
        ads: false, // Ad-Free
      },
    }
  );

  // Authenticate listener
  const listenerLogin = await request(
    {
      hostname: 'localhost',
      port: 5000,
      path: '/api/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    },
    { email: 'anu@example.com', password: 'password123' }
  );

  let listenerToken = listenerLogin.data?.data?.token;
  if (!listenerToken) {
    const retryListener = await request(
      {
        hostname: 'localhost',
        port: 5000,
        path: '/api/auth/login',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
      { email: 'anu@example.com', password: '123456' }
    );
    listenerToken = retryListener.data?.data?.token;
  }

  if (listenerToken) {
    console.log('✔ Listener authenticated.');
    
    // Check ad-serving for listener
    const listenerAdRes = await request({
      hostname: 'localhost',
      port: 5000,
      path: '/api/ads/serve?placement=audio_preroll',
      method: 'GET',
      headers: { Authorization: `Bearer ${listenerToken}` },
    });
    console.log(`   Listener ad check result: isAdFree = ${listenerAdRes.data?.data?.isAdFree}`);
  }

  // 8. Cleanup test plan
  console.log('\n8. Cleaning up test plan...');
  const deleteRes = await request({
    hostname: 'localhost',
    port: 5000,
    path: `/api/subscription-plans/${createdPlan._id || createdPlan.id}`,
    method: 'DELETE',
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert(deleteRes.status === 200, 'Test plan deleted');
  console.log('✔ Test plan cleaned up successfully.');

  console.log('\n======================================================');
  console.log('🎉 ALL PLAN LIMITS VERIFICATION TESTS PASSED SUCCESSFULLY!');
  console.log('======================================================\n');
}

runTests().catch((err) => {
  console.error('\n❌ Test execution failed:', err);
  process.exit(1);
});
