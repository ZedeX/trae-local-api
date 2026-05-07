const http = require('http');

function makeRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 9900,
      path: path,
      method: method,
      headers: {
        'Authorization': 'Bearer trae-local-api-key',
        'Content-Type': 'application/json'
      },
      timeout: 30000
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({ status: res.statusCode, data: data });
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

function makeStreamRequest(path, body) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 9900,
      path: path,
      method: 'POST',
      headers: {
        'Authorization': 'Bearer trae-local-api-key',
        'Content-Type': 'application/json'
      },
      timeout: 60000
    };

    const req = http.request(options, (res) => {
      let fullData = '';
      let chunkCount = 0;
      res.on('data', (chunk) => {
        fullData += chunk.toString();
        chunkCount++;
      });
      res.on('end', () => {
        resolve({ status: res.statusCode, data: fullData, chunks: chunkCount });
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  console.log('=== Trae Local API Integration Test ===\n');

  try {
    console.log('[1] Testing GET / ...');
    const r0 = await makeRequest('GET', '/');
    console.log(`  Status: ${r0.status}`);
    const d0 = JSON.parse(r0.data);
    console.log(`  Name: ${d0.name}, Version: ${d0.version}, Edition: ${d0.edition}`);
    console.log('');

    console.log('[2] Testing GET /v1/status ...');
    const r1 = await makeRequest('GET', '/v1/status');
    console.log(`  Status: ${r1.status}`);
    const d1 = JSON.parse(r1.data);
    console.log(`  Auth: ${d1.token_expired ? 'EXPIRED' : 'VALID'}, Edition: ${d1.edition}, API Host: ${d1.api_host}`);
    console.log(`  User: ${d1.user_id}, Account: ${d1.account}`);
    console.log('');

    console.log('[3] Testing GET /v1/models ...');
    const r2 = await makeRequest('GET', '/v1/models');
    console.log(`  Status: ${r2.status}`);
    const d2 = JSON.parse(r2.data);
    console.log(`  Models: ${d2.data.map(m => m.id).join(', ')}`);
    console.log('');

    console.log('[4] Testing POST /v1/chat/completions (non-stream) ...');
    const r3 = await makeRequest('POST', '/v1/chat/completions', {
      model: 'claude-3.5-sonnet',
      messages: [{ role: 'user', content: 'Say hello in one word only' }],
      stream: false
    });
    console.log(`  Status: ${r3.status}`);
    const d3 = JSON.parse(r3.data);
    if (d3.error) {
      console.log(`  Error: ${d3.error.message}`);
    } else {
      console.log(`  ID: ${d3.id}`);
      console.log(`  Model: ${d3.model}`);
      console.log(`  Content: ${d3.choices?.[0]?.message?.content || 'N/A'}`);
      console.log(`  Finish: ${d3.choices?.[0]?.finish_reason}`);
    }
    console.log('');

    console.log('[5] Testing POST /v1/chat/completions (stream) ...');
    const r4 = await makeStreamRequest('/v1/chat/completions', {
      model: 'claude-3.5-sonnet',
      messages: [{ role: 'user', content: 'Say hi in exactly one word' }],
      stream: true
    });
    console.log(`  Status: ${r4.status}`);
    console.log(`  Chunks received: ${r4.chunks}`);
    const lines = r4.data.split('\n').filter(l => l.startsWith('data: '));
    console.log(`  SSE events: ${lines.length}`);
    let fullContent = '';
    for (const line of lines) {
      const jsonStr = line.substring(6).trim();
      if (jsonStr === '[DONE]') continue;
      try {
        const chunk = JSON.parse(jsonStr);
        if (chunk.choices?.[0]?.delta?.content) {
          fullContent += chunk.choices[0].delta.content;
        }
      } catch {}
    }
    console.log(`  Full content: ${fullContent.substring(0, 200) || '(empty)'}`);
    console.log('');

    console.log('[6] Testing POST /v1/encrypt and /v1/decrypt ...');
    const r5 = await makeRequest('POST', '/v1/encrypt', { text: 'Hello Trae API!' });
    const d5 = JSON.parse(r5.data);
    console.log(`  Encrypted: ${d5.encrypted?.substring(0, 50)}...`);
    const r6 = await makeRequest('POST', '/v1/decrypt', { encrypted: d5.encrypted });
    const d6 = JSON.parse(r6.data);
    console.log(`  Decrypted: ${d6.decrypted}`);
    console.log('');

    console.log('=== All tests completed ===');
  } catch (err) {
    console.error(`Test failed: ${err.message}`);
  }
}

main();
