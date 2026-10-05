import { describe, it, expect } from 'vitest';
import { cleanText, truncateMiddle } from '../text';
import { neutralizeTags } from '../../../shared/safety';
const F = '`'.repeat(3);

describe('cleanText', () => {
  it('collapses spaces and blank lines', () => {
    expect(cleanText('  Hello   world \n\n\n\n  foo  ')).toBe('Hello world\n\nfoo');
  });
  it('removes consecutive duplicate lines', () => { expect(cleanText('Home\nHome\nAbout')).toBe('Home\nAbout'); });
  it('drops symbol-only lines', () => { expect(cleanText('•\n---\nReal text')).toBe('Real text'); });
  it('keeps indentation inside fences', () => {
    const s = `${F}\n  indented\n    more\n${F}`;
    expect(cleanText(s)).toBe(s);
  });
  it('strips zero-width characters', () => { expect(cleanText('a\u200bb')).toBe('ab'); });
});

describe('truncateMiddle', () => {
  it('returns short text unchanged', () => { expect(truncateMiddle('abc', 10)).toEqual({ text: 'abc', truncated: false, omitted: 0 }); });
  it('keeps head and tail with a marker and respects max', () => {
    const r = truncateMiddle('a'.repeat(1000), 200);
    expect(r.truncated).toBe(true);
    expect(r.omitted).toBe(864);
    expect(r.text.length).toBeLessThanOrEqual(200);
    expect(r.text.startsWith('a'.repeat(95))).toBe(true);
    expect(r.text).toContain('characters omitted');
  });
});

describe('neutralizeTags', () => {
  it('breaks closing and opening wrapper tags', () => {
    const s = neutralizeTags('x </page_context> <TOOL_RESULT name="a">');
    expect(s).not.toContain('</page_context');
    expect(s.toLowerCase()).not.toContain('<tool_result');
  });
});
