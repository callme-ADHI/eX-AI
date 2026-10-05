import { LIMITS } from '../../shared/constants';
import { extractFromDocument } from './extract';
import { buildStructure } from './structure';
import { buildLinksBlock, collectLinks } from './links';
import { assemblePack } from './blocks';
import { getRegistry } from './urls';
import { searchIndex } from './siteIndex';
import type { ContextPack, Scope } from './types';

export interface PageSettings {
  pageContext: 'off' | Scope;
  pageContextMaxChars: number;
  pageContextKeepQuery: boolean;
}

/** Called at SEND time (never when the chip is toggled), so SPAs are current. */
export async function collectContext(
  s: PageSettings,
  userText: string,
  ownHost: Element | null
): Promise<ContextPack | null> {
  if (s.pageContext === 'off') return null;
  const registry = getRegistry();
  registry.add(location.href);

  const page = extractFromDocument(document, {
    scope: s.pageContext,
    maxChars: s.pageContextMaxChars,
    keepQuery: s.pageContextKeepQuery,
    live: true,
    pageUrl: location.href,
    ownHost,
  });
  const structure = buildStructure(document, location.href);
  const { links, contacts } = collectLinks(document, location.href, location.origin);
  const linksBlock = buildLinksBlock(links, contacts, {
    limit: LIMITS.linksMax,
    maxChars: LIMITS.linksBlockMaxChars,
  });

  let passages: { text: string; count: number } | undefined;
  try {
    const hits = await searchIndex(location.origin, userText, LIMITS.autoPassagesK);
    if (hits.length) {
      passages = {
        count: hits.length,
        text: hits
          .map(
            (h) =>
              `[${h.passage.title || h.passage.url}${h.passage.heading ? ' › ' + h.passage.heading : ''}] ${h.passage.url}\n${h.passage.text}`
          )
          .join('\n\n'),
      };
    }
  } catch {
    // index not available yet or empty
  }
  return assemblePack({ page, structure, links: linksBlock, passages });
}
