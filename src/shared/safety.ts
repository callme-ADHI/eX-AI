// Tags we use to wrap untrusted data. Any literal occurrence inside the data is broken
// with a zero-width space so the data can never close or open our wrappers.
const TAGS = /<(\/?)(page_context|page_links|page_structure|site_passages|tool_result)/gi;

export const neutralizeTags = (s: string): string => s.replace(TAGS, '<\u200b$1$2');

export const escapeAttr = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/[\r\n]+/g, ' ');

export function wrapToolResult(name: string, content: string): string {
  return `<tool_result name="${escapeAttr(name)}" untrusted="true">\n${neutralizeTags(content)}\n</tool_result>`;
}
