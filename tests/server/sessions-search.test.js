import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';

const TEST_PORT = 19995;
const API_KEY = 'trae-local-api-key-search';
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

describe('Phase 7: Session rename / pin / search', () => {
  beforeAll(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trae-test-search-'));
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

  it('renames a session via PUT /v1/sessions/:id {name: "..."}', async () => {
    const create = await request('POST', '/v1/sessions', {}, authHeaders());
    expect(create.status).toBe(200);
    const sessionId = create.body.id;

    const rename = await request('PUT', `/v1/sessions/${sessionId}`, { name: 'My Renamed Session' }, authHeaders());
    expect(rename.status).toBe(200);
    expect(rename.body.name).toBe('My Renamed Session');

    // Verify persistence
    const get = await request('GET', `/v1/sessions/${sessionId}`, null, authHeaders());
    expect(get.body.name).toBe('My Renamed Session');
  });

  it('toggles pinned via PUT /v1/sessions/:id {pinned: true/false}', async () => {
    const create = await request('POST', '/v1/sessions', {}, authHeaders());
    const sessionId = create.body.id;
    expect(create.body.pinned).toBe(false);

    const pin = await request('PUT', `/v1/sessions/${sessionId}`, { pinned: true }, authHeaders());
    expect(pin.status).toBe(200);
    expect(pin.body.pinned).toBe(true);

    const unpin = await request('PUT', `/v1/sessions/${sessionId}`, { pinned: false }, authHeaders());
    expect(unpin.body.pinned).toBe(false);
  });

  it('pinned sessions sort before unpinned sessions', async () => {
    // Create two sessions
    const a = await request('POST', '/v1/sessions', { name: 'Unpinned A' }, authHeaders());
    const b = await request('POST', '/v1/sessions', { name: 'Pinned B' }, authHeaders());

    // Pin session B
    await request('PUT', `/v1/sessions/${b.body.id}`, { pinned: true }, authHeaders());

    const list = await request('GET', '/v1/sessions', null, authHeaders());
    expect(list.status).toBe(200);
    const sessions = list.body;

    // Find the two sessions
    const unpinnedA = sessions.find(s => s.id === a.body.id);
    const pinnedB = sessions.find(s => s.id === b.body.id);

    // Pinned should appear before unpinned in the list
    const idxA = sessions.indexOf(unpinnedA);
    const idxB = sessions.indexOf(pinnedB);
    expect(idxB).toBeLessThan(idxA);
  });

  it('GET /v1/sessions?q=test returns only matching sessions (case-insensitive)', async () => {
    await request('POST', '/v1/sessions', { name: 'Testing Search' }, authHeaders());
    await request('POST', '/v1/sessions', { name: 'Other Session' }, authHeaders());

    const result = await request('GET', '/v1/sessions?q=test', null, authHeaders());
    expect(result.status).toBe(200);
    expect(Array.isArray(result.body)).toBe(true);
    // All returned sessions should match "test" (case-insensitive)
    for (const s of result.body) {
      expect(s.name.toLowerCase()).toContain('test');
    }
    // At least "Testing Search" should be in results
    expect(result.body.some(s => s.name === 'Testing Search')).toBe(true);
  });

  it('GET /v1/sessions?q= (empty) returns all sessions', async () => {
    const result = await request('GET', '/v1/sessions?q=', null, authHeaders());
    expect(result.status).toBe(200);
    expect(result.body.length).toBeGreaterThan(0);
  });
});
