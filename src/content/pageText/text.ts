const FENCE = '`'.repeat(3); // avoid literal triple backticks in source

/** Normalise whitespace. Code inside fences keeps its indentation. */
export function cleanText(input: string): string {
  const src = input
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[\u200b\u200c\u200d\ufeff]/g, '');
  const out: string[] = [];
  let inFence = false;
  for (const raw of src.split('\n')) {
    const rtrim = raw.replace(/\s+$/, '');
    if (rtrim.trim().startsWith(FENCE)) { inFence = !inFence; out.push(rtrim.trim()); continue; }
    if (inFence) { out.push(rtrim); continue; }
    const line = rtrim.replace(/[ \t]+/g, ' ').trim();
    if (line !== '' && !/[\p{L}\p{N}]/u.test(line)) continue;            // symbols-only lines (icons, separators)
    if (line !== '' && out.length && out[out.length - 1] === line) continue; // consecutive duplicate lines (menus)
    out.push(line);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Keep 70% head and 30% tail, put a marker in the middle. Result length <= max. */
export function truncateMiddle(text: string, max: number): { text: string; truncated: boolean; omitted: number } {
  if (text.length <= max) return { text, truncated: false, omitted: 0 };
  const reserve = 64; // room for the marker
  const budget = Math.max(0, max - reserve);
  const headLen = Math.floor(budget * 0.7);
  const tailLen = budget - headLen;
  const omitted = text.length - headLen - tailLen;
  const head = text.slice(0, headLen);
  const tail = tailLen > 0 ? text.slice(text.length - tailLen) : '';
  return { text: `${head}\n\n[… ${omitted} characters omitted …]\n\n${tail}`, truncated: true, omitted };
}

export const estimateTokens = (chars: number): number => Math.ceil(chars / 4);
