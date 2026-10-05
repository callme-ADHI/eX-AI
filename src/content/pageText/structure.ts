import { LIMITS } from '../../shared/constants';

const meta = (doc: Document, sel: string) =>
  (doc.querySelector(sel) as HTMLMetaElement | null)?.getAttribute('content')?.trim() ?? '';

export function buildStructure(doc: Document, pageUrl: string): string {
  const out: string[] = [];
  const add = (k: string, v: string | number) => { if (v !== '' && v !== 0) out.push(`${k}: ${v}`); };

  add('title', (doc.title || '').trim());
  add('description', meta(doc, 'meta[name="description"]'));
  add('canonical', doc.querySelector('link[rel="canonical"]')?.getAttribute('href')?.trim() ?? '');
  add('language', doc.documentElement?.getAttribute('lang') ?? '');
  add('og:title', meta(doc, 'meta[property="og:title"]'));
  add('og:description', meta(doc, 'meta[property="og:description"]'));
  add('og:type', meta(doc, 'meta[property="og:type"]'));
  add('og:site_name', meta(doc, 'meta[property="og:site_name"]'));

  const heads = Array.from(doc.querySelectorAll('h1, h2, h3')).slice(0, LIMITS.headingsMax);
  if (heads.length) {
    out.push('headings:');
    for (const h of heads) {
      const t = (h.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
      if (t) out.push(`${'  '.repeat(Number(h.localName[1]) - 1)}${h.localName}: ${t}`);
    }
  }

  const imgs = doc.querySelectorAll('img');
  add('images', imgs.length);
  add('images-without-alt', Array.from(imgs).filter(i => !(i.getAttribute('alt') ?? '').trim()).length);
  add('tables', doc.querySelectorAll('table').length);
  add('iframes', doc.querySelectorAll('iframe').length);

  const forms = Array.from(doc.querySelectorAll('form')).slice(0, 5);
  if (forms.length) {
    out.push('forms (field names and types only, no values):');
    forms.forEach((f, i) => {
      const fields = Array.from(f.querySelectorAll('input, select, textarea'))
        .filter(x => (x.getAttribute('type') ?? '').toLowerCase() !== 'hidden')
        .slice(0, 12)
        .map(x => `${x.getAttribute('name') || x.getAttribute('id') || '(unnamed)'}:${x.getAttribute('type') || x.localName}`);
      out.push(`  form${i + 1}: ${fields.join(', ') || '(no visible fields)'}`);
    });
  }

  const hosts = new Set<string>();
  let pageHost = '';
  try { pageHost = new URL(pageUrl).host; } catch { /* ignore */ }
  const grab = (sel: string, attr: string) => {
    for (const el of Array.from(doc.querySelectorAll(sel))) {
      const v = el.getAttribute(attr);
      if (!v) continue;
      try { const h = new URL(v, pageUrl).host; if (h && h !== pageHost) hosts.add(h); } catch { /* ignore */ }
    }
  };
  grab('script[src]', 'src'); grab('link[rel="stylesheet"][href]', 'href'); grab('iframe[src]', 'src');
  if (hosts.size) out.push(`third-party-hosts: ${Array.from(hosts).slice(0, LIMITS.thirdPartyHostsMax).join(', ')}`);

  return out.join('\n');
}
