import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';

const TEST_PORT = 19994;
const API_KEY = 'trae-local-api-key-edit';
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

describe('Phase 8: Message edit + regenerate', () => {
  beforeAll(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trae-test-edit-'));
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

  it('DELETE /v1/sessions/:id/messages/:msgId truncates that message and all after it', async () => {
    const create = await request('POST', '/v1/sessions', {}, authHeaders());
    const sid = create.body.id;

    // Add messages: user1, assistant1, user2, assistant2
    const m1 = await request('POST', `/v1/sessions/${sid}/messages`, { role: 'user', content: 'user1' }, authHeaders());
    const m2 = await request('POST', `/v1/sessions/${sid}/messages`, { role: 'assistant', content: 'assistant1' }, authHeaders());
    const m3 = await request('POST', `/v1/sessions/${sid}/messages`, { role: 'user', content: 'user2' }, authHeaders());
    const m4 = await request('POST', `/v1/sessions/${sid}/messages`, { role: 'assistant', content: 'assistant2' }, authHeaders());

    // Delete from m2 (assistant1) onward — should truncate m2, m3, m4
    const del = await request('DELETE', `/v1/sessions/${sid}/messages/${m2.body.id}`, null, authHeaders());
    expect(del.status).toBe(200);

    // Verify only m1 remains
    const get = await request('GET', `/v1/sessions/${sid}`, null, authHeaders());
    expect(get.body.messages.length).toBe(1);
    expect(get.body.messages[0].content).toBe('user1');
  });

  it('editing a message: truncate + re-add user message', async () => {
    const create = await request('POST', '/v1/sessions', {}, authHeaders());
    const sid = create.body.id;

    const m1 = await request('POST', `/v1/sessions/${sid}/messages`, { role: 'user', content: 'original' }, authHeaders());
    const m2 = await request('POST', `/v1/sessions/${sid}/messages`, { role: 'assistant', content: 'response' }, authHeaders());

    // Edit: delete from m1 onward, then add new user message
    await request('DELETE', `/v1/sessions/${sid}/messages/${m1.body.id}`, null, authHeaders());
    const newMsg = await request('POST', `/v1/sessions/${sid}/messages`, { role: 'user', content: 'edited version' }, authHeaders());
    expect(newMsg.status).toBe(200);

    const get = await request('GET', `/v1/sessions/${sid}`, null, authHeaders());
    expect(get.body.messages.length).toBe(1);
    expect(get.body.messages[0].content).toBe('edited version');
  });

  it('regenerate: drop last assistant message and re-add', async () => {
    const create = await request('POST', '/v1/sessions', {}, authHeaders());
    const sid = create.body.id;

    const m1 = await request('POST', `/v1/sessions/${sid}/messages`, { role: 'user', content: 'hello' }, authHeaders());
    const m2 = await request('POST', `/v1/sessions/${sid}/messages`, { role: 'assistant', content: 'old response', tokensIn: 10, tokensOut: 20 }, authHeaders());

    // Regenerate: delete the assistant message
    await request('DELETE', `/v1/sessions/${sid}/messages/${m2.body.id}`, null, authHeaders());

    // Verify only user message remains
    const get = await request('GET', `/v1/sessions/${sid}`, null, authHeaders());
    expect(get.body.messages.length).toBe(1);
    expect(get.body.messages[0].role).toBe('user');
  });

  it('token usage persists on messages', async () => {
    const create = await request('POST', '/v1/sessions', {}, authHeaders());
    const sid = create.body.id;

    const msg = await request('POST', `/v1/sessions/${sid}/messages`, {
      role: 'assistant',
      content: 'response with tokens',
      tokensIn: 150,
      tokensOut: 250,
    }, authHeaders());
    expect(msg.status).toBe(200);
    expect(msg.body.tokensIn).toBe(150);
    expect(msg.body.tokensOut).toBe(250);

    // Verify persistence
    const get = await request('GET', `/v1/sessions/${sid}`, null, authHeaders());
    const found = get.body.messages.find(m => m.id === msg.body.id);
    expect(found.tokensIn).toBe(150);
    expect(found.tokensOut).toBe(250);
  });

  it('DELETE message from unknown session returns 404', async () => {
    const del = await request('DELETE', '/v1/sessions/sess_nonexistent/messages/msg_xxx', null, authHeaders());
    expect(del.status).toBe(404);
  });
});
