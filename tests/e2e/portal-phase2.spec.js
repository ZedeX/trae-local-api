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

async function apiGet(path) {
  const r = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  return { status: r.status, body: r.status === 204 ? null : await r.json().catch(() => null) };
}

describe('Phase 2 E2E: Message persistence via X-Session-Id', () => {
  beforeAll(async () => {
    await clearAllSessions();
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage();
    page.on('console', (msg) => {
      if (msg.type() === 'error') console.error('[browser console]', msg.text());
    });
    page.on('pageerror', (err) => console.error('[page error]', err.message));
  }, 30000);

  afterAll(async () => {
    if (browser) await browser.close();
  });

  it('portal loads and auto-creates a session', async () => {
    await page.goto(PORTAL_URL, { waitUntil: 'networkidle' });
    await page.waitForSelector('#sessionList', { timeout: 10000 });
    await page.waitForTimeout(1500); // allow init() + loadServerMessages to complete
    const sessions = await page.$$eval('.session-item', (els) => els.length);
    expect(sessions).toBeGreaterThanOrEqual(1);
  }, 30000);

  it('sending a chat message persists the user message on the server', async () => {
    // Switch to chat tab
    await page.click('#mainTabs .tab[data-tab="chat"]');
    await page.waitForSelector('#chatInput', { visible: true, timeout: 5000 });

    // Type a unique marker message
    const marker = `phase2-e2e-${Date.now()}`;
    await page.fill('#chatInput', marker);
    await page.click('#chatSendBtn');

    // Wait for the request to settle (success or failure — either way the
    // user message is persisted BEFORE the model call). Give it a few seconds
    // to reach the server even if the model call hangs/fails.
    await page.waitForTimeout(4000);

    // Verify via API that the active session has the user message persisted
    const listRes = await apiGet('/v1/sessions');
    expect(listRes.status).toBe(200);
    expect(Array.isArray(listRes.body)).toBe(true);
    expect(listRes.body.length).toBeGreaterThanOrEqual(1);

    // Find the session whose messages contain our marker
    let foundSession = null;
    for (const s of listRes.body) {
      const detail = await apiGet(`/v1/sessions/${s.id}`);
      if (detail.status === 200 && Array.isArray(detail.body.messages)) {
        const has = detail.body.messages.some(
          (m) => m.role === 'user' && m.content === marker
        );
        if (has) { foundSession = s; break; }
      }
    }
    expect(foundSession).toBeTruthy();
  }, 30000);

  it('refreshing the page restores the persisted user message', async () => {
    // Capture current chat messages before refresh
    const beforeMessages = await page.$$eval('.chat-msg', (els) =>
      els.map((e) => ({
        role: e.classList.contains('user') ? 'user' : e.classList.contains('assistant') ? 'assistant' : 'system',
        text: e.textContent || '',
      }))
    );
    const hadUserMsg = beforeMessages.some((m) => m.role === 'user' && m.text.includes('phase2-e2e-'));
    expect(hadUserMsg).toBe(true);

    // Refresh
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(2000); // allow init + loadServerMessages

    // Switch to chat tab
    await page.click('#mainTabs .tab[data-tab="chat"]');
    await page.waitForSelector('#chatMessages', { visible: true, timeout: 5000 });

    // Verify the user message is still there (loaded from server)
    const afterMessages = await page.$$eval('.chat-msg', (els) =>
      els.map((e) => ({
        role: e.classList.contains('user') ? 'user' : e.classList.contains('assistant') ? 'assistant' : 'system',
        text: e.textContent || '',
      }))
    );
    const stillHasUserMsg = afterMessages.some((m) => m.role === 'user' && m.text.includes('phase2-e2e-'));
    expect(stillHasUserMsg).toBe(true);
  }, 30000);
});
