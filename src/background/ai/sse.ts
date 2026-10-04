// ─── SSE Stream Parser ────────────────────────────────────────────────────────
// Pure, tested parser for OpenAI-compatible SSE streams.
// Handles: partial chunks, CRLF, data: {json}, data: [DONE], mid-stream errors.

export interface SSEEvent {
  data: string;
}

/**
 * Parse SSE lines from a text chunk, tolerating partial lines.
 * Returns complete events and the leftover partial line.
 */
export function parseSSEChunk(
  buffer: string,
  chunk: string
): { events: SSEEvent[]; buffer: string } {
  const text = buffer + chunk;
  // Normalise line endings
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n');

  const events: SSEEvent[] = [];

  // The last element may be a partial line (no trailing \n)
  // If chunk ended with \n, the last element will be ''
  for (let i = 0; i < lines.length - 1; i++) {
    const line = lines[i];

    // Skip comment and empty lines
    if (line === '' || line.startsWith(':')) continue;

    if (line.startsWith('data: ')) {
      const data = line.slice(6);
      events.push({ data });
    }
  }

  // Keep the last (potentially incomplete) line as new buffer
  const remaining = lines[lines.length - 1];

  return { events, buffer: remaining };
}

/**
 * Split NVIDIA reasoning content from regular content for a single string block.
 */
export interface SplitContent {
  reasoning: string | null;
  content: string | null;
}

export function splitReasoningContent(delta: {
  content?: string | null;
  reasoning_content?: string | null;
}): SplitContent {
  const reasoningField = delta.reasoning_content ?? null;
  let content = delta.content ?? null;
  let reasoning = reasoningField;

  // Also check for inline <think>…</think> blocks
  if (content) {
    const thinkMatch = content.match(/^<think>([\s\S]*?)<\/think>([\s\S]*)$/s);
    if (thinkMatch) {
      reasoning = (reasoning ? reasoning + '\n' : '') + thinkMatch[1];
      content = thinkMatch[2] || null;
    }
  }

  return { reasoning, content };
}

/**
 * Stateful stream splitter for handling reasoning that arrives either:
 * 1) Via `delta.reasoning_content` (or `delta.reasoning`), OR
 * 2) Token-by-token inline `<think>...</think>` inside `delta.content` across chunk boundaries.
 */
export class ThinkingStreamSplitter {
  private inThinkTag = false;

  processDelta(delta: {
    content?: string | null;
    reasoning_content?: string | null;
  }): {
    reasoning: string | null;
    content: string | null;
  } {
    const directReasoning = delta.reasoning_content ?? null;
    const rawContent = delta.content ?? null;

    if (!rawContent) {
      return { reasoning: directReasoning, content: null };
    }

    const reasoningParts: string[] = directReasoning ? [directReasoning] : [];
    const contentParts: string[] = [];

    let remaining = rawContent;
    while (remaining.length > 0) {
      if (!this.inThinkTag) {
        const startIdx = remaining.indexOf('<think>');
        if (startIdx !== -1) {
          if (startIdx > 0) {
            contentParts.push(remaining.slice(0, startIdx));
          }
          this.inThinkTag = true;
          remaining = remaining.slice(startIdx + 7);
        } else {
          contentParts.push(remaining);
          remaining = '';
        }
      } else {
        const endIdx = remaining.indexOf('</think>');
        if (endIdx !== -1) {
          reasoningParts.push(remaining.slice(0, endIdx));
          this.inThinkTag = false;
          remaining = remaining.slice(endIdx + 8);
        } else {
          reasoningParts.push(remaining);
          remaining = '';
        }
      }
    }

    return {
      reasoning: reasoningParts.length > 0 ? reasoningParts.join('') : null,
      content: contentParts.length > 0 ? contentParts.join('') : null,
    };
  }
}

/**
 * Parse a complete SSE data line into a structured event.
 * Returns null for [DONE] or unparseable line.
 */
export function parseSSEData(data: string): {
  choices?: Array<{
    delta?: { content?: string | null; reasoning_content?: string | null };
    finish_reason?: string | null;
  }>;
  delta?: { content?: string | null; reasoning_content?: string | null };
  finish_reason?: string;
  usage?: { prompt_tokens: number; completion_tokens: number };
  error?: { message: string; code?: string | number };
} | null {
  if (data === '[DONE]') return null;

  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}
