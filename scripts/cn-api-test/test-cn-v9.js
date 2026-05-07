const fetch = require('node-fetch');
const { v4: uuidv4 } = require('./src/uuid');
const fs = require('fs');

const API_HOST = 'https://trae-api-cn.mchost.guru';

const BOOT_CONFIG = {
  token: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJkYXRhIjp7ImlkIjoiNDQ4NDIyMTcxMjczMDY5NyIsInNvdXJjZSI6InJlZnJlc2hfdG9rZW4iLCJzb3VyY2VfaWQiOiJTN3RxdHI3RnB3UFRwaFdob0NOM3kwNHRQMHoxb3EyVEtBRjhkQzRWd0E4PS4xOGFiY2IwZjBhYThiMjIxIiwidGVuYW50X2lkIjoiN28yZDg5NHA3ZHIwbzQiLCJ0eXBlIjoidXNlciJ9LCJleHAiOjE3Nzg5NDczNDMsImlhdCI6MTc3NzczNzc0M30.kc34mm1hwtyRtTs3LS4PI9Erkv4uQPCSqgtQjyZQRacsNc1P-OTn1Jyhptt55Qznm0T670bWGkft4tvaA2PIMN3Rc8Rjsp-f1XfkdGaxOIB0ixxPZ2OO5aT8iSLgW-DPp2akfT8ZPCUdsz4BR69OaCRegsT8Ou6NRoNL_zWmlkt3iOvZhrJ7KOQb2dnR-9agFtoe7Rfqpryi0lqsPXisEmqSMPDGULwnxvwp49meACIstoJibAGNUs-pM-ff21N1HDV79DszKypkar2n6NBhLeREE0PzxiGaq1nEYIb47xw1DtJd3dYOTlZOdiYn7n_Mdqry_mbYURF-h4L7hUEgL5SZlnBVYUYf_fd77wlpOo9XW50hNqlSzhvRZ_ZIJo17sAilGMb6eWe7NTnH0E7nOjHhtshsrERi8v3dnCBf6q0Ki4kek0rgLdj5sMFbXGB8E5nSb4aJqc2Hh_p5DmHMHfX0lcgUJRPn6AMyMLcDIVvJOrSd9eBszxgWPJ1JBa4MR9No4u2ghDlk0QrG03Vaofi6qYghzIIT20f-953im3m_zXefszxNs-2gwBNjpiLyoaeUipVgw-O2n4hd_cs3n_Oj4_OMEc_Fj6xL9BoCGJ9QcQRW3_Adyqzuv0r8DOIble9gDQHa4e1lkpcvZkvi6DlZEmZ4MRI4v8oDOtN5MkY',
  user_id: '4484221712730697'
};

const DEVICE_INFO = {
  'x-app-id': '6eefa01c-1036-4c7e-9ca5-d891f63bfcd8',
  'x-app-version': 'default',
  'x-ide-version-code': '20260401',
  'x-app-version-code': '20260401',
  'x-device-brand': '82RF',
  'x-device-cpu': 'Intel',
  'x-device-id': '629333755172936',
  'x-machine-id': '87ddf83d68c40fe3585c85ced360a8c8adc7647bc06318874feeceba975de97a',
  'x-os-version': 'Windows 10 Enterprise LTSC 2021',
  'x-device-type': 'windows',
  'x-ide-version': '3.3.55',
  'x-ide-version-type': 'stable',
  'request-traffic-type': 'prod'
};

function buildHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Cloud-IDE-JWT ${BOOT_CONFIG.token}`,
    'X-Cloudide-Token': BOOT_CONFIG.token,
    'x-uid': BOOT_CONFIG.user_id,
    'x-custom-trace-id': uuidv4().replace(/-/g, ''),
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

async function getFullModelConfig(funcName, configName) {
  const headers = buildHeaders();
  const body = {
    function: funcName,
    config_names: configName ? [configName] : null,
    need_prompt: true,
    current_config_info: null,
    poly_prompt: true,
    mode_type: null,
    agent_type: null
  };
  const resp = await fetch(`${API_HOST}/api/ide/v1/get_detail_param`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });
  const data = await resp.json();
  if (data.config_info_list) {
    for (const cfg of data.config_info_list) {
      if (!configName || cfg.config_name === configName) {
        return cfg;
      }
    }
    return data.config_info_list[0];
  }
  return null;
}

async function testWithCompleteConfig() {
  console.log('\n' + '='.repeat(60));
  console.log('Test: Complete request with ALL fields from DLL analysis');
  console.log('='.repeat(60));

  const modelConfig = await getFullModelConfig('builder_v3', 'Doubao_1_6');
  if (!modelConfig) {
    console.log('No model config found');
    return false;
  }

  const modelDetail = modelConfig.model_detail_list?.[0];
  if (!modelDetail) {
    console.log('No model details');
    return false;
  }

  console.log(`Config: ${modelConfig.config_name}, Model: ${modelDetail.model_name}`);

  const summaryConfig = await getFullModelConfig('builder_v3', 'summary');
  console.log(`Summary config: ${summaryConfig ? summaryConfig.config_name : 'NOT FOUND'}`);
  if (summaryConfig) {
    const sm = summaryConfig.model_detail_list?.[0];
    console.log(`  Summary model: ${sm ? sm.model_name : 'none'}`);
  }

  const sessionId = generateObjectId() + generateObjectId().substring(0, 4);
  const taskId = generateObjectId() + generateObjectId().substring(0, 4);
  const messageId = generateObjectId() + generateObjectId().substring(0, 4);

  const headers = buildHeaders();
  headers['Accept'] = 'text/event-stream';
  headers['X-Request-ID'] = uuidv4();
  headers['X-Trae-Request-ID'] = headers['X-Request-ID'];

  const body = {
    session_id: sessionId,
    task_id: taskId,
    message_id: messageId,
    conversation_id: sessionId,
    user_id: BOOT_CONFIG.user_id,
    device_id: DEVICE_INFO['x-device-id'],
    model_name: modelDetail.model_name,
    config_name: modelConfig.config_name,
    ide_version: DEVICE_INFO['x-ide-version'],
    ide_version_code: DEVICE_INFO['x-ide-version-code'],
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
    workspace_path: 'd:\\_program\\Trae',
    current_config_info: {
      config_name: modelConfig.config_name,
      model_detail_list: modelConfig.model_detail_list
    },
    summary_config_info: summaryConfig ? {
      config_name: summaryConfig.config_name,
      model_detail_list: summaryConfig.model_detail_list
    } : null,
    tunnel_id: null,
    missing_history: null,
    available_tool_list: [],
    mcp_tool_name: null,
    mcp_tool_list: null,
    custom_agent_list: null,
    agent_version: null,
    ab_info: null,
    custom_subagent_info: null,
    skill_list: null,
    agent_dsl: null,
    agent_static_dsl_name: null,
    mcp_folder_info: null,
    access_type: null,
    mcp_folder_base_path: null,
    cached_tool_groups: null,
    history_message_limit: null,
    raw_rules: null,
    enterprise_custom_hyper_params: null,
  };

  console.log('\nBody keys:', Object.keys(body));
  console.log('Body size:', JSON.stringify(body).length);
  console.log('summary_config_info:', JSON.stringify(body.summary_config_info));

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
    return false;
  }

  return await handleStreamResponse(resp, contentType);
}

async function testWithSummaryConfigInfoOnly() {
  console.log('\n' + '='.repeat(60));
  console.log('Test: Request with ONLY summary_config_info (no other extra fields)');
  console.log('='.repeat(60));

  const modelConfig = await getFullModelConfig('builder_v3', 'Doubao_1_6');
  if (!modelConfig) return false;

  const modelDetail = modelConfig.model_detail_list?.[0];
  if (!modelDetail) return false;

  const summaryConfig = await getFullModelConfig('builder_v3', 'summary');
  
  const sessionId = generateObjectId() + generateObjectId().substring(0, 4);
  const taskId = generateObjectId() + generateObjectId().substring(0, 4);
  const messageId = generateObjectId() + generateObjectId().substring(0, 4);

  const headers = buildHeaders();
  headers['Accept'] = 'text/event-stream';

  const body = {
    session_id: sessionId,
    task_id: taskId,
    message_id: messageId,
    conversation_id: sessionId,
    user_id: BOOT_CONFIG.user_id,
    device_id: DEVICE_INFO['x-device-id'],
    model_name: modelDetail.model_name,
    config_name: modelConfig.config_name,
    ide_version: DEVICE_INFO['x-ide-version'],
    ide_version_code: DEVICE_INFO['x-ide-version-code'],
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
    workspace_path: 'd:\\_program\\Trae',
    current_config_info: {
      config_name: modelConfig.config_name,
      model_detail_list: modelConfig.model_detail_list
    },
    summary_config_info: summaryConfig ? {
      config_name: summaryConfig.config_name,
      model_detail_list: summaryConfig.model_detail_list
    } : {
      config_name: 'summary',
      model_detail_list: [
        {
          model_name: 'Doubao_1_6',
          model_provider: 'doubao',
          is_stream: true,
          is_vision: false,
          max_tokens: 4096,
          temperature: 0.7,
          top_p: 0.9
        }
      ]
    }
  };

  console.log('summary_config_info:', JSON.stringify(body.summary_config_info, null, 2));
  console.log('Body size:', JSON.stringify(body).length);

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
    return false;
  }

  return await handleStreamResponse(resp, contentType);
}

async function testWithSummaryConfigFromAPI() {
  console.log('\n' + '='.repeat(60));
  console.log('Test: Using summary config from get_detail_param with need_prompt=true');
  console.log('='.repeat(60));

  const headers = buildHeaders();
  const body = {
    function: 'builder_v3',
    config_names: ['summary'],
    need_prompt: true,
    current_config_info: null,
    poly_prompt: true,
    mode_type: 1,
    agent_type: 'builder_v3'
  };
  const resp = await fetch(`${API_HOST}/api/ide/v1/get_detail_param`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });
  const data = await resp.json();
  
  console.log('Summary config response keys:', Object.keys(data));
  if (data.config_info_list && data.config_info_list.length > 0) {
    const cfg = data.config_info_list[0];
    console.log('Config name:', cfg.config_name);
    console.log('Config keys:', Object.keys(cfg));
    const md = cfg.model_detail_list?.[0];
    if (md) {
      console.log('Model detail keys:', Object.keys(md));
      console.log('Full model detail:', JSON.stringify(md, null, 2));
    }
    console.log('Full config (no model_detail):', JSON.stringify({...cfg, model_detail_list: '[see above]'}, null, 2));
  }
  return false;
}

async function handleStreamResponse(resp, contentType) {
  if (contentType.includes('stream') || contentType.includes('event-stream')) {
    let fullContent = '';
    let eventCount = 0;
    let buffer = '';
    let firstEvents = [];
    let hasError = false;

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
          if (evt === 'error') hasError = true;
          continue;
        }
        if (trimmed.startsWith('id:')) continue;
        if (trimmed.startsWith('data:')) {
          const data = trimmed.substring(5).trim();
          if (data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            eventCount++;
            if (firstEvents.length < 30) firstEvents.push({ type: 'data', value: parsed });
            if (parsed.code && parsed.message) {
              console.log(`ERROR: code=${parsed.code}, message=${parsed.message}`);
              hasError = true;
            }
            if (parsed.text || parsed.content || parsed.delta) {
              fullContent += parsed.text || parsed.content || parsed.delta || '';
            }
            if (parsed.data) {
              if (parsed.data.text) fullContent += parsed.data.text;
              if (parsed.data.content) fullContent += parsed.data.content;
              if (parsed.data.delta) fullContent += parsed.data.delta;
            }
          } catch (e) {}
        }
      }
    }

    console.log('\nFirst events:');
    for (const evt of firstEvents) {
      if (evt.type === 'event') console.log(`  [event] ${evt.value}`);
      else if (evt.type === 'data') console.log(`  [data]`, JSON.stringify(evt.value).substring(0, 300));
    }

    console.log(`\nTotal events: ${eventCount}`);
    if (fullContent) console.log(`Content: ${fullContent.substring(0, 500)}`);
    return !hasError && eventCount > 0;
  } else {
    const text = await resp.text();
    console.log('Non-stream response:', text.substring(0, 2000));
    return false;
  }
}

async function main() {
  await testWithSummaryConfigFromAPI();
  const r1 = await testWithCompleteConfig();
  if (r1) { console.log('\n*** SUCCESS with complete config ***'); return; }
  const r2 = await testWithSummaryConfigInfoOnly();
  if (r2) { console.log('\n*** SUCCESS with summary config info ***'); return; }
  console.log('\nALL TESTS FAILED');
}

main().catch(console.error);
