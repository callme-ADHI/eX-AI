import type { FocusSession } from './types';

// ─── Message union type ───────────────────────────────────────────────────────

export type Message =
  | { type: 'OPEN_TAB'; url: string; active?: boolean }
  | { type: 'START_FOCUS_SESSION'; session: Omit<FocusSession, 'id' | 'startedAt' | 'status' | 'distractionAttempts'> }
  | { type: 'PAUSE_FOCUS_SESSION'; id: string }
  | { type: 'RESUME_FOCUS_SESSION'; id: string }
  | { type: 'CANCEL_FOCUS_SESSION'; id: string }
  | { type: 'CLOSE_TABS'; tabIds: number[] }
  | { type: 'REQUEST_SECURITY_REPORT'; origin: string }
  | { type: 'ADD_TASK'; task: { title: string; description: string; category: string; dueAt: number | null; priority: string } }
  | { type: 'UPDATE_TASK'; id: string; updates: Record<string, unknown> }
  | { type: 'DELETE_TASK'; id: string }
  | { type: 'QUERY_PAGE_PERMISSIONS' }
  | { type: 'QUERY_ACTIVE_MEDIA' }
  | {
      type: 'PAGE_META';
      origin: string;
      title: string;
      description: string;
      ogType: string;
      cameraAccessCount: number;
      micAccessCount: number;
      fetchCount: number;
      permissions: Record<string, string>;
    }
  | { type: 'AI_SETTINGS_GET' }
  | { type: 'AI_SETTINGS_SET'; settings: Partial<import('./aiTypes').ExAISettings> }
  | { type: 'AI_KEY_SET'; key: string }
  | { type: 'AI_KEY_CLEAR' }
  | { type: 'AI_MODELS_LIST'; refresh?: boolean }
  | { type: 'SNIP_CAPTURE' }
  | { type: 'OCR_RUN'; dataUrl: string; mode: import('./aiTypes').OCRMode; psmHint?: number }
  | { type: 'OCR_WARM' };

export type MessageResponse<T = any> =
  | { ok: true; data: T }
  | { ok: false; error: string };

// ─── Typed send helper ────────────────────────────────────────────────────────

export function sendMessage<T = any>(message: Message): Promise<MessageResponse<T>> {
  return new Promise((resolve) => {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
      console.warn('[eX1] Messaging fallback: Extension environment not available.', message);
      resolve({ ok: false, error: 'Extension environment not available' });
      return;
    }
    chrome.runtime.sendMessage(message, (response: MessageResponse<T>) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message ?? 'Unknown error' });
      } else {
        resolve(response ?? { ok: true, data: undefined as T });
      }
    });
  });
}
