const http = require('http');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const config = require('../src/config/env');

const BASE_URL = 'http://localhost:5000/api';
const JWT_SECRET = config.jwtSecret;

let adminToken = '';

function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${BASE_URL}${path}`);
    const reqOptions = {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
        ...(options.headers || {}),
      },
    };

    const req = http.request(url, reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });

    req.on('error', reject);
    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

async function run() {
  console.log('--- STARTING PLATFORM SETTINGS SUITE ---');

  if (mongoose.connection.readyState === 0) {
    await mongoose.connect('mongodb://localhost:27017/audio_stories_db');
  }

  adminToken = jwt.sign({ id: '60c72b2f9b1d8b2badbee555', role: 'admin' }, JWT_SECRET, { expiresIn: '1d' });

  // 1. GET /api/settings
  console.log('\n[1] GET /api/settings');
  const getRes = await request('/settings');
  console.log('Status:', getRes.status);
  if (getRes.status !== 200 || !getRes.data.success) {
    throw new Error(`Failed to GET /settings: ${JSON.stringify(getRes.data)}`);
  }

  const settings = getRes.data.data;
  const expectedSections = [
    'general',
    'storage',
    'seo',
    'subscription',
    'payment',
    'story',
    'audio',
    'streaming',
    'downloads',
    'notifications',
  ];

  for (const sec of expectedSections) {
    if (!settings[sec]) {
      throw new Error(`Missing expected section: ${sec}`);
    }
    console.log(`✓ Section "${sec}" present and populated`);
  }

  // 2. Test Secret Masking on GET
  console.log('\n[2] Checking sensitive secret masking');
  console.log('storage.secretAccessKey:', settings.storage.secretAccessKey);
  console.log('payment.razorpayKeySecret:', settings.payment.razorpayKeySecret);
  console.log('payment.stripeSecretKey:', settings.payment.stripeSecretKey);
  console.log('payment.webhookSecret:', settings.payment.webhookSecret);

  // 3. PUT /api/settings - Update general and audio settings
  console.log('\n[3] PUT /api/settings - Updating platform name and audio parameters');
  const updatePayload = {
    general: {
      ...settings.general,
      platformName: 'ElevStory Audio Studio Elite',
      tagline: 'World-Class Audio Stories & Immersive Fiction CMS',
    },
    audio: {
      ...settings.audio,
      defaultAudioQuality: '320kbps Studio Lossless',
      defaultVolumeLevel: 85,
    },
    storage: {
      ...settings.storage,
      secretAccessKey: '••••••••••••••••', // Masked placeholder should not overwrite secret
    },
  };

  const putRes = await request('/settings', {
    method: 'PUT',
    body: updatePayload,
  });

  console.log('PUT Status:', putRes.status);
  if (putRes.status !== 200 || !putRes.data.success) {
    throw new Error(`Failed to PUT /settings: ${JSON.stringify(putRes.data)}`);
  }

  if (putRes.data.data.general.platformName !== 'ElevStory Audio Studio Elite') {
    throw new Error('Platform name was not updated correctly');
  }
  console.log('✓ PUT update verified: Platform name persisted as', putRes.data.data.general.platformName);

  // 4. PATCH /api/settings/:section - Update downloads section
  console.log('\n[4] PATCH /api/settings/downloads');
  const patchRes = await request('/settings/downloads', {
    method: 'PATCH',
    body: {
      allowOfflineDownloads: true,
      enforcePlanPermissions: true,
      maxConcurrentDownloads: 5,
    },
  });

  console.log('PATCH Status:', patchRes.status);
  if (patchRes.status !== 200 || !patchRes.data.success) {
    throw new Error(`Failed to PATCH /settings/downloads: ${JSON.stringify(patchRes.data)}`);
  }
  if (patchRes.data.data.downloads.maxConcurrentDownloads !== 5) {
    throw new Error('PATCH downloads failed to update maxConcurrentDownloads');
  }
  console.log('✓ PATCH section verified: maxConcurrentDownloads =', patchRes.data.data.downloads.maxConcurrentDownloads);

  // 5. Test Integration with Download Permission Service
  console.log('\n[5] Verifying Download Permission integration with Setting');
  const { checkUserDownloadPermission } = require('../src/services/downloadPermission.service');
  const Setting = require('../src/models/Setting');

  // Globally disable offline downloads
  await Setting.updateOne({}, { $set: { 'downloads.allowOfflineDownloads': false } });
  const permWhenDisabled = await checkUserDownloadPermission({ plan: 'Premium', subscriptionStatus: 'active' });
  console.log('Permission when allowOfflineDownloads is false:', permWhenDisabled);
  if (permWhenDisabled !== false) {
    throw new Error('checkUserDownloadPermission should return false when global allowOfflineDownloads is false');
  }

  // Restore downloads
  await Setting.updateOne({}, { $set: { 'downloads.allowOfflineDownloads': true } });
  console.log('✓ Setting.downloads.allowOfflineDownloads enforcement verified');

  // 6. Test Integration with Notification Trigger Service
  console.log('\n[6] Verifying Notification Trigger integration with Setting');
  const { onStoryPublished } = require('../src/services/notificationTrigger.service');
  await Setting.updateOne({}, { $set: { 'notifications.notifyOnStoryPublished': false } });
  const resultWhenDisabled = await onStoryPublished({ _id: new mongoose.Types.ObjectId(), status: 'Published', categoryName: 'Sci-Fi' });
  console.log('Notification trigger result when notifyOnStoryPublished is false:', resultWhenDisabled);
  if (resultWhenDisabled !== 0) {
    throw new Error('onStoryPublished should return 0 when notifyOnStoryPublished is false');
  }

  // Restore notifications
  await Setting.updateOne({}, { $set: { 'notifications.notifyOnStoryPublished': true } });
  console.log('✓ Setting.notifications toggles enforcement verified');

  // 7. Test Secret Storage & Masking Preservation
  console.log('\n[7] Verifying secret masking & preservation logic');
  const secretPutRes = await request('/settings', {
    method: 'PUT',
    body: {
      storage: {
        ...settings.storage,
        secretAccessKey: 'super_secret_aws_key_12345',
      },
    },
  });

  if (secretPutRes.data.data.storage.secretAccessKey !== '••••••••••••••••') {
    throw new Error('Secret was not masked in response: ' + secretPutRes.data.data.storage.secretAccessKey);
  }
  console.log('✓ Secret correctly masked as •••••••••••••••• in API response');

  // Verify in MongoDB directly that the plain secret was saved
  const SettingDoc = await Setting.findOne();
  if (SettingDoc.storage.secretAccessKey !== 'super_secret_aws_key_12345') {
    throw new Error('Secret was not stored in MongoDB correctly');
  }
  console.log('✓ Secret stored securely in MongoDB');

  // Now perform another PUT sending the mask back
  const subsequentPut = await request('/settings', {
    method: 'PUT',
    body: {
      storage: {
        ...settings.storage,
        secretAccessKey: '••••••••••••••••',
      },
    },
  });
  const SettingDocAfter = await Setting.findOne();
  if (SettingDocAfter.storage.secretAccessKey !== 'super_secret_aws_key_12345') {
    throw new Error('Mask string overwrote actual secret in MongoDB!');
  }
  console.log('✓ Mask placeholder did not overwrite stored secret in MongoDB');

  console.log('\n=======================================');
  console.log(' ALL PLATFORM SETTINGS SUITE TESTS PASSED ');
  console.log('=======================================');
  process.exit(0);
}

run().catch((err) => {
  console.error('\n❌ Test suite failed:', err);
  process.exit(1);
});
