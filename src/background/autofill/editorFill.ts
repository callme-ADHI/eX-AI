// ─── Code Editor Fill in Service Worker / MAIN World ─────────────────────────
import { isAutofillAllowed } from '../../shared/autofillPolicy';

/**
 * MUST be fully self-contained (it is serialised and run in the page's JS world).
 * No imports, no outer variables.
 */
export function fillEditorInMainWorld(
  token: string,
  code: string,
): { ok: boolean; method?: string; error?: string } {
  const root = document.querySelector(`[data-exai-target="${token}"]`) as any;
  if (!root) return { ok: false, error: 'target not found' };
  const w = window as any;
  try {
    // Monaco
    if (w.monaco?.editor) {
      const eds: any[] = w.monaco.editor.getEditors?.() ?? [];
      const ed = eds.find(e => {
        const n = e.getContainerDomNode?.();
        return n && (root.contains(n) || n.contains(root));
      });
      if (ed) {
        ed.focus();
        const model = ed.getModel();
        ed.executeEdits('exai-autofill', [
          { range: model.getFullModelRange(), text: code, forceMoveMarkers: true },
        ]);
        return model.getValue().replace(/\r\n/g, '\n') === code.replace(/\r\n/g, '\n')
          ? { ok: true, method: 'monaco' }
          : { ok: false, error: 'monaco verify failed' };
      }
    }

    // CodeMirror 5
    const cm5el = root.classList?.contains('CodeMirror')
      ? root
      : root.querySelector?.('.CodeMirror');
    if (cm5el?.CodeMirror) {
      cm5el.CodeMirror.setValue(code);
      return { ok: cm5el.CodeMirror.getValue() === code, method: 'codemirror5' };
    }

    // CodeMirror 6 (the .cm-content element exposes cmView.view)
    const cm6el = root.classList?.contains('cm-content')
      ? root
      : root.querySelector?.('.cm-content');
    const view = cm6el?.cmView?.view ?? cm6el?.cmView?.rootView?.view;
    if (view?.dispatch) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: code } });
      return { ok: view.state.doc.toString() === code, method: 'codemirror6' };
    }

    // Ace
    const aceEl = root.classList?.contains('ace_editor')
      ? root
      : root.querySelector?.('.ace_editor');
    if (aceEl) {
      const ed = aceEl.env?.editor ?? w.ace?.edit?.(aceEl);
      if (ed?.setValue) {
        ed.setValue(code, 1);
        return { ok: ed.getValue() === code, method: 'ace' };
      }
    }

    // Last resort: type into the editor's hidden input with execCommand
    const input = root.querySelector?.('textarea.inputarea, textarea') ?? null;
    if (input) {
      input.focus();
      document.execCommand('selectAll');
      document.execCommand('insertText', false, code);
      return { ok: true, method: 'insertText' };
    }

    return { ok: false, error: 'no supported editor API found' };
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? e).slice(0, 120) };
  }
}

export function registerEditorFill(getAllow: () => Promise<string[]>): void {
  chrome.runtime.onMessage.addListener((m, sender, send) => {
    if (m?.type !== 'AUTOFILL_EDITOR_FILL') return;
    (async () => {
      try {
        if (!sender.tab?.id || !sender.url) return send({ ok: false, error: 'no tab' });
        if (!/^[a-f0-9]{32}$/.test(String(m.token))) return send({ ok: false, error: 'bad token' });
        if (typeof m.code !== 'string' || m.code.length > 50_000)
          return send({ ok: false, error: 'bad code' });
        const allow = isAutofillAllowed(new URL(sender.url).hostname, await getAllow());
        if (!allow.allowed) return send({ ok: false, error: allow.reason });
        const r = await chrome.scripting.executeScript({
          target: { tabId: sender.tab.id, frameIds: [sender.frameId ?? 0] },
          world: 'MAIN',
          func: fillEditorInMainWorld,
          args: [m.token, m.code],
        });
        send(r[0]?.result ?? { ok: false, error: 'no result' });
      } catch (e: any) {
        send({ ok: false, error: String(e?.message ?? e).slice(0, 120) });
      }
    })();
    return true; // async response
  });
}
