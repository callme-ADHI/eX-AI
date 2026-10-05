import { LIMITS } from '../../shared/constants';
import { cleanUrl, getRegistry, urlKey, redactUrl, isSameOrigin } from './urls';
import type { Contacts, LinkInfo, Region } from './types';

export function queryAllDeep(root: ParentNode, selector: string, out: Element[] = []): Element[] {
  out.push(...Array.from(root.querySelectorAll(selector)));
  for (const el of Array.from(root.querySelectorAll('*'))) {
    const sr = (el as HTMLElement).shadowRoot;
    if (sr) queryAllDeep(sr, selector, out);
  }
  return out;
}

function regionOf(a: Element): Region {
  if (a.closest('nav, [role="navigation"]')) return 'nav';
  if (a.closest('footer, [role="contentinfo"]')) return 'footer';
  if (a.closest('aside, [role="complementary"]')) return 'aside';
  if (a.closest('header, [role="banner"]')) return 'header';
  if (a.closest('main, [role="main"], article')) return 'main';
  return 'other';
}

function anchorText(a: Element): string {
  const t = (a.textContent ?? '').replace(/\s+/g, ' ').trim();
  if (t) return t;
  const al = a.getAttribute('aria-label')?.trim(); if (al) return al;
  const ti = a.getAttribute('title')?.trim(); if (ti) return ti;
  const alt = a.querySelector('img[alt]')?.getAttribute('alt')?.trim(); if (alt) return alt;
  return '';
}

export function effectiveBase(doc: Document, pageUrl: string): string {
  const b = doc.querySelector('base[href]');
  if (b) { try { return new URL(b.getAttribute('href')!, pageUrl).toString(); } catch { /* ignore */ } }
  return pageUrl;
}

const REGION_RANK: Record<Region, number> = { main: 0, nav: 1, header: 2, aside: 3, other: 4, footer: 5 };

/**
 * IMPORTANT: use a.getAttribute('href'), NOT a.href. In a DOMParser document, a.href resolves
 * against the CURRENT page, not against the fetched page. We resolve against pageUrl ourselves.
 */
export function collectLinks(doc: Document, pageUrl: string, pageOrigin: string):
  { links: LinkInfo[]; contacts: Contacts } {
  const registry = getRegistry();
  const base = effectiveBase(doc, pageUrl);
  const self = (() => { try { return urlKey(pageUrl); } catch { return ''; } })();
  const seen = new Map<string, LinkInfo>();
  const mailto = new Set<string>();
  const tel = new Set<string>();

  for (const a of queryAllDeep(doc, 'a[href]')) {
    const href = (a.getAttribute('href') ?? '').trim();
    if (!href || href.startsWith('#')) continue;
    const lower = href.toLowerCase();
    if (lower.startsWith('mailto:')) { mailto.add(href.slice(7).split('?')[0]); continue; }
    if (lower.startsWith('tel:')) { tel.add(href.slice(4)); continue; }
    if (/^(javascript|data|blob|file|about):/i.test(href)) continue;

    const url = cleanUrl(href, base);
    if (!url) continue;
    let key: string;
    try { key = urlKey(url); } catch { continue; }
    if (key === self) continue;

    const text = anchorText(a);
    const region = regionOf(a);
    const prev = seen.get(key);
    if (prev) {
      if (!prev.text && text) prev.text = text;
      if (REGION_RANK[region] < REGION_RANK[prev.region]) prev.region = region;
      continue;
    }
    const id = registry.add(url);
    if (!id) continue;
    const u = new URL(url);
    seen.set(key, {
      id, text, url, region, host: u.host,
      scope: isSameOrigin(url, pageOrigin) ? 'internal' : 'external',
    });
  }
  return {
    links: Array.from(seen.values()),
    contacts: { mailto: Array.from(mailto), tel: Array.from(tel) },
  };
}

/** internal before external, then region priority. Stable. */
export function rankLinks(links: LinkInfo[]): LinkInfo[] {
  return [...links].sort((a, b) =>
    (a.scope === b.scope ? 0 : a.scope === 'internal' ? -1 : 1) || REGION_RANK[a.region] - REGION_RANK[b.region]);
}

export function formatLinkLine(l: LinkInfo): string {
  const tag = l.scope === 'internal' ? `${l.region}|internal` : `${l.region}|external:${l.host}`;
  const text = l.text.length > LIMITS.linkTextMax ? l.text.slice(0, LIMITS.linkTextMax - 1) + '…' : l.text;
  return `${l.id} [${tag}] ${text || '(no text)'} → ${redactUrl(l.url)}`;
}

export function buildLinksBlock(links: LinkInfo[], contacts: Contacts,
  opts: { limit: number; maxChars: number }): { text: string; shown: number; total: number } {
  const lines: string[] = [];
  let used = 0;
  let shown = 0;
  for (const l of rankLinks(links).slice(0, opts.limit)) {
    const line = formatLinkLine(l);
    if (used + line.length + 1 > opts.maxChars) break;
    lines.push(line); used += line.length + 1; shown++;
  }
  if (contacts.mailto.length) lines.push(`contacts-email: ${contacts.mailto.slice(0, 10).join(', ')}`);
  if (contacts.tel.length) lines.push(`contacts-phone: ${contacts.tel.slice(0, 10).join(', ')}`);
  return { text: lines.join('\n'), shown, total: links.length };
}
