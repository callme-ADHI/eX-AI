// ─── Offscreen Document Lifecycle Manager ────────────────────────────────────

let creatingDocumentPromise: Promise<void> | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

function resetIdleTimer() {
  if (idleTimer) {
    clearTimeout(idleTimer);
  }
  idleTimer = setTimeout(async () => {
    try {
      await closeOffscreen();
    } catch {
      // Ignore
    }
  }, IDLE_TIMEOUT_MS);
}

/**
 * Checks if an offscreen document is currently active.
 */
async function hasOffscreenDocument(): Promise<boolean> {
  if ('getContexts' in chrome.runtime) {
    const contexts = await (chrome.runtime as any).getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
    });
    return contexts && contexts.length > 0;
  }
  // Fallback check
  return false;
}

/**
 * Ensures the offscreen document is open. Serialises concurrent requests.
 */
export async function ensureOffscreen(): Promise<void> {
  resetIdleTimer();

  if (await hasOffscreenDocument()) {
    return;
  }

  if (creatingDocumentPromise) {
    return creatingDocumentPromise;
  }

  creatingDocumentPromise = (async () => {
    try {
      await chrome.offscreen.createDocument({
        url: 'offscreen.html',
        reasons: ['WORKERS' as any],
        justification: 'Run offline OCR in a Web Worker',
      });
    } catch (err: any) {
      if (err.message && err.message.includes('Only a single offscreen document may be created')) {
        // Already exists
        return;
      }
      throw err;
    } finally {
      creatingDocumentPromise = null;
    }
  })();

  return creatingDocumentPromise;
}

/**
 * Closes the offscreen document to free memory.
 */
export async function closeOffscreen(): Promise<void> {
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }

  if (await hasOffscreenDocument()) {
    try {
      await chrome.offscreen.closeDocument();
    } catch {
      // Ignore
    }
  }
}
