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

export const isHardDenied = (host: string): boolean =>
  HARD_DENY.some(d => matchesDomain(normalizeHost(host), d));

export function isAutofillAllowed(
  host: string,
  userAllow: readonly string[],
): { allowed: boolean; reason: string } {
  const h = normalizeHost(host);
  if (!h) return { allowed: false, reason: 'Invalid host.' };
  if (isHardDenied(h))
    return {
      allowed: false,
      reason:
        'This site is on the built-in assessment/proctoring platform deny list and cannot be enabled.',
    };
  if (
    (DEFAULT_ALLOW_EXACT as readonly string[]).includes(h) ||
    DEFAULT_ALLOW_SUFFIX.some(s => h.endsWith(s))
  )
    return { allowed: true, reason: 'Local/test host.' };
  if (userAllow.some(d => matchesDomain(h, normalizeHost(d))))
    return { allowed: true, reason: 'On your allowlist.' };
  return {
    allowed: false,
    reason: 'This host is not on the Autofill allowlist (Settings → Autofill).',
  };
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
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h) && h !== '127.0.0.1')
    return { ok: false, error: 'IP addresses other than 127.0.0.1 are not allowed.' };
  if (isHardDenied(h))
    return { ok: false, error: 'This platform is on the built-in deny list and cannot be enabled.' };
  return { ok: true, host: h };
}

export const confirmPhrase = (host: string): string => `I am authorized to test ${host}`;
