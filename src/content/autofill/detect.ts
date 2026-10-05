// ─── Autofill Field Detector ─────────────────────────────────────────────────
import { extractElementText } from '../pageText/extract';
import {
  commonAncestor,
  hash,
  labelTextFor,
  norm,
  questionTextFor,
} from './labels';
import type { EditorType, FieldHandle, FieldInfo, FieldKind, OptionInfo } from './types';

export interface ScanOptions {
  ownHost: Element | null;
  isVisible?: (el: Element) => boolean; // injectable for jsdom tests
  root?: ParentNode;
}
export interface ScanResult {
  fields: FieldHandle[];
  scannedAt: number;
  warnings: string[];
}

const EDITOR_SEL = '.monaco-editor, .CodeMirror, .cm-editor, .ace_editor';

const PERSONAL_AUTOCOMPLETE =
  /^(name|given-name|family-name|email|tel|username|new-password|current-password|one-time-code|cc-.*|street-address|postal-code|bday.*|address-.*)$/i;
const SENSITIVE_NAME =
  /(pass(word)?|pwd|card|cvv|cvc|ssn|aadhaar|otp|captcha|token|secret|search|query)/i;

function defaultVisible(el: Element): boolean {
  const cv = (el as any).checkVisibility;
  if (
    typeof cv === 'function' &&
    !cv.call(el, { checkVisibilityCSS: true, visibilityProperty: true })
  )
    return false;
  const r = (el as HTMLElement).getBoundingClientRect?.();
  return !r || r.width > 0 || r.height > 0;
}

// Stable per-element numeric id (WeakMap so it doesn't leak memory)
const ids = new WeakMap<Element, number>();
let idCounter = 0;
const elId = (e: Element): number => {
  let v = ids.get(e);
  if (!v) {
    v = ++idCounter;
    ids.set(e, v);
  }
  return v;
};

function fingerprint(kind: FieldKind, question: string, options: OptionInfo[]): string {
  return `${kind}|${hash(question)}|${options.map(o => hash(o.label)).join(',')}`;
}

export function scanPage(o: ScanOptions): ScanResult {
  const root = o.root ?? document;
  const vis = o.isVisible ?? defaultVisible;
  const warnings: string[] = [];
  const claimed = new Set<Element>();
  const out: FieldHandle[] = [];

  const outside = (el: Element) => !(o.ownHost && o.ownHost.contains(el));

  const claim = (...els: Element[]) =>
    els.forEach(e => {
      claimed.add(e);
      e.querySelectorAll?.('*').forEach(c => claimed.add(c));
    });

  const push = (
    h: Omit<FieldHandle, 'fingerprint' | 'info'> & { info: Omit<FieldInfo, 'id'> },
  ) => {
    const info: FieldInfo = { ...h.info, id: `f${out.length + 1}` };
    out.push({ ...h, info, fingerprint: fingerprint(info.kind, info.question, info.options) });
  };

  const opts = (labels: string[]): OptionInfo[] =>
    labels.map((label, i) => ({ id: `o${i + 1}`, label }));

  // ── 1. Code editors first ────────────────────────────────────────────────────
  const editorRoots = Array.from(root.querySelectorAll(EDITOR_SEL)).filter(outside);
  const topEditors = editorRoots.filter(
    e => !editorRoots.some(x => x !== e && x.contains(e)),
  );
  for (const e of topEditors) {
    if (!vis(e)) continue;
    const type: EditorType = e.matches('.monaco-editor')
      ? 'monaco'
      : e.matches('.CodeMirror')
      ? 'codemirror5'
      : e.matches('.cm-editor')
      ? 'codemirror6'
      : 'ace';
    claim(e);
    push({
      els: [e],
      optionEls: [],
      root: e,
      editor: type,
      info: {
        kind: 'code',
        multi: false,
        question: questionTextFor(e.parentElement ?? e, [e], { min: 40, max: 4000 }),
        options: [],
        language: guessLanguage(e),
        confidence: 0.85,
        source: 'native',
        currentlyFilled: false,
      },
    });
  }

  // Code-like textareas
  for (const t of Array.from(
    root.querySelectorAll<HTMLTextAreaElement>('textarea'),
  ).filter(outside)) {
    if (claimed.has(t) || t.disabled || t.readOnly || !vis(t)) continue;
    const hint = `${t.className} ${t.id} ${t.name}`;
    if (
      !/code|editor|source|solution/i.test(hint) ||
      (t.rows < 6 && t.getBoundingClientRect().height < 120)
    )
      continue;
    claim(t);
    push({
      els: [t],
      optionEls: [],
      root: t,
      editor: 'textarea',
      info: {
        kind: 'code',
        multi: false,
        question: questionTextFor(t.parentElement ?? t, [t], { min: 40, max: 4000 }),
        options: [],
        language: guessLanguage(t),
        confidence: 0.7,
        source: 'heuristic',
        currentlyFilled: t.value.length > 0,
      },
    });
  }

  // Code-like contenteditable
  for (const c of Array.from(
    root.querySelectorAll<HTMLElement>('[contenteditable="true"],[contenteditable=""]'),
  ).filter(outside)) {
    if (claimed.has(c) || !vis(c) || !/code|editor/i.test(String(c.className))) continue;
    claim(c);
    push({
      els: [c],
      optionEls: [],
      root: c,
      editor: 'contenteditable',
      info: {
        kind: 'code',
        multi: false,
        question: questionTextFor(c.parentElement ?? c, [c], { min: 40, max: 4000 }),
        options: [],
        language: guessLanguage(c),
        confidence: 0.6,
        source: 'heuristic',
        currentlyFilled: false,
      },
    });
  }

  // ── 2. Native radio / checkbox groups ────────────────────────────────────────
  for (const type of ['radio', 'checkbox'] as const) {
    const groups = new Map<string, HTMLInputElement[]>();
    for (const el of Array.from(
      root.querySelectorAll<HTMLInputElement>(`input[type=${type}]`),
    ).filter(outside)) {
      if (el.disabled || claimed.has(el)) continue;
      const formKey = el.form ? `form${elId(el.form)}` : 'noform';
      const key = el.name
        ? `${formKey}|${el.name}`
        : `${formKey}|anon${elId(
            el.closest('fieldset,[role=group],[role=radiogroup],ul,ol,div') ??
              el.parentElement ??
              el,
          )}`;
      const arr = groups.get(key);
      if (arr) arr.push(el);
      else groups.set(key, [el]);
    }
    for (const inputs of groups.values()) {
      // A single checkbox is a consent box, not an MCQ
      if (inputs.length < 2) continue;
      if (
        !inputs.some(
          i =>
            vis(i) ||
            vis(i.closest('label') ?? (i.parentElement as Element) ?? i),
        )
      )
        continue;
      const labels = inputs.map(i => labelTextFor(i) || i.value || '(option)');
      const common = commonAncestor(inputs);
      claim(...inputs);
      push({
        els: inputs,
        optionEls: inputs,
        root: common,
        info: {
          kind: 'choice',
          multi: type === 'checkbox',
          question: questionTextFor(
            common,
            inputs.map(i => i.closest('label') ?? i),
          ),
          options: opts(labels),
          confidence: 0.9,
          source: 'native',
          currentlyFilled: inputs.some(i => i.checked),
        },
      });
    }
  }

  // ── 3. ARIA groups ───────────────────────────────────────────────────────────
  for (const g of Array.from(
    root.querySelectorAll('[role=radiogroup],[role=group],[role=listbox]'),
  ).filter(outside)) {
    if (claimed.has(g) || !vis(g)) continue;
    const items = Array.from(
      g.querySelectorAll('[role=radio],[role=checkbox],[role=option]'),
    ).filter(i => !claimed.has(i) && vis(i));
    if (items.length < 2) continue;
    const multi =
      items[0].getAttribute('role') === 'checkbox' ||
      g.getAttribute('aria-multiselectable') === 'true';
    claim(g);
    push({
      els: items,
      optionEls: items,
      root: g,
      info: {
        kind: 'choice',
        multi,
        question: questionTextFor(g, items),
        options: opts(items.map(i => norm(extractElementText(i)))),
        confidence: 0.85,
        source: 'aria',
        currentlyFilled: items.some(
          i =>
            i.getAttribute('aria-checked') === 'true' ||
            i.getAttribute('aria-selected') === 'true',
        ),
      },
    });
  }

  // ── 4. Selects (single) ──────────────────────────────────────────────────────
  for (const s of Array.from(
    root.querySelectorAll<HTMLSelectElement>('select:not([multiple])'),
  ).filter(outside)) {
    if (claimed.has(s) || s.disabled || !vis(s)) continue;
    const real = Array.from(s.options).filter(op => op.value !== '' && !op.disabled);
    if (real.length < 2) continue;
    // Skip language dropdowns adjacent to code editors
    if (
      real.some(op => /python|java\b|c\+\+|javascript/i.test(op.text)) &&
      topEditors.length
    )
      continue;
    claim(s);
    push({
      els: [s],
      optionEls: real,
      root: s,
      info: {
        kind: 'select',
        multi: false,
        question: labelTextFor(s) || questionTextFor(s.parentElement ?? s, [s]),
        options: opts(real.map(op => norm(op.text))),
        confidence: 0.85,
        source: 'native',
        currentlyFilled: s.selectedIndex > 0,
      },
    });
  }

  // ── 5. Text inputs / textareas ───────────────────────────────────────────────
  for (const el of Array.from(
    root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea'),
  ).filter(outside)) {
    if (claimed.has(el) || el.disabled || (el as HTMLInputElement).readOnly || !vis(el))
      continue;
    const isTA = el.localName === 'textarea';
    const type = isTA
      ? 'textarea'
      : (((el as HTMLInputElement).type || 'text').toLowerCase());
    if (!isTA && !['text', 'number', 'search', 'tel', 'url', 'email'].includes(type)) continue;
    // Personal / search boxes are never question answers
    if (type === 'search' || type === 'email' || type === 'tel') continue;
    const ac = el.getAttribute('autocomplete') ?? '';
    if (PERSONAL_AUTOCOMPLETE.test(ac)) continue;
    if (
      SENSITIVE_NAME.test(
        `${el.name} ${el.id} ${el.getAttribute('aria-label') ?? ''}`,
      )
    )
      continue;
    if (el.closest('[role=search], nav, header')) continue;
    const label = labelTextFor(el);
    push({
      els: [el],
      optionEls: [],
      root: el,
      info: {
        kind: isTA ? 'longtext' : 'text',
        multi: false,
        question: label || questionTextFor(el.parentElement ?? el, [el]),
        options: [],
        maxLength: (el as HTMLInputElement).maxLength > 0
          ? (el as HTMLInputElement).maxLength
          : undefined,
        confidence: label ? 0.7 : 0.5,
        source: 'native',
        currentlyFilled: (el as HTMLInputElement).value.length > 0,
      },
    });
  }

  // ── 6. Heuristic custom MCQ blocks (div/li/button lists) ─────────────────────
  const parents = Array.from(
    root.querySelectorAll('div, ul, ol, section'),
  ).filter(outside).slice(0, 3000);

  for (const parent of parents) {
    if (claimed.has(parent) || parent.closest('nav, header, footer, aside')) continue;
    const kids = Array.from(parent.children).filter(k => !claimed.has(k) && vis(k));
    if (kids.length < 2 || kids.length > 8) continue;

    // All children must have the same tag + class signature
    const sig = new Set(
      kids.map(k => k.localName + '|' + Array.from(k.classList).sort().join('.')),
    );
    if (sig.size > 1) continue;
    if (kids.some(k => k.querySelector('input[type=radio],input[type=checkbox],select,textarea')))
      continue;

    const texts = kids.map(k => norm(extractElementText(k)));
    if (texts.some(t => t.length === 0 || t.length > 300)) continue;

    let score = 0;
    const clickable = kids.filter(
      k =>
        getComputedStyle(k).cursor === 'pointer' ||
        k.hasAttribute('onclick') ||
        k.hasAttribute('tabindex'),
    ).length;
    if (clickable === kids.length) score += 2;
    if (
      kids.every(k =>
        /option|choice|answer|opt\b|radio|mcq/i.test(String((k as HTMLElement).className)),
      )
    )
      score += 2;
    if (texts.every(t => /^[\(\[]?[A-Da-d1-4][\)\].:]\s*\S/.test(t))) score += 2;
    if (score < 3) continue;

    claim(...kids);
    push({
      els: kids,
      optionEls: kids,
      root: parent,
      info: {
        kind: 'choice',
        multi: false,
        question: questionTextFor(parent, kids),
        options: opts(texts),
        confidence: Math.min(0.8, 0.4 + score * 0.1),
        source: 'heuristic',
        currentlyFilled: kids.some(
          k =>
            k.getAttribute('aria-checked') === 'true' ||
            /\b(selected|active|checked)\b/.test(String((k as HTMLElement).className)),
        ),
      },
    });
  }

  // Sort by document order
  out.sort((a, b) =>
    a.root.compareDocumentPosition(b.root) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
  );
  // Renumber after sorting
  out.forEach((h, i) => {
    h.info.id = `f${i + 1}`;
  });

  if (!out.length)
    warnings.push(
      'No answerable fields were detected. Use "Pick field" to map one manually.',
    );
  if (out.some(f => f.info.kind === 'choice' && !f.info.question))
    warnings.push(
      'Some questions have no readable text (images?). Add them manually or via Snip.',
    );

  return { fields: out, scannedAt: Date.now(), warnings };
}

function guessLanguage(root: Element): string {
  const mode = root
    .querySelector?.('[data-mode-id]')
    ?.getAttribute('data-mode-id');
  if (mode) return mode;
  const dl =
    root.getAttribute('data-language') ??
    root.closest('[data-language]')?.getAttribute('data-language');
  if (dl) return dl;
  const scope = root.closest('form, section, main') ?? root.ownerDocument.body;
  for (const s of Array.from(scope.querySelectorAll('select'))) {
    if (
      Array.from(s.options).some(o => /python|java\b|c\+\+|javascript/i.test(o.text))
    )
      return norm(s.selectedOptions[0]?.text);
  }
  return '';
}

/**
 * Manual picker result → handle.
 * Re-runs detection on the picked subtree so the UI can show the detected question.
 */
export function classifyPicked(el: Element, ownHost: Element | null): FieldHandle | null {
  const scoped = scanPage({
    ownHost,
    root: el.matches('input,select,textarea') ? (el.parentElement ?? el) : el,
  });
  const h = scoped.fields[0];
  if (!h) return null;
  h.info.source = 'picked';
  h.info.confidence = 1;
  return h;
}
