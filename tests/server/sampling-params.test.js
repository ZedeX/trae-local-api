import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';

const TEST_PORT = 19996;
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

describe('Phase 4: Sampling parameters in schema + forwarding', () => {
  beforeAll(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trae-test-sampling-'));
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

  // ===== Schema includes 8 sampling params =====
  const SAMPLING_PARAMS = ['temperature', 'top_p', 'max_tokens', 'presence_penalty', 'frequency_penalty', 'stop', 'seed', 'n'];

  it('schema includes all 8 OpenAI sampling parameters in "Sampling" group', async () => {
    const res = await request('GET', '/v1/config/schema', null, authHeaders());
    expect(res.status).toBe(200);
    const keys = res.body.params.map((p) => p.key);
    for (const param of SAMPLING_PARAMS) {
      expect(keys).toContain(param);
    }
    // Verify each is in the "Sampling" group
    const samplingParams = res.body.params.filter((p) => p.group === 'Sampling');
    expect(samplingParams.length).toBeGreaterThanOrEqual(8);
  });

  it('temperature has correct type/range/default', async () => {
    const res = await request('GET', '/v1/config/schema', null, authHeaders());
    const temp = res.body.params.find((p) => p.key === 'temperature');
    expect(temp.type).toBe('number');
    expect(temp.min).toBe(0);
    expect(temp.max).toBe(2);
    expect(temp.default).toBe(1);
    expect(temp.advanced).toBe(true);
  });

  it('sampling params are marked advanced', async () => {
    const res = await request('GET', '/v1/config/schema', null, authHeaders());
    const samplingParams = res.body.params.filter((p) => p.group === 'Sampling');
    for (const p of samplingParams) {
      expect(p.advanced).toBe(true);
    }
  });

  // ===== Per-session sampling config =====
  it('session config preserves sampling params via PUT', async () => {
    const create = await request('POST', '/v1/sessions', {}, authHeaders());
    const sid = create.body.id;
    const updated = await request('PUT', `/v1/sessions/${sid}`, {
      config: {
        temperature: 0.1,
        top_p: 0.8,
        max_tokens: 100,
        stop: ['END'],
        seed: 42,
      },
    }, authHeaders());
    expect(updated.status).toBe(200);
    expect(updated.body.config.temperature).toBeCloseTo(0.1);
    expect(updated.body.config.top_p).toBeCloseTo(0.8);
    expect(updated.body.config.max_tokens).toBe(100);
    expect(updated.body.config.stop).toEqual(['END']);
    expect(updated.body.config.seed).toBe(42);
  });

  it('sampling params survive session switch', async () => {
    const a = await request('POST', '/v1/sessions', {}, authHeaders());
    const b = await request('POST', '/v1/sessions', {}, authHeaders());
    await request('PUT', `/v1/sessions/${a.body.id}`, {
      config: { temperature: 0.3, top_p: 0.7 },
    }, authHeaders());
    await request('PUT', `/v1/sessions/${b.body.id}`, {
      config: { temperature: 0.9, top_p: 0.5 },
    }, authHeaders());
    const getA = await request('GET', `/v1/sessions/${a.body.id}`, null, authHeaders());
    const getB = await request('GET', `/v1/sessions/${b.body.id}`, null, authHeaders());
    expect(getA.body.config.temperature).toBeCloseTo(0.3);
    expect(getA.body.config.top_p).toBeCloseTo(0.7);
    expect(getB.body.config.temperature).toBeCloseTo(0.9);
    expect(getB.body.config.top_p).toBeCloseTo(0.5);
  });
});
