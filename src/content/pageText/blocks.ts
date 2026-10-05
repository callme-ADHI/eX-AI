import { escapeAttr, neutralizeTags } from '../../shared/safety';
import { estimateTokens } from './text';
import type { ContextPack, ExtractResult } from './types';

export function assemblePack(p: {
  page: ExtractResult; structure: string;
  links: { text: string; shown: number; total: number };
  passages?: { text: string; count: number };
}): ContextPack {
  const { page, structure, links, passages } = p;
  const parts: string[] = [];
  parts.push(
    `<page_context title="${escapeAttr(page.title)}" url="${escapeAttr(page.url)}" ` +
    `source="${page.source}" truncated="${page.truncated}" chars="${page.chars}">\n` +
    `${neutralizeTags(page.text)}\n</page_context>`);
  if (structure) parts.push(`<page_structure>\n${neutralizeTags(structure)}\n</page_structure>`);
  if (links.text) parts.push(`<page_links count="${links.shown}" total="${links.total}">\n${neutralizeTags(links.text)}\n</page_links>`);
  if (passages?.text) parts.push(`<site_passages count="${passages.count}">\n${neutralizeTags(passages.text)}\n</site_passages>`);
  const block = parts.join('\n');
  return {
    block,
    meta: {
      title: page.title, url: page.url, chars: page.chars, estTokens: estimateTokens(block.length),
      truncated: page.truncated, links: links.total, skippedFrames: page.skippedFrames,
      rendered: page.rendered, passages: passages?.count ?? 0,
    },
  };
}
