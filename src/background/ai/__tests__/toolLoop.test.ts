import { describe, it, expect, vi } from 'vitest';
import { runToolLoop } from '../toolLoop';
import * as nvidia from '../nvidiaClient';

describe('runToolLoop', () => {
  it('completes normally when model returns no tool calls', async () => {
    const streamOnceSpy = vi.spyOn(nvidia, 'streamOnce').mockResolvedValueOnce({
      finishReason: 'stop',
      content: 'Here is the answer.',
      reasoning: '',
      toolCalls: [],
    });

    const sent: any[] = [];
    await runToolLoop({
      model: 'test-model',
      apiMessages: [{ role: 'user', content: 'hi' }],
      think: false,
      apiKey: 'nvapi-test',
      abortSignal: new AbortController().signal,
      sendMsg: (m) => sent.push(m),
      waitForToolResult: vi.fn(),
    });

    expect(streamOnceSpy).toHaveBeenCalledTimes(1);
    expect(sent.some((m) => m.type === 'DONE')).toBe(true);
  });
});
