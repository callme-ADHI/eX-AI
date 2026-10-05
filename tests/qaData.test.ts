// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { buildQaPlan } from '../src/content/autofill/qaData';

const mk = (id: string, kind: any, n = 3): any => ({
  info: {
    id,
    kind,
    options: Array.from({ length: n }, (_, i) => ({ id: `o${i + 1}`, label: `L${i + 1}` })),
  },
});

describe('buildQaPlan', () => {
  it('first/last/random are deterministic for a seed', () => {
    const fields = [mk('f1', 'choice'), mk('f2', 'choice')];
    expect(buildQaPlan(fields, 'first')[0].optionIds).toEqual(['o1']);
    expect(buildQaPlan(fields, 'last')[1].optionIds).toEqual(['o3']);
    expect(buildQaPlan(fields, 'random', 7)).toEqual(buildQaPlan(fields, 'random', 7));
  });

  it('fills text and code placeholders', () => {
    const p = buildQaPlan([mk('f1', 'text', 0), mk('f2', 'code', 0)], 'placeholder');
    expect(p[0].text).toBe('Test answer');
    expect(p[1].code).toContain('print');
  });
});
