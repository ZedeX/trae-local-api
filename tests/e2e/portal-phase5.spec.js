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

/** Get the active session ID by reading the .session-item.active element's onclick attribute */
async function getActiveSessionId() {
  // The session-item div has onclick="switchSession('sess_xxx')" — extract the ID
  const onclickAttr = await page.$eval('.session-item.active', (el) => el.getAttribute('onclick'));
  if (!onclickAttr) return null;
  const match = onclickAttr.match(/switchSession\('([^']+)'\)/);
  return match ? match[1] : null;
}

describe('Phase 5 E2E: Markdown rendering', () => {
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

  it('renders assistant message with markdown formatting', async () => {
    await page.goto(PORTAL_URL, { waitUntil: 'networkidle' });
    await page.waitForSelector('#sessionList', { timeout: 10000 });

    // Wait for auto-created session
    await page.waitForSelector('.session-item.active', { timeout: 10000 });
    const activeSess = await getActiveSessionId();
    expect(activeSess).toBeTruthy();

    // Inject an assistant message with markdown directly via API
    const markdownContent = [
      '# Hello World',
      '',
      'This is **bold** and *italic* text.',
      '',
      '```python',
      'def greet(name):',
      '    return f"Hello, {name}!"',
      '```',
      '',
      '- Item 1',
      '- Item 2',
      '',
      '[Click here](https://example.com)',
    ].join('\n');

    const res = await fetch(`${API_BASE}/v1/sessions/${activeSess}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({ role: 'assistant', content: markdownContent }),
    });
    expect(res.status).toBe(200);

    // Reload portal to see the message
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('.chat-msg.assistant .md-body', { timeout: 10000 });

    // Verify markdown rendering
    const hasH1 = await page.$eval('.md-body h1', (el) => el.textContent);
    expect(hasH1).toBe('Hello World');

    const hasBold = await page.$eval('.md-body strong', (el) => el.textContent);
    expect(hasBold).toBe('bold');

    const hasItalic = await page.$eval('.md-body em', (el) => el.textContent);
    expect(hasItalic).toBe('italic');

    // Verify code block with language class
    const codeLang = await page.$eval('.md-body pre code', (el) => el.className);
    expect(codeLang).toContain('language-python');

    // Verify list items
    const listItems = await page.$$eval('.md-body li', (els) => els.map((e) => e.textContent));
    expect(listItems).toContain('Item 1');
    expect(listItems).toContain('Item 2');

    // Verify link
    const linkHref = await page.$eval('.md-body a', (el) => el.getAttribute('href'));
    expect(linkHref).toBe('https://example.com');
  }, 30000);

  it('renders copy button on code blocks', async () => {
    await page.goto(PORTAL_URL, { waitUntil: 'networkidle' });
    await page.waitForSelector('.session-item.active', { timeout: 10000 });
    const activeSess = await getActiveSessionId();
    expect(activeSess).toBeTruthy();

    // Inject assistant message with code block
    const res = await fetch(`${API_BASE}/v1/sessions/${activeSess}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        role: 'assistant',
        content: '```js\nconsole.log("hello");\n```',
      }),
    });
    expect(res.status).toBe(200);

    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('.chat-msg.assistant .md-body', { timeout: 10000 });

    // Verify copy button exists
    const copyBtn = await page.$('.code-copy-btn');
    expect(copyBtn).toBeTruthy();
    const btnText = await copyBtn.textContent();
    expect(btnText.trim()).toBe('Copy');
  }, 30000);

  it('renders user message as plain text (no markdown)', async () => {
    await page.goto(PORTAL_URL, { waitUntil: 'networkidle' });
    await page.waitForSelector('.session-item.active', { timeout: 10000 });
    const activeSess = await getActiveSessionId();
    expect(activeSess).toBeTruthy();

    // Inject user message with markdown-like text
    const res = await fetch(`${API_BASE}/v1/sessions/${activeSess}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({ role: 'user', content: '**bold** should not render' }),
    });
    expect(res.status).toBe(200);

    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('.chat-msg.user', { timeout: 10000 });

    // User messages should NOT have md-body wrapper or <strong>
    const hasMdBody = await page.$('.chat-msg.user .md-body');
    expect(hasMdBody).toBeNull();

    const hasStrong = await page.$('.chat-msg.user strong');
    expect(hasStrong).toBeNull();

    // Should contain the raw text (escaped)
    const msgText = await page.$eval('.chat-msg.user', (el) => el.textContent);
    expect(msgText).toContain('**bold** should not render');
  }, 30000);
});
