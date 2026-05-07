const { getAuthInfo, getDeviceIds, getApiHost, buildStreamHeaders, refreshTokenIfNeeded, getDeviceInfo, getIdeVersion, getIdeVersionCode } = require('./src/auth');
const fetch = require('node-fetch');
const { v4: uuidv4 } = require('./src/uuid');

function generateId() {
  return uuidv4().replace(/-/g, '').substring(0, 24) + Date.now().toString(16).slice(-8);
}

async function test() {
  try {
    console.log('=== Trae API Model Test ===');

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

    const modelTests = [
      { model: 'claude-3.7-sonnet', config_name: 'claude-3.7-sonnet', agent_type: 'builder_v3' },
      { model: 'claude-4-sonnet', config_name: 'claude-4-sonnet', agent_type: 'builder_v3' },
      { model: 'claude-sonnet-4-20250514', config_name: 'claude-sonnet-4-20250514', agent_type: 'builder_v3' },
      { model: 'gpt-4o', config_name: 'gpt-4o', agent_type: 'builder_v3' },
      { model: 'gpt-4.1', config_name: 'gpt-4.1', agent_type: 'builder_v3' },
      { model: 'deepseek-V3.1', config_name: 'deepseek-V3.1', agent_type: 'builder_v3' },
      { model: 'glm-5', config_name: 'glm-5', agent_type: 'builder_v3' },
    ];

    for (const modelTest of modelTests) {
      console.log(`\n--- Testing model: ${modelTest.model} ---`);

      const body = {
        conversation_id: sessionId,
        session_id: sessionId,
        task_id: taskId,
        message_id: messageId,
        user_id: authInfo.userId || '',
        device_id: deviceInfo.device_id,
        model_name: modelTest.model,
        config_name: modelTest.config_name,
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
        model: modelTest.model,
        stream: true,
        mode_type: 0,
        agent_type: modelTest.agent_type,
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
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
      });

      console.log('Status:', resp.status);
      const text = await resp.text();
      const firstLine = text.split('\n')[0];
      console.log('First line:', firstLine.substring(0, 200));

      if (resp.status === 200 && !text.includes('"event":"error"') && !text.includes('event:error')) {
        console.log('\n*** FOUND WORKING MODEL! ***');
        console.log('Full response:', text.substring(0, 3000));
        break;
      }
    }

  } catch (err) {
    console.error('Test failed:', err.message);
    console.error(err.stack);
  }
}

test();
