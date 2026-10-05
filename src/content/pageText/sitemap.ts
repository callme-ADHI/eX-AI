import { LIMITS } from '../../shared/constants';
import { cleanUrl, isSameOrigin, isBlockedUrl } from './urls';
import { fetchText } from './fetchPage';

export function parseSitemapXml(xmlText: string, origin: string): { urls: string[]; childSitemaps: string[] } {
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
  const urls: string[] = [];
  const childSitemaps: string[] = [];

  for (const loc of Array.from(doc.querySelectorAll('url > loc'))) {
    const raw = (loc.textContent ?? '').trim();
    const u = cleanUrl(raw, origin);
    if (u && isSameOrigin(u, origin) && !isBlockedUrl(u).blocked) {
      urls.push(u);
    }
  }

  for (const loc of Array.from(doc.querySelectorAll('sitemap > loc'))) {
    const raw = (loc.textContent ?? '').trim();
    const u = cleanUrl(raw, origin);
    if (u && isSameOrigin(u, origin)) {
      childSitemaps.push(u);
    }
  }

  return { urls, childSitemaps };
}

export async function getSitemapUrls(origin: string): Promise<{ ok: boolean; urls: string[]; error?: string }> {
  const initialUrl = `${origin}/sitemap.xml`;
  const r = await fetchText(initialUrl, origin);
  if (!r.ok || !r.text) {
    return { ok: false, urls: [], error: r.error || 'sitemap not found' };
  }

  const { urls, childSitemaps } = parseSitemapXml(r.text, origin);
  const allUrls = new Set<string>(urls);

  for (const childUrl of childSitemaps.slice(0, LIMITS.sitemapMaxChildren)) {
    if (allUrls.size >= LIMITS.sitemapMaxUrls) break;
    const cr = await fetchText(childUrl, origin);
    if (cr.ok && cr.text) {
      const parsed = parseSitemapXml(cr.text, origin);
      for (const u of parsed.urls) {
        allUrls.add(u);
        if (allUrls.size >= LIMITS.sitemapMaxUrls) break;
      }
    }
  }

  return { ok: true, urls: Array.from(allUrls).slice(0, LIMITS.sitemapMaxUrls) };
}
