import { describe, it, expect } from 'vitest';
import { extractCodeBlocks, parseAnswerLine, mapTokenToOptionId } from '../src/content/autofill/fromChat';

const F = '`'.repeat(3);

describe('fromChat', () => {
  it('extracts code blocks', () => {
    const md = `text\n${F}python\nprint(1)\n${F}\nmore\n${F}\nplain\n${F}`;
    expect(extractCodeBlocks(md)).toEqual([
      { lang: 'python', code: 'print(1)\n' },
      { lang: '', code: 'plain\n' },
    ]);
  });

  it('parses answer lines', () => {
    expect(parseAnswerLine('Steps...\nAnswer: B')?.tokens).toEqual(['B']);
    expect(parseAnswerLine('**Answer:** (c)')?.tokens).toEqual(['C']);
    expect(parseAnswerLine('Answer: B and D')?.tokens).toEqual(['B', 'D']);
    expect(parseAnswerLine('no answer here')).toBeNull();
  });

  it('maps tokens to option ids by prefix, then by position', () => {
    const f: any = {
      info: {
        options: [
          { id: 'o1', label: 'A. 3' },
          { id: 'o2', label: 'B. 4' },
        ],
      },
    };
    expect(mapTokenToOptionId(f, 'B')).toBe('o2');

    const g: any = {
      info: {
        options: [
          { id: 'o1', label: '3' },
          { id: 'o2', label: '4' },
        ],
      },
    };
    expect(mapTokenToOptionId(g, 'B')).toBe('o2');
    expect(mapTokenToOptionId(g, '1')).toBe('o1');
  });
});
