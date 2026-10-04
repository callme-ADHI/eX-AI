// ─── NVIDIA NIM Streaming Client & Port Handler ──────────────────────────────
/*
 * Working request body structure for NVIDIA NIM (OpenAI-compatible):
 * POST https://integrate.api.nvidia.com/v1/chat/completions
 * Headers:
 *   Authorization: Bearer nvapi-...
 *   Content-Type: application/json
 *   Accept: text/event-stream
 * Body:
 *   {
 *     "model": "nvidia/nemotron-3-super-120b-a12b",
 *     "messages": [
 *       { "role": "system", "content": "..." },
 *       { "role": "user", "content": "..." }
 *     ],
 *     "stream": true,
 *     "max_tokens": 4096,
 *     "temperature": think ? 0.6 : 0.7,
 *     "top_p": 0.95,
 *     "chat_template_kwargs": { "enable_thinking": think }
 *   }
 */

import type {
  PortMessageIn,
  PortMessageOut,
  AIErrorCode,
} from '../../shared/aiTypes';
import { getSystemPrompt } from '../../shared/aiPrompts';
import { getApiKey, loadSettings } from './settings';
import { acquireToken, on429 } from './rateLimiter';
import {
  parseSSEChunk,
  parseSSEData,
  ThinkingStreamSplitter,
} from './sse';
import { prepareAndTrimMessages } from './context';

const API_BASE = 'https://integrate.api.nvidia.com/v1/chat/completions';
const FIRST_TOKEN_TIMEOUT_MS = 45_000;
const PING_INTERVAL_MS = 20_000;

export function initAIClient() {
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== 'ex-ai-chat') return;

    let currentAbortController: AbortController | null = null;
    let pingInterval: ReturnType<typeof setInterval> | null = null;

    const stopPing = () => {
      if (pingInterval) {
        clearInterval(pingInterval);
        pingInterval = null;
      }
    };

    const startPing = () => {
      stopPing();
      pingInterval = setInterval(() => {
        try {
          port.postMessage({ type: 'PING' } satisfies PortMessageOut);
        } catch {
          stopPing();
        }
      }, PING_INTERVAL_MS);
    };

    const sendMsg = (msg: PortMessageOut) => {
      try {
        port.postMessage(msg);
      } catch {
        // Port disconnected
        if (currentAbortController) {
          currentAbortController.abort();
        }
      }
    };

    port.onMessage.addListener(async (msg: PortMessageIn) => {
      if (msg.type === 'ABORT') {
        if (currentAbortController) {
          currentAbortController.abort();
          currentAbortController = null;
        }
        stopPing();
        return;
      }

      if (msg.type === 'CHAT_START') {
        // Abort any existing stream
        if (currentAbortController) {
          currentAbortController.abort();
          currentAbortController = null;
        }

        const apiKey = await getApiKey();
        if (!apiKey) {
          sendMsg({
            type: 'ERROR',
            code: 'auth',
            message: 'NVIDIA API key not set. Please enter your key in Settings.',
          });
          return;
        }

        const settings = await loadSettings();
        const primaryModel = msg.model || settings.model;
        const candidateModels = Array.from(
          new Set([primaryModel, ...(settings.fallbackChain || [])])
        );

        const systemPrompt = getSystemPrompt(msg.mode || settings.mode);
        const apiMessages = prepareAndTrimMessages(systemPrompt, msg.messages);

        currentAbortController = new AbortController();
        startPing();

        try {
          await streamWithFallback({
            candidateModels,
            apiMessages,
            think: msg.think ?? settings.think,
            apiKey,
            abortSignal: currentAbortController.signal,
            sendMsg,
          });
        } finally {
          stopPing();
          currentAbortController = null;
        }
      }
    });

    port.onDisconnect.addListener(() => {
      if (currentAbortController) {
        currentAbortController.abort();
        currentAbortController = null;
      }
      stopPing();
    });
  });
}

interface StreamOptions {
  candidateModels: string[];
  apiMessages: Array<{ role: string; content: string }>;
  think: boolean;
  apiKey: string;
  abortSignal: AbortSignal;
  sendMsg: (msg: PortMessageOut) => void;
}

async function streamWithFallback(options: StreamOptions): Promise<void> {
  const { candidateModels, apiMessages, think, apiKey, abortSignal, sendMsg } = options;

  let lastError: { code: AIErrorCode; message: string } = {
    code: 'unknown',
    message: 'Failed to generate response.',
  };

  for (let modelIdx = 0; modelIdx < candidateModels.length; modelIdx++) {
    const model = candidateModels[modelIdx];
    if (abortSignal.aborted) return;

    // Surfaced model to UI
    sendMsg({ type: 'MODEL', id: model });

    // Rate limiter: acquire token
    try {
      await acquireToken((etaMs) => {
        sendMsg({ type: 'QUEUED', etaMs });
      });
    } catch {
      // Aborted or limiter issue
    }

    if (abortSignal.aborted) return;

    let hasReceivedFirstToken = false;
    let firstTokenTimeoutId: ReturnType<typeof setTimeout> | null = null;
    let localAbort = new AbortController();

    const cleanupTimeout = () => {
      if (firstTokenTimeoutId) {
        clearTimeout(firstTokenTimeoutId);
        firstTokenTimeoutId = null;
      }
    };

    // Forward parent abort to local abort
    const onParentAbort = () => localAbort.abort();
    abortSignal.addEventListener('abort', onParentAbort);

    // 45s first token timer
    firstTokenTimeoutId = setTimeout(() => {
      if (!hasReceivedFirstToken) {
        localAbort.abort();
      }
    }, FIRST_TOKEN_TIMEOUT_MS);

    let retryCount = 0;
    let success = false;

    while (retryCount <= 1 && !success) {
      if (abortSignal.aborted) {
        cleanupTimeout();
        abortSignal.removeEventListener('abort', onParentAbort);
        return;
      }

      try {
        const bodyPayload: Record<string, unknown> = {
          model,
          messages: apiMessages,
          stream: true,
          max_tokens: 4096,
          temperature: think ? 0.6 : 0.7,
          top_p: 0.95,
          chat_template_kwargs: { enable_thinking: think },
        };

        const res = await fetch(API_BASE, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'Accept': 'text/event-stream',
          },
          body: JSON.stringify(bodyPayload),
          signal: localAbort.signal,
        });

        // 401: Invalid key -> Do NOT fallback
        if (res.status === 401) {
          cleanupTimeout();
          abortSignal.removeEventListener('abort', onParentAbort);
          sendMsg({
            type: 'ERROR',
            code: 'auth',
            message: 'Invalid NVIDIA API key (401 Unauthorized). Check your key in Settings.',
          });
          return;
        }

        // 429: Rate limit -> backoff and retry same model ONCE. Do NOT fail over to another model.
        if (res.status === 429) {
          if (retryCount === 0) {
            retryCount++;
            await on429(res.headers.get('Retry-After'));
            continue;
          } else {
            cleanupTimeout();
            abortSignal.removeEventListener('abort', onParentAbort);
            sendMsg({
              type: 'ERROR',
              code: 'rate-limit',
              message: 'Rate limit exceeded (~40 requests/minute limit shared across models). Please wait a few seconds.',
            });
            return;
          }
        }

        // 403: Model access registration needed
        if (res.status === 403) {
          lastError = {
            code: 'forbidden-model',
            message: `Access to model '${model}' is not registered. Please visit build.nvidia.com to register.`,
          };
          break; // Fallback to next model
        }

        // 404 or 5xx: Server errors -> Fallback to next model
        if (!res.ok) {
          lastError = {
            code: res.status >= 500 ? 'network' : 'unknown',
            message: `Model ${model} returned HTTP ${res.status}: ${res.statusText}`,
          };
          break; // Fallback to next model
        }

        if (!res.body) {
          throw new Error('Response has no readable body stream.');
        }

        // Stream processing
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        const splitter = new ThinkingStreamSplitter();
        let sseBuffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const textChunk = decoder.decode(value, { stream: true });
          const { events, buffer } = parseSSEChunk(sseBuffer, textChunk);
          sseBuffer = buffer;

          for (const ev of events) {
            const parsed = parseSSEData(ev.data);
            if (!parsed) continue;

            if (parsed.error) {
              sendMsg({
                type: 'ERROR',
                code: 'unknown',
                message: parsed.error.message || 'Stream error from model.',
              });
              success = true;
              break;
            }

            const choice = parsed.choices?.[0];
            const delta = choice?.delta || parsed.delta;

            if (delta) {
              const { reasoning, content } = splitter.processDelta(delta);

              if (reasoning) {
                if (!hasReceivedFirstToken) {
                  hasReceivedFirstToken = true;
                  cleanupTimeout();
                }
                sendMsg({ type: 'REASONING', text: reasoning });
              }

              if (content) {
                if (!hasReceivedFirstToken) {
                  hasReceivedFirstToken = true;
                  cleanupTimeout();
                }
                sendMsg({ type: 'DELTA', text: content });
              }
            }

            if (choice?.finish_reason) {
              sendMsg({
                type: 'DONE',
                finishReason: choice.finish_reason,
                usage: parsed.usage,
              });
              success = true;
            }
          }

          if (success) break;
        }

        // Flush any trailing sse buffer
        if (!success && sseBuffer.trim()) {
          const { events } = parseSSEChunk(sseBuffer, '\n');
          for (const ev of events) {
            const parsed = parseSSEData(ev.data);
            if (parsed?.choices?.[0]?.finish_reason) {
              sendMsg({
                type: 'DONE',
                finishReason: parsed.choices[0].finish_reason,
                usage: parsed.usage,
              });
              success = true;
            }
          }
        }

        if (hasReceivedFirstToken) {
          success = true;
          cleanupTimeout();
          abortSignal.removeEventListener('abort', onParentAbort);
          return;
        }
      } catch (err: any) {
        if (abortSignal.aborted) {
          cleanupTimeout();
          abortSignal.removeEventListener('abort', onParentAbort);
          return;
        }

        if (err.name === 'AbortError') {
          // Could be first token timeout
          if (!hasReceivedFirstToken) {
            lastError = {
              code: 'timeout',
              message: `Model ${model} did not return tokens within 45s. Falling back...`,
            };
            break; // Try next model
          }
        } else {
          lastError = {
            code: 'network',
            message: err.message || 'Network error occurred while connecting to NVIDIA API.',
          };
          break; // Try next model
        }
      }
    }

    cleanupTimeout();
    abortSignal.removeEventListener('abort', onParentAbort);

    if (success) return;
  }

  // All models in fallback chain exhausted
  sendMsg({
    type: 'ERROR',
    code: lastError.code,
    message: lastError.message,
  });
}
