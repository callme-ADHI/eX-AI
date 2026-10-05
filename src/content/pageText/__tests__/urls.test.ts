import { describe, it, expect } from 'vitest';
import { cleanUrl, urlKey, isBlockedUrl, isSensitiveUrl, redactUrl, UrlRegistry } from '../urls';

describe('cleanUrl / urlKey', () => {
  it('removes tracking params and hash', () => {
    expect(cleanUrl('/a?utm_source=x&b=1#frag', 'https://ex.com/base')).toBe('https://ex.com/a?b=1');
  });
  it('rejects non-http(s)', () => {
    expect(cleanUrl('javascript:alert(1)', 'https://ex.com')).toBeNull();
    expect(cleanUrl('mailto:a@b.c', 'https://ex.com')).toBeNull();
  });
  it('builds stable keys', () => {
    expect(urlKey('https://ex.com/a/?b=2&a=1')).toBe('https://ex.com/a?a=1&b=2');
    expect(urlKey('https://ex.com/')).toBe('https://ex.com/');
  });
});

describe('isBlockedUrl', () => {
  const blocked = ['https://ex.com/logout', 'https://ex.com/account/logout?next=/', 'https://ex.com/%6Cogout',
    'https://ex.com/?action=delete&id=3', 'https://ex.com/shop/cart/', 'https://ex.com/api/v1/users', 'https://ex.com/file.pdf'];
  const allowed = ['https://ex.com/blog/hello-world', 'https://ex.com/docs/cartography', 'https://ex.com/apiary', 'https://ex.com/pricing'];
  for (const u of blocked) it(`blocks ${u}`, () => expect(isBlockedUrl(u).blocked).toBe(true));
  for (const u of allowed) it(`allows ${u}`, () => expect(isBlockedUrl(u).blocked).toBe(false));
});

describe('isSensitiveUrl', () => {
  it('flags account-type paths', () => { expect(isSensitiveUrl('https://ex.com/account/settings')).toBe(true); });
  it('does not flag normal paths', () => { expect(isSensitiveUrl('https://ex.com/blog')).toBe(false); });
});

describe('redactUrl', () => {
  it('redacts secret-looking params and long token segments', () => {
    const r = redactUrl('https://ex.com/reset/abcdEFGH1234abcdEFGH1234abcd?token=abc&page=2');
    expect(r).toContain('token=REDACTED');
    expect(r).toContain('page=2');
    expect(r).toContain('/reset/REDACTED');
  });
});

describe('UrlRegistry provenance', () => {
  it('resolves only collected URLs and returns the stored string', () => {
    const r = new UrlRegistry();
    const id = r.add('https://ex.com/a?x=1')!;
    expect(r.resolveId(id)).toBe('https://ex.com/a?x=1');
    expect(r.resolveUrl('/a?x=1', 'https://ex.com/')).toBe('https://ex.com/a?x=1');
    expect(r.resolveUrl('https://ex.com/a/?x=1', 'https://ex.com')).toBe('https://ex.com/a?x=1');
    expect(r.resolveUrl('/a?x=1&data=secret', 'https://ex.com/')).toBeNull();
    expect(r.resolveUrl('https://evil.com/a?x=1', 'https://ex.com/')).toBeNull();
    expect(r.resolveId('zz999')).toBeNull();
  });
  it('assigns the same id to the same URL', () => {
    const r = new UrlRegistry();
    expect(r.add('https://ex.com/a')).toBe(r.add('https://ex.com/a/'));
  });
});
