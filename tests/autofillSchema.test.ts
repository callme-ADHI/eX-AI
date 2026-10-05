import { describe, it, expect } from 'vitest';
import { extractJson, validateProposal } from '../src/shared/autofillSchema';

const fields = [
  { id: 'f1', kind: 'choice', multi: false, options: [{ id: 'o1' }, { id: 'o2' }] },
  { id: 'f2', kind: 'choice', multi: true, options: [{ id: 'o1' }, { id: 'o2' }, { id: 'o3' }] },
  { id: 'f3', kind: 'text', multi: false, maxLength: 5, options: [] },
  { id: 'f4', kind: 'code', multi: false, options: [] },
];

describe('extractJson', () => {
  it('strips think blocks and fences', () => {
    expect(extractJson('<think>x {y}</think>```json\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it('handles braces inside strings', () => {
    expect(extractJson('{"code":"if (x) { y }"} tail')).toBe('{"code":"if (x) { y }"}');
  });

  it('returns null without JSON', () => {
    expect(extractJson('no json')).toBeNull();
  });
});

describe('validateProposal', () => {
  it('accepts valid answers', () => {
    const r = validateProposal(
      '{"answers":[{"field_id":"f1","option_ids":["o2"],"confidence":0.9},{"field_id":"f3","text":"abcdefgh","confidence":0.5},{"field_id":"f4","code":"print(1)","language":"python","confidence":0.7}]}',
      fields,
    );
    expect(r.errors).toEqual([]);
    expect(r.answers[0].optionIds).toEqual(['o2']);
    expect(r.answers[1].text).toBe('abcde'); // clamped to maxLength
    expect(r.answers[2].code).toBe('print(1)');
  });

  it('rejects unknown ids and over-selection', () => {
    const r = validateProposal(
      '{"answers":[{"field_id":"f9","text":"x"},{"field_id":"f1","option_ids":["o1","o2"]},{"field_id":"f2","option_ids":["o7"]}]}',
      fields,
    );
    expect(r.answers).toEqual([]);
    expect(r.errors.length).toBe(3);
  });

  it('allows several options only for multi fields', () => {
    const r = validateProposal(
      '{"answers":[{"field_id":"f2","option_ids":["o1","o3"],"confidence":1}]}',
      fields,
    );
    expect(r.answers[0].optionIds).toEqual(['o1', 'o3']);
  });

  it('ignores duplicates and defaults bad confidence', () => {
    const r = validateProposal(
      '{"answers":[{"field_id":"f1","option_ids":["o1"],"confidence":7},{"field_id":"f1","option_ids":["o2"]}]}',
      fields,
    );
    expect(r.answers.length).toBe(1);
    expect(r.answers[0].confidence).toBe(0.5);
  });
});
