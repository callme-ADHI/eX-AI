# eX-AI

> **eX-AI** is an instrument-grade Chrome extension (Manifest V3) created and built by **ADHI**. It features a right-edge slide-in **AI Practice Companion** with **100% offline screen-snip-to-text (OCR)** powered by local Tesseract.js WebAssembly and the NVIDIA NIM developer API.

---

## 🌟 Key Features

1. **Slide-In AI Companion Panel**:
   - Slides smoothly from the right edge with customizable triggers (edge hover strip, visible pill handle, or keyboard shortcut).
   - Sticky chat interface that never auto-closes while you compose or read answers.
   - Resizable width (340px to 720px) with live drag handle and persistent preferences.
   - Hardened with **Closed Shadow DOM** and keyboard isolation so typing never interferes with host page shortcuts (YouTube, Gmail, GitHub).

2. **Offline Screen-to-Text OCR (Snip)**:
   - Drag a rectangle anywhere on screen to extract printed text or code.
   - **Zero network requests**: Runs completely offline using Tesseract.js (LSTM English engine) inside an MV3 offscreen Web Worker.
   - Multi-stage image preprocessing: auto-upscaling, Rec. 709 grayscale, auto-dark-mode background inversion, and contrast stretching.
   - **Text mode**: Auto-joins soft-wrapped lines, de-hyphenates breaks, and normalizes ligatures.
   - **Code mode**: Preserves exact indentation, line breaks, and whitespace.
   - Interactive attachment chip with confidence rating, crop thumbnail preview, and mode re-run controls.

3. **High-Performance Practice AI**:
   - Designed for campus placements, technical interviews, and aptitude preparation.
   - Dedicated modes:
     - **Aptitude**: Quant, logical, verbal with formulas, step-by-step arithmetic verification, and shortcuts.
     - **Coding**: Problem restatement, optimal Big-O analysis, full runnable code blocks, sample dry runs, and edge cases.
     - **Reasoning**: Syllogisms, puzzles, arrangements, elimination tables, and contradiction checks.
     - **General**: Versatile coding and engineering assistant.
   - **Configurable Reasoning (Think toggle)**: Deep-thinking chains stream into a live collapsible accordion with execution duration.
   - **MathML Math Rendering**: Equations rendered via pure MathML without web font dependencies in Shadow DOM.
   - **Syntax Highlighting**: Pre-bundled syntax highlighting for Python, C++, C, Java, JavaScript, TypeScript, SQL, Bash, and JSON without external stylesheets.

4. **NVIDIA NIM Integration & Resilience**:
   - Compatible with OpenAI API format via `https://integrate.api.nvidia.com/v1`.
   - Client-side token bucket rate limiter (35 RPM with smooth queueing and ETA countdowns).
   - Automatic fallback chain across models on HTTP 403, 404, 5xx, or 45s silence timeouts.
   - Ephemeral service worker keep-alive pings every 20s during complex reasoning pauses.

---

## 🚀 Installation & Setup

### Prerequisites
- Node.js 20+ and npm

### 1. Build from Source
```bash
# Clone the repository
git clone https://github.com/callme-ADHI/eX-AI.git
cd eX-AI

# Install dependencies
npm ci

# Build extension bundles
npm run build

# Run unit test suite
npm run test
```

### 2. Load Extension in Google Chrome
1. Open Chrome and navigate to `chrome://extensions`.
2. Enable **Developer mode** toggle in the top-right corner.
3. Click **Load unpacked** in the top-left.
4. Select the `dist/` directory inside this repository.

### 3. Get a Free NVIDIA API Key
1. Visit [build.nvidia.com/settings/api-keys](https://build.nvidia.com/settings/api-keys) and sign in.
2. Generate a personal API key (starts with `nvapi-`).
3. Open the eX-AI panel (click the handle on the right edge or press `Ctrl+Space`), click **⚙️ Settings**, paste your key, and click **Save & Verify**.
4. *(Note: NVIDIA free-tier developer accounts provide ~40 requests/minute shared across models for prototyping).*

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action | Context |
|---|---|---|
| `Ctrl+Space` | Toggle eX-AI Side Panel | Anywhere on web pages |
| `Alt+Shift+S` (Mac: `MacCtrl+Shift+S`) | Trigger Screen Snip OCR | Anywhere on web pages |
| `Esc` | Close panel / Cancel snip | While panel or snip overlay is open |
| `T` / `C` | Switch between Text & Code OCR modes | While snip selection is active |
| `Enter` | Send message in chat composer | Composer focused |
| `Shift+Enter` | Insert new line in composer | Composer focused |

---

## 🔒 Privacy & Security Statement

- **Zero Telemetry**: eX-AI does not track browsing, send analytics, or transmit user identifiers.
- **Offline OCR**: All image processing, pixel cropping, and Tesseract.js character recognition execute 100% locally in your browser inside an isolated extension offscreen document. **Snipped screenshot pixels are NEVER sent to NVIDIA or any third-party server.**
- **Safe API Storage**: Your NVIDIA API key is stored strictly in Chrome local extension storage (`chrome.storage.local`) and is only ever accessed from the background service worker. The key is never exposed to content scripts or host web pages.
- **Security Scanner Gated**: Background geo-IP/RDAP domain lookups from the legacy security scanner are disabled by default (`securityEngineEnabled: false`) to ensure visited URLs are never transmitted to external IP lookup APIs unless explicitly enabled by the user.

---

## ⚠️ Known Limits

- **Complex Mathematical Notation**: Tesseract OCR is optimized for typography. Deeply nested fractions, multi-line integrals, and radical surds may be recognized as approximate ASCII. The attachment chip provides a thumbnail preview so you can verify and adjust equations before sending.
- **Handwritten Content**: The offline OCR model is trained on printed Latin characters; handwritten text will produce lower confidence.
- **Visible Viewport Only**: In accordance with Chrome Manifest V3 security, screen capture operates on the active visible viewport (scrolling capture is not supported).
- **Chrome Internal Pages**: Content scripts cannot inject into `chrome://`, `chrome-extension://`, or the Chrome Web Store.

---

## ⚖️ Responsible Use

eX-AI is designed as an interactive study and preparation instrument for campus placement exams, competitive programming practice, and technical interview simulations. Please adhere to institutional academic integrity standards and assessment guidelines during formal examinations and tests.

---

## 👨‍💻 Author

Created and built by **ADHI** ([@callme-ADHI](https://github.com/callme-ADHI)).

