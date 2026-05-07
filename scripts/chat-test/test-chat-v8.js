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

function makeRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const headers = buildHeaders();
    const bodyStr = body ? JSON.stringify(body) : '';

    const options = {
      hostname: API_HOST,
      port: 443,
      path: path,
      method: method,
      headers: {
        ...headers,
        'Content-Length': Buffer.byteLength(bodyStr || ''),
      },
    };

    const req = https.request(options, (res) => {
      const contentType = res.headers['content-type'] || '';
      let data = '';
      res.on('data', (chunk) => { data += chunk.toString(); });
      res.on('end', () => {
        resolve({ status: res.statusCode, headers: res.headers, body: data, isSSE: contentType.includes('text/event-stream') });
      });
    });

    req.on('error', (e) => reject(e));
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

function generateHexId(len) {
  const chars = '0123456789abcdef';
  let result = '';
  for (let i = 0; i < len; i++) result += chars[Math.floor(Math.random() * 16)];
  return result;
}

async function main() {
  const detailParam = JSON.parse(fs.readFileSync('d:\\_program\\Trae\\zx-test\\detail-param-chat_v3.json', 'utf8'));
  
  const glm5Config = detailParam.config_info_list.find(c => c.config_name === 'glm-5.1');
  if (!glm5Config) {
    console.log('glm-5.1 config not found!');
    return;
  }
  console.log('Found config:', glm5Config.config_name);
  console.log('Model detail list count:', glm5Config.model_detail_list.length);
  console.log('Model name:', glm5Config.model_detail_list[0].model_name);
  console.log('Encrypted model params length:', glm5Config.encrypted_model_params ? glm5Config.encrypted_model_params.length : 0);

  const sessionId = generateHexId(24);
  const taskId = generateHexId(28);
  const messageId = generateHexId(28);

  console.log('\n=== Test: create_agent_task with full model detail from get_detail_param ===');

  const body = {
    session_id: sessionId,
    task_id: taskId,
    message_id: messageId,
    conversation_id: sessionId,
    user_id: BOOT_CONFIG.user_id,
    device_id: '629333755172936',
    model_name: glm5Config.model_detail_list[0].model_name,
    config_name: glm5Config.config_name,
    ide_version: '3.3.55',
    ide_version_code: '20260401',
    user_input: {
      id: messageId,
      user_input: 'Say "Hello" and nothing else.',
      placeholder_map: '{}',
    },
    messages: [
      {
        role: 'user',
        content: 'Say "Hello" and nothing else.',
      }
    ],
    stream: true,
    mode_type: 1,
    agent_type: 'builder_v3',
    enable_chat_memory: false,
    workspace_folder: 'd:\\_program\\Trae',
    workspace_path: 'd:\\_program\\Trae',
    current_config_info: {
      config_name: glm5Config.config_name,
      model_detail_list: glm5Config.model_detail_list,
      display_config: glm5Config.display_config,
      encrypted_model_params: glm5Config.encrypted_model_params,
    },
  };

  console.log('Request body size:', JSON.stringify(body).length, 'bytes');

  try {
    const resp = await makeRequest('POST', '/api/agent/v3/create_agent_task', body);
    console.log('Status:', resp.status);
    console.log('Content-Type:', resp.headers['content-type']);
    if (resp.isSSE) {
      const lines = resp.body.split('\n');
      console.log('SSE events:');
      for (const line of lines.slice(0, 30)) {
        if (line.trim()) console.log('  ', line.substring(0, 200));
      }
    } else {
      console.log('Response:', resp.body.substring(0, 5000));
    }
  } catch (e) {
    console.log('Error:', e.message);
  }
}

main().catch(console.error);
