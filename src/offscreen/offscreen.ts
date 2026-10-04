// ─── Offscreen Document Message Router ───────────────────────────────────────

import { warmWorker, queueOCR, terminateWorker } from './ocrWorker';

window.addEventListener('unload', () => {
  terminateWorker();
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  // Ignore messages not targeted to offscreen
  if (msg.target !== 'offscreen') return;

  if (msg.type === 'OCR_WARM') {
    warmWorker()
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }

  if (msg.type === 'OCR_RUN') {
    queueOCR(msg.dataUrl, msg.mode, msg.psmHint)
      .then((result) => sendResponse({ ok: true, data: result }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }

  if (msg.type === 'OCR_CLOSE') {
    terminateWorker().then(() => {
      window.close();
      sendResponse({ ok: true });
    });
    return true;
  }
});
