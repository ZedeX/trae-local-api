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

async function testModel(desc, body) {
  process.stdout.write(`Testing: ${desc} ... `);
  try {
    const result = await makeRequest('/v1/chat/completions', 'POST', body);
    if (result.status !== 200) {
      console.log(`HTTP_${result.status}`);
      return;
    }
    const content = parseSSEContent(result.body);
    if (content.includes('[Error')) {
      console.log(`API_ERROR -> ${content.substring(0, 80)}`);
    } else {
      console.log(`OK -> "${content.substring(0, 50)}"`);
    }
  } catch (err) {
    console.log(`EXCEPTION -> ${err.message}`);
  }
  await sleep(2000);
}

async function main() {
  console.log('========================================');
  console.log('  Model Selection Debug Tests');
  console.log('========================================\n');

  await testModel('chat_v3 + model=glm-5.1 (no config_name)', {
    model: 'auto',
    messages: [{ role: 'user', content: 'Say "OK" and nothing else.' }],
    stream: true,
    function: 'chat_v3',
    config_name: 'glm-5.1',
  });

  await testModel('chat_v3 + model=glm-5.1 (no config_name)', {
    model: 'auto',
    messages: [{ role: 'user', content: 'Say "OK" and nothing else.' }],
    stream: true,
    function: 'chat_v3',
  });

  await testModel('chat_v3 + model field only', {
    model: 'auto',
    messages: [{ role: 'user', content: 'Say "OK" and nothing else.' }],
    stream: true,
    function: 'chat_v3',
    model_name: 'glm-5.1',
  });

  await testModel('chat_v3 + config_name=Doubao_1_6', {
    model: 'auto',
    messages: [{ role: 'user', content: 'Say "OK" and nothing else.' }],
    stream: true,
    function: 'chat_v3',
    config_name: 'Doubao_1_6',
  });

  await testModel('chat_v3 + config_name=glm-5__dev', {
    model: 'auto',
    messages: [{ role: 'user', content: 'Say "OK" and nothing else.' }],
    stream: true,
    function: 'chat_v3',
    config_name: 'glm-5__dev',
  });

  await testModel('chat_v3 + config_name=Doubao_1_6__dev', {
    model: 'auto',
    messages: [{ role: 'user', content: 'Say "OK" and nothing else.' }],
    stream: true,
    function: 'chat_v3',
    config_name: 'Doubao_1_6__dev',
  });

  await testModel('inline_chat + config_name=glm-5.1 (should strip)', {
    model: 'auto',
    messages: [{ role: 'user', content: 'Say "OK" and nothing else.' }],
    stream: true,
    function: 'inline_chat',
    config_name: 'glm-5.1',
  });

  console.log('\n========================================');
}

main();
