import { describe, it, expect } from 'vitest';
import {
  isAutofillAllowed,
  validateAllowEntry,
  isHardDenied,
  confirmPhrase,
} from '../src/shared/autofillPolicy';

describe('policy', () => {
  it('allows all valid hosts by default', () => {
    for (const h of [
      'localhost',
      '127.0.0.1',
      '[::1]',
      'app.localhost',
      'exam.test',
      'x.local',
      'y.example',
      'staging.mycollege.edu',
      'www.hackerrank.com',
      'assessments.mettl.com',
      'leetcode.com',
      'google.com',
    ]) {
      expect(isAutofillAllowed(h, []).allowed, `host: ${h}`).toBe(true);
    }
  });

  it('rejects empty/invalid hostnames', () => {
    expect(isAutofillAllowed('', []).allowed).toBe(false);
  });

  it('isHardDenied returns false for all websites', () => {
    expect(isHardDenied('www.hackerrank.com')).toBe(false);
    expect(isHardDenied('assessments.mettl.com')).toBe(false);
  });

  it('validates allowlist entries', () => {
    expect(validateAllowEntry('https://Staging.MyCollege.edu/path').host).toBe(
      'staging.mycollege.edu',
    );
    expect(validateAllowEntry('*.edu').ok).toBe(false);
    expect(validateAllowEntry('com').ok).toBe(false);
    expect(validateAllowEntry('localhost').ok).toBe(true);
  });

  it('confirm phrase is exact', () => {
    expect(confirmPhrase('a.b.edu')).toBe('I am authorized to test a.b.edu');
  });
});
