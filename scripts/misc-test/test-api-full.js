const axios = require('axios');
const fs = require('fs');
const path = require('path');
const os = require('os');

const storagePath = path.join(os.homedir(), 'AppData', 'Roaming', 'Trae', 'User', 'globalStorage', 'storage.json');
let storage = JSON.parse(fs.readFileSync(storagePath, 'utf-8'));
let authRaw = storage['iCubeAuthInfo://icube.cloudide'];
let auth = JSON.parse(authRaw);

const API_HOST = 'https://coresg-normal.trae.ai';

function makeHeaders(token) {
  return {
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
}

async function main() {
  console.log('Step 1: Refresh token...');
  const authHost = auth.host || 'https://api-sg-central.trae.ai';
  const refreshResp = await axios({
    method: 'POST',
    url: `${authHost}/cloudide/api/v3/trae/oauth/ExchangeToken`,
    headers: { 'Content-Type': 'application/json' },
    data: {
      ClientID: 'ono9krqynydwx5',
      RefreshToken: auth.refreshToken,
      ClientSecret: '-',
      UserID: ''
    },
    timeout: 15000,
    validateStatus: () => true
  });

  let newToken;
  if (refreshResp.data?.Result?.Token) {
    newToken = refreshResp.data.Result.Token;
    console.log('Token refreshed OK, length:', newToken.length);

    const newAuth = {
      ...auth,
      token: newToken,
      refreshToken: refreshResp.data.Result.RefreshToken || auth.refreshToken,
      expiredAt: new Date(refreshResp.data.Result.ExpireAt || Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      refreshExpiredAt: new Date(refreshResp.data.Result.RefreshExpireAt).toISOString()
    };
    storage['iCubeAuthInfo://icube.cloudide'] = JSON.stringify(newAuth);
    fs.writeFileSync(storagePath, JSON.stringify(storage, null, '\t'), 'utf-8');
    console.log('New token saved.');
  } else {
    newToken = auth.token;
    console.log('Using existing token. Refresh response:', JSON.stringify(refreshResp.data).substring(0, 200));
  }

  const headers = makeHeaders(newToken);

  console.log('\nStep 2: Test get_detail_param...');
  const detailResp = await axios({
    method: 'POST',
    url: `${API_HOST}/api/ide/v1/get_detail_param`,
    headers,
    data: { function: 'chat_v3' },
    timeout: 15000,
    validateStatus: () => true
  });
  console.log('Status:', detailResp.status);
  console.log('Response:', JSON.stringify(detailResp.data).substring(0, 500));

  console.log('\nStep 3: Test chat endpoint...');
  const chatResp = await axios({
    method: 'POST',
    url: `${API_HOST}/api/ide/v1/chat`,
    headers,
    data: {
      function: 'chat_v3',
      model: 'claude-3.5-sonnet',
      messages: [{ role: 'user', content: 'Say hello in one word' }],
      stream: false,
      mode_type: 'Manual'
    },
    timeout: 30000,
    validateStatus: () => true
  });
  console.log('Status:', chatResp.status);
  const chatText = typeof chatResp.data === 'string' ? chatResp.data : JSON.stringify(chatResp.data);
  console.log('Response:', chatText.substring(0, 500));

  console.log('\nStep 4: Test chat_mode...');
  const modeResp = await axios({
    method: 'POST',
    url: `${API_HOST}/api/v1/commercial/chat_mode`,
    headers,
    data: {},
    timeout: 15000,
    validateStatus: () => true
  });
  console.log('Status:', modeResp.status);
  console.log('Response:', JSON.stringify(modeResp.data).substring(0, 500));

  console.log('\nStep 5: Test chat with stream...');
  try {
    const streamResp = await axios({
      method: 'POST',
      url: `${API_HOST}/api/ide/v1/chat`,
      headers: {
        ...headers,
        'Accept': 'text/event-stream'
      },
      data: {
        function: 'chat_v3',
        model: 'claude-3.5-sonnet',
        messages: [{ role: 'user', content: 'Say hello' }],
        stream: true,
        mode_type: 'Manual'
      },
      timeout: 30000,
      responseType: 'stream',
      validateStatus: () => true
    });
    console.log('Stream Status:', streamResp.status);
    console.log('Stream Headers:', JSON.stringify(streamResp.headers).substring(0, 300));

    let streamData = '';
    await new Promise((resolve) => {
      streamResp.data.on('data', (chunk) => {
        streamData += chunk.toString();
        if (streamData.length > 1000) {
          streamResp.data.destroy();
          resolve();
        }
      });
      streamResp.data.on('end', resolve);
      streamResp.data.on('error', resolve);
      setTimeout(resolve, 10000);
    });
    console.log('Stream Data:', streamData.substring(0, 1000));
  } catch (err) {
    console.log('Stream error:', err.message);
  }
}

main().catch(err => console.error('Fatal error:', err));
