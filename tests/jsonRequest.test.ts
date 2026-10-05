import { describe, it, expect, vi } from 'vitest';
import { handleJsonRequest } from '../src/background/ai/jsonRequest';
import { DEFAULT_EXAI_SETTINGS } from '../src/shared/aiTypes';

describe('handleJsonRequest', () => {
  const baseSettings = {
    ...DEFAULT_EXAI_SETTINGS,
    autofillEnabled: true,
    autofillAllow: ['testsite.com'],
  };

  const validSender = {
    tab: { id: 1 },
    url: 'https://testsite.com/exam',
  } as chrome.runtime.MessageSender;

  it('rejects when autofillEnabled is false', async () => {
    const res = await handleJsonRequest(
      { type: 'AI_JSON_REQUEST', user: 'hello' },
      validSender,
      { ...baseSettings, autofillEnabled: false },
      'mock-key',
    );
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/disabled/i);
  });

  it('rejects when the sender host is not allowed by policy', async () => {
    const res = await handleJsonRequest(
      { type: 'AI_JSON_REQUEST', user: 'hello' },
      { tab: { id: 1 }, url: 'https://hackerrank.com/test' } as chrome.runtime.MessageSender,
      baseSettings,
      'mock-key',
    );
    expect(res.ok).toBe(false);
    expect(res.error).toBeDefined();
  });

  it('rejects when user payload exceeds 60000 characters', async () => {
    const res = await handleJsonRequest(
      { type: 'AI_JSON_REQUEST', user: 'a'.repeat(60_001) },
      validSender,
      baseSettings,
      'mock-key',
    );
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/60,000/);
  });

  it('success returns only final content with reasoning stripped, clamps maxTokens to 8192, and passes no tools', async () => {
    const mockStreamOnce = vi.fn(async (options: any) => {
      // Assertions on options passed to streamOnce
      expect(options.tools).toBe(false);
      expect(options.maxTokens).toBe(8192); // clamped from 10000
      return {
        finishReason: 'stop',
        content: '{"answers":[]}',
        reasoning: 'I thought about it deeply.',
        toolCalls: [],
      };
    });

    const res = await handleJsonRequest(
      { type: 'AI_JSON_REQUEST', user: 'fields', maxTokens: 10_000 },
      validSender,
      baseSettings,
      'mock-key',
      mockStreamOnce,
    );

    expect(res.ok).toBe(true);
    expect(res.text).toBe('{"answers":[]}');
    // Ensure reasoning is not in res.text
    expect(res.text).not.toContain('thought');
    expect(mockStreamOnce).toHaveBeenCalled();
  });
});
