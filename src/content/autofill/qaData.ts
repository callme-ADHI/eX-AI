// ─── QA (no-AI) fill plans ───────────────────────────────────────────────────
import type { FieldHandle, PlanItem } from './types';

export type QaMode = 'first' | 'last' | 'random' | 'placeholder' | 'long';

/** mulberry32 — reproducible seeded PRNG. Returns a function. */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Build a deterministic QA fill plan for the given fields and mode. */
export function buildQaPlan(
  fields: FieldHandle[],
  mode: QaMode,
  seed = 1234,
  overwrite = false,
): PlanItem[] {
  const rand = rng(seed);
  return fields.map((h): PlanItem => {
    const base = { fieldId: h.info.id, overwrite };
    const n = h.info.options.length;
    switch (h.info.kind) {
      case 'choice': {
        if (!n) return base;
        const idx =
          mode === 'last' ? n - 1 : mode === 'random' ? Math.floor(rand() * n) : 0;
        return { ...base, optionIds: [h.info.options[idx].id] };
      }
      case 'select': {
        if (!n) return base;
        const idx =
          mode === 'last' ? n - 1 : mode === 'random' ? Math.floor(rand() * n) : 0;
        return { ...base, text: h.info.options[idx].label };
      }
      case 'text':
        return {
          ...base,
          text:
            mode === 'long'
              ? 'x'.repeat(Math.min(h.info.maxLength ?? 200, 200))
              : 'Test answer',
        };
      case 'longtext':
        return {
          ...base,
          text:
            mode === 'long'
              ? 'Lorem ipsum dolor sit amet. '.repeat(20).trim()
              : 'This is a test answer.',
        };
      case 'code':
        return {
          ...base,
          language: h.info.language,
          code:
            mode === 'placeholder' || mode === 'first'
              ? '# test code\nprint("hello")\n'
              : 'print("hello")\n'.repeat(mode === 'long' ? 200 : 1),
        };
    }
  });
}
