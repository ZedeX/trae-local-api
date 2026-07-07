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

async function setupSession(name = 'Phase10 Test') {
  const res = await fetch(`${API_BASE}/v1/sessions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  return res.json();
}

async function addMessage(sessionId, role, content, tokensIn = 0, tokensOut = 0) {
  await fetch(`${API_BASE}/v1/sessions/${sessionId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ role, content, tokensIn, tokensOut }),
  });
}

describe('Phase 10 E2E: Menu overlay + token totals', () => {
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
  }, 15000);

  it('shows menu button, opens overlay, navigates to API Tester, closes overlay', async () => {
    const sess = await setupSession('Menu Test');
    await page.goto(PORTAL_URL, { waitUntil: 'networkidle' });
    await page.waitForSelector('.session-item', { timeout: 10000 });

    // Click the menu button
    const menuBtn = await page.$('#menuBtn');
    expect(menuBtn).toBeTruthy();
    await menuBtn.click();
    await page.waitForTimeout(300);

    // Menu panel should be visible
    const panel = await page.$('#menuPanel');
    expect(panel).toBeTruthy();
    const panelDisplay = await page.$eval('#menuPanel', el => el.style.display);
    expect(panelDisplay).not.toBe('none');

    // Chat should be active by default
    const chatActive = await page.$eval('.menu-item[data-menu="chat"]', el => el.classList.contains('active'));
    expect(chatActive).toBe(true);

    // Click "API Tester" in the menu
    const apiItem = await page.$('.menu-item[data-menu="api"]');
    await apiItem.click();
    await page.waitForTimeout(300);

    // Menu should close (overlay not open)
    const overlayClass = await page.$eval('#menuOverlay', el => el.className);
    expect(overlayClass).not.toContain('open');

    // API tab should now be active in main tabs
    const apiTabActive = await page.$eval('#mainTabs .tab[data-tab="api"]', el => el.classList.contains('active'));
    expect(apiTabActive).toBe(true);

    // Re-open menu
    await menuBtn.click();
    await page.waitForTimeout(300);

    // API Tester should now be highlighted in menu
    const apiMenuActive = await page.$eval('.menu-item[data-menu="api"]', el => el.classList.contains('active'));
    expect(apiMenuActive).toBe(true);

    // Click overlay backdrop to close
    const overlay = await page.$('#menuOverlay');
    await overlay.click();
    await page.waitForTimeout(200);

    const overlayClassAfter = await page.$eval('#menuOverlay', el => el.className);
    expect(overlayClassAfter).not.toContain('open');
  }, 30000);

  it('displays token totals in sidebar session items', async () => {
    await clearAllSessions();
    const sess = await setupSession('Token Display');
    await addMessage(sess.id, 'user', 'hello', 10, 0);
    await addMessage(sess.id, 'assistant', 'hi there', 10, 5);

    await page.goto(PORTAL_URL, { waitUntil: 'networkidle' });
    await page.waitForSelector('.session-item', { timeout: 10000 });
    await page.waitForTimeout(500);

    // Find the session with token totals
    const tokenEl = await page.$('.session-tokens');
    expect(tokenEl).toBeTruthy();
    const text = await tokenEl.textContent();
    expect(text).toContain('Σ20/5');
  }, 30000);
});
