# eX-AI by Aevoarx

> **eX1** is an instrument-grade browser companion that seamlessly integrates cybersecurity intelligence, focus/productivity metrics, and smart web utilities into a unified, high-performance browser extension.

Developed by **Aevoarx**, eX1 is designed for security professionals, developers, and power users who require real-time cyber threat analytics and focus management without sacrificing browser performance.

---

## Key Modules & Features

### 1. Cybersecurity Intelligence Engine (3/4 Screen Real Estate)
Provides instant OSINT data retrieval and website fingerprinting dynamically, featuring:
- **Safety Index**: A real-time heuristic hazard score (0–100%) highlighting typosquatting, IDN homograph attacks, and suspicious domains.
- **HTTPS & SSL Certificate Details**: Live verification of TLS handshake details, validity periods, and issuer information.
- **Server Metadata**: Geolocation mapping, ASN lookup, hosting organization detection, and reverse IP queries.
- **Domain Age & Registrar Registry**: Accesses RDAP registries to determine domain registration timelines, expiration data, and nameservers.
- **Domain History Timeline**: Comprehensive history of important domain events (Registration, SSL issuance/renewals, and reputation alerts).
- **Website Fingerprint**: Technical categorization, trust level, region mapping, hosting infrastructure type, and tech-stack analysis.
- **Risk Indicators**: Real-time identification of suspicious patterns (e.g. excessive subdomains, randomized DGAs).
- **Active Permissions Monitor**: Real-time auditing of browser capabilities such as camera, microphone, geolocation, and clipboard.

### 2. Focus & Productivity HUD (1/4 Screen Real Estate)
An integrated focus cockpit directly next to the security view:
- **Focus Timer**: Configurable pomodoro-style sessions with study, code, and research presets.
- **Productivity Profile**: Weekly and daily rollups of web activity categorized by productive vs. distracting usage.
- **Task Management**: Simple task manager to track focus targets for the active session.

### 3. Shortcut Dock & Dashboard
A macOS-style dock at the bottom of the new tab page featuring:
- **Tactile Sound Effects**: Interactive mechanical "tick" sound feedback on icon hover and slide.
- **Dynamic Scale & Glow**: Smooth, physics-based scale expansion (similar to macOS) with custom back-glows.
- **Hover Deletion**: An intuitive floating close (`×`) button on hover to delete shortcuts instantly.
- **Drag-and-Drop Sorting**: Easily sort your shortcuts.

---

## Code Architecture

The extension is modularly structured:
- `src/background/service-worker.ts`: Master background broker handling alarms, messaging, tab change listeners, and engine initialization.
- `src/background/securityEngine.ts`: The central cybersecurity engine. Bypasses CSP restrictions and retrieves live RDAP and Geo-IP info asynchronously.
- `src/content/content.tsx` & `tracker.ts`: Content scripts injected in the MAIN world to monitor DOM mutations and hook native media APIs safely.
- `src/newtab/`: React application rendering the eX1 Dashboard page.
- `src/shared/`: Centralized types, defaults, preset icons, and local storage utilities.

---

## Installation & Build Instructions

### Prerequisites
- Node.js (v18+)
- npm

### Development
To run the local Vite development server:
```bash
npm run dev
```

### Production Build
To compile the TypeScript source files and bundle the extension for production deployment:
```bash
npm run build
```
This generates the ready-to-load bundle in the `dist/` directory.

### Loading into Chrome
1. Open Google Chrome.
2. Navigate to `chrome://extensions/`.
3. Enable **Developer mode** (top-right toggle).
4. Click **Load unpacked** (top-left button).
5. Select the `dist/` directory generated in the root of this project.

---

## Branding & Copyright

Copyright © Aevoarx. All rights reserved.

**Aevoarx** is a registered brand. The eX1 Suite contains proprietary designs, heuristic engines, and visual interfaces. Copying, modification, or distribution is governed by the company's code compliance guidelines.
