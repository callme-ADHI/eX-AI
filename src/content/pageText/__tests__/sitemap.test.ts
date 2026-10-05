// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { parseSitemapXml } from '../sitemap';

describe('parseSitemapXml', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
  <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    <url><loc>https://ex.com/page1</loc></url>
    <url><loc>https://ex.com/page2?utm_source=rss</loc></url>
    <url><loc>https://other.com/ext</loc></url>
    <url><loc>https://ex.com/logout</loc></url>
  </urlset>`;

  it('filters same-origin and skips blocked URLs', () => {
    const r = parseSitemapXml(xml, 'https://ex.com');
    expect(r.urls).toContain('https://ex.com/page1');
    expect(r.urls).toContain('https://ex.com/page2');
    expect(r.urls).not.toContain('https://other.com/ext');
    expect(r.urls).not.toContain('https://ex.com/logout');
  });

  const indexXml = `<?xml version="1.0" encoding="UTF-8"?>
  <sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    <sitemap><loc>https://ex.com/sitemap-posts.xml</loc></sitemap>
    <sitemap><loc>https://other.com/sitemap-ext.xml</loc></sitemap>
  </sitemapindex>`;

  it('extracts same-origin child sitemaps from sitemapindex', () => {
    const r = parseSitemapXml(indexXml, 'https://ex.com');
    expect(r.childSitemaps).toEqual(['https://ex.com/sitemap-posts.xml']);
  });
});
