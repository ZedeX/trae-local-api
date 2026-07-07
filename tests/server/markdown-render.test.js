import { describe, it, expect } from 'vitest';
import { marked } from 'marked';

// Phase 5: Markdown rendering + code highlight
// We don't need a server for unit tests of the render module itself.
// The E2E test will verify it works in the browser.

describe('Phase 5: Markdown rendering pipeline', () => {
  it('renders basic markdown to HTML', () => {
    const html = marked.parse('**bold** and *italic*');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<em>italic</em>');
  });

  it('renders fenced code blocks with language class', () => {
    const html = marked.parse('```javascript\nconst x = 1;\n```');
    expect(html).toContain('<code class="language-javascript"');
  });

  it('renders inline code', () => {
    const html = marked.parse('use `const` keyword');
    expect(html).toContain('<code>const</code>');
  });

  it('renders headers correctly', () => {
    const html = marked.parse('# H1\n## H2\n### H3');
    expect(html).toContain('<h1>H1</h1>');
    expect(html).toContain('<h2>H2</h2>');
    expect(html).toContain('<h3>H3</h3>');
  });

  it('renders lists correctly', () => {
    const html = marked.parse('- item 1\n- item 2\n1. numbered\n2. also numbered');
    expect(html).toContain('<li>item 1</li>');
    expect(html).toContain('<li>item 2</li>');
    expect(html).toContain('<ol>');
  });

  it('renders links correctly', () => {
    const html = marked.parse('[link](https://example.com)');
    expect(html).toContain('href="https://example.com"');
  });

  it.skip('sanitizes HTML in user input (XSS prevention) — browser-only, requires jsdom', () => {
    // DOMPurify requires a browser/DOM environment. This is tested in E2E.
    // In Node, DOMPurify needs jsdom which we don't want as a dep.
  });
});
