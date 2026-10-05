// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { scanPage } from '../src/content/autofill/detect';

// Helper: run scan with ownHost=null and always-visible
const scan = (root?: ParentNode) =>
  scanPage({ ownHost: null, isVisible: () => true, root });

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('scanPage', () => {
  it('detects native radio groups with question and options', () => {
    document.body.innerHTML = `
      <div class="q">
        <p>What is 2 + 2?</p>
        <ul>
          <li><label><input type="radio" name="q1" value="a"> 3</label></li>
          <li><label><input type="radio" name="q1" value="b"> 4</label></li>
        </ul>
      </div>`;
    const { fields } = scan();
    expect(fields.length).toBe(1);
    expect(fields[0].info.kind).toBe('choice');
    expect(fields[0].info.multi).toBe(false);
    expect(fields[0].info.question).toContain('2 + 2');
    expect(fields[0].info.options.map(o => o.label)).toEqual(['3', '4']);
  });

  it('detects checkbox groups as multi', () => {
    document.body.innerHTML = `
      <fieldset>
        <legend>Pick primes</legend>
        <label><input type="checkbox" name="p" value="2"> 2</label>
        <label><input type="checkbox" name="p" value="4"> 4</label>
        <label><input type="checkbox" name="p" value="5"> 5</label>
      </fieldset>`;
    const { fields } = scan();
    expect(fields.length).toBe(1);
    expect(fields[0].info.multi).toBe(true);
    expect(fields[0].info.question).toBe('Pick primes');
  });

  it('ignores a lone checkbox, password, email and search inputs', () => {
    document.body.innerHTML = `
      <label><input type="checkbox"> I agree</label>
      <input type="password" name="pw">
      <input type="email" name="e">
      <input type="text" name="search">`;
    const { fields } = scan();
    // Only the plain text input named "search" might pass, but sensitive-name filter blocks it
    // lone checkbox, password, email should all be excluded
    const hasPassword = fields.some(f => f.els[0] instanceof HTMLInputElement
      && (f.els[0] as HTMLInputElement).type === 'password');
    const hasEmail = fields.some(f => f.els[0] instanceof HTMLInputElement
      && (f.els[0] as HTMLInputElement).type === 'email');
    expect(hasPassword).toBe(false);
    expect(hasEmail).toBe(false);
    // The single checkbox should also be excluded
    const checkboxFields = fields.filter(f => f.info.kind === 'choice');
    expect(checkboxFields.length).toBe(0);
  });

  it('detects ARIA radio groups', () => {
    document.body.innerHTML = `
      <div role="radiogroup" aria-labelledby="l">
        <span id="l">Capital of France?</span>
        <div role="radio" aria-checked="false">Berlin</div>
        <div role="radio" aria-checked="false">Paris</div>
      </div>`;
    const { fields } = scan();
    expect(fields.length).toBe(1);
    expect(fields[0].info.source).toBe('aria');
    expect(fields[0].info.question).toContain('Capital of France');
  });

  it('detects text inputs with labels and selects', () => {
    document.body.innerHTML = `
      <label for="n">Your answer</label><input id="n" type="text">
      <label for="s">Pick</label>
      <select id="s">
        <option value="">-</option>
        <option value="1">One</option>
        <option value="2">Two</option>
      </select>`;
    const { fields } = scan();
    const kinds = fields.map(f => f.info.kind).sort();
    expect(kinds).toEqual(['select', 'text']);
  });

  it('detects a code textarea and not as plain text', () => {
    document.body.innerHTML = `
      <h3>Write a function</h3>
      <p>Return the sum of two numbers and print the result to stdout for the given input.</p>
      <textarea class="code-editor" rows="12"></textarea>`;
    const { fields } = scan();
    expect(fields.length).toBe(1);
    expect(fields[0].info.kind).toBe('code');
    expect(fields[0].editor).toBe('textarea');
  });

  it('skips controls inside our own host', () => {
    document.body.innerHTML = `<div id="own"><input type="text" name="x"></div>`;
    const ownHost = document.getElementById('own')!;
    const { fields } = scanPage({ ownHost, isVisible: () => true });
    expect(fields.length).toBe(0);
  });

  it('assigns sequential ids f1, f2... in document order', () => {
    document.body.innerHTML = `
      <label for="a">First</label><input id="a" type="text">
      <label for="b">Second</label><input id="b" type="text">`;
    const { fields } = scan();
    expect(fields.length).toBe(2);
    expect(fields[0].info.id).toBe('f1');
    expect(fields[1].info.id).toBe('f2');
  });

  it('never touches input[type=hidden]', () => {
    document.body.innerHTML = `<input type="hidden" name="token" value="abc">`;
    const { fields } = scan();
    expect(fields.length).toBe(0);
  });
});
