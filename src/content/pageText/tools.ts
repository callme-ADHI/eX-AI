import { LIMITS } from '../../shared/constants';
import { wrapToolResult } from '../../shared/safety';
import { buildStructure } from './structure';
import { collectLinks, buildLinksBlock } from './links';
import { extractFromDocument } from './extract';
import { getRegistry, isSensitiveUrl } from './urls';
import { getSitemapUrls } from './sitemap';
import { fetchAndExtract } from './fetchPage';
import { searchIndex } from './siteIndex';
import type { Scope, Region } from './types';

export interface ToolExecutionResult {
  ok: boolean;
  content: string;
  activityLabel: string;
  url?: string;
}

export interface ToolConfirmHandler {
  (message: string): Promise<boolean>;
}

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  ownHost: Element | null,
  confirmHandler?: ToolConfirmHandler
): Promise<ToolExecutionResult> {
  const registry = getRegistry();

  switch (name) {
    case 'get_page_structure': {
      const s = buildStructure(document, location.href);
      return {
        ok: true,
        content: wrapToolResult(name, s),
        activityLabel: 'Inspected page structure',
      };
    }

    case 'get_page_links': {
      const filter = (typeof args.filter === 'string' ? args.filter : 'all') as string;
      const { links, contacts } = collectLinks(document, location.href, location.origin);
      let filtered = links;
      if (filter === 'internal') filtered = links.filter((l) => l.scope === 'internal');
      else if (filter === 'external') filtered = links.filter((l) => l.scope === 'external');
      else if (['nav', 'main', 'footer', 'header', 'aside'].includes(filter)) {
        filtered = links.filter((l) => l.region === (filter as Region));
      }

      const b = buildLinksBlock(filtered, contacts, {
        limit: LIMITS.linksMax,
        maxChars: LIMITS.linksBlockMaxChars,
      });
      return {
        ok: true,
        content: wrapToolResult(name, b.text),
        activityLabel: `Listed ${b.shown} links (${filter})`,
      };
    }

    case 'get_page_text': {
      const scope: Scope =
        args.scope === 'page' || args.scope === 'selection' ? (args.scope as Scope) : 'main';
      const r = extractFromDocument(document, {
        scope,
        maxChars: LIMITS.pageMaxCharsDefault,
        keepQuery: false,
        live: true,
        pageUrl: location.href,
        ownHost,
      });
      return {
        ok: true,
        content: wrapToolResult(name, r.text),
        activityLabel: `Read page text (${scope})`,
      };
    }

    case 'get_sitemap': {
      const r = await getSitemapUrls(location.origin);
      if (!r.ok) {
        return {
          ok: false,
          content: wrapToolResult(name, `Failed to retrieve sitemap: ${r.error}`),
          activityLabel: 'Checked sitemap (not found)',
        };
      }
      // Register sitemap URLs so model can fetch them
      for (const u of r.urls) registry.add(u);
      const text = r.urls.slice(0, 100).join('\n');
      return {
        ok: true,
        content: wrapToolResult(name, text),
        activityLabel: `Read sitemap (${r.urls.length} URLs)`,
      };
    }

    case 'fetch_page': {
      const resolved = registry.resolve(args, location.href);
      if (!resolved) {
        return {
          ok: false,
          content: wrapToolResult(
            name,
            'URL not recognised. You can only fetch URLs previously listed in page_links or tool results.'
          ),
          activityLabel: 'Blocked fetch (unrecognised URL)',
        };
      }

      if (isSensitiveUrl(resolved)) {
        if (confirmHandler) {
          const approved = await confirmHandler(
            `Let the AI read this account-type page using your logged-in session?\n${resolved}`
          );
          if (!approved) {
            return {
              ok: false,
              content: wrapToolResult(name, 'User declined access to this sensitive account page.'),
              activityLabel: 'Blocked sensitive fetch (user declined)',
              url: resolved,
            };
          }
        }
      }

      const res = await fetchAndExtract(resolved, location.origin, LIMITS.toolResultMaxChars);
      if (!res.ok || !res.page) {
        return {
          ok: false,
          content: wrapToolResult(name, `Fetch failed: ${res.error || 'unknown error'}`),
          activityLabel: `Fetch failed for ${resolved}`,
          url: resolved,
        };
      }

      const body = [
        `URL: ${res.page.url}`,
        `Title: ${res.page.title}`,
        res.structure ? `\nStructure:\n${res.structure}` : '',
        `\nText:\n${res.page.text}`,
        res.linksText ? `\nLinks:\n${res.linksText}` : '',
      ]
        .filter(Boolean)
        .join('\n');

      return {
        ok: true,
        content: wrapToolResult(name, body),
        activityLabel: `Fetched ${res.page.url.replace(location.origin, '') || '/'}`,
        url: resolved,
      };
    }

    case 'search_site': {
      const q = typeof args.query === 'string' ? args.query : '';
      const limit = typeof args.limit === 'number' ? Math.min(10, Math.max(1, args.limit)) : 5;
      const hits = await searchIndex(location.origin, q, limit);
      if (!hits.length) {
        return {
          ok: true,
          content: wrapToolResult(name, 'No matching passages found in the site index.'),
          activityLabel: `Searched site for "${q}" (0 hits)`,
        };
      }
      const formatted = hits
        .map(
          (h) =>
            `[${h.passage.title || h.passage.url}${h.passage.heading ? ' › ' + h.passage.heading : ''}] ${h.passage.url}\n${h.passage.text}`
        )
        .join('\n\n');
      return {
        ok: true,
        content: wrapToolResult(name, formatted),
        activityLabel: `Searched site for "${q}" (${hits.length} hits)`,
      };
    }

    default:
      return {
        ok: false,
        content: wrapToolResult(name, `Unknown tool: ${name}`),
        activityLabel: `Unknown tool ${name}`,
      };
  }
}
