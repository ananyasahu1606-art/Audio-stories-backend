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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runTests() {
  console.log('=== STARTING NOTIFICATION SYSTEM PHASE 4 AUTOMATED TESTS ===\n');

  // 1. Authenticate Admin
  console.log('1. Authenticating Admin...');
  const adminLogin = await request(
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
    const retry = await request(
      {
        hostname: 'localhost',
        port: 5000,
        path: '/api/auth/login',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
      { email: 'admin@example.com', password: '123456' }
    );
    adminToken = retry.data?.data?.token;
  }
  assert(adminToken, 'Admin token acquired');
  console.log('✔ Admin authenticated successfully.');

  // 2. Authenticate Listener 1 (anu@example.com)
  console.log('\n2. Authenticating Listener 1 (anu@example.com)...');
  let listener1Login = await request(
    {
      hostname: 'localhost',
      port: 5000,
      path: '/api/auth/listener/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    },
    { email: 'anu@example.com', password: 'AudioPass2026!' }
  );
  if (!listener1Login.data?.data?.token) {
    listener1Login = await request(
      {
        hostname: 'localhost',
        port: 5000,
        path: '/api/auth/listener/login',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
      { email: 'anu@example.com', password: 'listenerPass123' }
    );
  }
  const listener1Token = listener1Login.data?.data?.token;
  const listener1User = listener1Login.data?.data?.user;
  assert(listener1Token, 'Listener 1 token acquired');
  console.log(`✔ Listener 1 authenticated (${listener1User.email}, ID: ${listener1User.id || listener1User._id}).`);

  // 3. Test Story Publication Trigger & Genre Targeting
  console.log('\n3. Testing Story Publication Trigger & Genre Targeting...');
  // Get an existing category ID and its real name
  const catRes = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/categories',
    method: 'GET',
  });
  const selectedCat = catRes.data?.data?.categories?.[0];
  const categoryId = String(selectedCat?._id || selectedCat?.id || '');
  const targetCategoryName = selectedCat?.name || 'Mystery & Thriller';

  // Ensure Listener 1 has this exact category in favoriteGenres
  await request(
    {
      hostname: 'localhost',
      port: 5000,
      path: `/api/users/${listener1User.id || listener1User._id}`,
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
    },
    {
      favoriteGenres: [targetCategoryName],
    }
  );

  const narratorRes = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/narrators',
    method: 'GET',
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const narratorId = String(narratorRes.data?.data?.narrators?.[0]?._id || narratorRes.data?.data?.narrators?.[0]?.id || '');

  // Step A: Create story as Draft
  const testStoryTitle = `Test Auto-Trigger Story ${Date.now()}`;
  const createDraftStoryRes = await request(
    {
      hostname: 'localhost',
      port: 5000,
      path: '/api/stories',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
    },
    {
      title: testStoryTitle,
      shortDescription: 'Testing automatic story publication notification trigger',
      categoryId,
      narratorId,
      categoryName: targetCategoryName,
      storyType: 'Mystery',
      status: 'Draft',
    }
  );

  if (createDraftStoryRes.status !== 201) {
    console.error('DEBUG Story create failure:', createDraftStoryRes);
  }
  assert(createDraftStoryRes.status === 201, 'Draft story created');
  const storyId = createDraftStoryRes.data?.data?._id || createDraftStoryRes.data?.data?.id;

  // Verify listener did NOT receive notification for draft creation
  await sleep(200);
  const inboxAfterDraft = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/listener/notifications',
    method: 'GET',
    headers: { Authorization: `Bearer ${listener1Token}` },
  });
  const draftNotifs = (inboxAfterDraft.data?.data?.notifications || []).filter(
    (n) => n.metadata?.storyId === storyId
  );
  assert(draftNotifs.length === 0, 'No notification sent for Draft story');
  console.log('✔ Draft story creation correctly did NOT trigger listener notification.');

  // Step B: Ordinary edit to draft story
  await request(
    {
      hostname: 'localhost',
      port: 5000,
      path: `/api/stories/${storyId}`,
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
    },
    {
      shortDescription: 'Updated draft description',
      status: 'Draft',
    }
  );
  await sleep(150);
  const inboxAfterDraftEdit = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/listener/notifications',
    method: 'GET',
    headers: { Authorization: `Bearer ${listener1Token}` },
  });
  const draftEditNotifs = (inboxAfterDraftEdit.data?.data?.notifications || []).filter(
    (n) => n.metadata?.storyId === storyId
  );
  assert(draftEditNotifs.length === 0, 'No notification sent for Draft edit');
  console.log('✔ Editing Draft story correctly did NOT trigger listener notification.');

  // Step C: Publish the story (Draft -> Published transition)
  const publishStoryRes = await request(
    {
      hostname: 'localhost',
      port: 5000,
      path: `/api/stories/${storyId}/status`,
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
    },
    { status: 'Published' }
  );
  assert(publishStoryRes.status === 200, 'Story transitioned to Published');

  await sleep(300);
  const inboxAfterPublish = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/listener/notifications',
    method: 'GET',
    headers: { Authorization: `Bearer ${listener1Token}` },
  });
  const storyPublishedNotifs = (inboxAfterPublish.data?.data?.notifications || []).filter(
    (n) => n.metadata?.storyId === storyId && n.type === 'story'
  );
  assert(storyPublishedNotifs.length === 1, 'Matching listener received exactly 1 story notification');
  assert(storyPublishedNotifs[0].title.includes(testStoryTitle), 'Notification contains story title');
  console.log('✔ Story publication trigger successfully delivered targeted notification to matching listener.');

  // 4. Test Deduplication: Ordinary Edits & Repeated Publish Calls
  console.log('\n4. Testing Story Publication Deduplication...');
  // Edit the already-published story
  await request(
    {
      hostname: 'localhost',
      port: 5000,
      path: `/api/stories/${storyId}`,
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
    },
    {
      shortDescription: 'Editing already published story',
    }
  );
  // Repeatedly PATCH status to Published
  await request(
    {
      hostname: 'localhost',
      port: 5000,
      path: `/api/stories/${storyId}/status`,
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
    },
    { status: 'Published' }
  );

  await sleep(300);
  const inboxAfterRepeated = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/listener/notifications',
    method: 'GET',
    headers: { Authorization: `Bearer ${listener1Token}` },
  });
  const dedupStoryNotifs = (inboxAfterRepeated.data?.data?.notifications || []).filter(
    (n) => n.metadata?.storyId === storyId && n.type === 'story'
  );
  assert(dedupStoryNotifs.length === 1, 'Duplicate notifications prevented for already published story');
  console.log('✔ Deduplication verified: repeated publish calls and edits did not create duplicate notifications.');

  // 5. Test Episode Publication Trigger & Favorites Targeting
  console.log('\n5. Testing Episode Publication Trigger & Favorites Targeting...');
  // Listener 1 adds this story to favorites
  await request(
    {
      hostname: 'localhost',
      port: 5000,
      path: '/api/favorites',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${listener1Token}`,
      },
    },
    { storyId }
  );

  // Admin creates an episode in Draft
  const testEpTitle = `Episode Awakening ${Date.now()}`;
  const createDraftEpRes = await request(
    {
      hostname: 'localhost',
      port: 5000,
      path: '/api/episodes',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
    },
    {
      storyId,
      title: testEpTitle,
      episodeNumber: 1,
      audioUrl: 'https://example.com/audio/sample.mp3',
      narratorId,
      status: 'Draft',
    }
  );
  assert(createDraftEpRes.status === 201, 'Draft episode created');
  const episodeId = createDraftEpRes.data?.data?._id || createDraftEpRes.data?.data?.id;

  // Verify no notification while Draft
  await sleep(200);
  const inboxAfterDraftEp = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/listener/notifications',
    method: 'GET',
    headers: { Authorization: `Bearer ${listener1Token}` },
  });
  const epDraftNotifs = (inboxAfterDraftEp.data?.data?.notifications || []).filter(
    (n) => n.metadata?.episodeId === episodeId
  );
  assert(epDraftNotifs.length === 0, 'No notification for draft episode');
  console.log('✔ Draft episode creation correctly did NOT trigger listener notification.');

  // Admin publishes episode (Draft -> Published transition)
  const publishEpRes = await request(
    {
      hostname: 'localhost',
      port: 5000,
      path: `/api/episodes/${episodeId}/status`,
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
    },
    { status: 'Published' }
  );
  assert(publishEpRes.status === 200, 'Episode published');

  await sleep(300);
  const inboxAfterPublishEp = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/listener/notifications',
    method: 'GET',
    headers: { Authorization: `Bearer ${listener1Token}` },
  });
  const epPublishedNotifs = (inboxAfterPublishEp.data?.data?.notifications || []).filter(
    (n) => n.metadata?.episodeId === episodeId && n.type === 'episode'
  );
  assert(epPublishedNotifs.length === 1, 'Listener received exactly 1 episode notification');
  assert(epPublishedNotifs[0].title.includes(testEpTitle), 'Notification contains episode title');
  console.log('✔ Episode publication trigger successfully alerted listener who favorited the story.');

  // Repeated edit to published episode
  await request(
    {
      hostname: 'localhost',
      port: 5000,
      path: `/api/episodes/${episodeId}`,
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
    },
    { description: 'Updated episode notes' }
  );
  await sleep(200);
  const inboxAfterEpEdit = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/listener/notifications',
    method: 'GET',
    headers: { Authorization: `Bearer ${listener1Token}` },
  });
  const epEditNotifs = (inboxAfterEpEdit.data?.data?.notifications || []).filter(
    (n) => n.metadata?.episodeId === episodeId && n.type === 'episode'
  );
  assert(epEditNotifs.length === 1, 'Duplicate episode notifications prevented');
  console.log('✔ Episode deduplication verified: edits to published episodes do not re-notify.');

  // 6. Test Subscription Lifecycle Triggers: Activation, Cancellation, Expiration
  console.log('\n6. Testing Subscription Lifecycle Triggers...');
  // Find or create a subscription specifically for Listener 1
  const subListRes = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/subscriptions/admin',
    method: 'GET',
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  let sub = subListRes.data?.data?.subscriptions?.find(
    (s) => String(s.userId?._id || s.userId?.id || s.userId) === String(listener1User.id || listener1User._id)
  );

  let subId = sub?._id;
  if (!subId) {
    const checkoutRes = await request(
      {
        hostname: 'localhost',
        port: 5000,
        path: '/api/subscriptions/checkout',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${listener1Token}`,
        },
      },
      { planSlug: 'plan-premium' }
    );
    subId = checkoutRes.data?.data?.subscriptionId;
  }
  assert(subId, 'Target subscription found for lifecycle testing');

  // Set subscription to pending first to test legitimate activation transition
  await request(
    {
      hostname: 'localhost',
      port: 5000,
      path: `/api/subscriptions/admin/${subId}/status`,
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
    },
    { status: 'pending' }
  );

  // Trigger A: Admin updates subscription status to 'active' (pending -> active)
  const activateSubRes = await request(
    {
      hostname: 'localhost',
      port: 5000,
      path: `/api/subscriptions/admin/${subId}/status`,
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
    },
    { status: 'active' }
  );
  assert(activateSubRes.status === 200, 'Subscription activated by Admin');

  await sleep(300);
  const inboxAfterSubActive = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/listener/notifications',
    method: 'GET',
    headers: { Authorization: `Bearer ${listener1Token}` },
  });
  const subActiveNotifs = (inboxAfterSubActive.data?.data?.notifications || []).filter(
    (n) => n.type === 'subscription' && n.title.includes('StoryPass Activated')
  );
  assert(subActiveNotifs.length >= 1, 'Subscription activation notification received');
  console.log('✔ Subscription activation trigger delivered notification with plan details.');

  // Trigger B: Cancellation
  const cancelSubRes = await request(
    {
      hostname: 'localhost',
      port: 5000,
      path: `/api/subscriptions/admin/${subId}/status`,
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
    },
    { status: 'cancelled' }
  );
  assert(cancelSubRes.status === 200, 'Subscription cancelled');

  await sleep(300);
  const inboxAfterSubCancel = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/listener/notifications',
    method: 'GET',
    headers: { Authorization: `Bearer ${listener1Token}` },
  });
  const subCancelNotifs = (inboxAfterSubCancel.data?.data?.notifications || []).filter(
    (n) => n.type === 'subscription' && n.title.includes('Subscription Cancelled')
  );
  assert(subCancelNotifs.length >= 1, 'Subscription cancellation notification received');
  console.log('✔ Subscription cancellation trigger delivered notification.');

  // Trigger C: Expiration
  const expireSubRes = await request(
    {
      hostname: 'localhost',
      port: 5000,
      path: `/api/subscriptions/admin/${subId}/status`,
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
    },
    { status: 'expired' }
  );
  assert(expireSubRes.status === 200, 'Subscription expired');

  await sleep(300);
  const inboxAfterSubExpire = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/listener/notifications',
    method: 'GET',
    headers: { Authorization: `Bearer ${listener1Token}` },
  });
  const subExpireNotifs = (inboxAfterSubExpire.data?.data?.notifications || []).filter(
    (n) => n.type === 'subscription' && n.title.includes('StoryPass Expired')
  );
  assert(subExpireNotifs.length >= 1, 'Subscription expiration notification received');
  console.log('✔ Subscription expiration trigger delivered notification once.');

  // Repeated call to expire -> must not duplicate
  await request(
    {
      hostname: 'localhost',
      port: 5000,
      path: `/api/subscriptions/admin/${subId}/status`,
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
    },
    { status: 'expired' }
  );
  await sleep(200);
  const inboxAfterRepeatedExpire = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/listener/notifications',
    method: 'GET',
    headers: { Authorization: `Bearer ${listener1Token}` },
  });
  const subExpireNotifs2 = (inboxAfterRepeatedExpire.data?.data?.notifications || []).filter(
    (n) => n.type === 'subscription' && n.title.includes('StoryPass Expired')
  );
  assert(subExpireNotifs2.length === subExpireNotifs.length, 'Subscription expiration not duplicated');
  console.log('✔ Subscription expiration deduplication verified.');

  // Clean-up: restore subscription to active status so other tests have expected subscriber state
  await request(
    {
      hostname: 'localhost',
      port: 5000,
      path: `/api/subscriptions/admin/${subId}/status`,
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
    },
    { status: 'active' }
  );

  // 7. Verify Existing Listener APIs & Admin Feed
  console.log('\n7. Verifying Existing Listener APIs & Admin Activity Feed...');
  const unreadCountRes = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/listener/notifications/unread-count',
    method: 'GET',
    headers: { Authorization: `Bearer ${listener1Token}` },
  });
  assert(unreadCountRes.status === 200 && typeof unreadCountRes.data?.data?.unreadCount === 'number', 'Unread count API working');

  // Mark all read
  const markAllRes = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/listener/notifications/read-all',
    method: 'PATCH',
    headers: { Authorization: `Bearer ${listener1Token}` },
  });
  assert(markAllRes.status === 200, 'Mark all as read succeeded');

  const adminFeedRes = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/notifications',
    method: 'GET',
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert(adminFeedRes.status === 200 && Array.isArray(adminFeedRes.data?.data?.notifications), 'Admin activity feed working');
  console.log('✔ Existing Listener APIs and Admin Activity Feed continue working properly.');

  console.log('\n======================================================');
  console.log('🎉 ALL PHASE 4 AUTOMATIC NOTIFICATION TRIGGER TESTS PASSED!');
  console.log('======================================================');
}

runTests().catch((err) => {
  console.error('\n❌ TEST RUN FAILED:', err);
  process.exit(1);
});
