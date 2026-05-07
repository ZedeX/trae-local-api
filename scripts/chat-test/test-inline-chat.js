const https = require('https');
const fs = require('fs');
const { v4: uuidv4 } = require('./src/uuid');

const API_HOST = 'trae-api-cn.mchost.guru';

const BOOT_CONFIG = {
  token: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJkYXRhIjp7ImlkIjoiNDQ4NDIyMTcxMjczMDY5NyIsInNvdXJjZSI6InJlZnJlc2hfdG9rZW4iLCJzb3VyY2VfaWQiOiJTN3RxdHI3RnB3UFRwaFdob0NOM3kwNHRQMHoxb3EyVEtBRjhkQzRWd0E4PS4xOGFiY2IwZjBhYThiMjIxIiwidGVuYW50X2lkIjoiN28yZDg5NHA3ZHIwbzQiLCJ0eXBlIjoidXNlciJ9LCJleHAiOjE3Nzg5NDczNDMsImlhdCI6MTc3NzczNzc0M30.kc34mm1hwtyRtTs3LS4PI9Erkv4uQPCSqgtQjyZQRacsNc1P-OTn1Jyhptt55Qznm0T670bWGkft4tvaA2PIMN3Rc8Rjsp-f1XfkdGaxOIB0ixxPZ2OO5aT8iSLgW-DPp2akfT8ZPCUdsz4BR69OaCRegsT8Ou6NRoNL_zWmlkt3iOvZhrJ7KOQb2dnR-9agFtoe7Rfqpryi0lqsPXisEmqSMPDGULwnxvwp49meACIstoJibAGNUs-pM-ff21N1HDV79DszKypkar2n6NBhLeREE0PzxiGaq1nEYIb47xw1DtJd3dYOTlZOdiYn7n_Mdqry_mbYURF-h4L7hUEgL5SZlnBVYUYf_fd77wlpOo9XW50hNqlSzhvRZ_ZIJo17sAilGMb6eWe7NTnH0E7nOjHhtshsrERi8v3dnCBf6q0Ki4kek0rgLdj5sMFbXGB8E5nSb4aJqc2Hh_p5DmHMHfX0lcgUJRPn6AMyMLcDIVvJOrSd9eBszxgWPJ1JBa4MR9No4u2ghDlk0QrG03Vaofi6qYghzIIT20f-953im3m_zXefszxNs-2gwBNjpiLyoaeUipVgw-O2n4hd_cs3n_Oj4_OMEc_Fj6xL9BoCGJ9QcQRW3_Adyqzuv0r8DOIble9gDQHa4e1lkpcvZkvi6DlZEmZ4MRI4v8oDOtN5MkY',
  user_id: '4484221712730697',
};

const DEVICE_INFO = {
  'x-app-id': '6eefa01c-1036-4c7e-9ca5-d891f63bfcd8',
  'x-app-version': 'default',
  'x-app-version-code': '20260401',
  'x-ide-version-code': '20260401',
  'x-custom-trace-id': uuidv4().replace(/-/g, ''),
  'x-device-brand': '82RF',
  'x-device-cpu': 'Intel',
  'x-device-id': '629333755172936',
  'x-machine-id': '87ddf83d68c40fe3585c85ced360a8c8adc7647bc06318874feeceba975de97a',
  'x-os-version': 'Windows 10 Enterprise LTSC 2021',
  'x-device-type': 'windows',
  'x-ide-version': '3.3.55',
  'x-ide-version-type': 'stable',
  'request-traffic-type': 'prod',
};

function buildHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Cloud-IDE-JWT ${BOOT_CONFIG.token}`,
    'X-Cloudide-Token': BOOT_CONFIG.token,
    'x-uid': BOOT_CONFIG.user_id,
    ...DEVICE_INFO,
  };
}

function makeStreamRequest(path, body) {
  return new Promise((resolve, reject) => {
    const headers = buildHeaders();
    const bodyStr = JSON.stringify(body);

    const options = {
      hostname: API_HOST,
      port: 443,
      path: path,
      method: 'POST',
      headers: {
        ...headers,
        'Content-Length': Buffer.byteLength(bodyStr),
      },
    };

    const req = https.request(options, (res) => {
      const contentType = res.headers['content-type'] || '';
      const events = [];

      if (contentType.includes('text/event-stream')) {
        let buffer = '';
        res.on('data', (chunk) => {
          buffer += chunk.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('event:')) {
              events.push({ event: line.substring(6).trim(), data: '' });
            } else if (line.startsWith('data:') && events.length > 0) {
              events[events.length - 1].data = line.substring(5).trim();
            }
          }
        });
        res.on('end', () => {
          if (buffer.trim()) {
            const remaining = buffer.split('\n');
            for (const line of remaining) {
              if (line.startsWith('event:')) {
                events.push({ event: line.substring(6).trim(), data: '' });
              } else if (line.startsWith('data:') && events.length > 0) {
                events[events.length - 1].data = line.substring(5).trim();
              }
            }
          }
          resolve({ status: res.statusCode, events });
        });
      } else {
        let data = '';
        res.on('data', (chunk) => { data += chunk.toString(); });
        res.on('end', () => {
          resolve({ status: res.statusCode, events: [{ event: 'response', data }] });
        });
      }
    });

    req.on('error', (e) => reject(e));
    req.write(bodyStr);
    req.end();
  });
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function testInlineChatLonger() {
  console.log('\n' + '='.repeat(60));
  console.log('Test 1: inline_chat - longer response');
  console.log('='.repeat(60));

  const body = {
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Write a short poem about programming. Keep it under 4 lines.' }
        ]
      }
    ],
    function: 'inline_chat',
    stream: true,
  };

  const result = await makeStreamRequest('/api/agent/v3/llm_utils_chat', body);
  console.log('Status:', result.status);
  console.log('Events:');
  for (const ev of result.events) {
    console.log(`  [${ev.event}] ${ev.data.substring(0, 300)}`);
  }

  const outputEvents = result.events.filter(e => e.event === 'output');
  if (outputEvents.length > 0) {
    console.log('\nFull response:');
    for (const ev of outputEvents) {
      try {
        const data = JSON.parse(ev.data);
        console.log('  response:', data.response);
        console.log('  reasoning:', data.reasoning_content);
      } catch (e) {
        console.log('  raw:', ev.data);
      }
    }
  }

  const tokenEvents = result.events.filter(e => e.event === 'token_usage');
  if (tokenEvents.length > 0) {
    console.log('\nToken usage:');
    for (const ev of tokenEvents) {
      try {
        const data = JSON.parse(ev.data);
        console.log('  ', JSON.stringify(data, null, 2));
      } catch (e) {
        console.log('  raw:', ev.data);
      }
    }
  }
}

async function testSoloCoderLonger() {
  console.log('\n' + '='.repeat(60));
  console.log('Test 2: solo_coder - longer response');
  console.log('='.repeat(60));

  const body = {
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Write a short poem about programming. Keep it under 4 lines.' }
        ]
      }
    ],
    function: 'solo_coder',
    stream: true,
  };

  const result = await makeStreamRequest('/api/agent/v3/llm_utils_chat', body);
  console.log('Status:', result.status);
  console.log('Events:');
  for (const ev of result.events) {
    console.log(`  [${ev.event}] ${ev.data.substring(0, 300)}`);
  }

  const outputEvents = result.events.filter(e => e.event === 'output');
  if (outputEvents.length > 0) {
    console.log('\nFull response:');
    for (const ev of outputEvents) {
      try {
        const data = JSON.parse(ev.data);
        console.log('  response:', data.response);
      } catch (e) {
        console.log('  raw:', ev.data);
      }
    }
  }
}

async function testInlineChatWithSystem() {
  console.log('\n' + '='.repeat(60));
  console.log('Test 3: inline_chat - with system message');
  console.log('='.repeat(60));

  const body = {
    messages: [
      {
        role: 'system',
        content: [
          { type: 'text', text: 'You are a helpful assistant. Always respond in English.' }
        ]
      },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'What is 2+2? Answer with just the number.' }
        ]
      }
    ],
    function: 'inline_chat',
    stream: true,
  };

  const result = await makeStreamRequest('/api/agent/v3/llm_utils_chat', body);
  console.log('Status:', result.status);
  console.log('Events:');
  for (const ev of result.events) {
    console.log(`  [${ev.event}] ${ev.data.substring(0, 300)}`);
  }
}

async function testInlineChatWithConfig() {
  console.log('\n' + '='.repeat(60));
  console.log('Test 4: inline_chat - with config_name');
  console.log('='.repeat(60));

  const body = {
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'What is 3+5? Answer with just the number.' }
        ]
      }
    ],
    function: 'inline_chat',
    config_name: 'Doubao_1_6',
    stream: true,
  };

  const result = await makeStreamRequest('/api/agent/v3/llm_utils_chat', body);
  console.log('Status:', result.status);
  console.log('Events:');
  for (const ev of result.events) {
    console.log(`  [${ev.event}] ${ev.data.substring(0, 300)}`);
  }
}

async function testInlineChatDifferentModel() {
  console.log('\n' + '='.repeat(60));
  console.log('Test 5: inline_chat - with glm-5 model');
  console.log('='.repeat(60));

  const body = {
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'What is 7+8? Answer with just the number.' }
        ]
      }
    ],
    function: 'inline_chat',
    config_name: 'glm-5',
    stream: true,
  };

  const result = await makeStreamRequest('/api/agent/v3/llm_utils_chat', body);
  console.log('Status:', result.status);
  console.log('Events:');
  for (const ev of result.events) {
    console.log(`  [${ev.event}] ${ev.data.substring(0, 300)}`);
  }
}

async function main() {
  await testInlineChatLonger();
  await sleep(5000);

  await testSoloCoderLonger();
  await sleep(5000);

  await testInlineChatWithSystem();
  await sleep(5000);

  await testInlineChatWithConfig();
  await sleep(5000);

  await testInlineChatDifferentModel();
}

main().catch(console.error);
