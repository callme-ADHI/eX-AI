import { describe, it, expect } from 'vitest';
import { Bm25Index, tokenize, chunkPage } from '../bm25';

describe('bm25', () => {
  const idx = new Bm25Index();
  idx.add({ id: 0, url: 'u1', title: 'Pricing', heading: 'Plans', text: 'Our pricing plans start at ten dollars per month.' });
  idx.add({ id: 0, url: 'u2', title: 'About', heading: 'Team', text: 'We are a small team building tools.' });
  idx.add({ id: 0, url: 'u3', title: 'Docs', heading: 'Install', text: 'Run npm install to get started.' });

  it('ranks the relevant passage first', () => {
    expect(idx.search('pricing plans', 2)[0].passage.url).toBe('u1');
  });

  it('returns nothing for unknown terms', () => {
    expect(idx.search('zzzz')).toEqual([]);
  });

  it('tokenizes and removes stop words', () => {
    expect(tokenize('The Quick-brown FOX!')).toEqual(['quick', 'brown', 'fox']);
  });

  it('chunks by heading and size', () => {
    const text = '# One\n' + 'alpha '.repeat(300) + '\n# Two\nbeta gamma';
    const chunks = chunkPage({ url: 'u', title: 't', text });
    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks.every((c) => c.text.length <= 1000)).toBe(true);
    expect(chunks.some((c) => c.heading === 'Two' && c.text.includes('beta'))).toBe(true);
  });
});
