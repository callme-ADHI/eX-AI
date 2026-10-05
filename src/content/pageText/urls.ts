const TRACKING = /^(utm_.*|fbclid|gclid|dclid|msclkid|mc_eid|mc_cid|igshid|ref_src|_hsenc|_hsmi|yclid)$/i;

/** Absolute http(s) URL, no hash, no credentials, tracking params removed. null if not http(s). */
export function cleanUrl(raw: string, base: string): string | null {
  let u: URL;
  try { u = new URL(raw.trim(), base); } catch { return null; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  u.hash = ''; u.username = ''; u.password = '';
  for (const k of [...u.searchParams.keys()]) if (TRACKING.test(k)) u.searchParams.delete(k);
  return u.toString();
}

/** Stable comparison key: sorted query, no trailing slash (except root), no hash. */
export function urlKey(url: string): string {
  const u = new URL(url);
  u.hash = '';
  u.searchParams.sort();
  let path = u.pathname;
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
  return `${u.origin}${path}${u.search}`;
}

export const isSameOrigin = (url: string, origin: string): boolean => {
  try { return new URL(url).origin === origin; } catch { return false; }
};

/** URL shown for the current page. Query is dropped unless keepQuery. */
export function displayUrl(url: string, keepQuery: boolean): string {
  try { const u = new URL(url); return keepQuery ? `${u.origin}${u.pathname}${u.search}` : `${u.origin}${u.pathname}`; }
  catch { return url; }
}

// ---- redaction (what the MODEL is shown). The registry keeps the full URL. ----
const SECRET_STRONG = /(token|secret|passw|pwd|apikey|api_key|session|jwt|signature|csrf|bearer|otp)/i;
const SECRET_EXACT = new Set(['key', 'sid', 'sig', 'code', 'auth', 'nonce', 'sso', 'ticket']);

export function redactUrl(url: string): string {
  let u: URL;
  try { u = new URL(url); } catch { return url; }
  for (const k of [...u.searchParams.keys()]) {
    if (SECRET_STRONG.test(k) || SECRET_EXACT.has(k.toLowerCase())) u.searchParams.set(k, 'REDACTED');
  }
  u.pathname = u.pathname.split('/').map(seg =>
    /^[A-Za-z0-9_-]{24,}$/.test(seg) && /\d/.test(seg) && /[A-Za-z]/.test(seg) ? 'REDACTED' : seg
  ).join('/');
  return u.toString();
}

// ---- blocklist: GET links that commonly change state or download junk ----
const ACTION_WORDS = [
  'logout', 'log-out', 'log_out', 'signout', 'sign-out', 'sign_out', 'signoff', 'sign-off',
  'delete', 'remove', 'destroy', 'revoke', 'unsubscribe', 'cancel',
  'checkout', 'payment', 'pay', 'purchase', 'add-to-cart', 'add_to_cart', 'addtocart', 'cart',
  'reset-password', 'reset_password', 'wp-admin', 'admin', 'api',
];
const B = '(?:^|[/?&=._-])';
const E = '(?:$|[/?&=._-])';
const BLOCK_RE = new RegExp(`${B}(?:${ACTION_WORDS.join('|')})${E}`, 'i');
const BLOCK_EXT = /\.(zip|rar|7z|tar|gz|exe|dmg|apk|iso|msi|mp4|mkv|avi|mov|mp3|wav|flac|pdf|docx?|xlsx?|pptx?)$/i;
const SENSITIVE_RE = new RegExp(
  `${B}(?:account|accounts|settings|billing|profile|inbox|messages|orders?|wallet|security|password|dashboard)${E}`, 'i');

export function decodeSafe(s: string): string {
  let prev = s;
  for (let i = 0; i < 3; i++) {
    try { const d = decodeURIComponent(prev); if (d === prev) break; prev = d; } catch { break; }
  }
  return prev;
}

export function isBlockedUrl(url: string): { blocked: boolean; reason?: string } {
  let u: URL;
  try { u = new URL(url); } catch { return { blocked: true, reason: 'invalid URL' }; }
  const path = decodeSafe(u.pathname);
  if (BLOCK_EXT.test(path)) return { blocked: true, reason: 'file download' };
  if (BLOCK_RE.test(decodeSafe(u.pathname + u.search))) return { blocked: true, reason: 'looks like an action link (logout/delete/cart/admin/api)' };
  return { blocked: false };
}

export function isSensitiveUrl(url: string): boolean {
  try { return SENSITIVE_RE.test(decodeSafe(new URL(url).pathname)); } catch { return false; }
}

// ---- provenance registry: the model may only fetch URLs WE collected ----
export class UrlRegistry {
  private byKey = new Map<string, { id: string; url: string }>();
  private byId = new Map<string, string>();
  private n = 0;
  private readonly epoch: string;

  constructor() {
    // 2 random letters per page load; stale ids from an older page will not resolve.
    this.epoch = Array.from({ length: 2 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join('');
  }

  /** Register a cleaned absolute URL. Returns its id (existing or new). */
  add(url: string | null): string | null {
    if (!url) return null;
    let k: string;
    try { k = urlKey(url); } catch { return null; }
    const hit = this.byKey.get(k);
    if (hit) return hit.id;
    const id = `${this.epoch}${++this.n}`;
    this.byKey.set(k, { id, url });
    this.byId.set(id, url);
    return id;
  }

  idOf(url: string): string | null {
    try { return this.byKey.get(urlKey(url))?.id ?? null; } catch { return null; }
  }

  resolveId(id: string): string | null { return this.byId.get(id.trim().toLowerCase()) ?? null; }

  /** Only returns a URL that was previously registered (the stored string, never the caller's). */
  resolveUrl(candidate: string, base: string): string | null {
    const c = cleanUrl(candidate, base);
    if (!c) return null;
    try { return this.byKey.get(urlKey(c))?.url ?? null; } catch { return null; }
  }

  resolve(args: { link_id?: unknown; url?: unknown }, base: string): string | null {
    if (typeof args.link_id === 'string' && args.link_id) return this.resolveId(args.link_id);
    if (typeof args.url === 'string' && args.url) return this.resolveUrl(args.url, base);
    return null;
  }

  get size(): number { return this.byKey.size; }
}

let _registry: UrlRegistry | null = null;
export const getRegistry = (): UrlRegistry => (_registry ??= new UrlRegistry());
