/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  eX-AI Content Script
 *  Brand: Aevoarx | Product: eX-AI
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import SidePanel from './SidePanel/SidePanel';

// ─── Content Script ──────────────────────────────────────────────────────────
// Key design principles:
//  1. Randomised host id per page load — not discoverable by pattern.
//  2. CLOSED shadow root — page scripts cannot read or tamper with panel content.
//  3. Module-scope reference to shadow root (never read via host.shadowRoot).
//  4. Guard against double-injection using a property on window in isolated world.
//  5. pointer-events:none on host when CLOSED; only EdgeTrigger opts in.

// Guard property — isolated content-script world, not visible to pages
const INJECTION_GUARD = '__exai_injected__';

function isSystemPage() {
  try {
    const href = window.location.href;
    return (
      href.startsWith('chrome://') ||
      href.startsWith('chrome-extension://') ||
      href.startsWith('about:') ||
      href.startsWith('devtools:') ||
      href.startsWith('edge://')
    );
  } catch {
    return true;
  }
}

// Single source of truth for panel width — Phase 2 uses 420px
const DEFAULT_PANEL_WIDTH = 420;

// Module-level refs so they survive across self-heal calls
let hostEl: HTMLDivElement | null = null;
let shadowRootRef: ShadowRoot | null = null;

// Inlined styles placeholder replaced at build time by inlineContentCssPlugin
const INLINED_STYLES = '__EXAI_INLINED_STYLES__';

function applyHostClosedStyles(el: HTMLElement) {
  el.style.setProperty('position',       'fixed',        'important');
  el.style.setProperty('top',            '0',            'important');
  el.style.setProperty('bottom',         '0',            'important');
  el.style.setProperty('right',          '0',            'important');
  el.style.setProperty('left',           'auto',         'important');
  el.style.setProperty('width',          '0px',          'important');
  el.style.setProperty('z-index',        '2147483647',   'important');
  el.style.setProperty('pointer-events', 'none',         'important');
  el.style.setProperty('background',     'transparent',  'important');
  el.style.setProperty('overflow',       'visible',      'important');
}

function applyHostOpenStyles(el: HTMLElement, width: number) {
  el.style.setProperty('position',       'fixed',        'important');
  el.style.setProperty('top',            '0',            'important');
  el.style.setProperty('bottom',         '0',            'important');
  el.style.setProperty('right',          '0',            'important');
  el.style.setProperty('left',           'auto',         'important');
  el.style.setProperty('width',          `${width}px`,   'important');
  el.style.setProperty('z-index',        '2147483647',   'important');
  el.style.setProperty('pointer-events', 'auto',         'important');
  el.style.setProperty('background',     'transparent',  'important');
  el.style.setProperty('overflow',       'visible',      'important');
}

function applyHostSnipStyles(el: HTMLElement) {
  el.style.setProperty('position',       'fixed',        'important');
  el.style.setProperty('top',            '0',            'important');
  el.style.setProperty('bottom',         '0',            'important');
  el.style.setProperty('left',           '0',            'important');
  el.style.setProperty('right',          '0',            'important');
  el.style.setProperty('width',          '100vw',        'important');
  el.style.setProperty('height',         '100vh',        'important');
  el.style.setProperty('z-index',        '2147483647',   'important');
  el.style.setProperty('pointer-events', 'auto',         'important');
  el.style.setProperty('background',     'transparent',  'important');
  el.style.setProperty('overflow',       'hidden',       'important');
}

function init() {
  if (isSystemPage()) return;

  // Guard against double-injection (isolated world property)
  if ((window as any)[INJECTION_GUARD]) return;
  (window as any)[INJECTION_GUARD] = true;

  const parent = document.body || document.documentElement;
  if (!parent) {
    setTimeout(init, 100);
    return;
  }

  // ── Create host container with randomised id ────────────────────────────
  const randomSuffix = Array.from(crypto.getRandomValues(new Uint8Array(4)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  const hostId = `exai-${randomSuffix}`;

  const container = document.createElement('div');
  container.id = hostId;
  hostEl = container;

  // Closed when created — panel will update width when opened
  applyHostClosedStyles(container);

  // ── Inject into DOM ──────────────────────────────────────────────────────
  const inject = () => {
    if (!hostEl) return;
    const p = document.body || document.documentElement;
    if (!p) return;
    if (p === document.body && hostEl.parentElement === document.documentElement) {
      try { document.documentElement.removeChild(hostEl); } catch { /* ignore */ }
    }
    if (!p.contains(hostEl)) {
      p.appendChild(hostEl);
    }
  };

  inject();

  // ── CLOSED Shadow DOM ────────────────────────────────────────────────────
  // mode:'closed' means host.shadowRoot === null in page scripts.
  // We keep the reference in shadowRootRef at module scope.
  const shadowRoot = container.attachShadow({ mode: 'closed' });
  shadowRootRef = shadowRoot;

  // 1. Constructable Stylesheet: CSP-immune on all Chromium platforms
  if (typeof CSSStyleSheet !== 'undefined' && shadowRoot.adoptedStyleSheets) {
    try {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(INLINED_STYLES);
      shadowRoot.adoptedStyleSheets = [sheet];
    } catch {
      // Fallback to inline <style> below
    }
  }

  // 2. Inline <style> tag: immediately applied even if page blocks <link>
  const inlineStyle = document.createElement('style');
  inlineStyle.textContent = `:host { all: initial; }\n${INLINED_STYLES}`;
  shadowRoot.appendChild(inlineStyle);

  // 3. Fallback <link> tags (for environments that allow web accessible resources)
  const tokensLink = document.createElement('link');
  tokensLink.rel = 'stylesheet';
  tokensLink.href = chrome.runtime.getURL('newtab.css');
  shadowRoot.appendChild(tokensLink);

  const stylesLink = document.createElement('link');
  stylesLink.rel = 'stylesheet';
  stylesLink.href = chrome.runtime.getURL('content.css');
  shadowRoot.appendChild(stylesLink);

  const mountPoint = document.createElement('div');
  mountPoint.style.height = '100%';
  shadowRoot.appendChild(mountPoint);

  // ── Mount React ──────────────────────────────────────────────────────────
  const reactRoot = createRoot(mountPoint);
  reactRoot.render(
    <React.StrictMode>
      <SidePanel
        container={container}
        shadowRoot={shadowRoot}
        defaultWidth={DEFAULT_PANEL_WIDTH}
        applyOpenStyles={applyHostOpenStyles}
        applyClosedStyles={applyHostClosedStyles}
        applySnipStyles={applyHostSnipStyles}
      />
    </React.StrictMode>
  );

  // ── Self-healing: restore if an SPA destroys our container ───────────────
  const domObserver = new MutationObserver(() => inject());
  domObserver.observe(document.documentElement, { childList: true, subtree: false });

  const bodyObserver = new MutationObserver(() => inject());
  if (document.body) {
    bodyObserver.observe(document.body, { childList: true, subtree: false });
  }

  // ── Page metadata tracking ───────────────────────────────────────────────
  startTracker();
}

// ─── API Usage and Metadata Reporting ────────────────────────────────────────

let cameraAccessCount = 0;
let micAccessCount = 0;
let fetchCount = 0;

function startTracker() {
  if (!window.location.protocol.startsWith('http')) return;

  // Note: 'ex1:api_access' events originate from tracker.ts running in MAIN world.
  // This is an existing design — we leave it unchanged (eX-AI doesn't add new
  // window-level events; all new messaging goes through chrome.runtime).
  window.addEventListener('ex1:api_access', (e: any) => {
    const detail = e.detail;
    if (detail) {
      cameraAccessCount = detail.cameraCount;
      micAccessCount    = detail.micCount;
      fetchCount        = detail.fetchCount;
      sendPageMeta();
    }
  });

  sendPageMeta();

  const titleEl = document.querySelector('title');
  if (titleEl) {
    const obs = new MutationObserver(() => sendPageMeta());
    obs.observe(titleEl, { subtree: true, childList: true, characterData: true });
  }
}

async function getPagePermissions(): Promise<Record<string, string>> {
  const perms = ['camera', 'microphone', 'geolocation', 'notifications'];
  const result: Record<string, string> = {
    camera: 'unknown', microphone: 'unknown',
    geolocation: 'unknown', notifications: 'unknown',
    clipboard: 'unknown', popups: 'unknown',
  };

  for (const name of perms) {
    try {
      const status = await navigator.permissions.query({ name: name as any });
      result[name] = status.state;
      status.onchange = () => sendPageMeta();
    } catch { /* ignore */ }
  }
  return result;
}

async function sendPageMeta() {
  const title   = document.title || '';
  const descEl  = document.querySelector('meta[name="description"]') ||
                  document.querySelector('meta[property="og:description"]');
  const description = descEl?.getAttribute('content') || '';
  const ogTypeEl    = document.querySelector('meta[property="og:type"]');
  const ogType      = ogTypeEl?.getAttribute('content') || '';
  const perms       = await getPagePermissions();

  chrome.runtime.sendMessage({
    type: 'PAGE_META',
    origin: window.location.origin,
    title, description, ogType,
    cameraAccessCount, micAccessCount, fetchCount,
    permissions: perms,
  }).catch(() => { /* service worker may not be ready yet */ });
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────
init();

// ─── Message listeners ────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'QUERY_PAGE_PERMISSIONS') {
    const names = ['camera', 'microphone', 'geolocation', 'notifications', 'clipboard-read'];
    Promise.allSettled(
      names.map(name =>
        navigator.permissions.query({ name: name as any }).then(s => ({ name, state: s.state }))
      )
    ).then(results => {
      const permissions: Record<string, string> = {};
      results.forEach((r, i) => {
        permissions[names[i]] = r.status === 'fulfilled' ? r.value.state : 'unavailable';
      });
      sendResponse({ permissions });
    });
    return true;
  }

  if (msg.type === 'QUERY_ACTIVE_MEDIA') {
    navigator.mediaDevices.enumerateDevices()
      .then(devices => {
        sendResponse({
          cameraActive: devices.some(d => d.kind === 'videoinput' && d.label !== ''),
          micActive:    devices.some(d => d.kind === 'audioinput' && d.label !== ''),
        });
      })
      .catch(() => sendResponse({ cameraActive: false, micActive: false }));
    return true;
  }
});
