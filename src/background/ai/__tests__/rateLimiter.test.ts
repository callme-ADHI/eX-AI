import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { acquireToken, on429 } from '../rateLimiter';

describe('Rate Limiter (rateLimiter.ts)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('immediately resolves when tokens are available', async () => {
    const onQueued = vi.fn();
    const tokenPromise = acquireToken(onQueued);

    await expect(tokenPromise).resolves.toBeUndefined();
    expect(onQueued).not.toHaveBeenCalled();
  });

  it('backs off when on429 is called', async () => {
    const backoffPromise = on429('2'); // 2 seconds
    vi.advanceTimersByTime(2000);
    await expect(backoffPromise).resolves.toBeUndefined();
  });
});
