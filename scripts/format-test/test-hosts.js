const { getAuthInfo, getDeviceIds, buildStreamHeaders, refreshTokenIfNeeded, getDeviceInfo, getIdeVersion, getIdeVersionCode } = require('./src/auth');
const fetch = require('node-fetch');
const { v4: uuidv4 } = require('./src/uuid');

function generateId() {
  return uuidv4().replace(/-/g, '').substring(0, 24) + Date.now().toString(16).slice(-8);
}

async function test() {
  try {
    const authInfo = await refreshTokenIfNeeded();
    const deviceInfo = getDeviceInfo();
    const ideVersion = getIdeVersion();
    const ideVersionCode = getIdeVersionCode();
    const deviceIds = getDeviceIds();

    const inputText = 'Say hello in one word.';
    const modelName = 'claude-3.7-sonnet';

    const hosts = [
      'https://api-sg-central.trae.ai',
      'https://coresg-normal.trae.ai',
    ];

    const endpoints = [
      '/api/agent/v3/create_agent_task',
      '/api/cue_agent/v3/create_agent_task',
      '/api/ide/v1/chat',
    ];

    for (const host of hosts) {
      for (const endpointPath of endpoints) {
        const requestId = uuidv4();
        const headers = buildStreamHeaders(authInfo, deviceIds, requestId);
        const sessionId = generateId();
        const taskId = generateId();
        const messageId = generateId();

        const body = {
          conversation_id: sessionId,
          session_id: sessionId,
          task_id: taskId,
          message_id: messageId,
          user_id: authInfo.userId || '',
          device_id: deviceInfo.device_id,
          model_name: modelName,
          config_name: modelName,
          ide_version: ideVersion,
          ide_version_code: ideVersionCode,
          user_input: {
            id: messageId,
            user_input: inputText,
            placeholder_map: '{}'
          },
          messages: [
            { role: 'user', content: [{ type: 'text', text: inputText }] }
          ],
          model: modelName,
          stream: true,
          mode_type: 0,
          agent_type: 'builder_v3',
          workspace_folder: '',
          workspace_id: '',
          workspace_path: '',
        };

        const url = `${host}${endpointPath}`;
        console.log(`\n--- ${url} ---`);

        try {
          const resp = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(body)
          });

          console.log('Status:', resp.status);
          const text = await resp.text();

          if (resp.status === 200 && !text.includes('event:error')) {
            console.log('*** SUCCESS! ***');
            console.log('Response:', text.substring(0, 2000));
            return;
          } else {
            const errMatch = text.match(/"message":"([^"]{0,100})"/);
            console.log('Error:', errMatch ? errMatch[1] : text.substring(0, 200));
          }
        } catch (e) {
          console.log('Exception:', e.message.substring(0, 100));
        }
      }
    }
  } catch (err) {
    console.error('Test failed:', err.message);
  }
}

test();
