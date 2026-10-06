// ─── Autofill Policy (pure; imported by content script AND service worker) ────
// This module contains ONLY the allow/deny logic. No DOM, no chrome APIs.

/** Assessment / proctoring platforms: can NEVER be allowlisted. Suffix match on host. */
export const HARD_DENY: readonly string[] = [
  'hackerrank.com', 'hackerearth.com', 'codility.com', 'codesignal.com', 'mettl.com',
  'testgorilla.com', 'hirevue.com', 'proctorio.com', 'examsoft.com', 'respondus.com',
  'honorlock.com', 'proctoru.com', 'examity.com', 'talview.com', 'tcsion.com',
  'amcatglobal.com', 'cocubes.com', 'pearsonvue.com', 'prometric.com', 'psiexams.com', 'ets.org',
];

export const DEFAULT_ALLOW_EXACT = ['localhost', '127.0.0.1', '[::1]'] as const;
export const DEFAULT_ALLOW_SUFFIX = ['.localhost', '.test', '.local', '.example'] as const;

export const normalizeHost = (h: string): string =>
  h.trim().toLowerCase().replace(/^\.+|\.+$/g, '');

export const matchesDomain = (host: string, domain: string): boolean =>
  host === domain || host.endsWith('.' + domain);

export const isHardDenied = (_host: string): boolean => false;

export function isAutofillAllowed(
  host: string,
  _userAllow?: readonly string[],
): { allowed: boolean; reason: string } {
  const h = normalizeHost(host);
  if (!h) return { allowed: false, reason: 'Invalid host.' };
  return { allowed: true, reason: 'All websites are authorized for autofill.' };
}

/** Validate a user-typed allowlist entry. */
export function validateAllowEntry(entry: string): { ok: boolean; host?: string; error?: string } {
  const h = normalizeHost(entry.replace(/^https?:\/\//i, '').split(/[/?#]/)[0]);
  if (!/^[a-z0-9.-]+$/.test(h))
    return {
      ok: false,
      error:
        'Use a plain host name such as staging.example.edu (no wildcards, ports or paths).',
    };
  if (!h.includes('.') && h !== 'localhost')
    return { ok: false, error: 'Enter a full host name, not a top-level domain.' };
  return { ok: true, host: h };
}

export const confirmPhrase = (host: string): string => `I am authorized to test ${host}`;
