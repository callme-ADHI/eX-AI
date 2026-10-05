import { LIMITS } from '../../shared/constants';
import { isSameOrigin, isBlockedUrl } from './urls';
import { extractFromDocument } from './extract';
import { collectLinks, buildLinksBlock } from './links';
import { buildStructure } from './structure';
import type { ExtractResult } from './types';

let lastFetchTime = 0;

export async function fetchText(
  url: string,
  origin: string
): Promise<{ ok: boolean; text?: string; finalUrl?: string; error?: string }> {
  if (!isSameOrigin(url, origin)) return { ok: false, error: 'cross-origin fetch is not allowed' };
  const check = isBlockedUrl(url);
  if (check.blocked) return { ok: false, error: `URL blocked: ${check.reason}` };

  const now = Date.now();
  const wait = Math.max(0, LIMITS.minGapMs - (now - lastFetchTime));
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastFetchTime = Date.now();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LIMITS.fetchTimeoutMs);

  try {
    const res = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      signal: controller.signal,
      headers: { Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9' },
    });
    clearTimeout(timer);

    if (!isSameOrigin(res.url, origin)) return { ok: false, error: 'redirected to a different origin' };
    const checkRedirect = isBlockedUrl(res.url);
    if (checkRedirect.blocked) return { ok: false, error: `redirected to blocked URL: ${checkRedirect.reason}` };

    const ct = res.headers.get('content-type') || '';
    if (!/(text\/html|application\/xhtml\+xml|text\/plain)/i.test(ct)) {
      return { ok: false, error: `unsupported content-type: ${ct}` };
    }

    if (!res.body) return { ok: false, error: 'empty response body' };

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let totalBytes = 0;
    let text = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > LIMITS.fetchMaxBytes) {
        controller.abort();
        return { ok: false, error: `response exceeded size cap (${LIMITS.fetchMaxBytes} bytes)` };
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();

    return { ok: true, text, finalUrl: res.url };
  } catch (e: any) {
    clearTimeout(timer);
    return { ok: false, error: e.name === 'AbortError' ? 'request timed out' : e.message || 'fetch failed' };
  }
}

export async function fetchAndExtract(
  url: string,
  origin: string,
  maxChars = 20_000
): Promise<{
  ok: boolean;
  page?: ExtractResult;
  structure?: string;
  linksText?: string;
  totalLinks?: number;
  error?: string;
}> {
  const r = await fetchText(url, origin);
  if (!r.ok || !r.text) return { ok: false, error: r.error };

  const doc = new DOMParser().parseFromString(r.text, 'text/html');
  const page = extractFromDocument(doc, {
    scope: 'main',
    maxChars,
    keepQuery: false,
    live: false,
    pageUrl: r.finalUrl || url,
  });
  const structure = buildStructure(doc, r.finalUrl || url);
  const { links, contacts } = collectLinks(doc, r.finalUrl || url, origin);
  const linksBlock = buildLinksBlock(links, contacts, { limit: 50, maxChars: 4000 });

  return {
    ok: true,
    page,
    structure,
    linksText: linksBlock.text,
    totalLinks: links.length,
  };
}
