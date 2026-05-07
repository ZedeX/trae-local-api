const http = require('http');

function makeRequest(path, method, body) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 9900,
      path: path,
      method: method,
      headers: {
        'Authorization': 'Bearer trae-local-api-key',
        'Content-Type': 'application/json',
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk.toString(); });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });

    req.on('error', (e) => reject(e));
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function parseSSEContent(rawBody) {
  let content = '';
  const lines = rawBody.split('\n');
  for (const line of lines) {
    if (line.startsWith('data: ') && line !== 'data: [DONE]') {
      try {
        const chunk = JSON.parse(line.substring(6));
        if (chunk.choices && chunk.choices[0] && chunk.choices[0].delta) {
          if (chunk.choices[0].delta.content) content += chunk.choices[0].delta.content;
        }
      } catch (e) {}
    }
  }
  return content;
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testModel(model, funcName, configName) {
  const body = {
    model: model,
    messages: [{ role: 'user', content: 'Say "OK" and nothing else.' }],
    stream: true,
  };
  if (funcName) body.function = funcName;
  if (configName) body.config_name = configName;

  try {
    const result = await makeRequest('/v1/chat/completions', 'POST', body);
    if (result.status !== 200) {
      return { status: 'error', code: result.status, detail: result.body.substring(0, 200) };
    }
    const content = parseSSEContent(result.body);
    if (content.includes('[Error')) {
      return { status: 'api_error', content: content.substring(0, 100) };
    }
    return { status: 'ok', content: content.substring(0, 50) };
  } catch (err) {
    return { status: 'exception', detail: err.message };
  }
}

async function main() {
  console.log('========================================');
  console.log('  Model Selection Tests');
  console.log('========================================\n');

  const tests = [
    { model: 'auto', func: null, config: null, desc: 'auto (inline_chat)' },
    { model: 'glm-5.1', func: null, config: null, desc: 'glm-5.1 (auto)' },
    { model: 'glm-5', func: null, config: null, desc: 'glm-5 (auto)' },
    { model: 'deepseek-v3', func: null, config: null, desc: 'deepseek-v3 (auto)' },
    { model: 'deepseek-r1', func: null, config: null, desc: 'deepseek-r1 (auto)' },
    { model: 'doubao-1-6', func: null, config: null, desc: 'doubao-1-6 (auto)' },
    { model: 'auto', func: 'solo_coder', config: null, desc: 'auto + solo_coder' },
    { model: 'auto', func: 'chat_v3', config: null, desc: 'auto + chat_v3 (no config)' },
    { model: 'auto', func: 'chat_v3', config: 'glm-5.1', desc: 'chat_v3 + glm-5.1 config' },
    { model: 'auto', func: 'chat_v3', config: 'deepseek-v3', desc: 'chat_v3 + deepseek-v3 config' },
    { model: 'auto', func: 'chat_v3', config: 'doubao-1-6', desc: 'chat_v3 + doubao-1-6 config' },
    { model: 'auto', func: 'inline_chat', config: null, desc: 'inline_chat (no config)' },
    { model: 'auto', func: 'builder_v3', config: null, desc: 'builder_v3' },
  ];

  for (const t of tests) {
    process.stdout.write(`Testing: ${t.desc} ... `);
    const result = await testModel(t.model, t.func, t.config);

    if (result.status === 'ok') {
      console.log(`OK -> "${result.content}"`);
    } else if (result.status === 'api_error') {
      console.log(`API_ERROR -> ${result.content}`);
    } else if (result.status === 'error') {
      console.log(`HTTP_${result.code} -> ${result.detail}`);
    } else {
      console.log(`EXCEPTION -> ${result.detail}`);
    }

    await sleep(2000);
  }

  console.log('\n========================================');
  console.log('  Model Selection Tests Complete');
  console.log('========================================');
}

main();
