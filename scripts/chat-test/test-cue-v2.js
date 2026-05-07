const { getAuthInfo, getDeviceIds, getApiHost, buildStreamHeaders, buildCommonHeaders, refreshTokenIfNeeded, getDeviceInfo, getIdeVersion, getIdeVersionCode } = require('./src/auth');
const fetch = require('node-fetch');
const { v4: uuidv4 } = require('./src/uuid');

function generateId() {
  return uuidv4().replace(/-/g, '').substring(0, 24) + Date.now().toString(16).slice(-8);
}

async function testCueAgent() {
  try {
    const authInfo = await refreshTokenIfNeeded();
    const apiHost = getApiHost();
    const deviceInfo = getDeviceInfo();
    const ideVersion = getIdeVersion();
    const ideVersionCode = getIdeVersionCode();
    const deviceIds = getDeviceIds();

    const inputText = 'Say hello in one word.';
    const modelName = 'claude-3.7-sonnet';

    const requestId = uuidv4();
    const headers = buildStreamHeaders(authInfo, deviceIds, requestId);
    const sessionId = generateId();
    const taskId = generateId();
    const messageId = generateId();

    const cueBody = {
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

    console.log('=== Test cue_agent with different formats ===');

    const tests = [
      {
        name: 'cue_agent with full body',
        url: `${apiHost}/api/cue_agent/v3/create_agent_task`,
        body: cueBody
      },
      {
        name: 'cue_agent with minimal body',
        url: `${apiHost}/api/cue_agent/v3/create_agent_task`,
        body: {
          session_id: sessionId,
          task_id: taskId,
          message_id: messageId,
          user_id: authInfo.userId || '',
          model_name: modelName,
          messages: [
            { role: 'user', content: [{ type: 'text', text: inputText }] }
          ],
          stream: true,
        }
      },
      {
        name: 'agent with mode_type=1 and solo_coder',
        url: `${apiHost}/api/agent/v3/create_agent_task`,
        body: {
          ...cueBody,
          mode_type: 1,
          agent_type: 'solo_coder',
          config_name: 'solo_coder',
        }
      },
      {
        name: 'agent with chat_v3',
        url: `${apiHost}/api/agent/v3/create_agent_task`,
        body: {
          ...cueBody,
          mode_type: 1,
          agent_type: 'chat_v3',
          config_name: 'chat_v3',
        }
      },
    ];

    for (const t of tests) {
      console.log(`\n--- ${t.name} ---`);
      const resp = await fetch(t.url, {
        method: 'POST',
        headers,
        body: JSON.stringify(t.body)
      });
      console.log('Status:', resp.status);
      const text = await resp.text();
      if (resp.status === 200 && !text.includes('event:error')) {
        console.log('*** SUCCESS! ***');
        console.log(text.substring(0, 2000));
        return;
      }
      const errMatch = text.match(/"message":"([^"]{0,120})"/);
      console.log('Error:', errMatch ? errMatch[1] : text.substring(0, 200));
    }
  } catch (err) {
    console.error('Test failed:', err.message);
  }
}

testCueAgent();
