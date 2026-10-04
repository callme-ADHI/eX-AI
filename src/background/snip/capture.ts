// ─── Visible Tab Capture and OCR Forwarding ──────────────────────────────────

import { ensureOffscreen } from './offscreenManager';
import type { OCRMode } from '../../shared/aiTypes';

let lastCaptureTime = 0;
const CAPTURE_DEBOUNCE_MS = 600;

export interface CaptureResponse {
  ok: boolean;
  dataUrl?: string;
  reason?: string;
}

/**
 * Captures the currently visible viewport of the sender's tab.
 * Debounced to ~2 calls per second to satisfy Chrome rate limits.
 */
export async function captureVisibleTab(
  windowId?: number
): Promise<CaptureResponse> {
  const now = Date.now();
  if (now - lastCaptureTime < CAPTURE_DEBOUNCE_MS) {
    return { ok: false, reason: 'Capture requested too quickly' };
  }
  lastCaptureTime = now;

  try {
    const targetWindowId = windowId ?? chrome.windows.WINDOW_ID_CURRENT;
    const dataUrl = await chrome.tabs.captureVisibleTab(targetWindowId, {
      format: 'png',
    });

    if (!dataUrl) {
      return { ok: false, reason: "Can't capture this page" };
    }

    return { ok: true, dataUrl };
  } catch (err: any) {
    console.error('[eX-AI] captureVisibleTab failed:', err);
    return {
      ok: false,
      reason: err.message || "Can't capture this page (restricted origin or internal page)",
    };
  }
}

/**
 * Handler for OCR_WARM: ensures offscreen document is open and warms up Tesseract.
 */
export async function handleOcrWarm(): Promise<{ ok: boolean }> {
  await ensureOffscreen();
  return new Promise<{ ok: boolean }>((resolve) => {
    chrome.runtime.sendMessage(
      { target: 'offscreen', type: 'OCR_WARM' },
      (res) => {
        resolve(res ?? { ok: true });
      }
    );
  });
}

/**
 * Handler for OCR_RUN: forwards to offscreen document and returns recognition result.
 */
export async function handleOcrRun(
  dataUrl: string,
  mode: OCRMode,
  psmHint?: number
): Promise<{ ok: boolean; data?: any; error?: string }> {
  await ensureOffscreen();
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { target: 'offscreen', type: 'OCR_RUN', dataUrl, mode, psmHint },
      (res) => {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: chrome.runtime.lastError.message });
        } else {
          resolve(res || { ok: false, error: 'No response from OCR worker' });
        }
      }
    );
  });
}
