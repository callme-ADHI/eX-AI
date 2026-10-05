import { LIMITS } from '../../shared/constants';
import { extractFromDocument } from './extract';
import { buildLinksBlock, collectLinks } from './links';
import { getRegistry, isBlockedUrl, isSameOrigin, urlKey } from './urls';
import type { ExtractResult, LinkInfo } from './types';

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
let nextSlot = 0;
async function politeWait(): Promise<void> {
  const now = Date.now();
  const at = Math.max(now, nextSlot);
  nextSlot = at + LIMITS.minGapMs;
  if (at > now) await sleep(at - now);
}

export interface Fetched { finalUrl: string; status: number; contentType: string; body: string }

/** Same-origin GET with timeout, size cap, content-type allowlist and one retry on 429/503. */
export async function fetchText(
  url: string,
  signal: AbortSignal,
  accept: RegExp = /^(text\/html|application\/xhtml\+xml|text\/plain|application\/xml|text\/xml)/i
): Promise<Fetched> {
  if (!isSameOrigin(url, location.origin)) throw new Error('cross-origin fetch refused');
  for (let attempt = 0; attempt < 2; attempt++) {
    await politeWait();
    const ctl = new AbortController();
    const onAbort = () => ctl.abort();
    signal.addEventListener('abort', onAbort, { once: true });
    const timer = setTimeout(() => ctl.abort(), LIMITS.fetchTimeoutMs);
    try {
      const res = await fetch(url, {
        method: 'GET',
        credentials: 'same-origin',
        redirect: 'follow',
        cache: 'no-store',
        signal: ctl.signal,
      });
      if ((res.status === 429 || res.status === 503) && attempt === 0) {
        const ra = Number(res.headers.get('retry-after'));
        await sleep(Math.min(10_000, Number.isFinite(ra) && ra > 0 ? ra * 1000 : 3000));
        continue;
      }
      const finalUrl = res.url || url;
      if (!isSameOrigin(finalUrl, location.origin)) throw new Error('redirected to another site');
      if (isBlockedUrl(finalUrl).blocked && urlKey(finalUrl) !== urlKey(url)) {
        throw new Error('redirected to a blocked URL');
      }
      const contentType = res.headers.get('content-type') ?? '';
      if (res.ok && !accept.test(contentType)) {
        throw new Error(`unsupported content type: ${contentType || 'unknown'}`);
      }
      const reader = res.body?.getReader();
      let received = 0;
      const chunks: Uint8Array[] = [];
      if (reader) {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          received += value.byteLength;
          if (received > LIMITS.fetchMaxBytes) {
            ctl.abort();
            break;
          }
          chunks.push(value);
        }
      }
      const buf = new Uint8Array(chunks.reduce((n, c) => n + c.byteLength, 0));
      let off = 0;
      for (const c of chunks) {
        buf.set(c, off);
        off += c.byteLength;
      }
      const charset = /charset=([\w-]+)/i.exec(contentType)?.[1] ?? 'utf-8';
      let body: string;
      try {
        body = new TextDecoder(charset).decode(buf);
      } catch {
        body = new TextDecoder('utf-8').decode(buf);
      }
      return { finalUrl, status: res.status, contentType, body };
    } finally {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
    }
  }
  throw new Error('server is rate limiting requests');
}

export interface FetchedPage {
  ok: true;
  url: string;
  status: number;
  page: ExtractResult;
  links: LinkInfo[];
  linksText: string;
}
export interface FetchFailure {
  ok: false;
  reason: string;
}

/** Fetch an HTML page, parse it with DOMParser (scripts never run), extract text and links. */
export async function fetchAndExtract(
  url: string,
  signal: AbortSignal,
  maxChars: number
): Promise<FetchedPage | FetchFailure> {
  let f: Fetched;
  try {
    f = await fetchText(url, signal);
  } catch (e: any) {
    return {
      ok: false,
      reason: e?.name === 'AbortError' ? 'timed out or cancelled' : String(e?.message ?? e),
    };
  }
  if (f.status >= 400) return { ok: false, reason: `HTTP ${f.status}` };
  const doc = new DOMParser().parseFromString(f.body, 'text/html');
  for (const n of Array.from(doc.querySelectorAll('script, style, noscript, template'))) {
    n.remove();
  }
  const page = extractFromDocument(doc, {
    scope: 'main',
    maxChars,
    keepQuery: true,
    live: false,
    pageUrl: f.finalUrl,
  });
  const { links, contacts } = collectLinks(doc, f.finalUrl, location.origin);
  getRegistry().add(f.finalUrl);
  const internal = links.filter((l) => l.scope === 'internal');
  const lb = buildLinksBlock(internal, contacts, { limit: 60, maxChars: 4000 });
  return { ok: true, url: f.finalUrl, status: f.status, page, links, linksText: lb.text };
}
