import { describe, it, expect } from 'vitest';
import { ToolCallAccumulator } from '../toolCallAccumulator';

describe('ToolCallAccumulator', () => {
  it('assembles fragmented streaming tool calls', () => {
    const acc = new ToolCallAccumulator();
    acc.pushDelta([
      { index: 0, id: 'call_1', function: { name: 'fetch_', arguments: '{"ur' } },
    ]);
    acc.pushDelta([
      { index: 0, function: { name: 'page', arguments: 'l":"/pricing"}' } },
    ]);
    expect(acc.hasCalls()).toBe(true);
    const calls = acc.finalize();
    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe('fetch_page');
    expect(calls[0].args).toEqual({ url: '/pricing' });
  });

  it('handles multiple calls in one stream', () => {
    const acc = new ToolCallAccumulator();
    acc.pushDelta([
      { index: 0, id: 'c1', function: { name: 'get_page_structure', arguments: '{}' } },
      { index: 1, id: 'c2', function: { name: 'get_page_links', arguments: '{"filter":"nav"}' } },
    ]);
    const calls = acc.finalize();
    expect(calls).toHaveLength(2);
    expect(calls[0].name).toBe('get_page_structure');
    expect(calls[1].name).toBe('get_page_links');
    expect(calls[1].args).toEqual({ filter: 'nav' });
  });
});
