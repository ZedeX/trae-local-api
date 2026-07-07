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

/** Create a session via API and navigate portal to it */
async function setupSession() {
  // Create via API
  const res = await fetch(`${API_BASE}/v1/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({}),
  });
  const session = await res.json();

  // Navigate portal
  await page.goto(PORTAL_URL, { waitUntil: 'networkidle' });
  await page.waitForSelector('.session-item', { timeout: 10000 });
  await page.waitForTimeout(500);

  return session;
}

describe('Phase 8 E2E: Message edit + regenerate + token badge', () => {
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

  it('shows edit icon on user messages', async () => {
    const session = await setupSession();

    // Add a user message via API
    await fetch(`${API_BASE}/v1/sessions/${session.id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({ role: 'user', content: 'Hello world' }),
    });

    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('.chat-msg.user', { timeout: 10000 });

    // Hover to make action visible
    const userMsg = await page.$('.chat-msg.user');
    await userMsg.hover();
    await page.waitForTimeout(300);

    // Edit icon should be present
    const editIcon = await page.$('.chat-msg.user .msg-action');
    expect(editIcon).toBeTruthy();
  }, 30000);

  it('shows token badge on assistant messages with tokens', async () => {
    const session = await setupSession();

    // Add an assistant message with token usage
    await fetch(`${API_BASE}/v1/sessions/${session.id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({ role: 'assistant', content: 'Response here', tokensIn: 1234, tokensOut: 567 }),
    });

    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('.chat-msg.assistant', { timeout: 10000 });

    // Token badge should be present
    const badge = await page.$('.token-badge');
    expect(badge).toBeTruthy();
    const badgeText = await badge.textContent();
    expect(badgeText).toContain('1234');
    expect(badgeText).toContain('567');
  }, 30000);

  it('shows regenerate icon on last assistant message', async () => {
    const session = await setupSession();

    // Add user + assistant messages
    await fetch(`${API_BASE}/v1/sessions/${session.id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({ role: 'user', content: 'Question' }),
    });
    await fetch(`${API_BASE}/v1/sessions/${session.id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({ role: 'assistant', content: 'Answer 1' }),
    });

    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('.chat-msg.assistant', { timeout: 10000 });

    // Hover to make action visible
    const assistantMessages = await page.$$('.chat-msg.assistant');
    const lastAssistant = assistantMessages[assistantMessages.length - 1];
    await lastAssistant.hover();
    await page.waitForTimeout(300);

    const regenIcon = await lastAssistant.$('.msg-action[title="Regenerate"]');
    expect(regenIcon).toBeTruthy();
  }, 30000);

  it('edit icon click opens textarea', async () => {
    const session = await setupSession();

    // Add user+assistant
    await fetch(`${API_BASE}/v1/sessions/${session.id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({ role: 'user', content: 'Original question' }),
    });
    await fetch(`${API_BASE}/v1/sessions/${session.id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({ role: 'assistant', content: 'Answer' }),
    });

    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('.chat-msg.user', { timeout: 10000 });

    // Hover and click edit icon
    const userMsg = await page.$('.chat-msg.user');
    await userMsg.hover();
    await page.waitForTimeout(300);

    const editIcon = await page.$('.chat-msg.user .msg-action');
    await editIcon.click();
    await page.waitForTimeout(500);

    // Textarea should appear
    const textarea = await page.$('.chat-msg.user textarea');
    expect(textarea).toBeTruthy();
  }, 30000);
});
