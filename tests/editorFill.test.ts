// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fillEditorInMainWorld, registerEditorFill } from '../src/background/autofill/editorFill';

describe('fillEditorInMainWorld', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    delete (window as any).monaco;
    delete (window as any).ace;
  });

  it('returns target not found for invalid token', () => {
    const res = fillEditorInMainWorld('nonexistent', 'print(1)');
    expect(res).toEqual({ ok: false, error: 'target not found' });
  });

  it('fills Monaco editor when global monaco is present', () => {
    const div = document.createElement('div');
    div.setAttribute('data-exai-target', 'token-monaco');
    document.body.appendChild(div);

    let docValue = '';
    const fakeEditor = {
      getContainerDomNode: () => div,
      focus: vi.fn(),
      getModel: () => ({
        getFullModelRange: () => ({ startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 }),
        getValue: () => docValue,
      }),
      executeEdits: (_source: string, edits: any[]) => {
        docValue = edits[0].text;
      },
    };

    (window as any).monaco = {
      editor: {
        getEditors: () => [fakeEditor],
      },
    };

    const res = fillEditorInMainWorld('token-monaco', 'const x = 42;');
    expect(res).toEqual({ ok: true, method: 'monaco' });
    expect(docValue).toBe('const x = 42;');
    expect(fakeEditor.focus).toHaveBeenCalled();
  });

  it('fills CodeMirror 5 element', () => {
    const div = document.createElement('div');
    div.className = 'CodeMirror';
    div.setAttribute('data-exai-target', 'token-cm5');
    document.body.appendChild(div);

    let docValue = '';
    (div as any).CodeMirror = {
      setValue: (val: string) => {
        docValue = val;
      },
      getValue: () => docValue,
    };

    const res = fillEditorInMainWorld('token-cm5', 'def foo(): pass');
    expect(res).toEqual({ ok: true, method: 'codemirror5' });
    expect(docValue).toBe('def foo(): pass');
  });

  it('fills CodeMirror 6 element', () => {
    const div = document.createElement('div');
    div.className = 'cm-content';
    div.setAttribute('data-exai-target', 'token-cm6');
    document.body.appendChild(div);

    let docValue = '';
    (div as any).cmView = {
      view: {
        state: {
          doc: {
            get length() {
              return docValue.length;
            },
            toString: () => docValue,
          },
        },
        dispatch: (tr: { changes: { from: number; to: number; insert: string } }) => {
          docValue = tr.changes.insert;
        },
      },
    };

    const res = fillEditorInMainWorld('token-cm6', 'SELECT * FROM users;');
    expect(res).toEqual({ ok: true, method: 'codemirror6' });
    expect(docValue).toBe('SELECT * FROM users;');
  });

  it('fills Ace editor', () => {
    const div = document.createElement('div');
    div.className = 'ace_editor';
    div.setAttribute('data-exai-target', 'token-ace');
    document.body.appendChild(div);

    let docValue = '';
    (div as any).env = {
      editor: {
        setValue: (val: string) => {
          docValue = val;
        },
        getValue: () => docValue,
      },
    };

    const res = fillEditorInMainWorld('token-ace', 'body { color: red; }');
    expect(res).toEqual({ ok: true, method: 'ace' });
    expect(docValue).toBe('body { color: red; }');
  });

  it('falls back to hidden textarea insertText when no editor API is detected', () => {
    const div = document.createElement('div');
    div.setAttribute('data-exai-target', 'token-textarea');
    const ta = document.createElement('textarea');
    ta.className = 'inputarea';
    div.appendChild(ta);
    document.body.appendChild(div);

    // mock execCommand
    document.execCommand = vi.fn();
    const res = fillEditorInMainWorld('token-textarea', 'fallback code');
    expect(res).toEqual({ ok: true, method: 'insertText' });
    expect(document.execCommand).toHaveBeenCalledWith('insertText', false, 'fallback code');
  });
});

describe('registerEditorFill', () => {
  it('rejects disallowed sender URLs, missing tabs, and malformed tokens/code', async () => {
    let messageListener: any;
    const mockChrome = {
      runtime: {
        onMessage: {
          addListener: vi.fn((fn) => {
            messageListener = fn;
          }),
        },
      },
      scripting: {
        executeScript: vi.fn(async () => [{ result: { ok: true, method: 'monaco' } }]),
      },
    };
    (globalThis as any).chrome = mockChrome;

    registerEditorFill(async () => ['allowed.test']);

    // Missing tab
    const send1 = vi.fn();
    messageListener({ type: 'AUTOFILL_EDITOR_FILL', token: 'a'.repeat(32), code: 'x' }, {}, send1);
    await new Promise((r) => setTimeout(r, 10));
    expect(send1).toHaveBeenCalledWith(expect.objectContaining({ ok: false, error: 'no tab' }));

    // Bad token
    const send2 = vi.fn();
    messageListener(
      { type: 'AUTOFILL_EDITOR_FILL', token: 'invalid-token', code: 'x' },
      { tab: { id: 1 }, url: 'https://allowed.test/page' },
      send2,
    );
    await new Promise((r) => setTimeout(r, 10));
    expect(send2).toHaveBeenCalledWith(expect.objectContaining({ ok: false, error: 'bad token' }));

    // Bad code (too long)
    const send3 = vi.fn();
    messageListener(
      { type: 'AUTOFILL_EDITOR_FILL', token: 'a'.repeat(32), code: 'x'.repeat(60_000) },
      { tab: { id: 1 }, url: 'https://allowed.test/page' },
      send3,
    );
    await new Promise((r) => setTimeout(r, 10));
    expect(send3).toHaveBeenCalledWith(expect.objectContaining({ ok: false, error: 'bad code' }));

    // Invalid sender URL
    const send4 = vi.fn();
    messageListener(
      { type: 'AUTOFILL_EDITOR_FILL', token: 'a'.repeat(32), code: 'valid code' },
      { tab: { id: 1 }, url: 'invalid-url' },
      send4,
    );
    await new Promise((r) => setTimeout(r, 10));
    expect(send4).toHaveBeenCalledWith(expect.objectContaining({ ok: false }));

    // Allowed origin
    const send5 = vi.fn();
    messageListener(
      { type: 'AUTOFILL_EDITOR_FILL', token: 'a'.repeat(32), code: 'valid code' },
      { tab: { id: 1 }, url: 'https://allowed.test/page' },
      send5,
    );
    await new Promise((r) => setTimeout(r, 10));
    expect(send5).toHaveBeenCalledWith({ ok: true, method: 'monaco' });
  });
});
