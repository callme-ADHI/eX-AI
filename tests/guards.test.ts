// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { clickAllowed, isActionControl, withSubmitBlocked } from '../src/content/autofill/guards';

const el = (html: string) => {
  document.body.innerHTML = html;
  return document.body.firstElementChild as Element;
};

describe('guards', () => {
  it('never clicks submit-like controls', () => {
    expect(clickAllowed(el('<button type="submit">Submit</button>'), true).ok).toBe(false);
    expect(clickAllowed(el('<input type="submit">'), true).ok).toBe(false);
    expect(clickAllowed(el('<a href="/next">Next</a>'), true).ok).toBe(false);
    expect(
      clickAllowed(el('<form><button>Go</button></form>').querySelector('button')!, true).ok,
    ).toBe(false); // default type in form = submit
  });

  it('allows radios, checkboxes and declared option elements', () => {
    expect(clickAllowed(el('<input type="radio">'), false).ok).toBe(true);
    expect(clickAllowed(el('<input type="checkbox">'), false).ok).toBe(true);
    expect(clickAllowed(el('<div class="option">A. 12</div>'), true).ok).toBe(true);
    expect(clickAllowed(el('<button type="button">B. 14</button>'), true).ok).toBe(true);
  });

  it('refuses undeclared or action-text elements', () => {
    expect(clickAllowed(el('<div>A. 12</div>'), false).ok).toBe(false);
    expect(isActionControl(el('<div role="button">Finish test</div>'))).toBe(true);
    expect(isActionControl(el('<div>Save & Next</div>'))).toBe(true);
  });

  it('cancels submit events during a fill', async () => {
    document.body.innerHTML = '<form id="f"><input name="a"></form>';
    let submitted = false;
    document.getElementById('f')!.addEventListener('submit', () => {
      submitted = true;
    });
    const { blocked } = await withSubmitBlocked(async () => {
      const ev = new Event('submit', { bubbles: true, cancelable: true });
      document.getElementById('f')!.dispatchEvent(ev);
      expect(ev.defaultPrevented).toBe(true);
    });
    expect(blocked.length).toBe(1);
    expect(submitted).toBe(false); // stopImmediatePropagation reached before the page handler
  });
});
