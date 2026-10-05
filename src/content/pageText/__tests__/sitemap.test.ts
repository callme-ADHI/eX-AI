// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { parseSitemapXml } from '../sitemap';

describe('parseSitemapXml', () => {
  it('reads urlset', () => {
    const r = parseSitemapXml(
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://ex.com/a</loc></url><url><loc>https://ex.com/b</loc></url></urlset>'
    );
    expect(r.urls).toEqual(['https://ex.com/a', 'https://ex.com/b']);
  });

  it('reads sitemapindex', () => {
    const r = parseSitemapXml(
      '<sitemapindex><sitemap><loc>https://ex.com/s1.xml</loc></sitemap></sitemapindex>'
    );
    expect(r.children).toEqual(['https://ex.com/s1.xml']);
    expect(r.urls).toEqual([]);
  });

  it('returns empty on invalid XML', () => {
    expect(parseSitemapXml('<<<')).toEqual({ urls: [], children: [] });
  });
});
