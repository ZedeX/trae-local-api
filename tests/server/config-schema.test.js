import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';

const TEST_PORT = 19997;
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

function authHeaders() {
  return { Authorization: `Bearer ${API_KEY}` };
}

describe('Phase 3: Config schema + per-session config', () => {
  beforeAll(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trae-test-cfg-'));
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

  // ===== GET /v1/config/schema =====
  it('GET /v1/config/schema returns {params: [...]} with required fields', async () => {
    const res = await request('GET', '/v1/config/schema', null, authHeaders());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.params)).toBe(true);
    expect(res.body.params.length).toBeGreaterThanOrEqual(8);

    // Verify each param has required shape
    for (const p of res.body.params) {
      expect(p.key).toBeTruthy();
      expect(p.type).toMatch(/^(string|number|boolean|enum)$/);
      expect(typeof p.default).toBeDefined();
      expect(p.group).toBeTruthy();
    }
  });

  it('schema includes model, system_prompt, stream, function, max_tool_rounds, auto_continue, max_continues, workspace_dir', async () => {
    const res = await request('GET', '/v1/config/schema', null, authHeaders());
    const keys = res.body.params.map((p) => p.key);
    const required = ['model', 'system_prompt', 'stream', 'function', 'max_tool_rounds', 'auto_continue', 'max_continues', 'workspace_dir'];
    for (const r of required) {
      expect(keys).toContain(r);
    }
  });

  it('number params have min/max, enum params have enum array', async () => {
    const res = await request('GET', '/v1/config/schema', null, authHeaders());
    for (const p of res.body.params) {
      if (p.type === 'number') {
        expect(typeof p.min).toBe('number');
        expect(typeof p.max).toBe('number');
      }
      if (p.type === 'enum') {
        expect(Array.isArray(p.enum)).toBe(true);
        expect(p.enum.length).toBeGreaterThan(0);
      }
    }
  });

  // ===== Per-session config via PUT /v1/sessions/:id =====
  it('PUT /v1/sessions/:id with config updates config_json and bumps updated_at', async () => {
    const create = await request('POST', '/v1/sessions', {}, authHeaders());
    const sid = create.body.id;
    const originalUpdatedAt = create.body.updatedAt;

    // Small delay to ensure updated_at differs
    await new Promise((r) => setTimeout(r, 10));

    const updated = await request('PUT', `/v1/sessions/${sid}`, {
      config: { model: 'gpt-4', temperature: 0.3, system_prompt: 'You are a pirate.' },
    }, authHeaders());
    expect(updated.status).toBe(200);
    expect(updated.body.config.model).toBe('gpt-4');
    expect(updated.body.config.temperature).toBe(0.3);
    expect(updated.body.config.system_prompt).toBe('You are a pirate.');
    expect(updated.body.updatedAt).toBeGreaterThanOrEqual(originalUpdatedAt);
  });

  it('changing config in session A does not affect session B', async () => {
    const a = await request('POST', '/v1/sessions', {}, authHeaders());
    const b = await request('POST', '/v1/sessions', {}, authHeaders());

    await request('PUT', `/v1/sessions/${a.body.id}`, {
      config: { model: 'claude-3', stream: false },
    }, authHeaders());

    await request('PUT', `/v1/sessions/${b.body.id}`, {
      config: { model: 'gpt-4', stream: true },
    }, authHeaders());

    const getA = await request('GET', `/v1/sessions/${a.body.id}`, null, authHeaders());
    const getB = await request('GET', `/v1/sessions/${b.body.id}`, null, authHeaders());

    expect(getA.body.config.model).toBe('claude-3');
    expect(getA.body.config.stream).toBe(false);
    expect(getB.body.config.model).toBe('gpt-4');
    expect(getB.body.config.stream).toBe(true);
  });

  // ===== Global defaults =====
  it('GET /v1/config/defaults returns current defaults', async () => {
    const res = await request('GET', '/v1/config/defaults', null, authHeaders());
    expect(res.status).toBe(200);
    expect(res.body).toBeTruthy();
    // Should have at least model and stream
    expect(res.body.model).toBeDefined();
    expect(res.body.stream).toBeDefined();
  });

  it('PUT /v1/config/defaults updates defaults that new sessions inherit', async () => {
    // Set defaults
    const putRes = await request('PUT', '/v1/config/defaults', {
      model: 'test-default-model',
      stream: false,
      temperature: 0.42,
    }, authHeaders());
    expect(putRes.status).toBe(200);

    // Create a new session — it should inherit the defaults
    const newSession = await request('POST', '/v1/sessions', {}, authHeaders());
    expect(newSession.status).toBe(200);
    expect(newSession.body.config.model).toBe('test-default-model');
    expect(newSession.body.config.stream).toBe(false);
    expect(newSession.body.config.temperature).toBeCloseTo(0.42);
  });
});
