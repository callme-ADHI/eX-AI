// ─── Extract Fillable Proposals from Chat Messages ───────────────────────────
import type { FieldHandle } from './types';

const FENCE = '`'.repeat(3);

export function extractCodeBlocks(md: string): { lang: string; code: string }[] {
  const re = new RegExp(`${FENCE}([\\w+#.-]*)\\n([\\s\\S]*?)${FENCE}`, 'g');
  const out: { lang: string; code: string }[] = [];
  for (const m of md.matchAll(re)) {
    out.push({
      lang: (m[1] || '').toLowerCase(),
      code: m[2].replace(/\s+$/, '') + '\n',
    });
  }
  return out;
}

/** Parses lines such as "Answer: B", "**Answer:** (c)", "Answer: B and D", "Answer: 2". */
export function parseAnswerLine(md: string): { tokens: string[] } | null {
  const m =
    /^\s*(?:[*_`>#-]*\s*)?answer(?:s)?\s*[*_`]*\s*[:\-–]\s*[*_`]*\s*(.+?)\s*$/im.exec(
      md,
    );
  if (!m) return null;
  const rest = m[1].replace(/[*_`]/g, '');
  const tokens = Array.from(
    rest.matchAll(/\b(?:option\s*)?\(?([A-Da-d]|[1-4])\)?\b/g),
  ).map(t => t[1].toUpperCase());
  return tokens.length ? { tokens: Array.from(new Set(tokens)) } : null;
}

/** Maps "B" / "2" to an option id: by explicit label prefix ("B." / "(b)" / "2)") first, else by position. */
export function mapTokenToOptionId(field: FieldHandle, token: string): string | null {
  const t = token.toUpperCase();
  const byPrefix = field.info.options.find(o =>
    new RegExp(`^[\\(\\[]?${t}[\\)\\].:]\\s*`, 'i').test(o.label),
  );
  if (byPrefix) return byPrefix.id;
  const idx = /[A-D]/.test(t) ? t.charCodeAt(0) - 65 : Number(t) - 1;
  return field.info.options[idx]?.id ?? null;
}
