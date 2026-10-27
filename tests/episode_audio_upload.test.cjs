const http = require('http');
const path = require('path');
const fs = require('fs');

function request(options, data) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve({ status: res.statusCode, headers: res.headers, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, raw: body });
        }
      });
    });
    req.on('error', reject);
    if (data) {
      if (Buffer.isBuffer(data)) {
        req.write(data);
      } else {
        req.write(typeof data === 'string' ? data : JSON.stringify(data));
      }
    }
    req.end();
  });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion Failed: ${message}`);
  }
}

function buildMultipartBody(filename, mimeType, fileContentBuffer, fields = {}) {
  const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
  const crlf = '\r\n';
  const parts = [];

  for (const [key, val] of Object.entries(fields)) {
    parts.push(
      `--${boundary}${crlf}` +
      `Content-Disposition: form-data; name="${key}"${crlf}${crlf}` +
      `${val}${crlf}`
    );
  }

  parts.push(
    `--${boundary}${crlf}` +
    `Content-Disposition: form-data; name="file"; filename="${filename}"${crlf}` +
    `Content-Type: ${mimeType}${crlf}${crlf}`
  );

  const preBuffer = Buffer.from(parts.join(''), 'utf8');
  const postBuffer = Buffer.from(`${crlf}--${boundary}--${crlf}`, 'utf8');
  const fullBody = Buffer.concat([preBuffer, fileContentBuffer, postBuffer]);

  return { boundary, body: fullBody };
}

async function runTests() {
  console.log('=== STARTING EPISODE AUDIO UPLOAD & CREATION VERIFICATION ===\n');

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

  // 2. Test Audio Upload: MP3
  console.log('\n2. Testing MP3 audio upload to /api/media/upload...');
  const mp3Content = Buffer.from('ID3DummyMp3AudioStreamDataContent12345');
  const mp3Multipart = buildMultipartBody('test_chapter_narration.mp3', 'audio/mpeg', mp3Content, {
    type: 'audio',
    storyTitle: 'Test Story',
  });

  const mp3Res = await request(
    {
      hostname: 'localhost',
      port: 5000,
      path: '/api/media/upload',
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${mp3Multipart.boundary}`,
        'Content-Length': mp3Multipart.body.length,
        Authorization: `Bearer ${adminToken}`,
      },
    },
    mp3Multipart.body
  );

  assert(mp3Res.status === 201, `MP3 upload returned status 201 (Got ${mp3Res.status}): ${JSON.stringify(mp3Res.data)}`);
  assert(mp3Res.data?.data?.url, 'MP3 upload response contains accessible url');
  assert(mp3Res.data?.data?.type === 'audio', 'Uploaded media type is audio');
  const uploadedMp3Url = mp3Res.data.data.url;
  console.log(`✔ MP3 uploaded successfully! URL: ${uploadedMp3Url}`);

  // 3. Test Audio Upload: WAV
  console.log('\n3. Testing WAV audio upload to /api/media/upload...');
  const wavContent = Buffer.from('RIFFDummyWavAudioDataStream54321');
  const wavMultipart = buildMultipartBody('chapter_master.wav', 'audio/wav', wavContent, {
    type: 'audio',
  });

  const wavRes = await request(
    {
      hostname: 'localhost',
      port: 5000,
      path: '/api/media/upload',
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${wavMultipart.boundary}`,
        'Content-Length': wavMultipart.body.length,
        Authorization: `Bearer ${adminToken}`,
      },
    },
    wavMultipart.body
  );

  assert(wavRes.status === 201, `WAV upload returned status 201 (Got ${wavRes.status})`);
  assert(wavRes.data?.data?.url, 'WAV upload response contains accessible url');
  console.log(`✔ WAV uploaded successfully! URL: ${wavRes.data.data.url}`);

  // 4. Test Audio Upload: FLAC
  console.log('\n4. Testing FLAC audio upload to /api/media/upload...');
  const flacContent = Buffer.from('fLaCDummyFlacAudioStream99999');
  const flacMultipart = buildMultipartBody('lossless_track.flac', 'audio/flac', flacContent, {
    type: 'audio',
  });

  const flacRes = await request(
    {
      hostname: 'localhost',
      port: 5000,
      path: '/api/media/upload',
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${flacMultipart.boundary}`,
        'Content-Length': flacMultipart.body.length,
        Authorization: `Bearer ${adminToken}`,
      },
    },
    flacMultipart.body
  );

  assert(flacRes.status === 201, `FLAC upload returned status 201 (Got ${flacRes.status})`);
  assert(flacRes.data?.data?.url, 'FLAC upload response contains accessible url');
  console.log(`✔ FLAC uploaded successfully! URL: ${flacRes.data.data.url}`);

  // 5. Test Unsupported File Format Rejection
  console.log('\n5. Testing rejection of unsupported file types (.txt / application/text)...');
  const invalidContent = Buffer.from('Plain text file content');
  const invalidMultipart = buildMultipartBody('script.txt', 'text/plain', invalidContent);

  const invalidRes = await request(
    {
      hostname: 'localhost',
      port: 5000,
      path: '/api/media/upload',
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${invalidMultipart.boundary}`,
        'Content-Length': invalidMultipart.body.length,
        Authorization: `Bearer ${adminToken}`,
      },
    },
    invalidMultipart.body
  );

  assert(invalidRes.status >= 400, `Unsupported file was rejected with HTTP ${invalidRes.status}`);
  console.log('✔ Unsupported file format rejected as expected.');

  // 6. Test Static Serving of Uploaded File
  console.log('\n6. Testing public accessibility of uploaded audio file...');
  // Extract path from full URL: e.g. http://localhost:5000/uploads/test_chapter_narration-xxx.mp3 -> /uploads/test_chapter_narration-xxx.mp3
  const urlObj = new URL(uploadedMp3Url);
  const staticFileRes = await request({
    hostname: 'localhost',
    port: 5000,
    path: urlObj.pathname,
    method: 'GET',
  });
  assert(staticFileRes.status === 200, `Static audio file is accessible (Status ${staticFileRes.status})`);
  console.log('✔ Uploaded audio file is statically accessible over HTTP 200.');

  // 7. Get an existing parent story
  console.log('\n7. Fetching existing Story to link new Episode...');
  const storiesRes = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/stories',
    method: 'GET',
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert(storiesRes.status === 200, 'Stories retrieved successfully');
  const stories = storiesRes.data?.data?.stories || storiesRes.data?.data || [];
  assert(stories.length > 0, 'At least one story exists');
  const parentStory = stories[0];
  const storyId = parentStory._id || parentStory.id;
  console.log(`✔ Using Parent Story: "${parentStory.title}" (${storyId})`);

  // 8. Create Episode with Uploaded Audio Track
  console.log('\n8. Creating Episode with uploaded audio track...');
  const newEpisodePayload = {
    storyId,
    episodeNumber: 99,
    title: `Upload Test Chapter ${Date.now()}`,
    description: 'Automated test chapter with verified uploaded audio file.',
    duration: '18m 45s',
    durationSeconds: 1125,
    audioUrl: uploadedMp3Url,
    fileSize: '15.2 MB',
    status: 'Published',
    releaseDate: new Date().toISOString().split('T')[0],
  };

  const createEpRes = await request(
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
    newEpisodePayload
  );

  assert(createEpRes.status === 201 || createEpRes.status === 200, `Create episode returned status 201/200 (Got ${createEpRes.status})`);
  const createdEp = createEpRes.data?.data;
  assert(createdEp, 'Episode data returned');
  assert(createdEp.audioUrl === uploadedMp3Url, 'Episode saved with real uploaded audio URL');
  assert(createdEp.fileSize === '15.2 MB', 'Episode saved with correct file size');
  const createdEpId = createdEp._id || createdEp.id;
  console.log(`✔ Episode "${createdEp.title}" created with ID: ${createdEpId}`);

  // 9. Fetch Single Episode to verify persistence
  console.log('\n9. Fetching single Episode to verify persistence after reload...');
  const getEpRes = await request({
    hostname: 'localhost',
    port: 5000,
    path: `/api/episodes/${createdEpId}`,
    method: 'GET',
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert(getEpRes.status === 200, 'Episode fetched successfully');
  assert(getEpRes.data?.data?.audioUrl === uploadedMp3Url, 'Persisted audioUrl matches uploaded file');
  console.log('✔ Episode persistence verified.');

  // 10. Clean up test Episode
  console.log('\n10. Cleaning up test Episode...');
  const deleteEpRes = await request({
    hostname: 'localhost',
    port: 5000,
    path: `/api/episodes/${createdEpId}`,
    method: 'DELETE',
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert(deleteEpRes.status === 200, 'Test episode deleted successfully');
  console.log('✔ Test episode cleaned up.');

  console.log('\n=============================================================');
  console.log('🎉 ALL EPISODE AUDIO UPLOAD VERIFICATION TESTS PASSED SUCCESSFULLY!');
  console.log('=============================================================\n');
}

runTests().catch((err) => {
  console.error('\n❌ Verification failed:', err);
  process.exit(1);
});
