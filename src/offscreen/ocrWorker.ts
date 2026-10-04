// ─── Tesseract Worker Manager (Persistent Worker & Single-Job Queue) ──────────

import { createWorker, OEM } from 'tesseract.js';
import type { OCRMode } from '../shared/aiTypes';
import { preprocessImage } from './preprocess';
import { postprocessOCR } from './postprocess';

export interface OCRResult {
  text: string;
  confidence: number;
  ms: number;
  mode: OCRMode;
}

let workerInstance: any = null;
let isInitializing = false;
let initPromise: Promise<any> | null = null;

// Sequential job queue
let queuePromise = Promise.resolve();

/**
 * Initializes or returns the singleton Tesseract worker with local assets.
 * Zero network requests!
 */
export async function getOrCreateWorker(): Promise<any> {
  if (workerInstance) return workerInstance;
  if (isInitializing && initPromise) return initPromise;

  isInitializing = true;
  initPromise = (async () => {
    try {
      const workerPath = chrome.runtime.getURL('ocr/worker.min.js');
      const corePath = chrome.runtime.getURL('ocr/tesseract-core-simd-lstm.wasm.js');
      const langPath = chrome.runtime.getURL('ocr/');

      const worker = await createWorker('eng', OEM.LSTM_ONLY, {
        workerPath,
        corePath,
        langPath,
        workerBlobURL: false,
        gzip: true,
      });

      workerInstance = worker;
      return worker;
    } catch (err) {
      console.error('[eX-AI] Failed to create Tesseract worker:', err);
      workerInstance = null;
      throw err;
    } finally {
      isInitializing = false;
      initPromise = null;
    }
  })();

  return initPromise;
}

/**
 * Warms up the worker in advance (called on overlay open)
 */
export async function warmWorker(): Promise<void> {
  try {
    await getOrCreateWorker();
  } catch (err) {
    console.warn('[eX-AI] Worker warmup failed (will retry on run):', err);
  }
}

/**
 * Runs OCR through a FIFO queue ensuring 1 job at a time.
 */
export function queueOCR(
  dataUrl: string,
  mode: OCRMode,
  psmHint = 6
): Promise<OCRResult> {
  return new Promise<OCRResult>((resolve, reject) => {
    queuePromise = queuePromise
      .then(async () => {
        const start = performance.now();
        const worker = await getOrCreateWorker();

        // 1. Preprocess
        const preprocessedBlob = await preprocessImage(dataUrl);

        // 2. Set runtime recognition parameters
        const psm = mode === 'code' ? 6 : psmHint;
        await worker.setParameters({
          tessedit_pageseg_mode: String(psm) as any,
          preserve_interword_spaces: mode === 'code' ? '1' : '0',
        });

        // 3. Recognize
        const res = await worker.recognize(preprocessedBlob);
        const rawText = res.data?.text || '';
        const confidence = typeof res.data?.confidence === 'number' ? res.data.confidence : 80;

        // 4. Postprocess
        const cleanedText = postprocessOCR(rawText, mode);
        const duration = Math.round(performance.now() - start);

        resolve({
          text: cleanedText,
          confidence,
          ms: duration,
          mode,
        });
      })
      .catch((err) => {
        reject(err);
      });
  });
}

/**
 * Terminate worker on offscreen unload
 */
export async function terminateWorker(): Promise<void> {
  if (workerInstance) {
    try {
      await workerInstance.terminate();
    } catch {
      // Ignore
    }
    workerInstance = null;
  }
}
