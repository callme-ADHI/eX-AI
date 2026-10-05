# ⚡ eX-AI

<div align="center">

**Instrument-Grade AI Practice Companion, Offline Screen-Snip OCR & Website Awareness Extension**  
*Created & Built with ⚡ by **ADHI***

[![Manifest V3](https://img.shields.io/badge/Chrome%20Extension-Manifest%20V3-blue?logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![React 19](https://img.shields.io/badge/React-19-61dafb?logo=react&logoColor=white)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Bundler-Vite%208-646cff?logo=vite&logoColor=white)](https://vitejs.dev/)
[![Vitest](https://img.shields.io/badge/Tests-84%20Passed-4ade80?logo=vitest&logoColor=white)](https://vitest.dev/)
[![Tesseract.js](https://img.shields.io/badge/Offline%20OCR-Tesseract.js%20WASM-00b4d8)](https://tesseract.projectnaptha.com/)
[![NVIDIA NIM](https://img.shields.io/badge/AI%20Inference-NVIDIA%20NIM-76b900?logo=nvidia&logoColor=white)](https://build.nvidia.com/)
[![Built by ADHI](https://img.shields.io/badge/Author-ADHI-7094ff?style=flat&logo=github)](https://github.com/callme-ADHI)

[Features](#-key-features) • [Website Awareness](#-website-awareness) • [Security Architecture](#-security-architecture) • [Installation](#-installation--setup) • [Shortcuts](#-keyboard-shortcuts) • [Architecture](#-architecture) • [Author](#-author)

</div>

---

## 📖 Overview

**eX-AI** is a high-performance Chrome Extension (Manifest V3) built by **ADHI**. It brings an instrument-grade AI practice assistant, **100% offline screen-snip OCR**, and **full website awareness** directly into any browser tab without disrupting your workflow.

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

### 3. 🌐 Website Awareness (Read & Browse)
- **Multi-Scope Page Extraction**:
  - `main`: Core document content (skips nav, header, footer, ads).
  - `page`: Entire visible document body text.
  - `selection`: Active highlighted text selection on the page.
  - `off`: Context disabled.
- **Provenance-Guarded Tool Calling**:
  - `get_page_structure`: Page title, meta description, headings hierarchy, third-party script/resource hosts, and form field signatures.
  - `get_page_links`: Discovers internal and external links ranked by content region (main, nav, aside, footer).
  - `get_page_text`: Re-reads visible text across scopes.
  - `get_sitemap`: Reads `robots.txt` and parses XML sitemaps/sitemap indexes.
  - `fetch_page`: Fetches same-origin pages on demand with a strict 2MB cap, 300ms polite spacing, and DOMParser extraction.
  - `search_site`: In-memory BM25 lexical search over indexed site passages.
- **Ephemeral Site Indexing**: Polite breadth-first crawl (concurrency 2, 400ms delay, depth ≤ 2, max 25 pages default) chunked into overlapping passages and indexed in `chrome.storage.session` (wiped when browser closes).
- **Origin Consent Gate**: Explicit inline consent per domain (`Allow once` or `Always for site`) before any page context or tool fetch is sent.

### 4. 🧠 Tailored Practice Assistant Modes
- **Aptitude**: Quantitative, logical, and verbal problem solving with formula derivation, step-by-step arithmetic verification, and speed shortcuts.
- **Coding**: Problem breakdown, brute-force to optimal derivation, formal Big-O analysis ($O(N)$, $O(1)$), runnable code with syntax highlighting, and edge case walkthroughs.
- **Reasoning**: Syllogisms, arrangement diagrams, elimination grids, and contradiction proofs.
- **General**: Versatile coding and engineering companion.
- **Collapsible Thinking Accordion**: Live duration timer and streaming reasoning tokens for reasoning models (e.g. DeepSeek-R1, Nemotron).
- **MathML Equation Support**: Clean, beautiful mathematical typesetting rendered with native MathML inside the Shadow Root.

### 5. ⚡ NVIDIA NIM Integration & Reliability
- Compatible with OpenAI format via `https://integrate.api.nvidia.com/v1`.
- **Client-Side Token Bucket Rate Limiter**: 35 RPM token bucket with smooth visual queue notices and estimated countdown timers.
- **Automatic Fallback Chain**: Gracefully cascades through your preferred backup models on HTTP 403, 404, 5xx, or 45s silence timeouts.
- **Port Keep-Alive Pings**: Continuous background ping every 20s prevents Chrome service worker termination during extended reasoning and tool execution phases.

---

## 🔒 Security Architecture

| # | Threat | Security Control & Enforcement Location |
|---|---|---|
| 1 | **Prompt Injection from Page Text** | Zero-width space tag neutralization (`neutralizeTags` in `safety.ts`), strict system prompt instructions, tool results wrapped in `<tool_result untrusted="true">`, read-only tools only. |
| 2 | **URL Exfiltration / SSRF via Model** | Provenance URL registry (`UrlRegistry` in `urls.ts`): only collected URLs are resolvable; exact string resolution; same-origin enforcement; GET only; `link_id` preferred. |
| 3 | **State-Changing GET Links (Logout/Delete)** | Blocklist regex (`isBlockedUrl` in `urls.ts`) evaluated on every fetch and redirect; crawl never overrides; manual "Fetch anyway" requires explicit user interaction. |
| 4 | **Reading Sensitive / Account Pages** | Sensitive URL regex (`isSensitiveUrl` in `urls.ts`) triggers explicit user confirmation dialog; automated crawls silently skip sensitive URLs. |
| 5 | **Credential & Token Leakage in URLs** | Automatic URL redaction (`redactUrl` in `urls.ts`) strips `token`, `key`, `auth`, `jwt` before sending to the model; registry resolves real targets privately. |
| 6 | **Form Data Interception** | Form control values are never read; hidden inputs are ignored; structure outline only reports input names and field types. |
| 7 | **Unauthorized Third-Party Data Transfer** | Origin consent gate (`consent.ts`), disabled by default in incognito (`isIncognito`), preview popover allows inspection before transmission. |
| 8 | **Page Data Persistence** | Page text is never persisted in chat history databases (`chatStore.ts`); site indexes are stored strictly in volatile `chrome.storage.session`. |
| 9 | **Hostile Site Hammering / Large Responses** | 300ms minimum inter-request spacing (`LIMITS.minGapMs`), concurrency capped at 2, 10s timeout, 2MB size cap, content-type allowlist, 429/503 exponential backoff. |
| 10 | **Host Page Panel Spoofing / Tampering** | Content script runs inside a closed Shadow DOM (`{ mode: 'closed' }`); all extension communications use internal `chrome.runtime.Port`. |
| 11 | **Runaway Tool Loops & Rate Limit Burn** | Max 6 tool calls per turn, max 3 rounds (`LIMITS.maxToolRounds`), 80,000 characters per turn budget, token bucket rate limiter. |
| 12 | **Script Execution in Fetched HTML** | `DOMParser` parses HTML in an inert sandbox where scripts cannot execute; `<script>`, `<style>`, `<noscript>`, `<template>` nodes removed before extraction. |

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action | Context |
|---|---|---|
| `Ctrl+Space` | Toggle / Open eX-AI Panel | Anywhere on any webpage |
| `Ctrl+Shift+P` | Cycle Page Context Scope (Main/Full/Sel/Off) | Anywhere when panel is open |
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

# 4. Verify test suite (84 tests passing)
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
│   ├── background.js          # Service worker (rate limiter, stream client, tool loop, keep-alive)
│   ├── content.js             # Closed shadow root, React UI, page extraction & tools
│   ├── content.css            # Scoped panel styles
│   ├── offscreen.html / .js   # Isolated Tesseract.js WASM worker environment
│   └── manifest.json          # Chrome Manifest V3 manifest
├── public/                    # Static assets & offline OCR models
│   ├── manifest.json
│   └── ocr/                   # Offline Tesseract WASM binaries & eng.traineddata
├── src/
│   ├── background/            # MV3 Service worker and background services
│   │   ├── ai/                # NVIDIA client, toolLoop, toolCallAccumulator, rate limiter, SSE
│   │   └── snip/              # Viewport capture and offscreen worker manager
│   ├── content/               # Injected panel components & styles
│   │   ├── SidePanel/         # Shadow DOM shell, ChatPanel, SnipOverlay, Drawers, BrowseMenu
│   │   │   └── chat/          # PageChip, ConsentBar, ActivityLines, IndexSiteButton, Markdown
│   │   └── pageText/          # DOM extract, links, structure, urls, fetchPage, sitemap, bm25, siteIndex
│   ├── offscreen/             # Tesseract OCR Web Worker, image preprocessing
│   └── shared/                # Types, safety helpers, toolDefs, system prompts, constants
├── vite.config.ts             # Main build config
├── vite.content.config.ts     # Content script IIFE & CSS inlining plugin
├── vitest.config.ts           # Vitest configuration with JSDOM support
└── README.md
```

---

## 👨‍💻 Author

Created and built with ⚡ by **ADHI**  
- **GitHub**: [@callme-ADHI](https://github.com/callme-ADHI)  
- **Repository**: [https://github.com/callme-ADHI/eX-AI.git](https://github.com/callme-ADHI/eX-AI.git)
