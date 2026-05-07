const axios = require('axios');
const fs = require('fs');
const path = require('path');
const os = require('os');

const storagePath = path.join(os.homedir(), 'AppData', 'Roaming', 'Trae', 'User', 'globalStorage', 'storage.json');
const storage = JSON.parse(fs.readFileSync(storagePath, 'utf-8'));
const authRaw = storage['iCubeAuthInfo://icube.cloudide'];
const auth = JSON.parse(authRaw);
const token = auth.token;

const API_HOST = 'https://coresg-normal.trae.ai';

const HEADERS = {
  'Content-Type': 'application/json',
  'x-cloudide-token': token,
  'Authorization': `Bearer ${token}`,
  'x-app-id': '6eefa01c-1036-4c7e-9ca5-d891f63bfcd8',
  'x-app-version': 'default',
  'x-ide-version-code': '20260401',
  'x-app-version-code': '20260401',
  'x-device-brand': '82RF',
  'x-device-cpu': 'Intel',
  'x-device-id': '7572191304870168081',
  'x-machine-id': '87ddf83d68c40fe3585c85ced360a8c8adc7647bc06318874feeceba975de97a',
  'x-os-version': 'Windows 10 Enterprise LTSC 2021',
  'x-device-type': 'windows',
  'x-ide-version': '3.5.51',
  'x-ide-version-type': 'stable',
  'request-traffic-type': 'prod',
  'x-uid': auth.userId || ''
};

async function testEndpoint(method, urlPath, body) {
  try {
    const resp = await axios({
      method,
      url: `${API_HOST}${urlPath}`,
      headers: HEADERS,
      data: body,
      timeout: 15000,
      validateStatus: () => true
    });
    const text = typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data);
    console.log(`[${method} ${urlPath}] Status: ${resp.status}`);
    console.log(`  Response: ${text.substring(0, 300)}`);
    return resp;
  } catch (err) {
    console.log(`[${method} ${urlPath}] Error: ${err.message}`);
    return null;
  }
}

async function main() {
  console.log('=== Exhaustive API endpoint testing ===\n');

  await testEndpoint('POST', '/api/ide/v1/get_detail_param', {
    function: 'chat_v3',
    config_names: null,
    need_prompt: false,
    current_config_info: null,
    poly_prompt: true,
    mode_type: 'Manual',
    agent_type: null
  });

  await testEndpoint('POST', '/api/ide/v1/get_detail_param', {
    function: 'chat_v3'
  });

  await testEndpoint('POST', '/api/ide/v1/get_detail_param', {});

  await testEndpoint('GET', '/api/ide/v1/get_detail_param', undefined);

  console.log('\n--- Testing chat endpoints ---\n');

  await testEndpoint('POST', '/api/ide/v1/chat/completions', {
    function: 'chat_v3',
    model: 'claude-3.5-sonnet',
    messages: [{ role: 'user', content: 'hi' }],
    stream: false,
    mode_type: 'Manual'
  });

  await testEndpoint('POST', '/api/ide/v1/chat', {
    function: 'chat_v3',
    model: 'claude-3.5-sonnet',
    messages: [{ role: 'user', content: 'hi' }],
    stream: false,
    mode_type: 'Manual'
  });

  await testEndpoint('POST', '/api/ide/v1/chat_v3', {
    model: 'claude-3.5-sonnet',
    messages: [{ role: 'user', content: 'hi' }],
    stream: false
  });

  await testEndpoint('POST', '/api/v1/chat/completions', {
    model: 'claude-3.5-sonnet',
    messages: [{ role: 'user', content: 'hi' }],
    stream: false
  });

  await testEndpoint('POST', '/icube/api/v1/chat/completions', {
    model: 'claude-3.5-sonnet',
    messages: [{ role: 'user', content: 'hi' }],
    stream: false
  });

  console.log('\n--- Testing other endpoints ---\n');

  await testEndpoint('POST', '/api/v1/commercial/chat_mode', {});

  await testEndpoint('POST', '/api/ide/v1/config/query', {});

  await testEndpoint('GET', '/api/ide/v1/models', undefined);

  await testEndpoint('POST', '/api/ide/v1/models', {});

  await testEndpoint('POST', '/icube/api/v1/native/config/query', {});

  console.log('\n--- Testing with different body for get_detail_param ---\n');

  await testEndpoint('POST', '/api/ide/v1/get_detail_param', {
    function: 'chat_v3',
    config_names: [],
    need_prompt: true,
    current_config_info: {},
    poly_prompt: true,
    mode_type: 'Manual',
    agent_type: ''
  });

  await testEndpoint('POST', '/api/ide/v1/get_detail_param', {
    function: 'chat_v3',
    config_names: ['claude-3.5-sonnet'],
    need_prompt: true,
    current_config_info: null,
    poly_prompt: true,
    mode_type: 'Manual',
    agent_type: null
  });

  console.log('\n--- Testing with only x-cloudide-token (no Bearer) ---\n');

  const headersNoBearer = { ...HEADERS };
  delete headersNoBearer['Authorization'];

  try {
    const resp = await axios({
      method: 'POST',
      url: `${API_HOST}/api/ide/v1/get_detail_param`,
      headers: headersNoBearer,
      data: { function: 'chat_v3' },
      timeout: 15000,
      validateStatus: () => true
    });
    const text = typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data);
    console.log(`[POST /api/ide/v1/get_detail_param no Bearer] Status: ${resp.status}`);
    console.log(`  Response: ${text.substring(0, 300)}`);
  } catch (err) {
    console.log(`Error: ${err.message}`);
  }

  console.log('\n--- Testing with only Bearer (no x-cloudide-token) ---\n');

  const headersNoCloudide = { ...HEADERS };
  delete headersNoCloudide['x-cloudide-token'];

  try {
    const resp = await axios({
      method: 'POST',
      url: `${API_HOST}/api/ide/v1/get_detail_param`,
      headers: headersNoCloudide,
      data: { function: 'chat_v3' },
      timeout: 15000,
      validateStatus: () => true
    });
    const text = typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data);
    console.log(`[POST /api/ide/v1/get_detail_param no cloudide-token] Status: ${resp.status}`);
    console.log(`  Response: ${text.substring(0, 300)}`);
  } catch (err) {
    console.log(`Error: ${err.message}`);
  }
}

main();
