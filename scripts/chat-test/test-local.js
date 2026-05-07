const axios = require('axios');
const fs = require('fs');
const path = require('path');
const os = require('os');

const storagePath = path.join(os.homedir(), 'AppData', 'Roaming', 'Trae', 'User', 'globalStorage', 'storage.json');
const storage = JSON.parse(fs.readFileSync(storagePath, 'utf-8'));
const authRaw = storage['iCubeAuthInfo://icube.cloudide'];
const auth = JSON.parse(authRaw);

const LOCAL_PORTS = [17788, 51000];

async function testLocalEndpoint(port, urlPath, method, body) {
  try {
    const resp = await axios({
      method: method || 'GET',
      url: `http://127.0.0.1:${port}${urlPath}`,
      headers: {
        'Content-Type': 'application/json',
        'x-cloudide-token': auth.token,
        'Authorization': `Bearer ${auth.token}`
      },
      data: body,
      timeout: 5000,
      validateStatus: () => true
    });
    const text = typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data);
    console.log(`[port ${port}] ${method || 'GET'} ${urlPath} => ${resp.status}: ${text.substring(0, 300)}`);
    return resp;
  } catch (err) {
    console.log(`[port ${port}] ${method || 'GET'} ${urlPath} => Error: ${err.message}`);
    return null;
  }
}

async function main() {
  console.log('=== Testing Trae local server endpoints ===\n');

  for (const port of LOCAL_PORTS) {
    console.log(`\n--- Port ${port} ---`);

    await testLocalEndpoint(port, '/');
    await testLocalEndpoint(port, '/api');
    await testLocalEndpoint(port, '/health');
    await testLocalEndpoint(port, '/status');
    await testLocalEndpoint(port, '/v1/models');
    await testLocalEndpoint(port, '/v1/chat/completions', 'POST', {
      model: 'claude-3.5-sonnet',
      messages: [{ role: 'user', content: 'hi' }],
      stream: false
    });
    await testLocalEndpoint(port, '/api/ide/v1/chat', 'POST', {
      function: 'chat_v3',
      model: 'claude-3.5-sonnet',
      messages: [{ role: 'user', content: 'hi' }],
      stream: false,
      mode_type: 'Manual'
    });
    await testLocalEndpoint(port, '/api/ide/v1/get_detail_param', 'POST', {
      function: 'chat_v3'
    });
  }

  console.log('\n\n=== Scanning more ports ===\n');
  const extraPorts = [14013, 14016, 14019, 14022, 14023, 16416, 5557, 7555, 5037];
  for (const port of extraPorts) {
    try {
      const resp = await axios({
        method: 'GET',
        url: `http://127.0.0.1:${port}/`,
        timeout: 2000,
        validateStatus: () => true
      });
      const text = typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data);
      console.log(`[port ${port}] GET / => ${resp.status}: ${text.substring(0, 200)}`);
    } catch (err) {
      console.log(`[port ${port}] Error: ${err.message.substring(0, 80)}`);
    }
  }
}

main().catch(err => console.error('Fatal:', err));
