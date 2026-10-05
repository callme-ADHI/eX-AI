// ─── Label and question text helpers for the autofill detector ───────────────
import { extractElementText } from '../pageText/extract';

export const norm = (s: string | null | undefined): string =>
  (s ?? '').replace(/\s+/g, ' ').trim();

/** djb2 hash — fast, sufficient for change-detection fingerprints. */
export function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

const idsText = (el: Element, ids: string | null): string =>
  (ids ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .map(id => norm(el.ownerDocument.getElementById(id)?.textContent))
    .filter(Boolean)
    .join(' ');

/** Best human label for a control element. */
export function labelTextFor(el: Element): string {
  // 1. aria-labelledby
  const byIds = idsText(el, el.getAttribute('aria-labelledby'));
  if (byIds) return byIds;

  // 2. <label for="id">
  const id = el.getAttribute('id');
  if (id) {
    // compare the attribute directly (no CSS.escape — jsdom does not implement it)
    const lab = Array.from(el.ownerDocument.querySelectorAll('label[for]')).find(
      l => l.getAttribute('for') === id,
    );
    if (lab) {
      const t = norm(extractElementText(lab, false));
      if (t) return t;
    }
  }

  // 3. Wrapping <label>
  const wrap = el.closest('label');
  if (wrap) {
    const t = norm(extractElementText(wrap, false));
    if (t) return t;
  }

  // 4. aria-label / title / placeholder
  const aria =
    norm(el.getAttribute('aria-label')) ||
    norm(el.getAttribute('title')) ||
    norm(el.getAttribute('placeholder'));
  if (aria) return aria;

  // 5. Adjacent text node
  const next = el.nextSibling;
  if (next && next.nodeType === Node.TEXT_NODE && norm(next.nodeValue))
    return norm(next.nodeValue);

  // 6. Next element sibling (if not an interactive element and short)
  const nextEl = el.nextElementSibling;
  if (nextEl && !nextEl.matches('input,select,textarea,button')) {
    const t = norm(extractElementText(nextEl, false));
    if (t.length < 300) return t;
  }

  return '';
}

/** Nearest common ancestor of all elements in the array. */
export function commonAncestor(els: Element[]): Element {
  if (els.length === 1) return els[0].parentElement ?? els[0];
  let node: Element | null = els[0];
  while (node && !els.every(e => node!.contains(e))) node = node.parentElement;
  return node ?? els[0].ownerDocument.body;
}

export interface QOpts { min: number; max: number }

/**
 * Finds the question / problem text for a group of option elements (or a single control).
 * Uses multiple heuristics in priority order:
 *   fieldset > legend, aria-labelledby, text children before first option branch,
 *   previous siblings walk up the DOM.
 */
export function questionTextFor(
  common: Element,
  optionEls: Element[],
  o: QOpts = { min: 8, max: 1500 },
): string {
  const optTexts = new Set(optionEls.map(e => norm(e.textContent)));

  // (a) fieldset > legend
  const fsLegend = common.closest('fieldset')?.querySelector('legend');
  if (fsLegend && norm(fsLegend.textContent).length >= 3)
    return norm(fsLegend.textContent).slice(0, o.max);

  // (b) aria-labelledby on the group wrapper
  const group =
    common.closest('[role=radiogroup],[role=group],[role=listbox]') ?? common;
  const byIds = idsText(group, group.getAttribute('aria-labelledby'));
  if (byIds.length >= 3) return byIds.slice(0, o.max);

  // (c) text children of the common ancestor that come before the first option branch
  const first = optionEls[0];
  const branch = Array.from(common.children).find(c => c === first || c.contains(first));
  const before: string[] = [];
  for (const c of Array.from(common.children)) {
    if (c === branch) break;
    const t = extractElementText(c);
    if (t) before.push(t);
  }
  const q1 = before.join('\n').trim();
  if (q1.length >= Math.min(o.min, 3)) return q1.slice(-o.max);

  // (d) walk up, collecting previous siblings until a heading / question-like element
  let node: Element | null = common;
  for (let d = 0; d < 6 && node; d++, node = node.parentElement) {
    const chunks: string[] = [];
    let total = 0;
    let prev = node.previousElementSibling;
    while (prev && total < o.max) {
      const t = extractElementText(prev);
      if (t && !optTexts.has(t)) {
        chunks.unshift(t);
        total += t.length;
      }
      if (
        /^h[1-6]$/.test(prev.localName) ||
        /question|ques|stem|prompt|title|problem/i.test(
          String((prev as HTMLElement).className ?? ''),
        )
      )
        break;
      prev = prev.previousElementSibling;
    }
    const joined = chunks.join('\n').trim();
    if (joined.length >= o.min) return joined.slice(-o.max);
  }
  return '';
}
