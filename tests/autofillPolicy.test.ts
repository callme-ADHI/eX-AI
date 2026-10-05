import { describe, it, expect } from 'vitest';
import {
  isAutofillAllowed,
  validateAllowEntry,
  isHardDenied,
  confirmPhrase,
} from '../src/shared/autofillPolicy';

describe('policy', () => {
  it('allows local/test hosts by default', () => {
    for (const h of [
      'localhost',
      '127.0.0.1',
      '[::1]',
      'app.localhost',
      'exam.test',
      'x.local',
      'y.example',
    ]) {
      expect(isAutofillAllowed(h, []).allowed, `host: ${h}`).toBe(true);
    }
  });

  it('denies unknown hosts until allowlisted (subdomains included)', () => {
    expect(isAutofillAllowed('staging.mycollege.edu', []).allowed).toBe(false);
    expect(isAutofillAllowed('staging.mycollege.edu', ['mycollege.edu']).allowed).toBe(true);
    expect(isAutofillAllowed('evilmycollege.edu', ['mycollege.edu']).allowed).toBe(false);
  });

  it('hard-deny wins even if allowlisted', () => {
    expect(isAutofillAllowed('www.hackerrank.com', ['hackerrank.com']).allowed).toBe(false);
    expect(isHardDenied('assessments.mettl.com')).toBe(true);
    expect(isHardDenied('notmettl.com')).toBe(false);
  });

  it('validates allowlist entries', () => {
    expect(validateAllowEntry('https://Staging.MyCollege.edu/path').host).toBe(
      'staging.mycollege.edu',
    );
    expect(validateAllowEntry('*.edu').ok).toBe(false);
    expect(validateAllowEntry('com').ok).toBe(false);
    expect(validateAllowEntry('10.0.0.5').ok).toBe(false);
    expect(validateAllowEntry('hackerrank.com').ok).toBe(false);
    expect(validateAllowEntry('localhost').ok).toBe(true);
  });

  it('confirm phrase is exact', () => {
    expect(confirmPhrase('a.b.edu')).toBe('I am authorized to test a.b.edu');
  });
});
