// ─── Context Trimming and Message Formatting ─────────────────────────────────

import type { ChatMessage } from '../../shared/aiTypes';
import { OCR_PREFIX } from '../../shared/aiPrompts';

export interface APIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Estimates token count as chars / 4 (standard OpenAI/NIM rule of thumb)
 */
export function estimateTokens(text: string): number {
  return Math.ceil((text || '').length / 4);
}

/**
 * Prepares and trims message history to fit within maxTokens.
 * - Always includes the system prompt.
 * - Formats user messages flagged with fromOcr with OCR_PREFIX.
 * - Never includes past reasoning in history sent to the model.
 * - Retains as many recent messages as fit within maxTokens (default 60,000).
 */
export function prepareAndTrimMessages(
  systemPrompt: string,
  history: ChatMessage[],
  maxTokens = 60_000
): APIMessage[] {
  const systemMsg: APIMessage = { role: 'system', content: systemPrompt };
  const systemTokens = estimateTokens(systemPrompt);

  let budgetRemaining = maxTokens - systemTokens;
  if (budgetRemaining <= 0) {
    return [systemMsg];
  }

  // Convert history messages into clean API messages (no reasoning, prefix OCR)
  const cleanHistory: APIMessage[] = history.map((msg) => {
    let content = msg.content || '';
    if (msg.role === 'user' && msg.fromOcr && !content.startsWith(OCR_PREFIX)) {
      content = `${OCR_PREFIX}\n\n${content}`;
    }
    return {
      role: msg.role,
      content,
    };
  });

  // Pick recent messages from the end until budget is exhausted
  const selected: APIMessage[] = [];
  for (let i = cleanHistory.length - 1; i >= 0; i--) {
    const msg = cleanHistory[i];
    const tokens = estimateTokens(msg.content);
    if (budgetRemaining - tokens < 0) {
      break;
    }
    budgetRemaining -= tokens;
    selected.unshift(msg);
  }

  return [systemMsg, ...selected];
}
