const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const os = require('os');

function getTraeDataDir() {
  return path.join(os.homedir(), 'AppData', 'Roaming', 'Trae');
}

function getStorageJsonPath() {
  return path.join(getTraeDataDir(), 'User', 'globalStorage', 'storage.json');
}

function readStorageJson() {
  const raw = fs.readFileSync(getStorageJsonPath(), 'utf-8');
  return JSON.parse(raw);
}

function getAuthInfo() {
  const storage = readStorageJson();
  const authRaw = storage['iCubeAuthInfo://icube.cloudide'];
  if (!authRaw) throw new Error('No auth info found');
  return JSON.parse(authRaw);
}

function getDeviceIds() {
  const storage = readStorageJson();
  return {
    machineId: storage['telemetry.machineId'] || '',
    sqmId: storage['telemetry.sqmId'] || '',
    devDeviceId: storage['telemetry.devDeviceId'] || ''
  };
}

function buildHeaders(authInfo) {
  return {
    'Content-Type': 'application/json',
    'x-cloudide-token': authInfo.token,
    'Authorization': `Bearer ${authInfo.token}`,
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
    'x-uid': authInfo.userId || ''
  };
}

async function testEndpoint(name, url, headers, body) {
  console.log(`\n--- Testing: ${name} ---`);
  console.log(`URL: ${url}`);
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      timeout: 30000
    });
    console.log(`Status: ${resp.status}`);
    const text = await resp.text();
    console.log(`Response (first 500 chars): ${text.substring(0, 500)}`);
    return { status: resp.status, body: text };
  } catch (err) {
    console.log(`Error: ${err.message}`);
    return { status: 0, error: err.message };
  }
}

async function testStreamEndpoint(name, url, headers, body) {
  console.log(`\n--- Testing Stream: ${name} ---`);
  console.log(`URL: ${url}`);
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        ...headers,
        'Accept': 'text/event-stream'
      },
      body: JSON.stringify(body),
      timeout: 30000
    });
    console.log(`Status: ${resp.status}`);
    if (!resp.ok) {
      const text = await resp.text();
      console.log(`Error response: ${text.substring(0, 500)}`);
      return;
    }

    let chunkCount = 0;
    let fullContent = '';
    const startTime = Date.now();

    return new Promise((resolve) => {
      resp.body.on('data', (chunk) => {
        chunkCount++;
        const text = chunk.toString();
        if (chunkCount <= 5) {
          console.log(`Chunk ${chunkCount}: ${text.substring(0, 200)}`);
        }
        fullContent += text;
      });

      resp.body.on('end', () => {
        const elapsed = Date.now() - startTime;
        console.log(`\nStream completed: ${chunkCount} chunks, ${elapsed}ms`);
        console.log(`Total content length: ${fullContent.length}`);
        console.log(`Last 200 chars: ${fullContent.substring(fullContent.length - 200)}`);
        resolve();
      });

      resp.body.on('error', (err) => {
        console.log(`Stream error: ${err.message}`);
        resolve();
      });

      setTimeout(() => {
        console.log('\nTimeout: stopping stream after 25s');
        resp.body.destroy();
        resolve();
      }, 25000);
    });
  } catch (err) {
    console.log(`Error: ${err.message}`);
  }
}

async function main() {
  const authInfo = getAuthInfo();
  const deviceIds = getDeviceIds();
  const headers = buildHeaders(authInfo);

  console.log('=== Auth Info ===');
  console.log('userId:', authInfo.userId);
  console.log('host:', authInfo.host);
  console.log('region:', JSON.stringify(authInfo.userRegion));
  console.log('expiredAt:', authInfo.expiredAt);
  console.log('tokenLen:', authInfo.token?.length);
  console.log('machineId:', deviceIds.machineId?.substring(0, 16) + '...');

  const apiHost = 'https://coresg-normal.trae.ai';
  console.log('\nAPI Host:', apiHost);

  await testEndpoint(
    'get_detail_param (chat_v3)',
    `${apiHost}/api/ide/v1/get_detail_param`,
    headers,
    {
      function: 'chat_v3',
      config_names: null,
      need_prompt: false,
      current_config_info: null,
      poly_prompt: true,
      mode_type: 'Manual',
      agent_type: null
    }
  );

  await testEndpoint(
    'chat_mode',
    `${apiHost}/api/v1/commercial/chat_mode`,
    headers,
    {}
  );

  await testEndpoint(
    'chat (non-stream)',
    `${apiHost}/api/ide/v1/chat`,
    headers,
    {
      function: 'chat_v3',
      model: 'claude-3.5-sonnet',
      messages: [{ role: 'user', content: 'Say hello in one word.' }],
      stream: false,
      mode_type: 'Manual'
    }
  );

  await testStreamEndpoint(
    'chat (stream)',
    `${apiHost}/api/ide/v1/chat`,
    headers,
    {
      function: 'chat_v3',
      model: 'claude-3.5-sonnet',
      messages: [{ role: 'user', content: 'Say hello in one word.' }],
      stream: true,
      mode_type: 'Manual'
    }
  );
}

main().catch(console.error);
