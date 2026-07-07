import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium } from 'playwright';

const PORTAL_URL = process.env.PORTAL_URL || 'http://localhost:19900/studio';
const API_BASE = process.env.API_BASE || 'http://localhost:19900';
const API_KEY = process.env.API_KEY || 'trae-local-api-key';

let browser;
let page;

async function clearAllSessions() {
  // Clean slate: delete all existing sessions via API
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

describe('Phase 1 E2E: Portal session smoke', () => {
  beforeAll(async () => {
    await clearAllSessions();
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage();
    // Collect console errors
    page.on('console', (msg) => {
      if (msg.type() === 'error') console.error('[browser console]', msg.text());
    });
    page.on('pageerror', (err) => console.error('[page error]', err.message));
  }, 30000);

  afterAll(async () => {
    if (browser) await browser.close();
  });

  it('portal page loads without errors', async () => {
    await page.goto(PORTAL_URL, { waitUntil: 'networkidle' });
    // Should have a session list element
    await page.waitForSelector('#sessionList', { timeout: 10000 });
    const title = await page.title();
    expect(title).toBeTruthy();
  }, 30000);

  it('auto-creates a session on first load when none exist', async () => {
    // After clearAllSessions + page load, the portal should auto-create one
    await page.waitForTimeout(1500); // give init() time to run
    const sessions = await page.$$eval('.session-item', (els) =>
      els.map((e) => e.querySelector('.session-name')?.textContent?.trim())
    );
    expect(sessions.length).toBeGreaterThanOrEqual(1);
  }, 15000);

  it('+ New button creates a session that persists across refresh', async () => {
    const beforeCount = await page.$$eval('.session-item', (els) => els.length);
    await page.click('button:has-text("New")');
    await page.waitForTimeout(1000); // wait for POST + render
    const afterCount = await page.$$eval('.session-item', (els) => els.length);
    expect(afterCount).toBe(beforeCount + 1);

    // Capture the new session name
    const names = await page.$$eval('.session-item .session-name', (els) =>
      els.map((e) => e.textContent?.trim())
    );

    // Refresh page
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    // Verify the session is still there (persisted on server)
    const namesAfterRefresh = await page.$$eval('.session-item .session-name', (els) =>
      els.map((e) => e.textContent?.trim())
    );
    for (const name of names) {
      expect(namesAfterRefresh).toContain(name);
    }
  }, 30000);

  it('trash icon deletes the session', async () => {
    const beforeCount = await page.$$eval('.session-item', (els) => els.length);
    expect(beforeCount).toBeGreaterThanOrEqual(1);

    // Click the first session's close (trash) button
    const firstClose = await page.$('.session-item .session-close');
    expect(firstClose).toBeTruthy();

    // Set up a confirmation handler if a confirm dialog appears
    page.on('dialog', (dialog) => dialog.accept());

    await firstClose.click();
    await page.waitForTimeout(1000); // wait for DELETE + render

    const afterCount = await page.$$eval('.session-item', (els) => els.length);
    expect(afterCount).toBe(beforeCount - 1);
  }, 15000);
});
