const { getAuthInfo, getDeviceIds, getApiHost, buildCommonHeaders, refreshTokenIfNeeded, getDeviceInfo, getIdeVersion, getIdeVersionCode } = require('./src/auth');
const fetch = require('node-fetch');
const { v4: uuidv4 } = require('./src/uuid');

async function test() {
  try {
    console.log('=== Get Available Models ===');

    const authInfo = await refreshTokenIfNeeded();
    const apiHost = getApiHost();
    const deviceIds = getDeviceIds();
    const headers = buildCommonHeaders(authInfo, deviceIds);

    const endpoints = [
      `${apiHost}/api/v1/commercial/chat_mode`,
      `${apiHost}/api/ide/v1/get_detail_param`,
    ];

    for (const endpoint of endpoints) {
      console.log(`\n--- ${endpoint} ---`);
      const body = {};
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
      });
      console.log('Status:', resp.status);
      const text = await resp.text();
      console.log('Response:', text.substring(0, 3000));
    }

  } catch (err) {
    console.error('Test failed:', err.message);
  }
}

test();
