// ─── Fill Guards — controls what the filler may and may not click ─────────────

const ACTION_TEXT =
  /^\s*(?:(?:submit|finish|finalize|finalise|end|complete)(?:\s+(?:the|my))?(?:\s+(?:test|exam|attempt|quiz|assessment|answers?))?|confirm|send|save\s*(?:&|and)\s*(?:next|continue)|next|previous|continue|done|proceed|pay|logout|log out|sign out|reset|clear|cancel)\s*[.!]?\s*$/i;

/**
 * Returns true if clicking this element could navigate, submit, or end the attempt.
 * Used both as a guard in applyPlan and to reject heuristic option elements.
 */
export function isActionControl(el: Element): boolean {
  const tag = el.localName;

  if (tag === 'a' && el.hasAttribute('href')) return true;

  if (tag === 'input') {
    const t = (el.getAttribute('type') ?? '').toLowerCase();
    return ['submit', 'image', 'button', 'reset'].includes(t);
  }

  if (tag === 'button') {
    const t = el.getAttribute('type');
    const inForm = !!el.closest('form');
    // No explicit type inside a form defaults to "submit"
    if (t === 'submit' || t === 'reset' || (t === null && inForm)) return true;
  }

  const role = el.getAttribute('role');
  if (role === 'link' || role === 'menuitem' || role === 'tab') return true;

  // Check text content for action words (only for short labels)
  const label = `${el.getAttribute('aria-label') ?? ''} ${el.textContent ?? ''}`
    .replace(/\s+/g, ' ')
    .trim();
  return label.length <= 40 && ACTION_TEXT.test(label);
}

/**
 * The only place that decides whether the filler may click an element.
 * Returns { ok: true } when safe, { ok: false, reason } otherwise.
 */
export function clickAllowed(
  el: Element,
  declaredOption: boolean,
): { ok: boolean; reason?: string } {
  if (el.localName === 'input') {
    const t = (el.getAttribute('type') ?? '').toLowerCase();
    return t === 'radio' || t === 'checkbox'
      ? { ok: true }
      : { ok: false, reason: `input[type=${t || 'text'}] is never clicked` };
  }
  if (!declaredOption) return { ok: false, reason: 'not a detected option element' };
  if (isActionControl(el)) return { ok: false, reason: 'looks like a navigation/submit control' };
  return { ok: true };
}

/**
 * Wraps a fill function with a submit-event blocker.
 * Records any blocked submit attempts and whether the URL changed.
 *
 * NOTE: This cannot stop page code calling form.submit() directly.
 * It only captures the bubbled "submit" DOM event.
 */
export async function withSubmitBlocked<T>(
  fn: () => Promise<T>,
): Promise<{ result: T; blocked: string[]; urlChanged: boolean }> {
  const blocked: string[] = [];
  const startUrl = location.href;
  const onSubmit = (e: Event) => {
    e.preventDefault();
    e.stopImmediatePropagation();
    blocked.push('form submit event cancelled');
  };
  window.addEventListener('submit', onSubmit, true);
  try {
    const result = await fn();
    return { result, blocked, urlChanged: location.href !== startUrl };
  } finally {
    window.removeEventListener('submit', onSubmit, true);
  }
}
