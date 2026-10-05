import { describe, it, expect } from 'vitest';
import { refersToPage } from '../intent';

describe('refersToPage', () => {
  it('detects references to current page or site', () => {
    expect(refersToPage('summarise this page')).toBe(true);
    expect(refersToPage('what does this website offer?')).toBe(true);
    expect(refersToPage('explain the article')).toBe(true);
    expect(refersToPage('what do they write about pricing on this site?')).toBe(true);
    expect(refersToPage('what is on the current tab?')).toBe(true);
  });

  it('does not trigger for generic questions', () => {
    expect(refersToPage('solve 2+2')).toBe(false);
    expect(refersToPage('write a quicksort in python')).toBe(false);
    expect(refersToPage('who are you?')).toBe(false);
  });
});
