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

async function getDetailParam(funcName) {
  const headers = buildHeaders();
  const body = {
    function: funcName,
    config_names: null,
    need_prompt: false,
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
  const text = await resp.text();
  const data = JSON.parse(text);

  const result = [];
  if (data.config_info_list) {
    for (const cfg of data.config_info_list) {
      const info = {
        config_name: cfg.config_name,
        display_name: cfg.display_config?.display_name,
        model_capability: cfg.display_config?.model_capability,
        is_default: cfg.is_default,
        is_beta: cfg.display_config?.is_beta,
        max_mode: cfg.display_config?.max_mode,
        model_details: []
      };
      if (cfg.model_detail_list) {
        for (const md of cfg.model_detail_list) {
          info.model_details.push({
            model_name: md.model_name,
            model_provider: md.model_provider,
            encrypted_params: md.encrypted_model_params ? md.encrypted_model_params.substring(0, 80) + '...' : null
          });
        }
      }
      result.push(info);
    }
  }
  return result;
}

async function main() {
  for (const func of ['builder_v3', 'chat_v3', 'solo_coder']) {
    console.log(`\n=== ${func} ===`);
    const models = await getDetailParam(func);
    for (const m of models) {
      console.log(`  config_name: ${m.config_name}`);
      console.log(`  display_name: ${m.display_name}`);
      console.log(`  capability: ${m.model_capability}`);
      console.log(`  is_default: ${m.is_default}`);
      console.log(`  is_beta: ${m.is_beta}`);
      console.log(`  max_mode: ${m.max_mode}`);
      for (const md of m.model_details) {
        console.log(`    model_name: ${md.model_name}, provider: ${md.model_provider}`);
      }
      console.log();
    }
  }

  fs.writeFileSync('d:/_program/Trae/zx-test/cn-models-detail.json', JSON.stringify({ builder_v3: await getDetailParam('builder_v3') }, null, 2), 'utf-8');
}

main().catch(console.error);
