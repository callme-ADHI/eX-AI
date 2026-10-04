// ─── Token Bucket Rate Limiter ────────────────────────────────────────────────
// 35 requests / 60 seconds (NVIDIA NIM free tier ≈40 RPM shared across models).
// FIFO queue of pending waiters.

interface Waiter {
  resolve: () => void;
  enqueueAt: number;
  onQueued: (etaMs: number) => void;
}

const CAPACITY = 35;
const REFILL_MS = 60_000; // 60 seconds

let tokens = CAPACITY;
let lastRefill = Date.now();
const queue: Waiter[] = [];
let processingQueue = false;

/** Refill tokens based on elapsed time */
function refill() {
  const now = Date.now();
  const elapsed = now - lastRefill;
  if (elapsed > 0) {
    const newTokens = (elapsed / REFILL_MS) * CAPACITY;
    tokens = Math.min(CAPACITY, tokens + newTokens);
    lastRefill = now;
  }
}

/** Estimate ms until we have a token */
function msUntilToken(): number {
  refill();
  if (tokens >= 1) return 0;
  const needed = 1 - tokens;
  return Math.ceil((needed / CAPACITY) * REFILL_MS);
}

/** Process the FIFO queue */
async function drainQueue() {
  if (processingQueue) return;
  processingQueue = true;

  while (queue.length > 0) {
    refill();
    if (tokens >= 1) {
      tokens -= 1;
      const waiter = queue.shift()!;
      waiter.resolve();
    } else {
      const wait = msUntilToken();
      await sleep(wait);
    }
  }

  processingQueue = false;
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Acquire a rate-limit token.
 * If immediately available, resolves right away.
 * If queue has waiting items, enqueues and calls onQueued(etaMs).
 */
export async function acquireToken(onQueued: (etaMs: number) => void): Promise<void> {
  refill();

  if (tokens >= 1 && queue.length === 0) {
    tokens -= 1;
    return;
  }

  // Must wait — estimate ETA
  let eta = 0;
  for (let i = 0; i < queue.length + 1; i++) {
    eta += msUntilToken() + (i * REFILL_MS / CAPACITY);
  }

  return new Promise<void>((resolve) => {
    queue.push({
      resolve,
      enqueueAt: Date.now(),
      onQueued,
    });
    onQueued(Math.round(eta));
    drainQueue();
  });
}

/** Call on HTTP 429 to handle back-off */
export async function on429(retryAfterHeader: string | null): Promise<void> {
  const wait = retryAfterHeader ? parseInt(retryAfterHeader, 10) * 1000 : 5_000;
  // Drain all tokens to prevent further requests
  tokens = 0;
  lastRefill = Date.now() - REFILL_MS + wait;
  await sleep(wait);
}

// Export for testing
export { tokens as _tokens, CAPACITY as _CAPACITY };
