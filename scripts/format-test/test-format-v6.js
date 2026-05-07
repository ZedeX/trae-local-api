const { getAuthInfo, getDeviceIds, getApiHost, buildStreamHeaders, detectEdition, refreshTokenIfNeeded, getDeviceInfo } = require('./src/auth');
const fetch = require('node-fetch');
const { v4: uuidv4 } = require('./src/uuid');

function generateId() {
  return uuidv4().replace(/-/g, '').substring(0, 24) + Date.now().toString(16).slice(-8);
}

async function test() {
  try {
    console.log('=== Trae API Request Format Test v6 ===');

    const authInfo = await refreshTokenIfNeeded();
    const apiHost = getApiHost();
    const deviceInfo = getDeviceInfo();
    console.log('API Host:', apiHost);
    console.log('User ID:', authInfo.userId);

    const deviceIds = getDeviceIds();
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
      model_name: 'claude-3.5-sonnet',
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: 'Say hello in one word.' }]
        }
      ],
      model: 'claude-3.5-sonnet',
      stream: true,
      mode_type: 0,
      agent_type: 'builder_v3',
      workspace_folder: '',
      workspace_id: '',
      workspace_path: '',
    };

    console.log('\n--- Sending request ---');
    const endpoint = `${apiHost}/api/agent/v3/create_agent_task`;
    console.log('Endpoint:', endpoint);

    const resp = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });

    console.log('Status:', resp.status);
    const text = await resp.text();
    console.log('Response:', text.substring(0, 1500));

    if (resp.status === 200) {
      console.log('\n*** SUCCESS! ***');
    }
  } catch (err) {
    console.error('Test failed:', err.message);
    console.error(err.stack);
  }
}

test();
