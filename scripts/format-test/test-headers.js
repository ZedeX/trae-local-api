const fs = require('fs');
const path = require('path');
const os = require('os');
const axios = require('axios');

const storagePath = path.join(os.homedir(), 'AppData', 'Roaming', 'Trae', 'User', 'globalStorage', 'storage.json');
const storage = JSON.parse(fs.readFileSync(storagePath, 'utf-8'));
const authRaw = storage['iCubeAuthInfo://icube.cloudide'];
const auth = JSON.parse(authRaw);
const token = auth.token;

const PROXY_CONFIG = {
  proxy: {
    host: 'localhost',
    port: 7891,
    protocol: 'http'
  }
};

const COMMON_HEADERS = {
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

async function testRequest(name, url, headers, body, useProxy) {
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
      config.proxy = PROXY_CONFIG.proxy;
    }
    const resp = await axios(config);
    const text = typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data);
    console.log(`[${name}] Status: ${resp.status}`);
    console.log(`  Response: ${text.substring(0, 500)}`);
    console.log('');
    return resp;
  } catch (err) {
    console.log(`[${name}] Error: ${err.message}\n`);
    return null;
  }
}

async function main() {
  console.log('=== Testing Trae API with axios + proxy ===\n');
  console.log(`Token (first 30): ${token.substring(0, 30)}...`);
  console.log(`UserId: ${auth.userId}`);
  console.log(`UserRegion: ${JSON.stringify(auth.userRegion)}`);
  console.log(`Host: ${auth.host}`);
  console.log('');

  const API_HOSTS = [
    'https://coresg-normal.trae.ai',
    'https://coreus-normal.trae.ai',
    'https://icube16-normal-sg.trae.ai'
  ];

  const detailParamBody = {
    function: 'chat_v3',
    config_names: null,
    need_prompt: false,
    current_config_info: null,
    poly_prompt: true,
    mode_type: 'Manual',
    agent_type: null
  };

  for (const host of API_HOSTS) {
    console.log(`--- Testing host: ${host} ---`);
    await testRequest(
      `detail_param @ ${host} (proxy)`,
      `${host}/api/ide/v1/get_detail_param`,
      COMMON_HEADERS,
      detailParamBody,
      true
    );
  }

  console.log('--- Testing without proxy ---');
  await testRequest(
    'detail_param no proxy',
    `${API_HOSTS[0]}/api/ide/v1/get_detail_param`,
    COMMON_HEADERS,
    detailParamBody,
    false
  );

  console.log('--- Testing chat/completions ---');
  const chatBody = {
    function: 'chat_v3',
    model: 'claude-3.5-sonnet',
    messages: [{ role: 'user', content: 'Say hello in one word' }],
    stream: false,
    mode_type: 'Manual'
  };

  await testRequest(
    'chat/completions (proxy)',
    `${API_HOSTS[0]}/api/ide/v1/chat/completions`,
    COMMON_HEADERS,
    chatBody,
    true
  );

  await testRequest(
    'chat/completions (no proxy)',
    `${API_HOSTS[0]}/api/ide/v1/chat/completions`,
    COMMON_HEADERS,
    chatBody,
    false
  );

  console.log('--- Testing with socks5 proxy ---');
  try {
    const { SocksProxyAgent } = require('socks-proxy-agent');
    const socksAgent = new SocksProxyAgent('socks5://localhost:1083');

    const resp = await axios({
      method: 'POST',
      url: `${API_HOSTS[0]}/api/ide/v1/get_detail_param`,
      headers: COMMON_HEADERS,
      data: detailParamBody,
      httpsAgent: socksAgent,
      httpAgent: socksAgent,
      timeout: 15000,
      validateStatus: () => true
    });
    const text = typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data);
    console.log(`[socks5 proxy] Status: ${resp.status}`);
    console.log(`  Response: ${text.substring(0, 500)}\n`);
  } catch (err) {
    console.log(`[socks5 proxy] Error: ${err.message}\n`);
  }

  console.log('--- Testing ExchangeToken API ---');
  try {
    const resp = await axios({
      method: 'POST',
      url: `${auth.host}/cloudide/api/v3/trae/oauth/ExchangeToken`,
      headers: { 'Content-Type': 'application/json' },
      data: {
        ClientID: 'ono9krqynydwx5',
        RefreshToken: auth.refreshToken,
        ClientSecret: '-',
        UserID: ''
      },
      proxy: PROXY_CONFIG.proxy,
      timeout: 15000,
      validateStatus: () => true
    });
    const text = typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data);
    console.log(`[ExchangeToken] Status: ${resp.status}`);
    console.log(`  Response: ${text.substring(0, 500)}\n`);
  } catch (err) {
    console.log(`[ExchangeToken] Error: ${err.message}\n`);
  }
}

main();
