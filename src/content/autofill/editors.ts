// ─── Code Editor Fill (isolated-world side) ──────────────────────────────────
// This sends the fill request to the service worker, which runs the actual
// editor API calls in the MAIN world via chrome.scripting.executeScript.

import type { FieldHandle } from './types';

/**
 * Requests the service worker to fill a code editor.
 * Uses a one-time random token embedded as a data attribute on the editor root
 * so the SW can find the right element in the page's JS world.
 * The attribute is removed in `finally` regardless of outcome.
 */
export async function fillEditor(
  h: FieldHandle,
  code: string,
): Promise<{ ok: boolean; method?: string; error?: string }> {
  const token = Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  h.root.setAttribute('data-exai-target', token);
  try {
    return (
      (await chrome.runtime.sendMessage({ type: 'AUTOFILL_EDITOR_FILL', token, code })) ?? {
        ok: false,
        error: 'no response',
      }
    );
  } finally {
    h.root.removeAttribute('data-exai-target');
  }
}
