const axios = require('axios');
const { getAuthInfo, getDeviceIds, getDeviceInfo, hashDeviceId, buildCommonHeaders, getApiHost } = require('./src/auth');

async function main() {
  const authInfo = getAuthInfo();
  const deviceIds = getDeviceIds();
  const deviceInfo = getDeviceInfo();
  const apiHost = getApiHost();

  console.log('=== Auth Info ===');
  console.log('Region:', authInfo.userRegion);
  console.log('Host:', authInfo.host);
  console.log('UserId:', authInfo.userId);
  console.log('Token (first 30):', authInfo.token.substring(0, 30) + '...');
  console.log('ExpiredAt:', authInfo.expiredAt);
  console.log('');

  console.log('=== Device Info ===');
  console.log('MachineId:', deviceIds.machineId);
  console.log('DeviceId (hashed):', deviceInfo.device_id);
  console.log('');

  const headers = buildCommonHeaders(authInfo, deviceIds);
  console.log('=== Request Headers ===');
  Object.entries(headers).forEach(([k, v]) => {
    console.log(`  ${k}: ${k.includes('Token') || k.includes('Authorization') ? v.substring(0, 40) + '...' : v}`);
  });
  console.log('');

  console.log('=== API Host ===');
  console.log('  ' + apiHost);
  console.log('');

  const PROXY = {
    proxy: {
      host: 'localhost',
      port: 7891,
      protocol: 'http'
    }
  };

  async function testEndpoint(name, url, body, useProxy) {
    try {
      const config = {
        method: 'POST',
        url,
        headers,
        data: body,
        timeout: 15000,
        validateStatus: () => true
      };
      if (useProxy) {
        config.proxy = PROXY.proxy;
      }
      const resp = await axios(config);
      const text = typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data);
      console.log(`[${name}] Status: ${resp.status}`);
      console.log(`  Response: ${text.substring(0, 500)}`);
      return resp;
    } catch (err) {
      console.log(`[${name}] Error: ${err.message}`);
      return null;
    }
  }

  console.log('--- Test 1: Usage API (ugApi) ---');
  await testEndpoint(
    'usage (proxy)',
    `${apiHost}/trae/api/v1/pay/ide_user_ent_usage`,
    { require_usage: true },
    true
  );

  console.log('\n--- Test 2: Usage API (no proxy) ---');
  await testEndpoint(
    'usage (no proxy)',
    `${apiHost}/trae/api/v1/pay/ide_user_ent_usage`,
    { require_usage: true },
    false
  );

  console.log('\n--- Test 3: Supabase Token ---');
  await testEndpoint(
    'supabase (proxy)',
    `${apiHost}/cloudide/api/v3/trae/GetUserSupabaseToken`,
    {},
    true
  );

  console.log('\n--- Test 4: Auth Host Usage API ---');
  await testEndpoint(
    'auth-host usage (proxy)',
    `${authInfo.host}/trae/api/v1/pay/ide_user_ent_usage`,
    { require_usage: true },
    true
  );

  console.log('\n--- Test 5: Auth Host Usage API (no proxy) ---');
  await testEndpoint(
    'auth-host usage (no proxy)',
    `${authInfo.host}/trae/api/v1/pay/ide_user_ent_usage`,
    { require_usage: true },
    false
  );

  console.log('\n--- Test 6: ExchangeToken ---');
  try {
    const resp = await axios({
      method: 'POST',
      url: `${authInfo.host}/cloudide/api/v3/trae/oauth/ExchangeToken`,
      headers: { 'Content-Type': 'application/json' },
      data: {
        ClientID: 'ono9krqynydwx5',
        RefreshToken: authInfo.refreshToken,
        ClientSecret: '-',
        UserID: ''
      },
      proxy: PROXY.proxy,
      timeout: 15000,
      validateStatus: () => true
    });
    const text = typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data);
    console.log(`[ExchangeToken] Status: ${resp.status}`);
    console.log(`  Response: ${text.substring(0, 500)}`);
  } catch (err) {
    console.log(`[ExchangeToken] Error: ${err.message}`);
  }
}

main().catch(err => console.error('Fatal error:', err));
