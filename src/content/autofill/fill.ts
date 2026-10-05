// ─── Autofill Plan Executor ───────────────────────────────────────────────────
import { clickAllowed, withSubmitBlocked } from './guards';
import { fillEditor } from './editors';
import { hash } from './labels';
import type { FieldHandle, FillResult, PlanItem } from './types';

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

/**
 * Works with React/Vue controlled inputs: uses the native value setter,
 * then dispatches `input` + `change` events so framework state picks up the change.
 */
export function setNativeValue(
  el: HTMLInputElement | HTMLTextAreaElement,
  value: string,
): void {
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

function isSelectedCustom(el: Element): boolean {
  return (
    el.getAttribute('aria-checked') === 'true' ||
    el.getAttribute('aria-selected') === 'true' ||
    /\b(selected|active|checked)\b/.test(String((el as HTMLElement).className))
  );
}

export interface ApplyOptions {
  delayMs: number;
  handles: Map<string, FieldHandle>;
  setLanguageDropdown?: boolean;
}

export interface ApplyOutcome {
  results: FillResult[];
  blocked: string[];
  urlChanged: boolean;
  /** Undo is partial: native text/select/checkbox are restored; radios/custom options cannot be reverted. */
  undo: () => void;
}

export async function applyPlan(plan: PlanItem[], o: ApplyOptions): Promise<ApplyOutcome> {
  const undoers: Array<() => void> = [];
  const results: FillResult[] = [];

  const { blocked, urlChanged } = await withSubmitBlocked(async () => {
    for (const item of plan) {
      const h = o.handles.get(item.fieldId);
      const res = (status: FillResult['status'], detail: string) =>
        results.push({ fieldId: item.fieldId, status, detail });

      if (!h) {
        res('skipped', 'field not found (rescan)');
        continue;
      }
      if (!h.root.isConnected) {
        res('skipped', 'element no longer on the page (rescan)');
        continue;
      }
      if (h.info.currentlyFilled && !item.overwrite) {
        res('skipped', 'already answered (overwrite is off)');
        continue;
      }

      try {
        h.root.scrollIntoView?.({ block: 'center', behavior: 'auto' });

        switch (h.info.kind) {
          case 'choice': {
            const [s, d] = fillChoice(h, item.optionIds ?? [], undoers);
            res(s, d);
            break;
          }
          case 'select': {
            const [s, d] = fillSelect(h, item.text ?? '', undoers);
            res(s, d);
            break;
          }
          case 'text':
          case 'longtext': {
            const [s, d] = fillText(h, item.text ?? '', undoers);
            res(s, d);
            break;
          }
          case 'code': {
            const [s, d] = await fillCode(h, item, undoers, o.setLanguageDropdown);
            res(s, d);
            break;
          }
        }
      } catch (e: any) {
        res('failed', String(e?.message ?? e).slice(0, 120));
      }

      // Fixed delay — lets page handlers process events. NOT human-mimicry.
      await sleep(o.delayMs);
    }
  });

  return {
    results,
    blocked,
    urlChanged,
    undo: () => {
      for (const u of undoers.reverse()) {
        try {
          u();
        } catch {
          /* ignore */
        }
      }
    },
  };
}

type R = [FillResult['status'], string];

function fillChoice(h: FieldHandle, optionIds: string[], undoers: Array<() => void>): R {
  if (!optionIds.length) return ['skipped', 'no option proposed'];
  const wanted = new Set(optionIds);
  let changed = 0;

  for (let i = 0; i < h.optionEls.length; i++) {
    const el = h.optionEls[i];
    const want = wanted.has(h.info.options[i].id);
    const native = el instanceof HTMLInputElement;
    const isOn = native ? (el as HTMLInputElement).checked : isSelectedCustom(el);

    if (want === isOn) continue;
    // For radio groups: clicking the wanted radio clears others automatically
    if (!want && !h.info.multi) continue;
    if (!want && native && (el as HTMLInputElement).type === 'radio') continue;

    const g = clickAllowed(el, true);
    if (!g.ok) return ['failed', `refused to click: ${g.reason}`];

    (el as HTMLElement).click();
    changed++;

    // Undo: toggle checkboxes back; radios cannot be "un-selected" by browser semantics
    if (native && (el as HTMLInputElement).type === 'checkbox') {
      undoers.push(() => (el as HTMLElement).click());
    }
  }

  // Verify by reading back for native inputs
  if (h.optionEls.every(el => el instanceof HTMLInputElement)) {
    const ok = h.optionEls.every((el, i) => {
      const want = wanted.has(h.info.options[i].id);
      const on = (el as HTMLInputElement).checked;
      return h.info.multi ? on === want : !want || on;
    });
    return [
      ok ? 'filled' : 'failed',
      ok ? (changed ? 'selected' : 'already selected') : 'verification failed',
    ];
  }

  // Custom / ARIA options: verify only when the page exposes state
  if (!changed) return ['filled', 'already selected'];
  if (!h.optionEls.some(isSelectedCustom))
    return [
      'filled',
      'clicked (this page does not expose option state, so it could not be verified)',
    ];
  const ok = h.optionEls.every(
    (el, i) => !wanted.has(h.info.options[i].id) || isSelectedCustom(el),
  );
  return [ok ? 'filled' : 'failed', ok ? 'selected' : 'verification failed'];
}

function fillSelect(h: FieldHandle, label: string, undoers: Array<() => void>): R {
  const sel = h.els[0] as HTMLSelectElement;
  const idx = Array.from(sel.options).findIndex(
    op => op.text.replace(/\s+/g, ' ').trim().toLowerCase() === label.trim().toLowerCase(),
  );
  if (idx < 0) return ['failed', `no option labelled "${label.slice(0, 40)}"`];
  const prev = sel.selectedIndex;
  sel.selectedIndex = idx;
  sel.dispatchEvent(new Event('input', { bubbles: true }));
  sel.dispatchEvent(new Event('change', { bubbles: true }));
  undoers.push(() => {
    sel.selectedIndex = prev;
    sel.dispatchEvent(new Event('input', { bubbles: true }));
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  });
  return sel.selectedIndex === idx ? ['filled', 'selected'] : ['failed', 'verification failed'];
}

function fillText(h: FieldHandle, text: string, undoers: Array<() => void>): R {
  if (!text) return ['skipped', 'empty answer'];
  const el = h.els[0] as HTMLInputElement | HTMLTextAreaElement;
  const prev = el.value;
  const clamped = el.maxLength > 0 ? text.slice(0, el.maxLength) : text;
  setNativeValue(el, clamped);
  undoers.push(() => setNativeValue(el, prev));
  return el.value.length ? ['filled', 'text set'] : ['failed', 'value did not stick'];
}

async function fillCode(
  h: FieldHandle,
  item: PlanItem,
  undoers: Array<() => void>,
  switchLang?: boolean,
): Promise<R> {
  const code = item.code ?? '';
  if (!code.trim()) return ['skipped', 'empty code'];
  if (switchLang && item.language) trySetLanguageDropdown(h, item.language, undoers);

  if (h.editor === 'textarea') {
    const el = h.els[0] as HTMLTextAreaElement;
    const prev = el.value;
    setNativeValue(el, code);
    undoers.push(() => setNativeValue(el, prev));
    return el.value === code ? ['filled', 'textarea'] : ['failed', 'value did not stick'];
  }

  if (h.editor === 'contenteditable') {
    const el = h.els[0] as HTMLElement;
    const prev = el.textContent ?? '';
    el.focus();
    document.execCommand('selectAll');
    document.execCommand('insertText', false, code);
    undoers.push(() => {
      el.focus();
      document.execCommand('selectAll');
      document.execCommand('insertText', false, prev);
    });
    return (el.textContent ?? '').length
      ? ['filled', 'contenteditable']
      : ['failed', 'insertText had no effect'];
  }

  const r = await fillEditor(h, code);
  return r.ok
    ? ['filled', r.method ?? 'editor']
    : ['failed', r.error ?? 'editor not reachable'];
}

function trySetLanguageDropdown(
  h: FieldHandle,
  language: string,
  undoers: Array<() => void>,
): void {
  const scope = h.root.closest('form, section, main') ?? document.body;
  const want = language.toLowerCase().replace('cpp', 'c++');
  for (const s of Array.from(scope.querySelectorAll('select'))) {
    const idx = Array.from(s.options).findIndex(o =>
      o.text.toLowerCase().includes(want),
    );
    if (
      idx >= 0 &&
      /python|java|c\+\+|javascript/i.test(
        Array.from(s.options).map(o => o.text).join(' '),
      )
    ) {
      const prev = s.selectedIndex;
      s.selectedIndex = idx;
      s.dispatchEvent(new Event('change', { bubbles: true }));
      undoers.push(() => {
        s.selectedIndex = prev;
        s.dispatchEvent(new Event('change', { bubbles: true }));
      });
      return;
    }
  }
}

/**
 * Re-check before filling that the page did not change since the scan.
 * Recompute the fingerprint from the current DOM and compare with the stored one.
 */
export function stillMatches(
  h: FieldHandle,
  recomputeFingerprint: (h: FieldHandle) => string,
): boolean {
  return h.root.isConnected && recomputeFingerprint(h) === h.fingerprint;
}

export { hash };
