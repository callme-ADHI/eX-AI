// ─── NVIDIA NIM Streaming Client & Port Handler ──────────────────────────────
/*
 * Tool-calling capability probe notes (section 13.1):
 * NVIDIA NIM OpenAPI endpoint `https://integrate.api.nvidia.com/v1/chat/completions`
 * supports OpenAI-compatible function calling format:
 *   tools: [{ type: 'function', function: { name, description, parameters } }]
 * Models with function-calling support (e.g. Nemotron/Llama-3-instruct) stream
 * choices[0].delta.tool_calls chunks which are accumulated by ToolCallAccumulator.
 * When finish_reason is "tool_calls", the client executes the tool in the content
 * script and returns tool messages until finish_reason is "stop".
 * Models without tool support gracefully stream standard text content.
 */

import type {
  PortMessageIn,
  PortMessageOut,
  AIErrorCode,
} from '../../shared/aiTypes';
import { getSystemPrompt } from '../../shared/aiPrompts';
import { TOOL_DEFS } from '../../shared/toolDefs';
import { LIMITS } from '../../shared/constants';
import { getApiKey, loadSettings } from './settings';
import { acquireToken, on429 } from './rateLimiter';
import {
  parseSSEChunk,
  parseSSEData,
  ThinkingStreamSplitter,
} from './sse';
import { prepareAndTrimMessages } from './context';
import { ToolCallAccumulator, type AccumulatedToolCall } from './toolCallAccumulator';
import { runToolLoop } from './toolLoop';

const API_BASE = 'https://integrate.api.nvidia.com/v1/chat/completions';
const FIRST_TOKEN_TIMEOUT_MS = 45_000;
const PING_INTERVAL_MS = 20_000;

export interface StreamOnceOptions {
  model: string;
  apiMessages: any[];
  think: boolean;
  apiKey: string;
  tools?: boolean;
  abortSignal: AbortSignal;
  maxTokens?: number;
  responseFormat?: { type: string };
  onReasoning?: (text: string) => void;
  onDelta?: (text: string) => void;
  onModel?: (id: string) => void;
}

export interface StreamOnceResult {
  finishReason: string;
  content: string;
  reasoning: string;
  toolCalls: AccumulatedToolCall[];
  usage?: { prompt_tokens: number; completion_tokens: number };
}

/**
 * Executes a single streaming generation request to the NVIDIA NIM endpoint.
 */
export async function streamOnce(options: StreamOnceOptions): Promise<StreamOnceResult> {
  const { model, apiMessages, think, apiKey, tools, abortSignal, maxTokens, responseFormat, onReasoning, onDelta, onModel } = options;

  if (onModel) onModel(model);

  const bodyPayload: Record<string, unknown> = {
    model,
    messages: apiMessages,
    stream: true,
    max_tokens: Math.min(maxTokens ?? 4096, 8192),
    temperature: think ? 0.6 : 0.7,
    top_p: 0.95,
    chat_template_kwargs: { enable_thinking: think },
  };

  if (responseFormat) {
    bodyPayload.response_format = responseFormat;
  }

  if (tools) {
    bodyPayload.tools = TOOL_DEFS;
  }

  const res = await fetch(API_BASE, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
    },
    body: JSON.stringify(bodyPayload),
    signal: abortSignal,
  });

  if (!res.ok) {
    throw new Error(`Model ${model} returned HTTP ${res.status}: ${res.statusText}`);
  }

  if (!res.body) {
    throw new Error('Response has no readable body stream.');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const splitter = new ThinkingStreamSplitter();
  const accumulator = new ToolCallAccumulator();

  let sseBuffer = '';
  let completeContent = '';
  let completeReasoning = '';
  let finishReason = '';
  let usage: { prompt_tokens: number; completion_tokens: number } | undefined;

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
        throw new Error(parsed.error.message || 'Stream error from model.');
      }

      if (parsed.usage) {
        usage = parsed.usage;
      }

      const choice = parsed.choices?.[0];
      const delta = choice?.delta || parsed.delta;

      if (delta) {
        // Collect tool calls if model is calling tools
        if (delta.tool_calls && Array.isArray(delta.tool_calls)) {
          accumulator.pushDelta(delta.tool_calls);
        }

        const { reasoning, content } = splitter.processDelta(delta);
        if (reasoning) {
          completeReasoning += reasoning;
          if (onReasoning) onReasoning(reasoning);
        }
        if (content) {
          completeContent += content;
          if (onDelta) onDelta(content);
        }
      }

      if (choice?.finish_reason) {
        finishReason = choice.finish_reason;
      }
    }
  }

  // Flush trailing buffer
  if (sseBuffer.trim()) {
    const { events } = parseSSEChunk(sseBuffer, '\n');
    for (const ev of events) {
      const parsed = parseSSEData(ev.data);
      if (parsed?.choices?.[0]?.finish_reason) {
        finishReason = parsed.choices[0].finish_reason;
      }
      if (parsed?.usage) {
        usage = parsed.usage;
      }
    }
  }

  return {
    finishReason: finishReason || 'stop',
    content: completeContent,
    reasoning: completeReasoning,
    toolCalls: accumulator.finalize(),
    usage,
  };
}

export function initAIClient() {
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== 'ex-ai-chat') return;

    let currentAbortController: AbortController | null = null;
    let pingInterval: ReturnType<typeof setInterval> | null = null;
    const toolResolvers = new Map<string, (res: { ok: boolean; content: string }) => void>();

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
      if (msg.type === 'TOOL_RESULT') {
        const resolver = toolResolvers.get(msg.id);
        if (resolver) {
          resolver({ ok: msg.ok, content: msg.content });
          toolResolvers.delete(msg.id);
        }
        return;
      }

      if (msg.type === 'ABORT') {
        if (currentAbortController) {
          currentAbortController.abort();
          currentAbortController = null;
        }
        for (const resolver of toolResolvers.values()) {
          resolver({ ok: false, content: 'Aborted by user' });
        }
        toolResolvers.clear();
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

        const systemPrompt = getSystemPrompt(msg.mode || settings.mode, !!msg.tools);
        const apiMessages = prepareAndTrimMessages(systemPrompt, msg.messages, 60_000, msg.context?.block);

        currentAbortController = new AbortController();
        startPing();

        const waitForToolResult = (id: string): Promise<{ ok: boolean; content: string }> => {
          return new Promise((resolve) => {
            const timer = setTimeout(() => {
              toolResolvers.delete(id);
              resolve({
                ok: false,
                content: '<tool_result untrusted="true">Tool execution timed out.</tool_result>',
              });
            }, LIMITS.toolCallTimeoutMs);

            toolResolvers.set(id, (res) => {
              clearTimeout(timer);
              resolve(res);
            });
          });
        };

        try {
          if (msg.tools) {
            await runToolLoop({
              model: primaryModel,
              apiMessages,
              think: msg.think ?? settings.think,
              apiKey,
              abortSignal: currentAbortController.signal,
              sendMsg,
              waitForToolResult,
            });
          } else {
            await streamWithFallback({
              candidateModels,
              apiMessages,
              think: msg.think ?? settings.think,
              apiKey,
              abortSignal: currentAbortController.signal,
              sendMsg,
            });
          }
        } catch (err: any) {
          if (!currentAbortController.signal.aborted) {
            sendMsg({
              type: 'ERROR',
              code: 'unknown',
              message: err.message || 'Stream processing failed.',
            });
          }
        } finally {
          stopPing();
          currentAbortController = null;
          toolResolvers.clear();
        }
      }
    });

    port.onDisconnect.addListener(() => {
      if (currentAbortController) {
        currentAbortController.abort();
        currentAbortController = null;
      }
      for (const resolver of toolResolvers.values()) {
        resolver({ ok: false, content: 'Port disconnected' });
      }
      toolResolvers.clear();
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

    sendMsg({ type: 'MODEL', id: model });

    try {
      await acquireToken((etaMs) => {
        sendMsg({ type: 'QUEUED', etaMs });
      });
    } catch {
      // ignore
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

    const onParentAbort = () => localAbort.abort();
    abortSignal.addEventListener('abort', onParentAbort);

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

        if (res.status === 403) {
          lastError = {
            code: 'forbidden-model',
            message: `Access to model '${model}' is not registered. Please visit build.nvidia.com to register.`,
          };
          break;
        }

        if (!res.ok) {
          lastError = {
            code: res.status >= 500 ? 'network' : 'unknown',
            message: `Model ${model} returned HTTP ${res.status}: ${res.statusText}`,
          };
          break;
        }

        if (!res.body) {
          throw new Error('Response has no readable body stream.');
        }

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

        // Flush trailing buffer
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
          if (!hasReceivedFirstToken) {
            lastError = {
              code: 'timeout',
              message: `Model ${model} did not return tokens within 45s. Falling back...`,
            };
            break;
          }
        } else {
          lastError = {
            code: 'network',
            message: err.message || 'Network error occurred while connecting to NVIDIA API.',
          };
          break;
        }
      }
    }

    cleanupTimeout();
    abortSignal.removeEventListener('abort', onParentAbort);

    if (success) return;
  }

  sendMsg({
    type: 'ERROR',
    code: lastError.code,
    message: lastError.message,
  });
}
