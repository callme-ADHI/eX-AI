// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { applyPlan, setNativeValue } from '../src/content/autofill/fill';
import { scanPage } from '../src/content/autofill/detect';

const handlesOf = () =>
  new Map(scanPage({ ownHost: null, isVisible: () => true }).fields.map(f => [f.info.id, f]));

describe('applyPlan', () => {
  it('selects a radio, sets text and select, and never submits', async () => {
    document.body.innerHTML = `<form id="f"><p>Q1?</p><label><input type="radio" name="q" value="a"> A</label><label><input type="radio" name="q" value="b"> B</label>
      <label for="t">Name your answer</label><input id="t" type="text">
      <label for="s">Pick one</label><select id="s"><option value="">-</option><option>One</option><option>Two</option></select>
      <button type="submit" id="go">Submit</button></form>`;
    let submitted = false;
    let clickedSubmit = false;
    document.getElementById('f')!.addEventListener('submit', e => {
      e.preventDefault();
      submitted = true;
    });
    document.getElementById('go')!.addEventListener('click', () => {
      clickedSubmit = true;
    });

    const h = handlesOf();
    const ids = Array.from(h.keys());
    const choice = Array.from(h.values()).find(x => x.info.kind === 'choice')!;
    const text = Array.from(h.values()).find(x => x.info.kind === 'text')!;
    const select = Array.from(h.values()).find(x => x.info.kind === 'select')!;

    const out = await applyPlan(
      [
        { fieldId: choice.info.id, optionIds: [choice.info.options[1].id], overwrite: false },
        { fieldId: text.info.id, text: 'hello', overwrite: false },
        { fieldId: select.info.id, text: 'Two', overwrite: false },
      ],
      { delayMs: 0, handles: h },
    );

    expect(ids.length).toBe(3);
    expect((document.querySelector('input[value=b]') as HTMLInputElement).checked).toBe(true);
    expect((document.getElementById('t') as HTMLInputElement).value).toBe('hello');
    expect((document.getElementById('s') as HTMLSelectElement).value).toBe('Two');
    expect(out.results.every(r => r.status === 'filled')).toBe(true);
    expect(clickedSubmit).toBe(false);
    expect(submitted).toBe(false);
  });

  it('skips already answered fields unless overwrite is on', async () => {
    document.body.innerHTML = `<label for="t">A</label><input id="t" type="text" value="old">`;
    const h = handlesOf();
    const f = Array.from(h.values())[0];
    const r1 = await applyPlan([{ fieldId: f.info.id, text: 'new', overwrite: false }], {
      delayMs: 0,
      handles: h,
    });
    expect(r1.results[0].status).toBe('skipped');

    const r2 = await applyPlan([{ fieldId: f.info.id, text: 'new', overwrite: true }], {
      delayMs: 0,
      handles: h,
    });
    expect(r2.results[0].status).toBe('filled');
    r2.undo();
    expect((document.getElementById('t') as HTMLInputElement).value).toBe('old');
  });

  it('fires input and change events with the native setter (controlled-input friendly)', () => {
    document.body.innerHTML = `<input id="i" type="text">`;
    const el = document.getElementById('i') as HTMLInputElement;
    const events: string[] = [];
    el.addEventListener('input', () => events.push('input'));
    el.addEventListener('change', () => events.push('change'));
    setNativeValue(el, 'abc');
    expect(el.value).toBe('abc');
    expect(events).toEqual(['input', 'change']);
  });

  it('refuses to click a submit-like custom option', async () => {
    document.body.innerHTML = `<div class="opts"><div class="option" tabindex="0">A. yes</div><div class="option" tabindex="0">Submit</div></div>`;
    const h = new Map(
      scanPage({ ownHost: null, isVisible: () => true }).fields.map(f => [f.info.id, f]),
    );
    for (const f of h.values()) {
      if (f.info.kind !== 'choice') continue;
      const submitIdx = f.info.options.findIndex(o => /submit/i.test(o.label));
      if (submitIdx < 0) continue;
      const out = await applyPlan(
        [{ fieldId: f.info.id, optionIds: [f.info.options[submitIdx].id], overwrite: true }],
        { delayMs: 0, handles: h },
      );
      expect(out.results[0].status).toBe('failed');
    }
  });
});
