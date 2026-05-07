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

function makeRequest(method, path, body, isStream) {
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
        'Content-Length': Buffer.byteLength(bodyStr),
      },
    };

    const req = https.request(options, (res) => {
      const contentType = res.headers['content-type'] || '';
      
      if (isStream && contentType.includes('text/event-stream')) {
        let fullData = '';
        res.on('data', (chunk) => {
          const str = chunk.toString();
          fullData += str;
          process.stdout.write(str);
        });
        res.on('end', () => {
          resolve({ status: res.statusCode, headers: res.headers, body: fullData, isSSE: true });
        });
      } else {
        let data = '';
        res.on('data', (chunk) => { data += chunk.toString(); });
        res.on('end', () => {
          resolve({ status: res.statusCode, headers: res.headers, body: data, isSSE: contentType.includes('text/event-stream') });
        });
      }
    });

    req.on('error', (e) => reject(e));
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

async function main() {
  const detailParam = JSON.parse(fs.readFileSync('d:\\_program\\Trae\\zx-test\\detail-param-chat_v3.json', 'utf8'));
  
  const doubaoConfig = detailParam.config_info_list.find(c => c.config_name === 'Doubao_1_6');
  if (!doubaoConfig) {
    console.log('Doubao_1_6 config not found!');
    return;
  }
  
  const modelDetail = doubaoConfig.model_detail_list[0];
  console.log('Using model:', modelDetail.model_name);
  console.log('Max tokens:', modelDetail.max_tokens);
  console.log('Prompt config:', JSON.stringify(modelDetail.prompt_config_list, null, 2));

  const currentConfigInfo = {
    config_name: doubaoConfig.config_name,
    model_detail: modelDetail,
  };

  console.log('\n=== Test 1: /api/ide/v1/chat with full config ===');
  const body = {
    messages: [
      { role: 'user', content: 'Say "Hello" and nothing else.' }
    ],
    stream: true,
    function: 'chat_v3',
    config_name: doubaoConfig.config_name,
    current_config_info: currentConfigInfo,
    mode_type: 1,
  };

  try {
    const resp = await makeRequest('POST', '/api/ide/v1/chat', body, true);
    console.log('\n\nStatus:', resp.status);
    if (!resp.isSSE) {
      console.log('Response:', resp.body.substring(0, 3000));
    }
  } catch (e) {
    console.log('Error:', e.message);
  }

  console.log('\n\n=== Test 2: /api/ide/v1/chat with model_list style ===');
  const body2 = {
    messages: [
      { role: 'user', content: 'Say "Hello" and nothing else.' }
    ],
    stream: true,
    function: 'chat_v3',
    config_name: doubaoConfig.config_name,
    current_config_info: currentConfigInfo,
    mode_type: 1,
    agent_type: 'chat_v3',
    conversation_id: uuidv4(),
  };

  try {
    const resp = await makeRequest('POST', '/api/ide/v1/chat', body2, true);
    console.log('\n\nStatus:', resp.status);
    if (!resp.isSSE) {
      console.log('Response:', resp.body.substring(0, 3000));
    }
  } catch (e) {
    console.log('Error:', e.message);
  }
}

main().catch(console.error);
