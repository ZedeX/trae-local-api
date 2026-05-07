const fetch = require('node-fetch');
const fs = require('fs');
const { v4: uuidv4 } = require('./src/uuid');

const API_HOST = 'https://trae-api-cn.mchost.guru';

const BOOT_CONFIG = {
  token: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJkYXRhIjp7ImlkIjoiNDQ4NDIyMTcxMjczMDY5NyIsInNvdXJjZSI6InJlZnJlc2hfdG9rZW4iLCJzb3VyY2VfaWQiOiJTN3RxdHI3RnB3UFRwaFdob0NOM3kwNHRQMHoxb3EyVEtBRjhkQzRWd0E4PS4xOGFiY2IwZjBhYThiMjIxIiwidGVuYW50X2lkIjoiN28yZDg5NHA3ZHIwbzQiLCJ0eXBlIjoidXNlciJ9LCJleHAiOjE3Nzg5NDczNDMsImlhdCI6MTc3NzczNzc0M30.kc34mm1hwtyRtTs3LS4PI9Erkv4uQPCSqgtQjyZQRacsNc1P-OTn1Jyhptt55Qznm0T670bWGkft4tvaA2PIMN3Rc8Rjsp-f1XfkdGaxOIB0ixxPZ2OO5aT8iSLgW-DPp2akfT8ZPCUdsz4BR69OaCRegsT8Ou6NRoNL_zWmlkt3iOvZhrJ7KOQb2dnR-9agFtoe7Rfqpryi0lqsPXisEmqSMPDGULwnxvwp49meACIstoJibAGNUs-pM-ff21N1HDV79DszKypkar2n6NBhLeREE0PzxiGaq1nEYIb47xw1DtJd3dYOTlZOdiYn7n_Mdqry_mbYURF-h4L7hUEgL5SZlnBVYUYf_fd77wlpOo9XW50hNqlSzhvRZ_ZIJo17sAilGMb6eWe7NTnH0E7nOjHhtshsrERi8v3dnCBf6q0Ki4kek0rgLdj5sMFbXGB8E5nSb4aJqc2Hh_p5DmHMHfX0lcgUJRPn6AMyMLcDIVvJOrSd9eBszxgWPJ1JBa4MR9No4u2ghDlk0QrG03Vaofi6qYghzIIT20f-953im3m_zXefszxNs-2gwBNjpiLyoaeUipVgw-O2n4hd_cs3n_Oj4_OMEc_Fj6xL9BoCGJ9QcQRW3_Adyqzuv0r8DOIble9gDQHa4e1lkpcvZkvi6DlZEmZ4MRI4v8oDOtN5MkY',
  refresh_token: 'S7tqtr7FpwPTphWhoCN3y04tP0z1oq2TKAF8dC4VwA8=.18abcb0f0aa8b221',
  user_id: '4484221712730697',
  expired_at: '2026-05-16T16:02:23.391Z'
};

const DEVICE_INFO = {
  x_app_id: '6eefa01c-1036-4c7e-9ca5-d891f63bfcd8',
  x_app_version: 'default',
  x_ide_version_code: '20260401',
  x_app_version_code: '20260401',
  x_device_brand: '82RF',
  x_device_cpu: 'Intel',
  x_device_id: '629333755172936',
  x_machine_id: '87ddf83d68c40fe3585c85ced360a8c8adc7647bc06318874feeceba975de97a',
  x_os_version: 'Windows 10 Enterprise LTSC 2021',
  x_device_type: 'windows',
  x_ide_version: '3.3.55',
  x_ide_version_type: 'stable',
  request_traffic_type: 'prod'
};

function buildHeaders(traceId) {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Cloud-IDE-JWT ${BOOT_CONFIG.token}`,
    'X-Cloudide-Token': BOOT_CONFIG.token,
    'x-uid': BOOT_CONFIG.user_id,
    'x-custom-trace-id': traceId || uuidv4().replace(/-/g, ''),
    ...DEVICE_INFO
  };
}

function generateObjectId() {
  const chars = '0123456789abcdef';
  let id = '';
  for (let i = 0; i < 24; i++) {
    id += chars[Math.floor(Math.random() * 16)];
  }
  return id;
}

async function testGetDetailParam() {
  console.log('\n=== Test get_detail_param ===');
  const headers = buildHeaders();

  const body = {
    function: 'chat_v3',
    config_names: null,
    need_prompt: true,
    current_config_info: {
      config_name: 'glm-5.1',
      is_custom_model: false
    },
    poly_prompt: true,
    mode_type: null,
    agent_type: 'builder_v3'
  };

  const resp = await fetch(`${API_HOST}/api/ide/v1/get_detail_param`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });

  console.log('Status:', resp.status);
  const text = await resp.text();
  try {
    const data = JSON.parse(text);
    console.log('Response keys:', Object.keys(data));
    if (data.data) {
      console.log('Data keys:', Object.keys(data.data));
      if (data.data.config_name) console.log('config_name:', data.data.config_name);
      if (data.data.model_name) console.log('model_name:', data.data.model_name);
      if (data.data.prompt) console.log('prompt length:', data.data.prompt?.length || 0);
      if (data.data.prompt_template) console.log('prompt_template length:', data.data.prompt_template?.length || 0);
    }
    fs.writeFileSync('d:/_program/Trae/zx-test/detail-param-response.json', text, 'utf-8');
    console.log('Full response saved to detail-param-response.json');
  } catch (e) {
    console.log('Raw response:', text.substring(0, 500));
  }
}

async function testCreateAgentTask() {
  console.log('\n=== Test create_agent_task ===');
  const sessionId = generateObjectId() + generateObjectId().substring(0, 4);
  const taskId = generateObjectId() + generateObjectId().substring(0, 4);
  const messageId = generateObjectId() + generateObjectId().substring(0, 4);

  const headers = buildHeaders();
  headers['Accept'] = 'text/event-stream';

  const body = {
    session_id: sessionId,
    task_id: taskId,
    message_id: messageId,
    user_id: BOOT_CONFIG.user_id,
    model_name: 'glm-5.1',
    config_name: 'glm-5.1',
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Hello, please respond with just "Hi there!" and nothing else.' }
        ]
      }
    ],
    stream: true,
    mode_type: 'Manual',
    agent_type: 'builder_v3',
    function: 'chat_v3',
    enable_chat_memory: false,
    workspace_folder: 'd:\\_program\\Trae',
    workspace_path: 'd:\\_program\\Trae',
    extra_info: JSON.stringify({
      workspace_folder: 'd:\\_program\\Trae',
      workspace_path: 'd:\\_program\\Trae'
    })
  };

  console.log('Session ID:', sessionId);
  console.log('Task ID:', taskId);
  console.log('Message ID:', messageId);

  const resp = await fetch(`${API_HOST}/api/agent/v3/create_agent_task`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });

  console.log('Status:', resp.status);
  console.log('Content-Type:', resp.headers.get('content-type'));

  if (resp.status !== 200) {
    const errText = await resp.text();
    console.log('Error response:', errText.substring(0, 1000));
    return;
  }

  const contentType = resp.headers.get('content-type') || '';
  if (contentType.includes('text/event-stream') || contentType.includes('stream')) {
    console.log('\n--- Streaming response ---');
    let fullContent = '';
    let eventCount = 0;

    const body = resp.body;
    let buffer = '';

    for await (const chunk of body) {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (trimmed.startsWith('event:')) {
          console.log(`[event] ${trimmed.substring(6).trim()}`);
          continue;
        }
        if (trimmed.startsWith('id:')) continue;
        if (trimmed.startsWith('retry:')) continue;
        if (trimmed.startsWith('data:')) {
          const data = trimmed.substring(5).trim();
          if (data === '[DONE]') {
            console.log('[DONE]');
            continue;
          }
          try {
            const parsed = JSON.parse(data);
            eventCount++;
            if (eventCount <= 20 || eventCount % 50 === 0) {
              console.log(`[data #${eventCount}]`, JSON.stringify(parsed).substring(0, 300));
            }
            if (parsed.text || parsed.content || parsed.delta) {
              fullContent += parsed.text || parsed.content || parsed.delta || '';
            }
            if (parsed.data) {
              if (parsed.data.text) fullContent += parsed.data.text;
              if (parsed.data.content) fullContent += parsed.data.content;
            }
          } catch (e) {
            if (eventCount <= 5) {
              console.log(`[raw data] ${data.substring(0, 200)}`);
            }
          }
        }
      }
    }

    console.log(`\nTotal events: ${eventCount}`);
    console.log(`Full content length: ${fullContent.length}`);
    console.log(`Content preview: ${fullContent.substring(0, 500)}`);
  } else {
    const text = await resp.text();
    console.log('Non-stream response:', text.substring(0, 2000));
    fs.writeFileSync('d:/_program/Trae/zx-test/agent-task-response.json', text, 'utf-8');
  }
}

async function testRefreshToken() {
  console.log('\n=== Test refresh token ===');
  const headers = {
    'Content-Type': 'application/json',
    ...DEVICE_INFO
  };

  const body = {
    ClientID: 'ono9krqynydwx5',
    RefreshToken: BOOT_CONFIG.refresh_token,
    ClientSecret: '-',
    UserID: BOOT_CONFIG.user_id
  };

  const resp = await fetch(`${API_HOST}/cloudide/api/v3/trae/oauth/ExchangeToken`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });

  console.log('Status:', resp.status);
  const text = await resp.text();
  try {
    const data = JSON.parse(text);
    console.log('Response keys:', Object.keys(data));
    if (data.token) {
      console.log('New token prefix:', data.token.substring(0, 50) + '...');
      console.log('New expiredAt:', data.expiredAt);
    }
  } catch (e) {
    console.log('Raw response:', text.substring(0, 500));
  }
}

async function main() {
  try {
    await testRefreshToken();
    await testGetDetailParam();
    await testCreateAgentTask();
  } catch (err) {
    console.error('Error:', err.message);
    if (err.cause) console.error('Cause:', err.cause);
  }
}

main();
