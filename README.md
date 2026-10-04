# ⚡ eX-AI

<div align="center">

**Instrument-Grade AI Practice Companion & Offline Screen-Snip OCR Extension**  
*Created & Built with ⚡ by **ADHI***

[![Manifest V3](https://img.shields.io/badge/Chrome%20Extension-Manifest%20V3-blue?logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![React 19](https://img.shields.io/badge/React-19-61dafb?logo=react&logoColor=white)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Bundler-Vite%208-646cff?logo=vite&logoColor=white)](https://vitejs.dev/)
[![Tesseract.js](https://img.shields.io/badge/Offline%20OCR-Tesseract.js%20WASM-00b4d8)](https://tesseract.projectnaptha.com/)
[![NVIDIA NIM](https://img.shields.io/badge/AI%20Inference-NVIDIA%20NIM-76b900?logo=nvidia&logoColor=white)](https://build.nvidia.com/)
[![Built by ADHI](https://img.shields.io/badge/Author-ADHI-7094ff?style=flat&logo=github)](https://github.com/callme-ADHI)

[Features](#-key-features) • [Installation](#-installation--setup) • [Shortcuts](#-keyboard-shortcuts) • [Architecture](#-architecture) • [Privacy](#-privacy--security) • [Author](#-author)

</div>

---

## 📖 Overview

**eX-AI** is a high-performance Chrome Extension (Manifest V3) built by **ADHI**. It brings an instrument-grade AI practice assistant and **100% offline screen-snip OCR** directly into any browser tab without disrupting your workflow.

Designed specifically for students, software engineers, and competitive programmers preparing for campus placement exams, technical coding interviews, and aptitude tests, eX-AI slides in from the right edge with a dark, distraction-free interface.

---

## 🌟 Key Features

### 1. 🪟 Slide-In AI Companion Panel
- **Auto-Popup on Edge Hover**: Move your cursor within 25px of the right screen edge to reveal the panel automatically.
- **`Ctrl+Space` Universal Shortcut**: Fast, reliable keyboard toggle that never conflicts with host website hotkeys.
- **Closed Shadow DOM & CSP Immunity**: Encapsulated in a closed Shadow Root with **100% inlined CSS and design tokens**. Works seamlessly on strict CSP pages like Google, YouTube, GitHub, and corporate intranets.
- **Smart Keyboard Isolation**: Captures keystrokes inside the panel so typing your prompts never triggers website actions in the background.
- **Fluid Resizing**: Smooth drag-to-resize handle (340px to 720px) with persistent width memory across sessions.
- **Natural Chat UX**: Press **`Enter`** to send and **`Shift+Enter`** to insert newlines.

### 2. ✂️ 100% Offline Screen-to-Text OCR (Snip)
- **Zero Cloud Leakage**: All image cropping, preprocessing, and character recognition execute completely locally on your device via Tesseract.js WebAssembly inside an isolated MV3 Offscreen Worker.
- **Full Viewport Capture**: Seamlessly snip anywhere across the visible screen using Chrome native viewport capture API (`captureVisibleTab`) — no DOM access permissions required.
- **Adaptive Preprocessing Pipeline**: Automatic 2× canvas upscaling, Rec. 709 luminance conversion, contrast stretching, and automatic background inversion for dark mode code editors.
- **Specialized Recognition Modes**:
  - **Text Mode**: Unwraps soft linebreaks, cleans hyphens, and normalizes ligatures.
  - **Code Mode**: Strictly preserves exact column indentation, spacing, and bracket alignments.
- **Ephemeral In-Memory Processing**: The captured screenshot exists strictly in RAM and is **deleted immediately** once text extraction finishes. Zero images are saved to disk or persistent storage.

### 3. 🧠 Tailored Practice Assistant Modes
- **Aptitude**: Quantitative, logical, and verbal problem solving with formula derivation, step-by-step arithmetic verification, and speed shortcuts.
- **Coding**: Problem breakdown, brute-force to optimal derivation, formal Big-O analysis ($O(N)$, $O(1)$), runnable code with syntax highlighting, and edge case walkthroughs.
- **Reasoning**: Syllogisms, arrangement diagrams, elimination grids, and contradiction proofs.
- **General**: Versatile coding and engineering companion.
- **Collapsible Thinking Accordion**: Live duration timer and streaming reasoning tokens for reasoning models (e.g. DeepSeek-R1, Nemotron).
- **MathML Equation Support**: Clean, beautiful mathematical typesetting rendered with native MathML inside the Shadow Root.

### 4. ⚡ NVIDIA NIM Integration & Reliability
- Compatible with OpenAI format via `https://integrate.api.nvidia.com/v1`.
- **Client-Side Token Bucket Rate Limiter**: 35 RPM token bucket with smooth visual queue notices and estimated countdown timers.
- **Automatic Fallback Chain**: Gracefully cascades through your preferred backup models on HTTP 403, 404, 5xx, or 45s silence timeouts.
- **Port Keep-Alive Pings**: Continuous background ping every 20s prevents Chrome service worker termination during extended reasoning phases.

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action | Context |
|---|---|---|
| `Ctrl+Space` | Toggle / Open eX-AI Panel | Anywhere on any webpage |
| `Alt+Shift+S` (Mac: `MacCtrl+Shift+S`) | Trigger Screen Snip OCR | Anywhere on any webpage |
| `T` / `C` | Switch between Text & Code OCR modes | While snip selection is active |
| `Esc` | Close panel or cancel snip | While panel or snip overlay is open |
| `Enter` | Send chat prompt | When composer is focused |
| `Shift+Enter` | Insert new line | When composer is focused |

---

## 🚀 Installation & Setup

### Prerequisites
- Google Chrome (or Chromium-based browser: Brave, Edge, Opera, Vivaldi)
- Node.js 20+ and npm

### 1. Build from Source
```bash
# 1. Clone the repository
git clone https://github.com/callme-ADHI/eX-AI.git
cd eX-AI

# 2. Install dependencies
npm ci

# 3. Build production extension bundles
npm run build

# 4. Verify test suite (36 tests)
npm run test
```

### 2. Load Extension in Chrome
1. Open Google Chrome and navigate to `chrome://extensions`.
2. Toggle **Developer mode** on in the top-right corner.
3. Click the **Load unpacked** button in the top-left corner.
4. Select the `dist/` directory inside your cloned `eX-AI` folder.

### 3. Add Your Free NVIDIA API Key
1. Go to [build.nvidia.com/settings/api-keys](https://build.nvidia.com/settings/api-keys) and sign in.
2. Generate your free personal API key (starts with `nvapi-`).
3. Open the eX-AI panel (move your cursor to the right edge or press `Ctrl+Space`).
4. Click **⚙️ Settings**, paste your key, and click **Save & Verify**.

*(Note: NVIDIA free developer tier includes ~40 requests/minute across models for testing and development).*

---

## 🏗️ Architecture

```
eX-AI/
├── dist/                      # Production extension package (load unpacked here)
│   ├── background.js          # Service worker (rate limiter, stream client, keep-alive)
│   ├── content.js             # Closed shadow root, React UI, inlined styles
│   ├── offscreen.html / .js   # Isolated Tesseract.js WASM worker environment
│   └── manifest.json          # Chrome Manifest V3 manifest
├── public/                    # Static assets & offline OCR models
│   ├── manifest.json
│   └── ocr/                   # Offline Tesseract WASM binaries & eng.traineddata
├── src/
│   ├── background/            # MV3 Service worker and background services
│   │   ├── ai/                # NVIDIA client, rate limiter, models, SSE parser
│   │   └── snip/              # Viewport capture and offscreen worker manager
│   ├── content/               # Injected panel components & styles
│   │   └── SidePanel/         # Shadow DOM shell, ChatPanel, SnipOverlay, Drawers
│   ├── offscreen/             # Tesseract OCR Web Worker, image preprocessing
│   └── shared/                # Types, storage keys, system prompts, crop math
├── vite.config.ts             # Main build config
├── vite.content.config.ts     # Content script IIFE & CSS inlining plugin
└── README.md
```

---

## 🔒 Privacy & Security

- **Zero Analytics & Telemetry**: eX-AI collects no user metrics, tracking cookies, or browsing history.
- **100% Offline Character Recognition**: Image pixels from screen captures never leave your machine. All OCR computation happens in local WebAssembly.
- **Safe Key Storage**: API credentials reside exclusively in Chrome sandboxed local extension storage (`chrome.storage.local`) and are only accessed within the background service worker.
- **Gated Background Scans**: Legacy network scanner requests are disabled by default (`securityEngineEnabled: false`) to ensure external DNS/RDAP queries never fire without explicit opt-in.

---

## ⚖️ Responsible Use

eX-AI is designed as an interactive learning instrument for coding interview preparation, placement practice, and competitive problem-solving. Please uphold your institution academic honesty policies and testing regulations during formal examinations.

---

## 👨‍💻 Author

Created and built with ⚡ by **ADHI**  
- **GitHub**: [@callme-ADHI](https://github.com/callme-ADHI)  
- **Repository**: [https://github.com/callme-ADHI/eX-AI.git](https://github.com/callme-ADHI/eX-AI.git)
