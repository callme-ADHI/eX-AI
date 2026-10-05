import { LIMITS } from '../../shared/constants';
import type { ActivityItem } from './types';
import { extractFromDocument } from './extract';
import { buildStructure } from './structure';
import { collectLinks, formatLinkLine, rankLinks } from './links';
import { fetchAndExtract } from './fetchPage';
import { getSitemapUrls } from './sitemap';
import { getRegistry, isBlockedUrl, isSameOrigin, isSensitiveUrl, redactUrl, urlKey } from './urls';
import { searchIndex } from './siteIndex';

export interface ToolEnv {
  signal: AbortSignal;
  settings: { pageContextMaxChars: number };
  overrides: Set<string>;                              // urlKeys the user approved with "Fetch anyway"
  confirm: (message: string) => Promise<boolean>;      // ConsentBar-style prompt
  onActivity: (a: ActivityItem) => void;
  ownHost: Element | null;
}
export interface ToolResult { ok: boolean; content: string }

const fail = (content: string): ToolResult => ({ ok: false, content });
const pathOf = (u: string) => { try { const x = new URL(u); return x.pathname + x.search; } catch { return u; } };

export async function executeTool(name: string, args: Record<string, unknown>, env: ToolEnv): Promise<ToolResult> {
  const id = crypto.randomUUID();
  const act = (label: string, state: ActivityItem['state'], url?: string) => env.onActivity({ id, label, state, url });
  try {
    switch (name) {
      case 'get_page_structure': {
        act('Reading page structure', 'running');
        const c = buildStructure(document, location.href);
        act('Read page structure', 'done');
        return { ok: true, content: c || '(no structure found)' };
      }
      case 'get_page_text': {
        act('Reading page text', 'running');
        const scope = (['main', 'page', 'selection'] as const).find(s => s === args.scope) ?? 'main';
        const p = extractFromDocument(document, { scope, maxChars: LIMITS.toolResultMaxChars, keepQuery: false, live: true, pageUrl: location.href, ownHost: env.ownHost });
        act('Read page text', 'done');
        return { ok: true, content: `Title: ${p.title}\nURL: ${p.url}\nScope: ${p.source}${p.truncated ? '\nNote: truncated' : ''}\n\n${p.text}` };
      }
      case 'get_page_links': {
        act('Listing page links', 'running');
        const { links } = collectLinks(document, location.href, location.origin);
        const f = typeof args.filter === 'string' ? args.filter.toLowerCase() : '';
        const limit = Math.min(200, Math.max(1, Number(args.limit) || 100));
        const rows = rankLinks(links).filter(l =>
          (!f || l.text.toLowerCase().includes(f) || l.url.toLowerCase().includes(f)) &&
          (!args.scope || l.scope === args.scope) && (!args.region || l.region === args.region)).slice(0, limit);
        act(`Listed ${rows.length} links`, 'done');
        return { ok: true, content: rows.map(formatLinkLine).join('\n') || '(no matching links)' };
      }
      case 'get_sitemap': {
        act('Reading sitemap', 'running');
        const urls = await getSitemapUrls(env.signal);
        act(`Sitemap: ${urls.length} URLs`, urls.length ? 'done' : 'error');
        if (!urls.length) return fail('No sitemap found for this site.');
        const reg = getRegistry();
        return { ok: true, content: urls.map(u => `${reg.idOf(u)} ${redactUrl(u)}`).join('\n') };
      }
      case 'search_site': {
        const q = String(args.query ?? '').trim();
        if (!q) return fail('Missing query.');
        const hits = await searchIndex(location.origin, q, Math.min(8, Number(args.k) || 5));
        act(`Searched site index for "${q.slice(0, 40)}"`, hits.length ? 'done' : 'error');
        if (!hits.length) return fail('No indexed passages matched, or the site has not been indexed. The user can click "Index this site".');
        return { ok: true, content: hits.map(h => `[${h.passage.title}${h.passage.heading ? ' › ' + h.passage.heading : ''}] ${redactUrl(h.passage.url)}\n${h.passage.text}`).join('\n\n') };
      }
      case 'fetch_page': {
        const url = getRegistry().resolve(args as any, location.href);
        if (!url) {
          act('Rejected fetch (unknown link)', 'error');
          return fail('Rejected: this is not a link id/URL that was collected from this site. Call get_page_links or get_sitemap and pass a link_id from the result.');
        }
        if (!isSameOrigin(url, location.origin)) { act('Rejected external link', 'error', url); return fail('Only pages of the same website can be fetched.'); }
        const key = urlKey(url);
        const blocked = isBlockedUrl(url);
        if (blocked.blocked && !env.overrides.has(key)) {
          act(`Blocked ${pathOf(url)}`, 'blocked', url);
          return fail(`Blocked for safety (${blocked.reason}). The user can approve this URL manually; tell them it was blocked and continue with what you have.`);
        }
        if (isSensitiveUrl(url) && !env.overrides.has(key)) {
          const ok = await env.confirm(`Let the AI read this account-type page using your logged-in session?\n${pathOf(url)}`);
          if (!ok) { act(`Declined ${pathOf(url)}`, 'blocked', url); return fail('The user declined to share this account-type page.'); }
        }
        act(`Fetching ${pathOf(url)}`, 'running', url);
        const r = await fetchAndExtract(url, env.signal, LIMITS.toolResultMaxChars);
        if (!r.ok) { act(`Failed ${pathOf(url)}: ${r.reason}`, 'error', url); return fail(`Fetch failed: ${r.reason}`); }
        act(`Fetched ${pathOf(r.url)}`, 'done', r.url);
        if (!r.page.rendered) {
          return { ok: true, content: `URL: ${r.url}\nThis page is built with JavaScript and cannot be read by fetching (no readable text). Ask the user to open it and use the Page chip.` };
        }
        return { ok: true, content:
          `URL: ${redactUrl(r.url)}\nTitle: ${r.page.title}\nStatus: ${r.status}${r.page.truncated ? '\nNote: text truncated' : ''}\n\n${r.page.text}\n\nLinks on that page:\n${r.linksText}` };
      }
      default:
        return fail(`Unknown tool: ${name}`);
    }
  } catch (e: any) {
    act(`${name} failed`, 'error');
    return fail(`Tool error: ${String(e?.message ?? e).slice(0, 200)}`);
  }
}
