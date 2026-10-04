import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  parseSSEChunk,
  parseSSEData,
  splitReasoningContent,
  ThinkingStreamSplitter,
} from '../sse';
import { isChatModel } from '../models';
import { prepareAndTrimMessages, estimateTokens } from '../context';
import type { ChatMessage } from '../../../shared/aiTypes';
import { OCR_PREFIX } from '../../../shared/aiPrompts';

describe('SSE Parser (sse.ts)', () => {
  it('handles complete events separated by newline', () => {
    const chunk = 'data: {"foo":"bar"}\n\ndata: {"baz":1}\n';
    const { events, buffer } = parseSSEChunk('', chunk);
    expect(events).toEqual([
      { data: '{"foo":"bar"}' },
      { data: '{"baz":1}' },
    ]);
    expect(buffer).toBe('');
  });

  it('handles chunk boundaries across tokens and lines', () => {
    const chunk1 = 'data: {"partial":';
    const res1 = parseSSEChunk('', chunk1);
    expect(res1.events).toHaveLength(0);
    expect(res1.buffer).toBe('data: {"partial":');

    const chunk2 = ' "value"}\n';
    const res2 = parseSSEChunk(res1.buffer, chunk2);
    expect(res2.events).toEqual([{ data: '{"partial": "value"}' }]);
    expect(res2.buffer).toBe('');
  });

  it('tolerates CRLF and carriage returns', () => {
    const chunk = 'data: {"line":1}\r\ndata: {"line":2}\r\n';
    const { events } = parseSSEChunk('', chunk);
    expect(events).toHaveLength(2);
    expect(events[0].data).toBe('{"line":1}');
    expect(events[1].data).toBe('{"line":2}');
  });

  it('parses [DONE] marker as null in parseSSEData', () => {
    const parsed = parseSSEData('[DONE]');
    expect(parsed).toBeNull();
  });

  it('parses error payloads mid-stream', () => {
    const payload = JSON.stringify({ error: { message: 'Rate limit', code: 429 } });
    const parsed = parseSSEData(payload);
    expect(parsed?.error?.message).toBe('Rate limit');
    expect(parsed?.error?.code).toBe(429);
  });
});

describe('Reasoning & <think> splitting', () => {
  it('splits inline <think> tags in static content', () => {
    const input = {
      content: '<think>Let me calculate 2+2.\nIt is 4.</think>The answer is 4.',
    };
    const { reasoning, content } = splitReasoningContent(input);
    expect(reasoning).toBe('Let me calculate 2+2.\nIt is 4.');
    expect(content).toBe('The answer is 4.');
  });

  it('handles explicit reasoning_content delta', () => {
    const input = {
      content: null,
      reasoning_content: 'Considering possibilities...',
    };
    const { reasoning, content } = splitReasoningContent(input);
    expect(reasoning).toBe('Considering possibilities...');
    expect(content).toBeNull();
  });

  it('streams <think> tags across multiple delta chunks with ThinkingStreamSplitter', () => {
    const splitter = new ThinkingStreamSplitter();

    // Chunk 1: Starts think tag
    const c1 = splitter.processDelta({ content: 'Here is thought: <think>step 1' });
    expect(c1.content).toBe('Here is thought: ');
    expect(c1.reasoning).toBe('step 1');

    // Chunk 2: Inside think tag
    const c2 = splitter.processDelta({ content: ', step 2' });
    expect(c2.content).toBeNull();
    expect(c2.reasoning).toBe(', step 2');

    // Chunk 3: Ends think tag and continues answer
    const c3 = splitter.processDelta({ content: ' finished.</think>Final answer.' });
    expect(c3.reasoning).toBe(' finished.');
    expect(c3.content).toBe('Final answer.');

    // Chunk 4: Plain answer
    const c4 = splitter.processDelta({ content: ' Done.' });
    expect(c4.reasoning).toBeNull();
    expect(c4.content).toBe(' Done.');
  });
});

describe('Model list filtering (models.ts)', () => {
  it('filters out non-chat models by pattern', () => {
    expect(isChatModel('nvidia/nemotron-3-super-120b-a12b', false)).toBe(true);
    expect(isChatModel('openai/gpt-oss-20b', false)).toBe(true);
    expect(isChatModel('nvidia/nv-embedqa-e5-v5', false)).toBe(false);
    expect(isChatModel('nvidia/reranking-v1', false)).toBe(false);
    expect(isChatModel('meta/llama-guard-3-8b', false)).toBe(false);
    expect(isChatModel('nvidia/neva-22b', false)).toBe(false);
  });

  it('includes non-chat models if showAll is true', () => {
    expect(isChatModel('nvidia/nv-embedqa-e5-v5', true)).toBe(true);
    expect(isChatModel('meta/llama-guard-3-8b', true)).toBe(true);
  });
});

describe('Context trimming (context.ts)', () => {
  it('estimates tokens based on chars/4', () => {
    expect(estimateTokens('1234')).toBe(1);
    expect(estimateTokens('12345678')).toBe(2);
    expect(estimateTokens('')).toBe(0);
  });

  it('prefixes OCR user messages with warning', () => {
    const history: ChatMessage[] = [
      {
        id: '1',
        role: 'user',
        content: 'Solve this equation: 2x = 10',
        fromOcr: true,
        timestamp: Date.now(),
      },
    ];

    const messages = prepareAndTrimMessages('System prompt', history, 1000);
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('system');
    expect(messages[1].content).toContain(OCR_PREFIX);
    expect(messages[1].content).toContain('Solve this equation: 2x = 10');
  });

  it('strips past reasoning and trims older messages when budget is tight', () => {
    const history: ChatMessage[] = [
      {
        id: '1',
        role: 'user',
        content: 'A'.repeat(400), // ~100 tokens
        timestamp: Date.now(),
      },
      {
        id: '2',
        role: 'assistant',
        content: 'B'.repeat(400), // ~100 tokens
        reasoning: 'Secret thoughts',
        timestamp: Date.now(),
      },
      {
        id: '3',
        role: 'user',
        content: 'C'.repeat(400), // ~100 tokens
        timestamp: Date.now(),
      },
    ];

    // Budget: 150 tokens (system is ~10 tokens, so room for only the last message)
    const messages = prepareAndTrimMessages('System', history, 150);
    expect(messages[0].role).toBe('system');
    expect(messages).toHaveLength(2);
    expect(messages[1].content).toBe('C'.repeat(400));
  });
});
