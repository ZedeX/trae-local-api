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
  const deviceHeaders = {};
  for (const [k, v] of Object.entries(DEVICE_INFO)) {
    deviceHeaders[k.replace(/_/g, '-')] = v;
  }
  return {
    'Content-Type': 'application/json',
    'Authorization': `Cloud-IDE-JWT ${BOOT_CONFIG.token}`,
    'X-Cloudide-Token': BOOT_CONFIG.token,
    'x-uid': BOOT_CONFIG.user_id,
    'x-custom-trace-id': traceId || uuidv4().replace(/-/g, ''),
    ...deviceHeaders
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

async function testCreateAgentTask() {
  console.log('\n=== Test create_agent_task with conversation_id ===');
  const sessionId = generateObjectId() + generateObjectId().substring(0, 4);
  const taskId = generateObjectId() + generateObjectId().substring(0, 4);
  const messageId = generateObjectId() + generateObjectId().substring(0, 4);
  const conversationId = sessionId;

  const headers = buildHeaders();
  headers['Accept'] = 'text/event-stream';
  headers['X-Request-ID'] = uuidv4();
  headers['X-Trae-Request-ID'] = headers['X-Request-ID'];

  const body = {
    session_id: sessionId,
    task_id: taskId,
    message_id: messageId,
    conversation_id: conversationId,
    user_id: BOOT_CONFIG.user_id,
    device_id: DEVICE_INFO.x_device_id,
    model_name: 'Doubao_1_6',
    config_name: 'Doubao_1_6',
    ide_version: DEVICE_INFO.x_ide_version,
    ide_version_code: DEVICE_INFO.x_ide_version_code,
    user_input: {
      id: messageId,
      user_input: 'Say "Hello" and nothing else.',
      placeholder_map: '{}'
    },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Say "Hello" and nothing else.' }
        ]
      }
    ],
    stream: true,
    mode_type: 1,
    agent_type: 'builder_v3',
    enable_chat_memory: false,
    workspace_folder: 'd:\\_program\\Trae',
    workspace_path: 'd:\\_program\\Trae'
  };

  console.log('Body keys:', Object.keys(body));
  const resp = await fetch(`${API_HOST}/api/agent/v3/create_agent_task`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });

  console.log('Status:', resp.status);
  const contentType = resp.headers.get('content-type') || '';

  if (resp.status !== 200) {
    const errText = await resp.text();
    console.log('Error:', errText.substring(0, 500));
    return { success: false, error: errText };
  }

  if (contentType.includes('stream') || contentType.includes('event-stream')) {
    console.log('Got streaming response!');
    let fullContent = '';
    let eventCount = 0;
    let buffer = '';
    let firstEvents = [];

    for await (const chunk of resp.body) {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (trimmed.startsWith('event:')) {
          const evt = trimmed.substring(6).trim();
          if (firstEvents.length < 30) firstEvents.push({ type: 'event', value: evt });
          continue;
        }
        if (trimmed.startsWith('id:')) continue;
        if (trimmed.startsWith('data:')) {
          const data = trimmed.substring(5).trim();
          if (data === '[DONE]') {
            firstEvents.push({ type: 'done' });
            continue;
          }
          try {
            const parsed = JSON.parse(data);
            eventCount++;
            if (firstEvents.length < 30) {
              firstEvents.push({ type: 'data', value: parsed });
            }
            if (parsed.text || parsed.content || parsed.delta) {
              fullContent += parsed.text || parsed.content || parsed.delta || '';
            }
            if (parsed.data) {
              if (parsed.data.text) fullContent += parsed.data.text;
              if (parsed.data.content) fullContent += parsed.data.content;
            }
          } catch (e) {
            if (firstEvents.length < 10) {
              firstEvents.push({ type: 'raw', value: data.substring(0, 200) });
            }
          }
        }
      }
    }

    console.log('\nFirst events:');
    for (const evt of firstEvents) {
      if (evt.type === 'event') {
        console.log(`  [event] ${evt.value}`);
      } else if (evt.type === 'data') {
        console.log(`  [data]`, JSON.stringify(evt.value).substring(0, 300));
      } else if (evt.type === 'done') {
        console.log(`  [DONE]`);
      } else {
        console.log(`  [raw] ${evt.value}`);
      }
    }

    console.log(`\nTotal events: ${eventCount}`);
    console.log(`Content: ${fullContent.substring(0, 500)}`);
    return { success: true, content: fullContent };
  } else {
    const text = await resp.text();
    console.log('Non-stream response:', text.substring(0, 2000));
    fs.writeFileSync('d:/_program/Trae/zx-test/agent-task-response.json', text, 'utf-8');
    return { success: true, data: text };
  }
}

async function main() {
  try {
    await testCreateAgentTask();
  } catch (err) {
    console.error('Error:', err.message);
  }
}

main();
