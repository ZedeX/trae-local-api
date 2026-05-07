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
      const contentType = res.headers['content-type'] || '';
      let data = '';

      if (contentType.includes('text/event-stream')) {
        res.on('data', (chunk) => { data += chunk.toString(); });
        res.on('end', () => resolve({ status: res.statusCode, body: data, isSSE: true }));
      } else {
        res.on('data', (chunk) => { data += chunk.toString(); });
        res.on('end', () => resolve({ status: res.statusCode, body: data, isSSE: false }));
      }
    });

    req.on('error', (e) => reject(e));
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function parseSSE(rawBody) {
  const chunks = [];
  const lines = rawBody.split('\n');
  for (const line of lines) {
    if (line.startsWith('data: ') && line !== 'data: [DONE]') {
      try {
        chunks.push(JSON.parse(line.substring(6)));
      } catch (e) {}
    }
  }
  return chunks;
}

function extractContent(chunks) {
  let content = '';
  let reasoning = '';
  let finishReason = null;
  for (const chunk of chunks) {
    if (chunk.choices && chunk.choices[0]) {
      const delta = chunk.choices[0].delta || {};
      if (delta.content) content += delta.content;
      if (delta.reasoning_content) reasoning += delta.reasoning_content;
      if (chunk.choices[0].finish_reason) finishReason = chunk.choices[0].finish_reason;
    }
  }
  return { content, reasoning, finishReason };
}

let passed = 0;
let failed = 0;

function assert(condition, testName, detail) {
  if (condition) {
    console.log(`  [PASS] ${testName}`);
    passed++;
  } else {
    console.log(`  [FAIL] ${testName} - ${detail || 'assertion failed'}`);
    failed++;
  }
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function test1_rootEndpoint() {
  console.log('\n=== Test 1: Root Endpoint ===');
  const result = await makeRequest('/', 'GET');
  const data = JSON.parse(result.body);

  assert(result.status === 200, 'Status 200');
  assert(data.name === 'Trae Local API', 'Name is Trae Local API');
  assert(data.endpoints.chat === 'POST /v1/chat/completions', 'Chat endpoint exists');
}

async function test2_modelsEndpoint() {
  console.log('\n=== Test 2: Models Endpoint ===');
  const result = await makeRequest('/v1/models', 'GET');
  const data = JSON.parse(result.body);

  assert(result.status === 200, 'Status 200');
  assert(data.object === 'list', 'Object is list');
  assert(data.data.length > 0, 'Has models');
  assert(data.data.some(m => m.id === 'auto'), 'Has auto model');
  assert(data.data.some(m => m.id === 'glm-5.1'), 'Has glm-5.1 model');
  assert(data.data.some(m => m.id === 'inline_chat'), 'Has inline_chat function');
}

async function test3_statusEndpoint() {
  console.log('\n=== Test 3: Status Endpoint ===');
  const result = await makeRequest('/v1/status', 'GET');
  const data = JSON.parse(result.body);

  assert(result.status === 200, 'Status 200');
  assert(data.status === 'ok', 'Status is ok');
  assert(data.edition === 'cn' || data.edition === 'sg', 'Edition is cn or sg');
  assert(typeof data.token_expired === 'boolean', 'token_expired is boolean');
  assert(data.api_host !== undefined, 'api_host exists');
}

async function test4_chatCompletionsStream() {
  console.log('\n=== Test 4: Chat Completions (Stream) ===');
  const body = {
    model: 'auto',
    messages: [{ role: 'user', content: 'Say "OK" and nothing else.' }],
    stream: true,
  };

  const result = await makeRequest('/v1/chat/completions', 'POST', body);
  assert(result.status === 200, 'Status 200');
  assert(result.isSSE, 'Response is SSE');

  const chunks = parseSSE(result.body);
  assert(chunks.length > 0, 'Has chunks');

  const { content, finishReason } = extractContent(chunks);
  assert(content.length > 0, `Has content: "${content.substring(0, 50)}"`);
  assert(finishReason === 'stop', 'Finish reason is stop');

  const firstChunk = chunks[0];
  assert(firstChunk.id && firstChunk.id.startsWith('chatcmpl-'), 'ID starts with chatcmpl-');
  assert(firstChunk.object === 'chat.completion.chunk', 'Object is chat.completion.chunk');
  assert(firstChunk.model === 'auto', 'Model is auto');
}

async function test5_chatCompletionsNonStream() {
  console.log('\n=== Test 5: Chat Completions (Non-Stream) ===');
  const body = {
    model: 'auto',
    messages: [{ role: 'user', content: 'Say "YES" and nothing else.' }],
    stream: false,
  };

  const result = await makeRequest('/v1/chat/completions', 'POST', body);
  assert(result.status === 200, 'Status 200');

  const data = JSON.parse(result.body);
  assert(data.object === 'chat.completion', 'Object is chat.completion');
  assert(data.id && data.id.startsWith('chatcmpl-'), 'ID starts with chatcmpl-');
  assert(data.choices && data.choices.length > 0, 'Has choices');
  assert(data.choices[0].message, 'Has message');
  assert(data.choices[0].message.role === 'assistant', 'Role is assistant');
}

async function test6_soloCoderWithReasoning() {
  console.log('\n=== Test 6: Solo Coder (Reasoning) ===');
  await sleep(3000);

  const body = {
    model: 'auto',
    messages: [{ role: 'user', content: 'What is 1+1? Answer with just the number.' }],
    stream: true,
    function: 'solo_coder',
  };

  const result = await makeRequest('/v1/chat/completions', 'POST', body);
  assert(result.status === 200, 'Status 200');

  const chunks = parseSSE(result.body);
  const { content, reasoning, finishReason } = extractContent(chunks);
  assert(content.length > 0, `Has content: "${content.substring(0, 50)}"`);
  assert(finishReason === 'stop', 'Finish reason is stop');
  console.log(`  [INFO] Reasoning length: ${reasoning.length}, Content: "${content.substring(0, 30)}"`);
}

async function test7_modelSelection() {
  console.log('\n=== Test 7: Model Selection ===');
  await sleep(3000);

  const body = {
    model: 'glm-5.1',
    messages: [{ role: 'user', content: 'Say "GLM" and nothing else.' }],
    stream: true,
  };

  const result = await makeRequest('/v1/chat/completions', 'POST', body);
  assert(result.status === 200, 'Status 200');

  const chunks = parseSSE(result.body);
  const { content, finishReason } = extractContent(chunks);
  assert(content.length > 0 || finishReason === 'stop', 'Has response or finish');
  console.log(`  [INFO] Content: "${content.substring(0, 50)}"`);
}

async function test8_authRequired() {
  console.log('\n=== Test 8: Auth Required ===');
  const result = await makeRequest('/v1/models', 'GET');
  assert(result.status === 200, 'With auth: Status 200');

  const noAuthResult = await new Promise((resolve) => {
    const req = http.request({
      hostname: 'localhost',
      port: 9900,
      path: '/v1/models',
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk.toString(); });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.end();
  });

  assert(noAuthResult.status === 401, 'Without auth: Status 401');
}

async function test9_invalidMessages() {
  console.log('\n=== Test 9: Invalid Messages ===');
  const body = { model: 'auto', messages: [], stream: true };
  const result = await makeRequest('/v1/chat/completions', 'POST', body);
  assert(result.status === 400, 'Empty messages: Status 400');
}

async function test10_encryptDecrypt() {
  console.log('\n=== Test 10: Encrypt/Decrypt ===');
  const originalText = 'Hello, Trae API!';

  const encryptResult = await makeRequest('/v1/encrypt', 'POST', { text: originalText });
  assert(encryptResult.status === 200, 'Encrypt: Status 200');
  const encrypted = JSON.parse(encryptResult.body);
  assert(encrypted.encrypted, 'Has encrypted data');
  assert(encrypted.hash, 'Has hash');

  const decryptResult = await makeRequest('/v1/decrypt', 'POST', { encrypted: encrypted.encrypted });
  assert(decryptResult.status === 200, 'Decrypt: Status 200');
  const decrypted = JSON.parse(decryptResult.body);
  assert(decrypted.decrypted === originalText, `Decrypted matches: "${decrypted.decrypted}"`);
}

async function main() {
  console.log('========================================');
  console.log('  Trae Local API - End-to-End Tests');
  console.log('========================================');

  try {
    await test1_rootEndpoint();
    await test2_modelsEndpoint();
    await test3_statusEndpoint();
    await test4_chatCompletionsStream();
    await test5_chatCompletionsNonStream();
    await test6_soloCoderWithReasoning();
    await test7_modelSelection();
    await test8_authRequired();
    await test9_invalidMessages();
    await test10_encryptDecrypt();
  } catch (err) {
    console.error('\nTest error:', err.message);
    failed++;
  }

  console.log('\n========================================');
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log('========================================');

  process.exit(failed > 0 ? 1 : 0);
}

main();
