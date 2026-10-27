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
  console.log('=== STARTING NOTIFICATION SYSTEM PHASE 1 AUTOMATED TESTS ===\n');

  // 1. Admin login
  console.log('1. Authenticating Admin...');
  const adminLogin = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/auth/login',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  }, { email: 'admin@example.com', password: 'password123' });

  let adminToken = adminLogin.data?.data?.token;
  if (!adminToken) {
    // try fallback seed password 123456
    const retry = await request({
      hostname: 'localhost',
      port: 5000,
      path: '/api/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }, { email: 'admin@example.com', password: '123456' });
    adminToken = retry.data?.data?.token;
  }
  assert(adminToken, 'Admin token acquired');
  console.log('✔ Admin authenticated successfully.');

  // 2. Listener 1 login (anu@example.com - Standard subscriber)
  console.log('\n2. Authenticating Listener 1 (Standard Subscriber: anu@example.com)...');
  const listener1Login = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/auth/listener/login',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  }, { email: 'anu@example.com', password: 'listenerPass123' });

  let listener1Token = listener1Login.data?.data?.token;
  let listener1User = listener1Login.data?.data?.user;
  if (!listener1Token) {
    // try fallback password AudioPass2026!
    const retry = await request({
      hostname: 'localhost',
      port: 5000,
      path: '/api/auth/listener/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }, { email: 'anu@example.com', password: 'AudioPass2026!' });
    listener1Token = retry.data?.data?.token;
    listener1User = retry.data?.data?.user;
  }
  assert(listener1Token, 'Listener 1 token acquired');
  console.log(`✔ Listener 1 authenticated (${listener1User.email}, plan: ${listener1User.plan}).`);

  // 3. Listener 2 login (liam.g@example.com - Free subscriber)
  console.log('\n3. Authenticating Listener 2 (Free Listener: liam.g@example.com)...');
  let listener2Login = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/auth/listener/login',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  }, { email: 'liam.g@example.com', password: 'AudioPass2026!' });

  let listener2Token = listener2Login.data?.data?.token;
  let listener2User = listener2Login.data?.data?.user;
  if (!listener2Token) {
    // try default listener password
    listener2Login = await request({
      hostname: 'localhost',
      port: 5000,
      path: '/api/auth/listener/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }, { email: 'liam.g@example.com', password: 'password123' });
    listener2Token = listener2Login.data?.data?.token;
    listener2User = listener2Login.data?.data?.user;
  }
  if (!listener2Token) {
    // Try admin@example.com listener account
    listener2Login = await request({
      hostname: 'localhost',
      port: 5000,
      path: '/api/auth/listener/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }, { email: 'admin@example.com', password: '123456' });
    listener2Token = listener2Login.data?.data?.token;
    listener2User = listener2Login.data?.data?.user;
  }
  assert(listener2Token, 'Listener 2 token acquired');
  console.log(`✔ Listener 2 authenticated (${listener2User.email}, plan: ${listener2User.plan}).`);

  // 4. Test RBAC Security
  console.log('\n4. Testing Role-Based Access Control (RBAC)...');
  // Listener attempting to send campaign
  const unauthorizedAdminPost = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/admin/notifications/send',
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${listener1Token}`,
      'Content-Type': 'application/json',
    },
  }, { title: 'Hacked', message: 'Hacked' });
  assert(unauthorizedAdminPost.status === 403, `Listener calling admin send was blocked with 403 (got ${unauthorizedAdminPost.status})`);
  console.log('✔ Listener blocked from admin send endpoint (403 Forbidden).');

  // Guest attempting to access listener inbox
  const unauthenticatedInbox = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/listener/notifications',
    method: 'GET',
  });
  assert(unauthenticatedInbox.status === 401, `Guest was blocked with 401 (got ${unauthenticatedInbox.status})`);
  console.log('✔ Guest blocked from listener inbox endpoint (401 Unauthorized).');

  // 5. Test Action Link Validation & Dangerous URLs
  console.log('\n5. Testing Action Link Validation & Security Rules...');
  // External link
  const extLinkRes = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/admin/notifications/send',
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json',
    },
  }, {
    title: 'External Link Test',
    message: 'Testing external link rejection',
    actionLink: 'https://malicious-site.com/steal-data',
    audience: 'all',
  });
  assert(extLinkRes.status === 400, `External link rejected with 400 (got ${extLinkRes.status})`);
  console.log('✔ External URL rejected safely (400 Bad Request).');

  // Protocol-relative link
  const protoLinkRes = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/admin/notifications/send',
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json',
    },
  }, {
    title: 'Protocol Link Test',
    message: 'Testing protocol relative link rejection',
    actionLink: '//evil.com/phish',
    audience: 'all',
  });
  assert(protoLinkRes.status === 400, `Protocol-relative link rejected with 400 (got ${protoLinkRes.status})`);
  console.log('✔ Protocol-relative link rejected safely (400 Bad Request).');

  // Sensitive data (credit card leak)
  const ccLeakRes = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/admin/notifications/send',
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json',
    },
  }, {
    title: 'Card Update',
    message: 'Your payment card is 4532-1234-5678-9012 CVV 999',
    audience: 'all',
  });
  assert(ccLeakRes.status === 400, `Sensitive payment data rejected with 400 (got ${ccLeakRes.status})`);
  console.log('✔ Sensitive payment data detected and rejected safely (400 Bad Request).');

  // 6. Test Admin Sending Valid Broadcast Announcement
  console.log('\n6. Testing Admin Broadcast Announcement ("all" listeners)...');
  const broadcastRes = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/admin/notifications/send',
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json',
    },
  }, {
    title: 'Welcome to ElevStory Season 2',
    message: 'We have updated our audio fiction library with 10 new binaural stories.',
    type: 'announcement',
    actionLink: '/explore',
    audience: 'all',
  });
  assert(broadcastRes.status === 201, `Broadcast campaign created with 201 (got ${broadcastRes.status})`);
  console.log(`✔ Broadcast campaign dispatched to ${broadcastRes.data?.data?.recipientCount} listeners.`);

  // 7. Verify Listener 1 and Listener 2 receive broadcast
  console.log('\n7. Verifying Listener Inboxes for Broadcast...');
  const l1Inbox = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/listener/notifications',
    method: 'GET',
    headers: { 'Authorization': `Bearer ${listener1Token}` },
  });
  assert(l1Inbox.status === 200, 'Listener 1 inbox retrieved');
  const l1Notifs = l1Inbox.data?.data?.notifications || [];
  const broadcastFoundL1 = l1Notifs.some(n => n.title === 'Welcome to ElevStory Season 2');
  assert(broadcastFoundL1, 'Broadcast received by Listener 1');

  const l2Inbox = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/listener/notifications',
    method: 'GET',
    headers: { 'Authorization': `Bearer ${listener2Token}` },
  });
  assert(l2Inbox.status === 200, 'Listener 2 inbox retrieved');
  const l2Notifs = l2Inbox.data?.data?.notifications || [];
  const broadcastFoundL2 = l2Notifs.some(n => n.title === 'Welcome to ElevStory Season 2');
  assert(broadcastFoundL2, 'Broadcast received by Listener 2');
  console.log('✔ Broadcast notification verified in both listener inboxes.');

  // 8. Test Duplicate Dispatch Prevention
  console.log('\n8. Testing Duplicate Campaign Dispatch Prevention...');
  const dupRes = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/admin/notifications/send',
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json',
    },
  }, {
    title: 'Welcome to ElevStory Season 2',
    message: 'We have updated our audio fiction library with 10 new binaural stories.',
    type: 'announcement',
    actionLink: '/explore',
    audience: 'all',
  });
  assert(dupRes.status === 409, `Duplicate broadcast rejected with 409 Conflict (got ${dupRes.status})`);
  console.log('✔ Accidental duplicate campaign blocked with 409 Conflict.');

  // 9. Test Targeted Notification by Tier (Standard Tier vs Free Tier)
  console.log('\n9. Testing Audience Targeting by Subscription Tier (Standard vs Free)...');
  // Send to standard tier only
  const standardTierRes = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/admin/notifications/send',
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json',
    },
  }, {
    title: 'Exclusive Standard Audio Perk',
    message: 'Enjoy high-fidelity studio streaming on your Standard membership.',
    type: 'subscription',
    actionLink: '/profile',
    audience: 'tier',
    targetTier: 'standard',
  });
  assert(standardTierRes.status === 201, `Standard tier campaign sent with 201 (got ${standardTierRes.status})`);
  console.log(`✔ Standard tier campaign sent to ${standardTierRes.data?.data?.recipientCount} recipient(s).`);

  // Check Listener 1 (Standard) receives it
  const l1StandardInbox = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/listener/notifications',
    method: 'GET',
    headers: { 'Authorization': `Bearer ${listener1Token}` },
  });
  const hasStandardL1 = l1StandardInbox.data?.data?.notifications?.some(n => n.title === 'Exclusive Standard Audio Perk');
  assert(hasStandardL1, 'Listener 1 (Standard) received tier-targeted notification');

  // Check Listener 2 (Free) does NOT receive it
  const l2StandardInbox = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/listener/notifications',
    method: 'GET',
    headers: { 'Authorization': `Bearer ${listener2Token}` },
  });
  const hasStandardL2 = l2StandardInbox.data?.data?.notifications?.some(n => n.title === 'Exclusive Standard Audio Perk');
  assert(!hasStandardL2, 'Listener 2 (Free) did NOT receive standard tier notification');
  console.log('✔ Tier targeting verified: Standard listener received it, Free listener isolated.');

  // 10. Test Individual Listener Targeting
  console.log('\n10. Testing Individual Listener Targeting...');
  const indivRes = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/admin/notifications/send',
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json',
    },
  }, {
    title: 'Personal Account Advisory',
    message: 'Your account preferences have been refreshed by administration.',
    type: 'system',
    actionLink: '/profile',
    audience: 'individual',
    targetUserId: listener1User.id,
  });
  assert(indivRes.status === 201, `Individual campaign sent with 201 (got ${indivRes.status})`);

  // Check Listener 1 has it
  const l1IndivInbox = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/listener/notifications',
    method: 'GET',
    headers: { 'Authorization': `Bearer ${listener1Token}` },
  });
  const hasIndivL1 = l1IndivInbox.data?.data?.notifications?.some(n => n.title === 'Personal Account Advisory');
  assert(hasIndivL1, 'Target listener received personal advisory');

  // Check Listener 2 does NOT have it
  const l2IndivInbox = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/listener/notifications',
    method: 'GET',
    headers: { 'Authorization': `Bearer ${listener2Token}` },
  });
  const hasIndivL2 = l2IndivInbox.data?.data?.notifications?.some(n => n.title === 'Personal Account Advisory');
  assert(!hasIndivL2, 'Other listener did NOT receive personal advisory');
  console.log('✔ Individual targeting verified: Only selected listener received notification.');

  // 11. Test Mark-As-Read, Unread Count, and Cross-User Isolation
  console.log('\n11. Testing Read State, Unread Count & Cross-User Security...');
  const targetNotifL1 = l1IndivInbox.data?.data?.notifications?.find(n => n.title === 'Personal Account Advisory');
  assert(targetNotifL1, 'Found notification to mark as read');
  assert(targetNotifL1.isRead === false, 'Notification initially unread');

  // Cross-user test: Listener 2 attempts to mark Listener 1's notification as read
  const crossUserReadRes = await request({
    hostname: 'localhost',
    port: 5000,
    path: `/api/listener/notifications/${targetNotifL1._id || targetNotifL1.id}/read`,
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${listener2Token}` },
  });
  assert(crossUserReadRes.status === 404, `Cross-user read manipulation blocked with 404 (got ${crossUserReadRes.status})`);
  console.log('✔ Cross-user isolation verified: Listener 2 cannot mark Listener 1 notification (404 Not Found).');

  // Listener 1 marks their own notification as read
  const markReadRes = await request({
    hostname: 'localhost',
    port: 5000,
    path: `/api/listener/notifications/${targetNotifL1._id || targetNotifL1.id}/read`,
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${listener1Token}` },
  });
  assert(markReadRes.status === 200, 'Notification marked as read');
  assert(markReadRes.data?.data?.notification?.isRead === true, 'isRead set to true');
  assert(markReadRes.data?.data?.notification?.readAt !== null, 'readAt timestamp recorded');
  console.log('✔ Notification marked as read and timestamp persisted.');

  // Test unread count endpoint
  const unreadCountRes = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/listener/notifications/unread-count',
    method: 'GET',
    headers: { 'Authorization': `Bearer ${listener1Token}` },
  });
  assert(unreadCountRes.status === 200, 'Unread count fetched');
  const countAfter1Read = unreadCountRes.data?.data?.unreadCount;
  console.log(`✔ Unread count API working properly (current unread: ${countAfter1Read}).`);

  // Test Mark-All-As-Read
  console.log('\n12. Testing Mark-All-As-Read...');
  const markAllRes = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/listener/notifications/read-all',
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${listener1Token}` },
  });
  assert(markAllRes.status === 200, 'Mark all as read succeeded');
  assert(markAllRes.data?.data?.unreadCount === 0, 'Unread count is 0 after mark-all-read');

  const unreadCountAfterAll = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/listener/notifications/unread-count',
    method: 'GET',
    headers: { 'Authorization': `Bearer ${listener1Token}` },
  });
  assert(unreadCountAfterAll.data?.data?.unreadCount === 0, 'Unread count confirmed 0 in database');
  console.log('✔ Mark all as read verified: All inbox items marked read, count reset to 0.');

  // Test Dismiss / Delete Notification
  console.log('\n13. Testing Dismiss / Delete Single Notification...');
  const deleteNotifRes = await request({
    hostname: 'localhost',
    port: 5000,
    path: `/api/listener/notifications/${targetNotifL1._id || targetNotifL1.id}`,
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${listener1Token}` },
  });
  assert(deleteNotifRes.status === 200, 'Notification dismissed successfully');

  // Verify it is gone from inbox
  const l1InboxAfterDelete = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/listener/notifications',
    method: 'GET',
    headers: { 'Authorization': `Bearer ${listener1Token}` },
  });
  const deletedStillExists = l1InboxAfterDelete.data?.data?.notifications?.some(n => (n._id || n.id) === (targetNotifL1._id || targetNotifL1.id));
  assert(!deletedStillExists, 'Notification completely removed from inbox');
  console.log('✔ Notification dismissed and removed from listener inbox.');

  // 14. Test Campaign History & Draft Lifecycle
  console.log('\n14. Testing Admin Campaign History & Draft Lifecycle...');
  const draftRes = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/admin/notifications/campaigns',
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json',
    },
  }, {
    title: 'Weekend Mystery Marathon Draft',
    message: 'Get ready for 48 hours of nonstop noir mysteries.',
    type: 'promotion',
    actionLink: '/explore',
    audience: 'all',
    sendImmediately: false,
  });
  assert(draftRes.status === 201, 'Draft campaign created');
  assert(draftRes.data?.data?.campaign?.status === 'draft', 'Campaign saved with status draft');
  const draftId = draftRes.data?.data?.campaign?._id || draftRes.data?.data?.campaign?.id;

  // Retrieve campaign history
  const campaignsListRes = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/admin/notifications/campaigns',
    method: 'GET',
    headers: { 'Authorization': `Bearer ${adminToken}` },
  });
  assert(campaignsListRes.status === 200, 'Campaign history retrieved');
  assert(campaignsListRes.data?.data?.campaigns?.length > 0, 'Campaigns present in history');
  console.log(`✔ Campaign history retrieved (${campaignsListRes.data?.data?.stats?.total} total campaigns).`);

  // Dispatch the draft campaign
  const sendDraftRes = await request({
    hostname: 'localhost',
    port: 5000,
    path: `/api/admin/notifications/campaigns/${draftId}/send`,
    method: 'POST',
    headers: { 'Authorization': `Bearer ${adminToken}` },
  });
  assert(sendDraftRes.status === 200, 'Draft campaign dispatched successfully');
  assert(sendDraftRes.data?.data?.campaign?.status === 'sent', 'Campaign status updated to sent');
  console.log('✔ Draft campaign dispatched successfully.');

  // Attempt duplicate send of the already-sent campaign
  const reSendDraftRes = await request({
    hostname: 'localhost',
    port: 5000,
    path: `/api/admin/notifications/campaigns/${draftId}/send`,
    method: 'POST',
    headers: { 'Authorization': `Bearer ${adminToken}` },
  });
  assert(reSendDraftRes.status === 409, `Resend blocked with 409 Conflict (got ${reSendDraftRes.status})`);
  console.log('✔ Duplicate dispatch of already-sent campaign blocked with 409 Conflict.');

  // 15. Verify Existing Admin Activity Feed APIs Still Function
  console.log('\n15. Verifying Existing Admin Activity Feed Compatibility...');
  const existingAdminFeedRes = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/notifications',
    method: 'GET',
    headers: { 'Authorization': `Bearer ${adminToken}` },
  });
  assert(existingAdminFeedRes.status === 200, 'Existing admin activity feed returned 200 OK');
  console.log(`✔ Existing Admin Activity Feed (/api/notifications) intact and functioning (returned ${existingAdminFeedRes.data?.data?.notifications?.length} activity items).`);

  console.log('\n======================================================');
  console.log('🎉 ALL 15 AUTOMATED NOTIFICATION TESTS PASSED SUCCESSFULLY!');
  console.log('======================================================');
}

runTests().catch(err => {
  console.error('\n❌ Test Failure:', err.message);
  process.exit(1);
});
