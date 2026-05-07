const { getAuthInfo, getDeviceIds, getApiHost, buildStreamHeaders, refreshTokenIfNeeded, getDeviceInfo, getIdeVersion, getIdeVersionCode } = require('./src/auth');
const fetch = require('node-fetch');
const { v4: uuidv4 } = require('./src/uuid');

function generateId() {
  return uuidv4().replace(/-/g, '').substring(0, 24) + Date.now().toString(16).slice(-8);
}

async function test() {
  try {
    console.log('=== Trae API Full Stream Test ===');

    const authInfo = await refreshTokenIfNeeded();
    const apiHost = getApiHost();
    const deviceInfo = getDeviceInfo();
    const ideVersion = getIdeVersion();
    const ideVersionCode = getIdeVersionCode();

    const deviceIds = getDeviceIds();
    const requestId = uuidv4();
    const headers = buildStreamHeaders(authInfo, deviceIds, requestId);

    const sessionId = generateId();
    const taskId = generateId();
    const messageId = generateId();
    const inputText = 'Say hello in one word.';
    const modelName = 'claude-3.7-sonnet';

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
        {
          role: 'user',
          content: [{ type: 'text', text: inputText }]
        }
      ],
      model: modelName,
      stream: true,
      mode_type: 0,
      agent_type: 'builder_v3',
      workspace_folder: '',
      workspace_id: '',
      workspace_path: '',
      extra_info: JSON.stringify({
        workspace_folder: '',
        workspace_id: '',
        workspace_path: ''
      }),
    };

    const endpoint = `${apiHost}/api/agent/v3/create_agent_task`;
    console.log('Endpoint:', endpoint);
    console.log('Model:', modelName);

    const resp = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });

    console.log('Status:', resp.status);
    console.log('Content-Type:', resp.headers.get('content-type'));

    if (resp.status === 200) {
      console.log('\n--- Streaming Response ---');
      const text = await resp.text();
      const lines = text.split('\n');
      let eventCount = 0;
      let textContent = '';
      for (const line of lines) {
        if (line.startsWith('event:')) {
          eventCount++;
          console.log(`[Event ${eventCount}] ${line}`);
        } else if (line.startsWith('data:')) {
          try {
            const data = JSON.parse(line.substring(5));
            if (data.type === 'text' || data.content) {
              textContent += data.content || data.text || '';
            }
            if (eventCount <= 5 || data.type === 'text') {
              console.log(`  Data type=${data.type}, keys=${Object.keys(data).join(',')}`);
            }
          } catch (e) {
            // ignore
          }
        }
      }
      console.log(`\nTotal events: ${eventCount}`);
      console.log(`Text content: ${textContent.substring(0, 500)}`);
    } else {
      const text = await resp.text();
      console.log('Error:', text);
    }
  } catch (err) {
    console.error('Test failed:', err.message);
    console.error(err.stack);
  }
}

test();
