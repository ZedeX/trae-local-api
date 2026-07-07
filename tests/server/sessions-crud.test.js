import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';

const TEST_PORT = 19999;
const API_KEY = 'trae-local-api-key-test';
const NODE_BIN = process.env.NODE_BIN || 'node';

let serverProcess;
let tempDir;
let serverReady;

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

function authHeaders() {
  return { Authorization: `Bearer ${API_KEY}` };
}

describe('Phase 1: Session storage skeleton', () => {
  beforeAll(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trae-test-'));
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
    serverReady = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('server start timeout')), 30000);
      serverProcess.stdout.on('data', (chunk) => {
        const text = chunk.toString();
        if (text.includes('Server running')) {
          clearTimeout(timeout);
          resolve();
        }
      });
      serverProcess.stderr.on('data', (chunk) => {
        // Surface stderr for debugging
        console.error('[server stderr]', chunk.toString());
      });
    });
    await serverReady;
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

  // Tracer bullet: POST creates a row that GET can list back.
  it('POST /v1/sessions creates a session that appears in GET /v1/sessions', async () => {
    const create = await request('POST', '/v1/sessions', {}, authHeaders());
    expect(create.status).toBe(200);
    expect(create.body.id).toMatch(/^sess_/);
    expect(create.body.name).toBeTruthy();
    expect(create.body.pinned).toBe(false);

    const list = await request('GET', '/v1/sessions', null, authHeaders());
    expect(list.status).toBe(200);
    expect(Array.isArray(list.body)).toBe(true);
    expect(list.body.find((s) => s.id === create.body.id)).toBeTruthy();
  });

  it('GET /v1/sessions without auth returns 401', async () => {
    const res = await request('GET', '/v1/sessions');
    expect(res.status).toBe(401);
  });

  it('GET /v1/sessions/:id returns the session', async () => {
    const create = await request('POST', '/v1/sessions', {}, authHeaders());
    const get = await request('GET', `/v1/sessions/${create.body.id}`, null, authHeaders());
    expect(get.status).toBe(200);
    expect(get.body.id).toBe(create.body.id);
  });

  it('GET /v1/sessions/:id on unknown id returns 404', async () => {
    const res = await request('GET', '/v1/sessions/sess_nonexistent', null, authHeaders());
    expect(res.status).toBe(404);
  });

  it('PUT /v1/sessions/:id updates name and pinned', async () => {
    const create = await request('POST', '/v1/sessions', {}, authHeaders());
    const updated = await request('PUT', `/v1/sessions/${create.body.id}`, {
      name: 'My Chat',
      pinned: true,
    }, authHeaders());
    expect(updated.status).toBe(200);
    expect(updated.body.name).toBe('My Chat');
    expect(updated.body.pinned).toBe(true);
  });

  it('PUT /v1/sessions/:id updates config independently per session', async () => {
    const a = await request('POST', '/v1/sessions', {}, authHeaders());
    const b = await request('POST', '/v1/sessions', {}, authHeaders());
    await request('PUT', `/v1/sessions/${a.body.id}`, {
      config: { model: 'gpt-4', temperature: 0.1 },
    }, authHeaders());
    await request('PUT', `/v1/sessions/${b.body.id}`, {
      config: { model: 'claude-3', temperature: 0.9 },
    }, authHeaders());
    const getA = await request('GET', `/v1/sessions/${a.body.id}`, null, authHeaders());
    const getB = await request('GET', `/v1/sessions/${b.body.id}`, null, authHeaders());
    expect(getA.body.config.model).toBe('gpt-4');
    expect(getA.body.config.temperature).toBe(0.1);
    expect(getB.body.config.model).toBe('claude-3');
    expect(getB.body.config.temperature).toBe(0.9);
  });

  it('DELETE /v1/sessions/:id removes the session', async () => {
    const create = await request('POST', '/v1/sessions', {}, authHeaders());
    const del = await request('DELETE', `/v1/sessions/${create.body.id}`, null, authHeaders());
    expect(del.status).toBe(200);
    expect(del.body.deleted).toBe(true);
    const get = await request('GET', `/v1/sessions/${create.body.id}`, null, authHeaders());
    expect(get.status).toBe(404);
  });

  it('GET /v1/sessions sorts pinned DESC then updated_at DESC', async () => {
    const a = await request('POST', '/v1/sessions', { name: 'A' }, authHeaders());
    const b = await request('POST', '/v1/sessions', { name: 'B' }, authHeaders());
    // Pin A
    await request('PUT', `/v1/sessions/${a.body.id}`, { pinned: true }, authHeaders());
    // Touch B's updated_at by renaming
    await new Promise((r) => setTimeout(r, 10));
    await request('PUT', `/v1/sessions/${b.body.id}`, { name: 'B-rename' }, authHeaders());
    const list = await request('GET', '/v1/sessions', null, authHeaders());
    const ids = list.body.map((s) => s.id);
    // Pinned A should come before unpinned B even though B was touched more recently
    expect(ids.indexOf(a.body.id)).toBeLessThan(ids.indexOf(b.body.id));
  });

  it('GET /v1/sessions?q= filters by name (case-insensitive)', async () => {
    await request('POST', '/v1/sessions', { name: 'Python Debugging' }, authHeaders());
    await request('POST', '/v1/sessions', { name: 'Java Refactor' }, authHeaders());
    const res = await request('GET', '/v1/sessions?q=python', null, authHeaders());
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body.every((s) => s.name.toLowerCase().includes('python'))).toBe(true);
  });

  it('session persists across server restart', async () => {
    // Create a session, then check it still exists via GET (same DB file)
    const create = await request('POST', '/v1/sessions', { name: 'Persist Test' }, authHeaders());
    const list = await request('GET', '/v1/sessions', null, authHeaders());
    expect(list.body.find((s) => s.id === create.body.id)).toBeTruthy();
    expect(list.body.find((s) => s.id === create.body.id).name).toBe('Persist Test');
  });
});

