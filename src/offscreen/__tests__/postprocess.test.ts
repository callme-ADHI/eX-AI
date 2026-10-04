import { describe, it, expect } from 'vitest';
import {
  dehyphenate,
  joinSoftWrappedLines,
  normaliseLigaturesAndQuotes,
  postprocessText,
  postprocessCode,
  postprocessOCR,
} from '../postprocess';

describe('OCR Postprocessing (postprocess.ts)', () => {
  it('dehyphenates words wrapped across lines', () => {
    const raw = 'The com-\nputer solved the equa-\ntion.';
    expect(dehyphenate(raw)).toBe('The computer solved the equation.');
  });

  it('normalises curly quotes and ligatures', () => {
    const raw = '“The ﬁnal ﬂow is ‘correct’.”';
    expect(normaliseLigaturesAndQuotes(raw)).toBe('"The final flow is \'correct\'."');
  });

  it('joins soft-wrapped lines in paragraphs when continuing sentences', () => {
    const raw = 'This is the first line of a paragraph\nand it continues on the second line.\n\nNext paragraph here.';
    const processed = joinSoftWrappedLines(raw);
    expect(processed).toBe('This is the first line of a paragraph and it continues on the second line.\n\nNext paragraph here.');
  });

  it('preserves line breaks if previous line ends with punctuation', () => {
    const raw = 'First complete sentence.\nSecond complete sentence.';
    const processed = joinSoftWrappedLines(raw);
    expect(processed).toBe('First complete sentence.\nSecond complete sentence.');
  });

  it('leaves code mode indentation, line breaks, and quotes untouched', () => {
    const code = `def solve(n):
    if n <= 1:
        return "base"
    return solve(n - 1) + '!'`;

    const processed = postprocessCode(code);
    expect(processed).toBe(code);
  });

  it('postprocessOCR routes correctly between text and code modes', () => {
    const input = 'func() {\n    return 42;\n}';
    expect(postprocessOCR(input, 'code')).toBe(input);
  });
});
