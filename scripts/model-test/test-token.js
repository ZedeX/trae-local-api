const axios = require('axios');
const fs = require('fs');
const path = require('path');
const os = require('os');

const storagePath = path.join(os.homedir(), 'AppData', 'Roaming', 'Trae', 'User', 'globalStorage', 'storage.json');
const storage = JSON.parse(fs.readFileSync(storagePath, 'utf-8'));
const authRaw = storage['iCubeAuthInfo://icube.cloudide'];
const auth = JSON.parse(authRaw);

console.log('=== Token Analysis ===');
console.log(`Token (first 50): ${auth.token.substring(0, 50)}...`);
console.log(`Token length: ${auth.token.length}`);
console.log(`ExpiredAt: ${auth.expiredAt}`);
console.log(`RefreshExpiredAt: ${auth.refreshExpiredAt}`);
console.log(`TokenReleaseAt: ${auth.tokenReleaseAt}`);
console.log(`UserId: ${auth.userId}`);
console.log(`Host: ${auth.host}`);
console.log(`UserRegion: ${JSON.stringify(auth.userRegion)}`);
console.log(`Account: ${JSON.stringify(auth.account)}`);

const now = new Date();
const expiredAt = new Date(auth.expiredAt);
const refreshExpiredAt = new Date(auth.refreshExpiredAt);
console.log(`\nNow: ${now.toISOString()}`);
console.log(`Token expired: ${expiredAt < now}`);
console.log(`Refresh token expired: ${refreshExpiredAt < now}`);
console.log(`Time until token expiry: ${(expiredAt - now) / 1000 / 60} minutes`);

const jwtParts = auth.token.split('.');
if (jwtParts.length === 3) {
  try {
    const payload = JSON.parse(Buffer.from(jwtParts[1], 'base64').toString());
    console.log(`\nJWT payload:`);
    console.log(JSON.stringify(payload, null, 2));
  } catch(e) {
    console.log(`JWT decode error: ${e.message}`);
  }
}

async function tryRefreshToken() {
  console.log('\n=== Trying Token Refresh ===');
  const authHost = auth.host || 'https://api-sg-central.trae.ai';

  try {
    const resp = await axios({
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
    const text = typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data);
    console.log(`ExchangeToken Status: ${resp.status}`);
    console.log(`Response: ${text.substring(0, 500)}`);

    if (resp.data && resp.data.token) {
      console.log('\nNew token obtained!');
      console.log(`New token (first 50): ${resp.data.token.substring(0, 50)}...`);
      console.log(`New expiredAt: ${resp.data.expiredAt}`);

      const newJwtParts = resp.data.token.split('.');
      if (newJwtParts.length === 3) {
        try {
          const payload = JSON.parse(Buffer.from(newJwtParts[1], 'base64').toString());
          console.log(`New JWT payload:`);
          console.log(JSON.stringify(payload, null, 2));
        } catch(e) {}
      }

      console.log('\n=== Testing new token ===');
      const API_HOST = 'https://coresg-normal.trae.ai';
      const newHeaders = {
        'Content-Type': 'application/json',
        'x-cloudide-token': resp.data.token,
        'Authorization': `Bearer ${resp.data.token}`,
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

      const testResp = await axios({
        method: 'POST',
        url: `${API_HOST}/api/ide/v1/get_detail_param`,
        headers: newHeaders,
        data: { function: 'chat_v3' },
        timeout: 15000,
        validateStatus: () => true
      });
      const testText = typeof testResp.data === 'string' ? testResp.data : JSON.stringify(testResp.data);
      console.log(`get_detail_param with new token: ${testResp.status}`);
      console.log(`Response: ${testText.substring(0, 500)}`);

      const chatResp = await axios({
        method: 'POST',
        url: `${API_HOST}/api/ide/v1/chat`,
        headers: newHeaders,
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
      const chatText = typeof chatResp.data === 'string' ? chatResp.data : JSON.stringify(chatResp.data);
      console.log(`\nchat with new token: ${chatResp.status}`);
      console.log(`Response: ${chatText.substring(0, 500)}`);

      if (resp.status === 200 && resp.data.token) {
        console.log('\n=== Saving new token to storage.json ===');
        const newAuth = {
          ...auth,
          token: resp.data.token,
          refreshToken: resp.data.refreshToken || auth.refreshToken,
          expiredAt: resp.data.expiredAt,
          refreshExpiredAt: resp.data.refreshExpiredAt || auth.refreshExpiredAt,
          tokenReleaseAt: resp.data.tokenReleaseAt || auth.tokenReleaseAt
        };
        storage['iCubeAuthInfo://icube.cloudide'] = JSON.stringify(newAuth);
        fs.writeFileSync(storagePath, JSON.stringify(storage, null, '\t'), 'utf-8');
        console.log('New token saved to storage.json');
      }
    }
  } catch (err) {
    console.log(`ExchangeToken error: ${err.message}`);
  }
}

tryRefreshToken();
