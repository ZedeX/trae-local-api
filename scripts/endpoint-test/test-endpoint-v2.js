const { getAuthInfo, getDeviceIds, getApiHost, buildStreamHeaders, detectEdition, refreshTokenIfNeeded } = require('./src/auth');
const fetch = require('node-fetch');
const { v4: uuidv4 } = require('./src/uuid');

async function test() {
  try {
    console.log('=== Trae API Endpoint Test ===');

    const authInfo = await refreshTokenIfNeeded();
    const apiHost = getApiHost();
    console.log('API Host:', apiHost);

    const deviceIds = getDeviceIds();
    const requestId = uuidv4();
    const headers = buildStreamHeaders(authInfo, deviceIds, requestId);

    const sessionId = uuidv4().replace(/-/g, '').substring(0, 24) + Date.now().toString(16).slice(-8);
    const taskId = uuidv4().replace(/-/g, '').substring(0, 24) + Date.now().toString(16).slice(-8);
    const messageId = uuidv4().replace(/-/g, '').substring(0, 24) + Date.now().toString(16).slice(-8);

    const baseBody = {
      session_id: sessionId,
      task_id: taskId,
      message_id: messageId,
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: 'Say hello in one word.' }]
        }
      ],
      model: 'claude-3.5-sonnet',
      stream: true,
      workspace_folder: '',
      workspace_id: '',
      workspace_path: '',
    };

    const tests = [
      { name: 'No mode_type/agent_type', body: { ...baseBody } },
      { name: 'mode_type=0, agent_type=0', body: { ...baseBody, mode_type: 0, agent_type: 0 } },
      { name: 'mode_type=1, agent_type=1', body: { ...baseBody, mode_type: 1, agent_type: 1 } },
      { name: 'mode_type=2, agent_type=2', body: { ...baseBody, mode_type: 2, agent_type: 2 } },
    ];

    for (const test of tests) {
      console.log(`\n--- Test: ${test.name} ---`);
      const endpoint = `${apiHost}/api/agent/v3/create_agent_task`;
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(test.body)
      });

      console.log('Status:', resp.status);
      const text = await resp.text();
      console.log('Response:', text.substring(0, 300));

      if (resp.status === 200) {
        console.log('\n*** SUCCESS! ***');
        break;
      }
    }

  } catch (err) {
    console.error('Test failed:', err.message);
  }
}

test();
