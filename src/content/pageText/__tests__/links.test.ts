// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { collectLinks, rankLinks, buildLinksBlock } from '../links';

describe('collectLinks', () => {
  beforeEach(() => {
    document.body.innerHTML = `<header><a href="/home">Home</a></header>
      <main><a href="/pricing?utm_source=x">Pricing</a><a href="/pricing">Pricing again</a>
      <a href="https://other.com/x">Other</a><a href="mailto:hi@ex.com">Mail</a>
      <a href="javascript:void(0)">x</a><a href="#top">top</a></main>
      <footer><a href="/privacy">Privacy</a></footer>`;
  });

  it('resolves, dedupes and classifies', () => {
    const { links, contacts } = collectLinks(document, 'https://ex.com/page', 'https://ex.com');
    expect(links.map(l => l.url)).toEqual(['https://ex.com/home', 'https://ex.com/pricing', 'https://other.com/x', 'https://ex.com/privacy']);
    expect(links.find(l => l.url.endsWith('/pricing'))!.text).toBe('Pricing');
    expect(links.find(l => l.url.endsWith('/pricing'))!.region).toBe('main');
    expect(links.find(l => l.host === 'other.com')!.scope).toBe('external');
    expect(contacts.mailto).toEqual(['hi@ex.com']);
  });
  it('ranks internal before external, main before footer', () => {
    const { links } = collectLinks(document, 'https://ex.com/page', 'https://ex.com');
    expect(rankLinks(links).map(l => l.url)).toEqual(['https://ex.com/pricing', 'https://ex.com/home', 'https://ex.com/privacy', 'https://other.com/x']);
  });
  it('builds a block with ids and respects the char cap', () => {
    const { links, contacts } = collectLinks(document, 'https://ex.com/page', 'https://ex.com');
    const b = buildLinksBlock(links, contacts, { limit: 150, maxChars: 12000 });
    expect(b.shown).toBe(4);
    expect(b.text).toContain('[main|internal] Pricing → https://ex.com/pricing');
    const tiny = buildLinksBlock(links, contacts, { limit: 150, maxChars: 80 });
    expect(tiny.shown).toBeLessThan(4);
  });
  it('resolves relative links against the FETCHED page, not the current page', () => {
    const d = new DOMParser().parseFromString('<a href="next">n</a>', 'text/html');
    const r = collectLinks(d, 'https://ex.com/blog/post1', 'https://ex.com');
    expect(r.links[0].url).toBe('https://ex.com/blog/next');
  });
});
