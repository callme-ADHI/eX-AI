import { LIMITS, STORAGE_KEYS } from '../../shared/constants';
import { Bm25Index, chunkPage, type StoredPage, type Passage } from './bm25';
import { fetchAndExtract } from './fetchPage';
import { getSitemapUrls } from './sitemap';
import { getRegistry, isBlockedUrl, isSameOrigin, isSensitiveUrl, urlKey } from './urls';

export interface IndexState {
  origin: string;
  builtAt: number;
  pages: StoredPage[];
  skipped: number;
  jsOnly: number;
}

export interface Progress {
  done: number;
  queued: number;
  skipped: number;
  jsOnly: number;
  current?: string;
}

export interface PassageHit {
  passage: Passage;
  score: number;
}

const key = (origin: string) => STORAGE_KEYS.siteIndexPrefix + origin;
const cache = new Map<string, Bm25Index>(); // built lazily from stored pages

export async function saveIndex(s: IndexState): Promise<void> {
  try {
    await chrome.storage.session.set({ [key(s.origin)]: s });
  } catch {
    // quota: halve each page and retry once
    const smaller = {
      ...s,
      pages: s.pages.map((p) => ({ ...p, text: p.text.slice(0, Math.floor(p.text.length / 2)) })),
    };
    await chrome.storage.session.set({ [key(s.origin)]: smaller });
  }
  cache.delete(s.origin);
}

export async function loadIndex(origin: string): Promise<IndexState | undefined> {
  try {
    const r = await chrome.storage.session.get(key(origin));
    return r[key(origin)] as IndexState | undefined;
  } catch {
    return undefined;
  }
}

export async function clearIndex(origin: string): Promise<void> {
  try {
    await chrome.storage.session.remove(key(origin));
  } catch {}
  cache.delete(origin);
}

async function getBm25(origin: string): Promise<Bm25Index | null> {
  if (cache.has(origin)) return cache.get(origin)!;
  const st = await loadIndex(origin);
  if (!st?.pages.length) return null;
  const idx = new Bm25Index();
  for (const pg of st.pages) {
    for (const p of chunkPage(pg)) {
      idx.add(p);
    }
  }
  cache.set(origin, idx);
  return idx;
}

export async function searchIndex(origin: string, query: string, k: number): Promise<PassageHit[]> {
  if (!query.trim()) return [];
  const idx = await getBm25(origin);
  return idx ? idx.search(query, k) : [];
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function crawlSite(o: {
  startUrl: string;
  maxPages: number;
  maxDepth: number;
  delayMs: number;
  signal: AbortSignal;
  onProgress: (p: Progress) => void;
}): Promise<IndexState> {
  const origin = location.origin;
  const registry = getRegistry();
  const maxPages = Math.min(o.maxPages, LIMITS.crawlMaxPagesHard);
  const visited = new Set<string>();
  const queue: { url: string; depth: number }[] = [];
  const pages: StoredPage[] = [];
  let skipped = 0;
  let jsOnly = 0;
  let claimed = 0;
  let active = 0;

  const enqueue = (url: string, depth: number) => {
    let k: string;
    try {
      k = urlKey(url);
    } catch {
      return;
    }
    if (visited.has(k) || !isSameOrigin(url, origin)) return;
    if (isBlockedUrl(url).blocked || isSensitiveUrl(url)) {
      visited.add(k);
      skipped++;
      return;
    } // never overridden in a crawl
    visited.add(k);
    registry.add(url);
    queue.push({ url, depth });
  };

  enqueue(o.startUrl, 0);
  try {
    for (const u of await getSitemapUrls(o.signal)) {
      if (queue.length + pages.length >= maxPages * 2) break;
      enqueue(u, 1);
    }
  } catch {
    /* no sitemap */
  }

  const worker = async () => {
    while (!o.signal.aborted) {
      if (claimed >= maxPages) return;
      const item = queue.shift();
      if (!item) {
        if (active === 0) return;
        await sleep(50);
        continue;
      }
      claimed++;
      active++;
      try {
        o.onProgress({ done: pages.length, queued: queue.length, skipped, jsOnly, current: item.url });
        const r = await fetchAndExtract(item.url, o.signal, LIMITS.storedPageMaxChars);
        if (!r.ok) {
          skipped++;
        } else if (!r.page.rendered) {
          jsOnly++;
        } else {
          pages.push({ url: r.url, title: r.page.title, text: r.page.text.slice(0, LIMITS.storedPageMaxChars) });
          if (item.depth < o.maxDepth) {
            const next = r.links.filter((l) => l.scope === 'internal').slice(0, LIMITS.crawlLinksPerPage);
            for (const l of next) enqueue(l.url, item.depth + 1);
          }
        }
      } finally {
        active--;
      }
      await sleep(o.delayMs);
    }
  };
  await Promise.all(Array.from({ length: LIMITS.crawlConcurrency }, worker));

  const state: IndexState = { origin, builtAt: Date.now(), pages, skipped, jsOnly };
  if (pages.length) await saveIndex(state);
  o.onProgress({ done: pages.length, queued: 0, skipped, jsOnly });
  return state;
}
