const { getAuthInfo, getDeviceIds, getApiHost, buildStreamHeaders, refreshTokenIfNeeded, getDeviceInfo, getIdeVersion, getIdeVersionCode } = require('./src/auth');
const fetch = require('node-fetch');
const { v4: uuidv4 } = require('./src/uuid');

function generateId() {
  return uuidv4().replace(/-/g, '').substring(0, 24) + Date.now().toString(16).slice(-8);
}

async function test() {
  try {
    const authInfo = await refreshTokenIfNeeded();
    const apiHost = getApiHost();
    const deviceInfo = getDeviceInfo();
    const ideVersion = getIdeVersion();
    const ideVersionCode = getIdeVersionCode();
    const deviceIds = getDeviceIds();

    const inputText = 'Say hello in one word.';

    const configs = [
      { agent_type: 'builder_v3', config_name: 'claude-3.7-sonnet', mode_type: 0 },
      { agent_type: 'builder_v3', config_name: 'claude-3.7-sonnet', mode_type: 1 },
      { agent_type: 'solo_coder', config_name: 'claude-3.7-sonnet', mode_type: 0 },
      { agent_type: 'solo_coder', config_name: 'claude-3.7-sonnet', mode_type: 1 },
      { agent_type: 'chat_v3', config_name: 'claude-3.7-sonnet', mode_type: 0 },
      { agent_type: 'chat_v3', config_name: 'claude-3.7-sonnet', mode_type: 1 },
      { agent_type: 'builder_v3', config_name: 'default', mode_type: 0 },
      { agent_type: 'builder_v3', config_name: 'default', mode_type: 1 },
      { agent_type: 'solo_coder', config_name: 'default', mode_type: 1 },
      { agent_type: 'chat_v3', config_name: 'default', mode_type: 1 },
    ];

    for (const cfg of configs) {
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
        model_name: 'claude-3.7-sonnet',
        config_name: cfg.config_name,
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
        model: 'claude-3.7-sonnet',
        stream: true,
        mode_type: cfg.mode_type,
        agent_type: cfg.agent_type,
        workspace_folder: '',
        workspace_id: '',
        workspace_path: '',
      };

      const endpoint = `${apiHost}/api/agent/v3/create_agent_task`;
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
      });

      const text = await resp.text();
      const isError = text.includes('event:error');
      const label = `agent=${cfg.agent_type}, config=${cfg.config_name}, mode=${cfg.mode_type}`;
      if (isError) {
        const dataMatch = text.match(/"message":"([^"]+)"/);
        console.log(`[FAIL] ${label} -> ${dataMatch ? dataMatch[1].substring(0, 80) : 'error'}`);
      } else {
        console.log(`[OK!] ${label}`);
        console.log('Response:', text.substring(0, 500));
        break;
      }
    }
  } catch (err) {
    console.error('Test failed:', err.message);
  }
}

test();
