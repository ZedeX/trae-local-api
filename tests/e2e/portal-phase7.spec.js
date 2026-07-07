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

async function getActiveSessionId() {
  const onclickAttr = await page.$eval('.session-item.active', (el) => el.getAttribute('onclick'));
  if (!onclickAttr) return null;
  const match = onclickAttr.match(/switchSession\('([^']+)'\)/);
  return match ? match[1] : null;
}

describe('Phase 7 E2E: Session rename/pin/search/delete', () => {
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

  it('double-click session name enables inline editing', async () => {
    await page.goto(PORTAL_URL, { waitUntil: 'networkidle' });
    await page.waitForSelector('.session-item.active', { timeout: 10000 });

    const nameEl = await page.$('.session-item.active .session-name');
    expect(nameEl).toBeTruthy();

    // Double-click to edit
    await nameEl.dblclick();
    await page.waitForTimeout(500);

    // Should be contenteditable
    const isEditable = await nameEl.getAttribute('contenteditable');
    expect(isEditable).toBe('true');
  }, 30000);

  it('pin toggle works on hover', async () => {
    await page.goto(PORTAL_URL, { waitUntil: 'networkidle' });
    await page.waitForSelector('.session-item.active', { timeout: 10000 });

    // Hover over session item to reveal pin icon
    const item = await page.$('.session-item.active');
    await item.hover();
    await page.waitForTimeout(300);

    // Click pin icon
    const pinIcon = await page.$('.session-item .pin-icon');
    expect(pinIcon).toBeTruthy();
    await pinIcon.click();
    await page.waitForTimeout(500);

    // Check pinned state — the pin icon should now have class "pinned"
    const pinnedIcon = await page.$('.session-item .pin-icon.pinned');
    expect(pinnedIcon).toBeTruthy();
  }, 30000);

  it('search box filters sessions', async () => {
    // Create sessions with specific names via API
    await fetch(`${API_BASE}/v1/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({ name: 'Alpha Test Session' }),
    });
    await fetch(`${API_BASE}/v1/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({ name: 'Beta Chat' }),
    });

    await page.goto(PORTAL_URL, { waitUntil: 'networkidle' });
    await page.waitForSelector('.session-item', { timeout: 10000 });

    // Type into search box
    const searchInput = await page.$('#sessionSearch');
    expect(searchInput).toBeTruthy();
    await searchInput.fill('Alpha');

    await page.waitForTimeout(500);

    // Should only show sessions matching "Alpha"
    const visibleItems = await page.$$('.session-item');
    for (const item of visibleItems) {
      const name = await item.$eval('.session-name', (el) => el.textContent);
      expect(name.toLowerCase()).toContain('alpha');
    }

    // Clear search
    await searchInput.fill('');
    await page.waitForTimeout(500);

    // Should show all sessions again
    const allItems = await page.$$('.session-item');
    expect(allItems.length).toBeGreaterThanOrEqual(2);
  }, 30000);

  it('delete shows confirmation dialog', async () => {
    await page.goto(PORTAL_URL, { waitUntil: 'networkidle' });
    await page.waitForSelector('.session-item', { timeout: 10000 });

    // Hover and click delete button
    const item = await page.$('.session-item');
    await item.hover();
    await page.waitForTimeout(300);

    const closeBtn = await item.$('.session-close');
    await closeBtn.click();
    await page.waitForTimeout(300);

    // Modal should appear
    const modal = await page.$('.modal-overlay');
    expect(modal).toBeTruthy();

    const modalText = await modal.textContent();
    expect(modalText).toContain('Delete');
    expect(modalText).toContain('cannot be undone');
  }, 30000);
});
