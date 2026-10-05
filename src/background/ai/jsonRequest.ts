// ─── AI JSON Request Handler for Service Worker ──────────────────────────────
import { isAutofillAllowed } from '../../shared/autofillPolicy';
import { AUTOFILL_SYSTEM } from '../../shared/autofillPrompts';
import type { ExAISettings } from '../../shared/aiTypes';
import { streamOnce, type StreamOnceOptions, type StreamOnceResult } from './nvidiaClient';
import { acquireToken, on429 } from './rateLimiter';
import { loadSettings, getApiKey } from './settings';

export interface JsonRequestMessage {
  type: 'AI_JSON_REQUEST';
  purpose?: string;
  user: string;
  think?: boolean;
  maxTokens?: number;
}

export interface JsonRequestResponse {
  ok: boolean;
  text?: string;
  model?: string;
  error?: string;
}

export type StreamOnceFn = (options: StreamOnceOptions) => Promise<StreamOnceResult>;

/**
 * Pure handler for AI_JSON_REQUEST to allow easy unit testing and direct invocation.
 */
export async function handleJsonRequest(
  m: any,
  sender: chrome.runtime.MessageSender,
  settings: ExAISettings,
  apiKey: string | null,
  streamOnceFn: StreamOnceFn = streamOnce,
): Promise<JsonRequestResponse> {
  if (!sender.tab?.id || !sender.url) {
    return { ok: false, error: 'no tab' };
  }

  if (!settings.autofillEnabled) {
    return { ok: false, error: 'Autofill is disabled in settings.' };
  }

  let hostname = '';
  try {
    hostname = new URL(sender.url).hostname;
  } catch {
    return { ok: false, error: 'Invalid sender URL.' };
  }

  const allow = isAutofillAllowed(hostname, settings.autofillAllow || []);
  if (!allow.allowed) {
    return { ok: false, error: allow.reason };
  }

  if (typeof m?.user !== 'string' || m.user.length > 60_000) {
    return { ok: false, error: 'User payload exceeds 60,000 characters.' };
  }

  if (!apiKey) {
    return { ok: false, error: 'NVIDIA API key not set. Please enter your key in Settings.' };
  }

  const candidateModels = Array.from(
    new Set([settings.model, ...(settings.fallbackChain || [])]),
  ).filter(Boolean);

  if (candidateModels.length === 0) {
    candidateModels.push('nvidia/nemotron-3-super-120b-a12b');
  }

  const messages = [
    { role: 'system', content: AUTOFILL_SYSTEM },
    { role: 'user', content: m.user },
  ];

  const maxTokens = Math.min(m.maxTokens ?? 4096, 8192);
  const think = m.think ?? settings.think ?? false;
  let lastError = 'Failed to generate proposal.';

  for (const model of candidateModels) {
    try {
      await acquireToken(() => {}).catch(() => {});
      const controller = new AbortController();
      const res = await streamOnceFn({
        model,
        apiMessages: messages,
        think,
        apiKey,
        tools: false,
        abortSignal: controller.signal,
        maxTokens,
      });

      return {
        ok: true,
        text: res.content,
        model,
      };
    } catch (err: any) {
      lastError = err?.message || String(err);
      if (/429/.test(lastError)) {
        on429(null);
      }
    }
  }

  return { ok: false, error: lastError };
}

export function registerJsonRequest(
  getSettings: () => Promise<ExAISettings> = loadSettings,
  getKey: () => Promise<string | null> = getApiKey,
  streamOnceFn: StreamOnceFn = streamOnce,
): void {
  chrome.runtime.onMessage.addListener((m, sender, send) => {
    if (m?.type !== 'AI_JSON_REQUEST') return;
    (async () => {
      try {
        const [settings, key] = await Promise.all([getSettings(), getKey()]);
        const res = await handleJsonRequest(m, sender, settings, key, streamOnceFn);
        send(res);
      } catch (e: any) {
        send({ ok: false, error: String(e?.message ?? e).slice(0, 120) });
      }
    })();
    return true; // async response
  });
}
