import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';

const TEST_PORT = 19993;
const API_KEY = 'trae-local-api-key-export';
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
        resolve({ status: res.statusCode, body: parsed, raw: data, headers: res.headers });
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

describe('Phase 10: Export route', () => {
  beforeAll(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trae-test-export-'));
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

  it('GET /v1/sessions/:id/export returns session + messages JSON with Content-Disposition', async () => {
    const create = await request('POST', '/v1/sessions', { name: 'Export Test' }, authHeaders());
    const sid = create.body.id;

    await request('POST', `/v1/sessions/${sid}/messages`, { role: 'user', content: 'hello' }, authHeaders());
    await request('POST', `/v1/sessions/${sid}/messages`, { role: 'assistant', content: 'hi', tokensIn: 5, tokensOut: 3 }, authHeaders());

    const res = await request('GET', `/v1/sessions/${sid}/export`, null, authHeaders());
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(sid);
    expect(res.body.name).toBe('Export Test');
    expect(Array.isArray(res.body.messages)).toBe(true);
    expect(res.body.messages.length).toBe(2);
    expect(res.body.messages[0].content).toBe('hello');
    expect(res.body.messages[1].tokensIn).toBe(5);

    // Content-Disposition header
    const cd = res.headers['content-disposition'];
    expect(cd).toContain('attachment');
    expect(cd).toContain('Export_Test');
  });

  it('GET /v1/sessions/:id/export returns 404 for unknown session', async () => {
    const res = await request('GET', '/v1/sessions/sess_nonexistent/export', null, authHeaders());
    expect(res.status).toBe(404);
  });

  it('GET /v1/sessions includes totalTokensIn/totalTokensOut per session', async () => {
    const create = await request('POST', '/v1/sessions', { name: 'Token Count Test' }, authHeaders());
    const sid = create.body.id;

    // No messages yet — totals should be 0
    const listBefore = await request('GET', '/v1/sessions', null, authHeaders());
    const sessBefore = listBefore.body.find(s => s.id === sid);
    expect(sessBefore).toBeTruthy();
    expect(sessBefore.totalTokensIn).toBe(0);
    expect(sessBefore.totalTokensOut).toBe(0);

    // Add messages with tokens
    await request('POST', `/v1/sessions/${sid}/messages`, { role: 'user', content: 'q1', tokensIn: 10, tokensOut: 0 }, authHeaders());
    await request('POST', `/v1/sessions/${sid}/messages`, { role: 'assistant', content: 'a1', tokensIn: 10, tokensOut: 5 }, authHeaders());
    await request('POST', `/v1/sessions/${sid}/messages`, { role: 'user', content: 'q2', tokensIn: 15, tokensOut: 0 }, authHeaders());
    await request('POST', `/v1/sessions/${sid}/messages`, { role: 'assistant', content: 'a2', tokensIn: 15, tokensOut: 8 }, authHeaders());

    // Now list should show aggregated totals
    const listAfter = await request('GET', '/v1/sessions', null, authHeaders());
    const sessAfter = listAfter.body.find(s => s.id === sid);
    expect(sessAfter).toBeTruthy();
    expect(sessAfter.totalTokensIn).toBe(50);  // 10+10+15+15
    expect(sessAfter.totalTokensOut).toBe(13);  // 0+5+0+8
  });
});
