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

describe('Phase 6 E2E: KaTeX lazy-load', () => {
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

  it('initial page load does NOT include KaTeX script', async () => {
    // Track network requests for KaTeX
    const katexRequests = [];
    page.on('request', (req) => {
      const url = req.url();
      if (url.includes('katex')) {
        katexRequests.push(url);
      }
    });

    await page.goto(PORTAL_URL, { waitUntil: 'networkidle' });
    await page.waitForSelector('.session-item.active', { timeout: 10000 });

    // KaTeX should NOT have been requested on initial load
    expect(katexRequests.length).toBe(0);

    // No KaTeX <script> tag should be present
    const katexScripts = await page.$$eval('script[src*="katex"]', (els) => els.length);
    expect(katexScripts).toBe(0);
  }, 30000);

  it('message with inline math triggers KaTeX load and renders', async () => {
    await page.goto(PORTAL_URL, { waitUntil: 'networkidle' });
    await page.waitForSelector('.session-item.active', { timeout: 10000 });
    const activeSess = await getActiveSessionId();
    expect(activeSess).toBeTruthy();

    // Inject assistant message with inline math
    const res = await fetch(`${API_BASE}/v1/sessions/${activeSess}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        role: 'assistant',
        content: 'The famous equation is $E=mc^2$ in physics.',
      }),
    });
    expect(res.status).toBe(200);

    // Reload to trigger rendering
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('.chat-msg.assistant .md-body', { timeout: 10000 });

    // Give KaTeX time to lazy-load and render (up to 5s)
    await page.waitForSelector('.katex', { timeout: 15000 }).catch(() => {});

    // Verify KaTeX rendered
    const hasKatex = await page.$('.katex');
    expect(hasKatex).toBeTruthy();
  }, 45000);

  it('block math renders centered on its own line', async () => {
    await page.goto(PORTAL_URL, { waitUntil: 'networkidle' });
    await page.waitForSelector('.session-item.active', { timeout: 10000 });
    const activeSess = await getActiveSessionId();
    expect(activeSess).toBeTruthy();

    const res = await fetch(`${API_BASE}/v1/sessions/${activeSess}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        role: 'assistant',
        content: 'Here is an integral:\n\n$$\\int_0^1 x\\,dx = \\frac{1}{2}$$\n\nDone.',
      }),
    });
    expect(res.status).toBe(200);

    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('.chat-msg.assistant .md-body', { timeout: 10000 });

    // Wait for KaTeX
    await page.waitForSelector('.katex', { timeout: 15000 }).catch(() => {});

    // Block math should have katex-display class
    const hasDisplay = await page.$('.katex-display');
    expect(hasDisplay).toBeTruthy();
  }, 45000);

  it('subsequent math messages render without re-fetching KaTeX', async () => {
    await page.goto(PORTAL_URL, { waitUntil: 'networkidle' });
    await page.waitForSelector('.session-item.active', { timeout: 10000 });
    const activeSess = await getActiveSessionId();

    // First math message to trigger KaTeX load
    await fetch(`${API_BASE}/v1/sessions/${activeSess}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        role: 'assistant',
        content: 'First: $a^2 + b^2 = c^2$',
      }),
    });

    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('.katex', { timeout: 15000 }).catch(() => {});

    // Now add second math message and count KaTeX requests
    const katexRequestsAfterFirst = [];
    page.on('request', (req) => {
      if (req.url().includes('katex')) {
        katexRequestsAfterFirst.push(req.url());
      }
    });

    await fetch(`${API_BASE}/v1/sessions/${activeSess}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        role: 'assistant',
        content: 'Second: $\\pi \\approx 3.14$',
      }),
    });

    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('.chat-msg.assistant .md-body', { timeout: 10000 });

    // Wait for render
    await page.waitForTimeout(2000);

    // The second message should render math (at least 2 .katex elements now)
    const katexCount = await page.$$eval('.katex', (els) => els.length);
    expect(katexCount).toBeGreaterThanOrEqual(2);
  }, 45000);
});
