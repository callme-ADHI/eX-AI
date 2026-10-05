// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { extractFromDocument } from '../extract';
const F = '`'.repeat(3);
const parse = (html: string) => new DOMParser().parseFromString(html, 'text/html');
const opts = { scope: 'main' as const, maxChars: 60000, keepQuery: false, live: false, pageUrl: 'https://ex.com/p?q=1' };

describe('extractFromDocument', () => {
  const doc = parse('<html><head><title>T</title><style>.x{}</style></head><body><nav>Menu</nav><main><h1>Hello</h1><p>World <b>bold</b></p><script>evil()</script><pre>a\n  b</pre><input value="secret"><ul><li>One</li><li>Two</li></ul></main></body></html>');
  const r = extractFromDocument(doc, opts);
  it('extracts headings, inline text, lists and code', () => {
    expect(r.text).toContain('# Hello');
    expect(r.text).toContain('World bold');
    expect(r.text).toContain('• One');
    expect(r.text).toContain(`${F}\na\n  b\n${F}`);
  });
  it('never includes scripts or form values', () => {
    expect(r.text).not.toContain('evil');
    expect(r.text).not.toContain('secret');
  });
  it('strips the query from the display URL', () => { expect(r.url).toBe('https://ex.com/p'); });
  it('detects JS-only shells', () => {
    const shell = parse('<body><div id="root"></div><script></script><script></script><script></script><script></script></body>');
    expect(extractFromDocument(shell, opts).rendered).toBe(false);
  });
  it('reads open shadow roots and slots on the live document', () => {
    document.body.innerHTML = '';
    const host = document.createElement('div');
    host.attachShadow({ mode: 'open' }).innerHTML = '<p>Inside shadow</p><slot></slot>';
    host.innerHTML = '<span>Slotted</span>';
    document.body.append(host);
    const live = extractFromDocument(document, { ...opts, live: true, scope: 'page' });
    expect(live.text).toContain('Inside shadow');
    if (typeof (document.createElement('slot') as any).assignedNodes === 'function') {
      expect(live.text).toContain('Slotted');
    }
  });
});
