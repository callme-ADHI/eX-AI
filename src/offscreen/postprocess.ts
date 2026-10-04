// ─── OCR Postprocessing (Text & Code Modes) ───────────────────────────────────

import type { OCRMode } from '../shared/aiTypes';

/**
 * Normalises common ligatures and curly quotes for clean plain-text math and prose.
 */
export function normaliseLigaturesAndQuotes(text: string): string {
  return text
    .replace(/ﬁ/g, 'fi')
    .replace(/ﬂ/g, 'fl')
    .replace(/ﬀ/g, 'ff')
    .replace(/ﬃ/g, 'ffi')
    .replace(/ﬄ/g, 'ffl')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'");
}

/**
 * De-hyphenates words broken across line wraps (e.g. "com-\nputer" -> "computer").
 */
export function dehyphenate(text: string): string {
  return text.replace(/(\w+)-\n(\w+)/g, '$1$2');
}

/**
 * Joins soft-wrapped lines within a paragraph:
 * A line break becomes a space when the previous line does not end in . ? ! : ;
 * and the next line starts with a lower-case letter or digit.
 * Blank lines between paragraphs are preserved.
 */
export function joinSoftWrappedLines(text: string): string {
  const paragraphs = text.split(/\n\s*\n/);

  const processedParagraphs = paragraphs.map((para) => {
    const lines = para.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length <= 1) return lines.join('');

    let result = lines[0];
    for (let i = 1; i < lines.length; i++) {
      const prev = result;
      const curr = lines[i];

      const prevEndsPunctuation = /[.?!:;]$/.test(prev);
      const currStartsLowerOrDigit = /^[a-z0-9]/.test(curr);

      if (!prevEndsPunctuation && currStartsLowerOrDigit) {
        result += ' ' + curr;
      } else {
        result += '\n' + curr;
      }
    }
    return result;
  });

  return processedParagraphs.join('\n\n');
}

/**
 * Clean up text mode:
 * 1. De-hyphenate -\n
 * 2. Join soft-wrapped lines
 * 3. Normalise ligatures and curly quotes
 * 4. Collapse repeated horizontal spaces, trim trailing spaces
 */
export function postprocessText(raw: string): string {
  let text = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  text = dehyphenate(text);
  text = joinSoftWrappedLines(text);
  text = normaliseLigaturesAndQuotes(text);

  // Collapse repeated spaces on each line while keeping indentation minimal
  const lines = text.split('\n').map((l) => l.replace(/[ \t]+/g, ' ').trim());
  return lines.join('\n').trim();
}

/**
 * Clean up code mode:
 * - Keeps indentation exactly as recognised
 * - Does not join lines
 * - Does not normalise quotes
 * - Trims trailing whitespace
 */
export function postprocessCode(raw: string): string {
  const text = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = text.split('\n').map((l) => l.replace(/[ \t]+$/, ''));
  return lines.join('\n').trim();
}

/**
 * Master postprocessing entry point
 */
export function postprocessOCR(raw: string, mode: OCRMode): string {
  if (mode === 'code') {
    return postprocessCode(raw);
  }
  return postprocessText(raw);
}
