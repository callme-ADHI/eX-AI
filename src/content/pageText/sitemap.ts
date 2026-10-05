import { LIMITS } from '../../shared/constants';
import { cleanUrl, getRegistry, isSameOrigin } from './urls';
import { fetchText } from './fetchPage';

export function parseSitemapXml(xml: string): { urls: string[]; children: string[] } {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  if (doc.querySelector('parsererror')) return { urls: [], children: [] };
  const locs = Array.from(doc.getElementsByTagName('loc')).map(n => (n.textContent ?? '').trim()).filter(Boolean);
  return doc.documentElement.localName === 'sitemapindex' ? { urls: [], children: locs } : { urls: locs, children: [] };
}

export async function getSitemapUrls(signal: AbortSignal): Promise<string[]> {
  const origin = location.origin;
  const registry = getRegistry();
  let sitemapUrls: string[] = [];
  try {
    const robots = await fetchText(`${origin}/robots.txt`, signal, /^text\//i);
    sitemapUrls = Array.from(robots.body.matchAll(/^\s*sitemap:\s*(\S+)/gim)).map(m => m[1]).filter(u => isSameOrigin(u, origin));
  } catch { /* no robots.txt */ }
  if (!sitemapUrls.length) sitemapUrls = [`${origin}/sitemap.xml`];

  const out: string[] = [];
  const queue = sitemapUrls.slice(0, LIMITS.sitemapMaxChildren);
  let fetched = 0;
  while (queue.length && fetched < LIMITS.sitemapMaxChildren * 2 && out.length < LIMITS.sitemapMaxUrls) {
    const u = queue.shift()!;
    fetched++;
    try {
      const r = await fetchText(u, signal, /xml|text\//i);
      if (r.status >= 400) continue;
      const { urls, children } = parseSitemapXml(r.body);
      for (const c of children) if (isSameOrigin(c, origin) && queue.length < LIMITS.sitemapMaxChildren) queue.push(c);
      for (const loc of urls) {
        const cu = cleanUrl(loc, origin);
        if (cu && isSameOrigin(cu, origin)) { out.push(cu); if (out.length >= LIMITS.sitemapMaxUrls) break; }
      }
    } catch { /* skip */ }
  }
  for (const u of out) registry.add(u);
  return out;
}
