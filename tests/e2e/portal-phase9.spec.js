import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium } from 'playwright';

const PORTAL_URL = process.env.PORTAL_URL || 'http://localhost:19900/studio';
const API_BASE = process.env.API_BASE || 'http://localhost:19900';
const API_KEY = process.env.API_KEY || 'trae-local-api-key';

let browser;
let page;

async function clearAllSessions() {
  const res = await fetch(`${API_BASE}/v1/sessions`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!res.ok) return;
  const sessions = await res.json();
  for (const s of sessions) {
    await fetch(`${API_BASE}/v1/sessions/${s.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
  }
}

describe('Phase 9 E2E: Backward-compat localStorage migration', () => {
  beforeAll(async () => {
    await clearAllSessions();
    browser = await chromium.launch({ headless: true });
  }, 30000);

  afterAll(async () => {
    if (browser) await browser.close();
  });

  it('migrates old localStorage sessions to server on first load', async () => {
    const context = await browser.newContext();
    page = await context.newPage();

    // Inject old-format data into localStorage before navigating
    await page.goto(PORTAL_URL, { waitUntil: 'domcontentloaded' });

    // Set up old-format localStorage data
    await page.evaluate(() => {
      const oldData = {
        sessions: [
          { id: 'old_sess_1', name: 'Migrated Session', activeSessionId: 'old_sess_1' }
        ],
        config: { apiBase: 'http://localhost:19900', apiKey: 'trae-local-api-key', model: 'auto', stream: true },
      };
      localStorage.setItem('trae_api_studio', JSON.stringify(oldData));

      // Also set up old messages store
      const messagesData = {
        old_sess_1: {
          chatMessages: [
            { role: 'user', content: 'Old question' },
            { role: 'assistant', content: 'Old answer' },
          ],
          agentMessages: [],
          history: [],
        },
      };
      localStorage.setItem('trae_api_studio_messages', JSON.stringify(messagesData));
    });

    // Reload to trigger migration
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('.session-item', { timeout: 10000 });

    // Migration should have run — verify via localStorage flag
    const migrationDone = await page.evaluate(() => localStorage.getItem('migration_v2_done'));
    expect(migrationDone).toBeTruthy();

    // Old localStorage should still exist (not cleared)
    const oldData = await page.evaluate(() => localStorage.getItem('trae_api_studio'));
    expect(oldData).toBeTruthy();

    // Server should have the migrated sessions
    const serverSessions = await fetch(`${API_BASE}/v1/sessions`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    }).then(r => r.json());
    expect(serverSessions.length).toBeGreaterThanOrEqual(1);
  }, 30000);

  it('skips migration on subsequent loads (flag present)', async () => {
    const context = await browser.newContext();
    page = await context.newPage();

    await page.goto(PORTAL_URL, { waitUntil: 'domcontentloaded' });

    // Set migration flag and old data
    await page.evaluate(() => {
      localStorage.setItem('migration_v2_done', String(Date.now()));
      localStorage.setItem('trae_api_studio', JSON.stringify({ sessions: [] }));
    });

    // Track console messages
    const consoleMessages = [];
    page.on('console', (msg) => {
      if (msg.text().includes('migration')) consoleMessages.push(msg.text());
    });

    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('.session-item', { timeout: 10000 });

    // No migration console messages should appear
    const migrationMessages = consoleMessages.filter(m => m.includes('[migration]'));
    expect(migrationMessages.length).toBe(0);

    await context.close();
  }, 30000);
});
