import { cleanText, truncateMiddle } from './text';
import { displayUrl } from './urls';
import { LIMITS } from '../../shared/constants';
import type { ExtractResult, Scope } from './types';

const SKIP = new Set(['script', 'style', 'noscript', 'template', 'svg', 'canvas', 'head', 'object', 'embed',
  'audio', 'video', 'input', 'textarea', 'select', 'option', 'datalist', 'link', 'meta', 'map']);

const BLOCK = new Set(['address', 'article', 'aside', 'blockquote', 'details', 'dialog', 'dd', 'div', 'dl', 'dt',
  'fieldset', 'figcaption', 'figure', 'footer', 'form', 'header', 'hgroup', 'li', 'main', 'nav', 'ol', 'p',
  'section', 'summary', 'table', 'tr', 'ul', 'caption', 'thead', 'tbody', 'tfoot']);

interface Ctx {
  out: string[]; len: number; live: boolean; skippedFrames: number; visited: number; hostToSkip: Element | null;
}
const push = (ctx: Ctx, s: string) => { ctx.out.push(s); ctx.len += s.length; };

function walk(node: Node, ctx: Ctx): void {
  if (ctx.len >= LIMITS.walkMaxChars || ctx.visited > LIMITS.elementWalkCap) return;

  if (node.nodeType === Node.TEXT_NODE) {
    const t = (node.nodeValue ?? '').replace(/\s+/g, ' ');
    if (t.trim()) push(ctx, t);
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;

  const el = node as HTMLElement;
  ctx.visited++;
  if (el === ctx.hostToSkip) return;                  // never read our own panel
  const name = el.localName;
  if (SKIP.has(name)) return;
  if (el.hasAttribute('hidden')) return;
  if (ctx.live) {
    const cv = (el as any).checkVisibility;           // Chrome 105+: handles display:none, visibility, content-visibility
    if (typeof cv === 'function' && !cv.call(el, { checkVisibilityCSS: true, visibilityProperty: true })) return;
  }

  if (name === 'img') {
    const alt = (el.getAttribute('alt') ?? '').trim();
    if (alt.length > 2 && alt.length < 150) push(ctx, ` [image: ${alt}] `);
    return;
  }
  if (name === 'br' || name === 'hr') { push(ctx, '\n'); return; }

  if (name === 'pre') {                               // keep code verbatim
    const FENCE = '`'.repeat(3);
    push(ctx, `\n${FENCE}\n${(el.textContent ?? '').replace(/\s+$/, '')}\n${FENCE}\n`);
    return;
  }

  if (name === 'iframe' || name === 'frame') {        // same-origin frames only
    if (!ctx.live) return;
    try {
      const d = (el as HTMLIFrameElement).contentDocument;
      if (d?.body) { push(ctx, '\n'); walk(d.body, ctx); push(ctx, '\n'); } else ctx.skippedFrames++;
    } catch { ctx.skippedFrames++; }
    return;
  }

  const heading = /^h[1-6]$/.test(name) ? Number(name[1]) : 0;
  const isBlock = heading > 0 || BLOCK.has(name);
  if (isBlock) push(ctx, '\n');
  if (heading) push(ctx, '#'.repeat(heading) + ' ');
  if (name === 'li') push(ctx, '• ');
  if ((name === 'td' || name === 'th') && el.previousElementSibling) push(ctx, ' | ');

  const sr = el.shadowRoot;                           // open shadow roots only
  if (sr) {
    for (const c of Array.from(sr.childNodes)) walk(c, ctx);
  } else if (name === 'slot') {
    const assigned = (el as HTMLSlotElement).assignedNodes?.({ flatten: true });
    for (const c of assigned && assigned.length ? assigned : Array.from(el.childNodes)) walk(c, ctx);
  } else {
    for (const c of Array.from(el.childNodes)) walk(c, ctx);
  }
  if (isBlock) push(ctx, '\n');
}

function pickMain(doc: Document): Element {
  let best: Element | null = null;
  let bestLen = 0;
  for (const c of Array.from(doc.querySelectorAll('main, article, [role="main"]'))) {
    const l = (c.textContent ?? '').length;
    if (l > bestLen) { best = c; bestLen = l; }
  }
  return best && bestLen >= 500 ? best : (doc.body ?? doc.documentElement);
}

export interface ExtractDocOptions {
  scope: Scope;
  maxChars: number;
  keepQuery: boolean;
  live: boolean;                // true for the real page, false for DOMParser documents
  pageUrl: string;
  ownHost?: Element | null;
}

export function extractFromDocument(doc: Document, o: ExtractDocOptions): ExtractResult {
  const ctx: Ctx = { out: [], len: 0, live: o.live, skippedFrames: 0, visited: 0, hostToSkip: o.ownHost ?? null };
  let source: Scope = o.scope;
  let raw = '';

  if (o.scope === 'selection' && o.live) {
    const sel = doc.defaultView?.getSelection?.()?.toString().trim() ?? '';
    if (sel) raw = sel; else source = 'main';
  }
  if (!raw) {
    const root = source === 'page' ? (doc.body ?? doc.documentElement) : pickMain(doc);
    source = root === doc.body || root === doc.documentElement ? 'page' : 'main';
    walk(root, ctx);
    raw = ctx.out.join('');
  }

  const cleaned = cleanText(raw);
  const t = truncateMiddle(cleaned, Math.min(o.maxChars, LIMITS.pageMaxCharsHard));
  const looksShell = cleaned.length < 200
    && !!doc.querySelector('#root, #app, #__next, #__nuxt, [data-reactroot]')
    && doc.querySelectorAll('script').length > 3;

  return {
    title: (doc.title || '').trim(),
    url: displayUrl(o.pageUrl, o.keepQuery),
    text: t.text, chars: t.text.length, truncated: t.truncated, omittedChars: t.omitted,
    skippedFrames: ctx.skippedFrames, source, rendered: !looksShell,
  };
}
