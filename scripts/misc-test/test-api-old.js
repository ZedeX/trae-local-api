const http = require('http');

const BASE_URL = process.env.TEST_URL || 'http://localhost:9900';
const API_KEY = process.env.TEST_API_KEY || 'trae-local-api-key';

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        resolve({ status: res.statusCode, headers: res.headers, body: data });
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function runTests() {
  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`  PASS: ${name}`);
      passed++;
    } catch (err) {
      console.log(`  FAIL: ${name} - ${err.message}`);
      failed++;
    }
  }

  function assert(condition, message) {
    if (!condition) throw new Error(message || 'Assertion failed');
  }

  console.log('\n=== Trae Local API Tests ===\n');

  await test('GET / - root endpoint', async () => {
    const res = await request('GET', '/');
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const body = JSON.parse(res.body);
    assert(body.name === 'Trae Local API', `Expected 'Trae Local API', got '${body.name}'`);
  });

  await test('GET /v1/models - list models', async () => {
    const res = await request('GET', '/v1/models');
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const body = JSON.parse(res.body);
    assert(body.object === 'list', `Expected 'list', got '${body.object}'`);
    assert(body.data.length > 0, 'Expected at least one model');
  });

  await test('GET /v1/status - auth status', async () => {
    const res = await request('GET', '/v1/status');
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const body = JSON.parse(res.body);
    assert(body.status === 'ok', `Expected 'ok', got '${body.status}'`);
    assert(body.api_host !== undefined, 'Expected api_host');
  });

  await test('POST /v1/encrypt - encrypt text', async () => {
    const res = await request('POST', '/v1/encrypt', { text: 'hello world' });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const body = JSON.parse(res.body);
    assert(body.encrypted !== undefined, 'Expected encrypted field');
    assert(body.hash !== undefined, 'Expected hash field');
  });

  await test('POST /v1/decrypt - decrypt text', async () => {
    const encRes = await request('POST', '/v1/encrypt', { text: 'test message' });
    const encBody = JSON.parse(encRes.body);
    const decRes = await request('POST', '/v1/decrypt', { encrypted: encBody.encrypted });
    assert(decRes.status === 200, `Expected 200, got ${decRes.status}`);
    const decBody = JSON.parse(decRes.body);
    assert(decBody.decrypted === 'test message', `Expected 'test message', got '${decBody.decrypted}'`);
  });

  await test('Auth required - no key', async () => {
    const url = new URL('/v1/models', BASE_URL);
    const res = await new Promise((resolve) => {
      const req = http.request({
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      }, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => resolve({ status: res.statusCode }));
      });
      req.end();
    });
    assert(res.status === 401, `Expected 401, got ${res.status}`);
  });

  await test('Auth required - wrong key', async () => {
    const url = new URL('/v1/models', BASE_URL);
    const res = await new Promise((resolve) => {
      const req = http.request({
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer wrong-key'
        }
      }, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => resolve({ status: res.statusCode }));
      });
      req.end();
    });
    assert(res.status === 401, `Expected 401, got ${res.status}`);
  });

  await test('POST /v1/chat/completions - validation', async () => {
    const res = await request('POST', '/v1/chat/completions', {});
    assert(res.status === 400, `Expected 400, got ${res.status}`);
  });

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
