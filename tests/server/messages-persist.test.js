import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';

const TEST_PORT = 19998;
const API_KEY = 'trae-local-api-key-test';
const NODE_BIN = process.env.NODE_BIN || 'node';

let serverProcess;
let tempDir;

function request(method, urlPath, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: TEST_PORT,
      path: urlPath,
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
    };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        let parsed = data;
        try { parsed = JSON.parse(data); } catch { /* keep raw */ }
        resolve({ status: res.statusCode, body: parsed, raw: data });
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function authHeaders(extra = {}) {
  return { Authorization: `Bearer ${API_KEY}`, ...extra };
}

describe('Phase 2: Send message + persist', () => {
  beforeAll(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trae-test-msg-'));
    const env = {
      ...process.env,
      SESSIONS_DB_PATH: path.join(tempDir, 'sessions.db'),
      PORT: String(TEST_PORT),
      API_KEY,
      WORKSPACE_DIR: tempDir,
    };
    serverProcess = spawn(NODE_BIN, ['src/server.js'], {
      cwd: process.cwd(),
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('server start timeout')), 30000);
      serverProcess.stdout.on('data', (chunk) => {
        if (chunk.toString().includes('Server running')) {
          clearTimeout(timeout);
          resolve();
        }
      });
      serverProcess.stderr.on('data', (chunk) => {
        console.error('[server stderr]', chunk.toString());
      });
    });
  }, 45000);

  afterAll(async () => {
    if (serverProcess) {
      serverProcess.kill();
      await new Promise((r) => serverProcess.on('exit', r));
    }
    if (tempDir) {
      try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  }, 15000);

  // Tracer bullet: POST a message, GET the session, message is there.
  it('POST /v1/sessions/:id/messages appends a message that GET /v1/sessions/:id returns', async () => {
    const create = await request('POST', '/v1/sessions', {}, authHeaders());
    expect(create.status).toBe(200);
    const sessionId = create.body.id;

    const append = await request('POST', `/v1/sessions/${sessionId}/messages`, {
      role: 'user',
      content: 'Hello, world!',
    }, authHeaders());
    expect(append.status).toBe(200);
    expect(append.body.id).toMatch(/^msg_/);
    expect(append.body.sessionId).toBe(sessionId);
    expect(append.body.role).toBe('user');
    expect(append.body.content).toBe('Hello, world!');

    const get = await request('GET', `/v1/sessions/${sessionId}`, null, authHeaders());
    expect(get.status).toBe(200);
    expect(Array.isArray(get.body.messages)).toBe(true);
    expect(get.body.messages.length).toBe(1);
    expect(get.body.messages[0].content).toBe('Hello, world!');
    expect(get.body.messages[0].role).toBe('user');
  });

  it('messages persist multiple appends in order', async () => {
    const create = await request('POST', '/v1/sessions', {}, authHeaders());
    const sid = create.body.id;
    await request('POST', `/v1/sessions/${sid}/messages`, { role: 'user', content: 'first' }, authHeaders());
    await request('POST', `/v1/sessions/${sid}/messages`, { role: 'assistant', content: 'second', tokensIn: 10, tokensOut: 20 }, authHeaders());
    await request('POST', `/v1/sessions/${sid}/messages`, { role: 'user', content: 'third' }, authHeaders());

    const get = await request('GET', `/v1/sessions/${sid}`, null, authHeaders());
    expect(get.body.messages.length).toBe(3);
    expect(get.body.messages[0].content).toBe('first');
    expect(get.body.messages[1].content).toBe('second');
    expect(get.body.messages[1].tokensIn).toBe(10);
    expect(get.body.messages[1].tokensOut).toBe(20);
    expect(get.body.messages[2].content).toBe('third');
  });

  it('POST message to unknown session returns 404', async () => {
    const res = await request('POST', '/v1/sessions/sess_nonexistent/messages', {
      role: 'user', content: 'test',
    }, authHeaders());
    expect(res.status).toBe(404);
  });

  it('DELETE session cascades to delete its messages', async () => {
    const create = await request('POST', '/v1/sessions', {}, authHeaders());
    const sid = create.body.id;
    await request('POST', `/v1/sessions/${sid}/messages`, { role: 'user', content: 'msg' }, authHeaders());
    const del = await request('DELETE', `/v1/sessions/${sid}`, null, authHeaders());
    expect(del.status).toBe(200);
    const get = await request('GET', `/v1/sessions/${sid}`, null, authHeaders());
    expect(get.status).toBe(404);
  });

  it('X-Session-Id header on /v1/chat/completions is accepted (no 400)', async () => {
    // We don't test full chat (requires Trae backend); just verify the header
    // is parsed without breaking the request. The route should still proceed
    // to attempt Trae backend call (which will fail, but not with 400 from us).
    const create = await request('POST', '/v1/sessions', {}, authHeaders());
    const sid = create.body.id;
    // Send a minimal chat request with X-Session-Id header.
    // We expect either a 200 (if Trae backend works) or 500/502 (if it doesn't).
    // We do NOT expect 400 "missing session" — that would mean header parsing broke.
    const res = await request('POST', '/v1/chat/completions', {
      model: 'auto',
      messages: [{ role: 'user', content: 'test' }],
      stream: false,
    }, authHeaders({ 'X-Session-Id': sid }));
    // Accept 200, 500, 502, 503 — anything but 400 from our own validation.
    expect(res.status).not.toBe(400);
  }, 15000);

  it('X-Session-Id persists the user message even when model call fails', async () => {
    // Without Trae backend auth in the test env, the chat call will fail
    // (401/500), but the user message MUST already be persisted BEFORE
    // the model call (per Phase 2 grill-me G2: "user message row may
    // still be created" on abort/failure).
    const create = await request('POST', '/v1/sessions', {}, authHeaders());
    const sid = create.body.id;
    await request('POST', '/v1/chat/completions', {
      model: 'auto',
      messages: [
        { role: 'system', content: 'system prompt' },
        { role: 'user', content: 'persistence test' },
      ],
      stream: false,
    }, authHeaders({ 'X-Session-Id': sid }));
    // Chat response status is irrelevant (likely 401/500 without Trae auth).
    // The user message should be in the DB.
    const get = await request('GET', `/v1/sessions/${sid}`, null, authHeaders());
    expect(get.status).toBe(200);
    expect(get.body.messages.length).toBeGreaterThanOrEqual(1);
    const userMsg = get.body.messages.find(m => m.role === 'user');
    expect(userMsg).toBeTruthy();
    expect(userMsg.content).toBe('persistence test');
    expect(userMsg.id).toMatch(/^msg_/);
  }, 15000);
});
