const { getAuthInfo, getDeviceIds, getApiHost, buildStreamHeaders, detectEdition, refreshTokenIfNeeded } = require('./src/auth');
const fetch = require('node-fetch');
const { v4: uuidv4 } = require('./src/uuid');

function generateId() {
  return uuidv4().replace(/-/g, '').substring(0, 24) + Date.now().toString(16).slice(-8);
}

async function test() {
  try {
    console.log('=== Trae API Request Format Test ===');

    const authInfo = await refreshTokenIfNeeded();
    const apiHost = getApiHost();
    console.log('API Host:', apiHost);

    const deviceIds = getDeviceIds();
    const requestId = uuidv4();
    const headers = buildStreamHeaders(authInfo, deviceIds, requestId);

    const sessionId = generateId();
    const taskId = generateId();
    const messageId = generateId();
    const conversationId = sessionId;

    const baseBody = {
      conversation_id: conversationId,
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
      { name: 'mode_type=0 (int), agent_type=builder (str)', body: { ...baseBody, mode_type: 0, agent_type: 'builder' } },
      { name: 'mode_type=1 (int), agent_type=builder (str)', body: { ...baseBody, mode_type: 1, agent_type: 'builder' } },
      { name: 'mode_type=0 (int), agent_type=builder_v3 (str)', body: { ...baseBody, mode_type: 0, agent_type: 'builder_v3' } },
      { name: 'mode_type=1 (int), agent_type=builder_v3 (str)', body: { ...baseBody, mode_type: 1, agent_type: 'builder_v3' } },
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
      console.log('Response:', text.substring(0, 500));

      if (resp.status === 200) {
        console.log('\n*** SUCCESS! ***');
        console.log('First 2000 chars of response:');
        console.log(text.substring(0, 2000));
        break;
      }
    }

  } catch (err) {
    console.error('Test failed:', err.message);
    console.error(err.stack);
  }
}

test();
