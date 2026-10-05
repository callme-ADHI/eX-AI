import React, { useEffect, useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { FocusSession } from '../../shared/types';
import type { OCRMode, ThemeMode } from '../../shared/aiTypes';
import { KEYS } from '../../shared/storage';
import FocusGlance from './FocusGlance';
import EdgeTrigger from './EdgeTrigger';
import Tabs, { type TabId } from './Tabs';
import ChatPanel from './chat/ChatPanel';
import AutofillTab from './autofill/AutofillTab';
import SnipOverlay, { SnipResult } from './SnipOverlay';
import styles from './SidePanel.module.css';
import type { AttachmentChipData } from './chat/Composer';

interface Props {
  container: HTMLDivElement;
  shadowRoot: ShadowRoot;
  defaultWidth: number;
  applyOpenStyles: (el: HTMLElement, width: number) => void;
  applyClosedStyles: (el: HTMLElement) => void;
  applySnipStyles?: (el: HTMLElement) => void;
}

/** Clamp panel width between min/max */
const MIN_WIDTH = 340;
const MAX_WIDTH = 720;
const PANEL_WIDTH_KEY = 'exai:panelWidth';
const SETTINGS_KEY = 'exai:settings';

/** Error boundary for the entire panel */
class PanelErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '24px 16px',
          color: '#e8e8f0',
          fontFamily: 'system-ui, sans-serif',
          fontSize: '13px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
        }}>
          <span style={{ fontSize: '24px' }}>⚠️</span>
          <p style={{ margin: 0, textAlign: 'center', color: 'rgba(232,232,240,0.7)' }}>
            Something broke — reload the panel
          </p>
          <button
            onClick={() => this.setState({ hasError: false })}
            style={{
              background: 'rgba(36,82,255,0.2)',
              border: '1px solid rgba(36,82,255,0.5)',
              borderRadius: '6px',
              padding: '8px 16px',
              color: '#e8e8f0',
              cursor: 'pointer',
              fontSize: '12px',
            }}
          >
            Reload panel
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function SidePanel({
  container,
  defaultWidth,
  applyOpenStyles,
  applyClosedStyles,
  applySnipStyles,
}: Props) {
  const [currentSession, setCurrentSession] = useState<FocusSession | null>(null);
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('ai');
  const [panelWidth, setPanelWidth] = useState(defaultWidth);
  const [edgeTriggerMode, setEdgeTriggerMode] = useState<'strip' | 'handle' | 'off'>('strip');
  const [themeMode, setThemeMode] = useState<ThemeMode>('dark');
  const [systemTheme, setSystemTheme] = useState<'light' | 'dark'>(() => {
    return typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches
      ? 'light'
      : 'dark';
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia('(prefers-color-scheme: light)');
    const handler = (e: MediaQueryListEvent) => {
      setSystemTheme(e.matches ? 'light' : 'dark');
    };
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  const resolvedTheme: 'light' | 'dark' = themeMode === 'auto' ? systemTheme : (themeMode === 'light' ? 'light' : 'dark');

  // Snip & OCR states
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const [isPanelHiddenForSnip, setIsPanelHiddenForSnip] = useState(false);
  const [ocrAttachment, setOcrAttachment] = useState<AttachmentChipData | null>(null);
  const [composerInput, setComposerInput] = useState('');
  const lastCroppedDataUrlRef = useRef<string | null>(null);

  const openRef = useRef(false);
  const panelWidthRef = useRef(panelWidth);
  const previousFocusRef = useRef<Element | null>(null);
  const isResizingRef = useRef(false);
  const resizeStartXRef = useRef(0);
  const resizeStartWidthRef = useRef(0);
  const lastCloseTimeRef = useRef(0);

  useEffect(() => { openRef.current = open; }, [open]);
  useEffect(() => { panelWidthRef.current = panelWidth; }, [panelWidth]);

  // ── Load persisted settings ───────────────────────────────────────────────
  useEffect(() => {
    chrome.storage.local.get([PANEL_WIDTH_KEY, SETTINGS_KEY], (res) => {
      const w = res[PANEL_WIDTH_KEY] as number | undefined;
      if (w && w >= MIN_WIDTH && w <= MAX_WIDTH) setPanelWidth(w);

      const settings = res[SETTINGS_KEY] as Record<string, unknown> | undefined;
      const mode = settings?.edgeTrigger as 'strip' | 'handle' | 'off' | undefined;
      if (mode) setEdgeTriggerMode(mode);

      const theme = settings?.themeMode as ThemeMode | undefined;
      if (theme) setThemeMode(theme);
    });

    const onStorageChange = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && changes[SETTINGS_KEY]) {
        const newSettings = changes[SETTINGS_KEY].newValue as Record<string, unknown> | undefined;
        if (newSettings?.themeMode) {
          setThemeMode(newSettings.themeMode as ThemeMode);
        }
      }
    };
    chrome.storage.onChanged.addListener(onStorageChange);
    return () => chrome.storage.onChanged.removeListener(onStorageChange);
  }, []);

  // ── Container styles ──────────────────────────────────────────────────────
  useEffect(() => {
    if (screenshotUrl) {
      if (applySnipStyles) applySnipStyles(container);
    } else if (open) {
      applyOpenStyles(container, panelWidth);
    } else {
      applyClosedStyles(container);
    }
  }, [screenshotUrl, open, panelWidth, container, applyOpenStyles, applyClosedStyles, applySnipStyles]);

  // ── Focus session from storage ────────────────────────────────────────────
  useEffect(() => {
    const read = () =>
      chrome.storage.local.get(KEYS.CURRENT_SESSION, (res) =>
        setCurrentSession((res[KEYS.CURRENT_SESSION] as FocusSession) ?? null)
      );
    read();

    const onChange = (changes: Record<string, chrome.storage.StorageChange>) => {
      if (KEYS.CURRENT_SESSION in changes)
        setCurrentSession((changes[KEYS.CURRENT_SESSION].newValue as FocusSession) ?? null);
    };
    chrome.storage.onChanged.addListener(onChange);
    return () => chrome.storage.onChanged.removeListener(onChange);
  }, []);

  // ── Open panel ────────────────────────────────────────────────────────────
  const openPanel = useCallback(() => {
    openRef.current = true;
    previousFocusRef.current = document.activeElement;
    setOpen(true);
  }, []);

  // ── Close panel ──────────────────────────────────────────────────────────
  const closePanel = useCallback(() => {
    lastCloseTimeRef.current = Date.now();
    openRef.current = false;
    setOpen(false);
    setTimeout(() => {
      if (previousFocusRef.current && (previousFocusRef.current as HTMLElement).focus) {
        (previousFocusRef.current as HTMLElement).focus();
      }
    }, 320);
  }, []);

  // ── Snip trigger pipeline ─────────────────────────────────────────────────
  const triggerSnip = useCallback(async () => {
    // 1. Hide panel visibility
    setIsPanelHiddenForSnip(true);

    // 2. Wait 2x requestAnimationFrame + 80ms for panel to disappear cleanly
    await new Promise((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setTimeout(resolve, 80);
        });
      });
    });

    // 3. Capture visible tab
    chrome.runtime.sendMessage({ type: 'SNIP_CAPTURE' }, (res) => {
      // SW router wraps result in { ok: true, data: { ok: true, dataUrl: '...' } }
      const payload = res && res.data !== undefined ? res.data : res;
      if (!res?.ok || !payload || !payload.ok || !payload.dataUrl) {
        setIsPanelHiddenForSnip(false);
        const reason = payload?.reason || res?.error || payload?.error || "Can't capture this page.";
        alert(reason);
        return;
      }
      // Unhide panel host before setting screenshotUrl so applySnipStyles
      // takes effect on a properly visible host element
      setIsPanelHiddenForSnip(false);
      setScreenshotUrl(payload.dataUrl);
    });
  }, []);

  // ── Snip completion: run OCR ──────────────────────────────────────────────
  const handleSnipComplete = useCallback((snip: SnipResult) => {
    setScreenshotUrl(null);
    setIsPanelHiddenForSnip(false);
    setOpen(true);
    setActiveTab('ai');

    lastCroppedDataUrlRef.current = snip.dataUrl;

    // Set chip to loading state
    setOcrAttachment({
      thumbnail: snip.thumbnail,
      mode: snip.mode as any,
      loading: true,
    });

    // Send OCR_RUN to SW -> Offscreen worker
    chrome.runtime.sendMessage(
      {
        type: 'OCR_RUN',
        dataUrl: snip.dataUrl,
        mode: snip.mode,
        psmHint: snip.psmHint,
      },
      (res) => {
        const payload = res && res.data !== undefined ? res.data : res;
        const inner = payload && payload.data !== undefined ? payload.data : payload;
        if (!res?.ok || !payload || !payload.ok || !inner) {
          setOcrAttachment({
            thumbnail: snip.thumbnail,
            mode: snip.mode as any,
            loading: false,
            empty: true,
          });
          return;
        }

        const text = (inner.text || '').trim();

        if (!text) {
          setOcrAttachment({
            thumbnail: snip.thumbnail,
            mode: snip.mode as any,
            loading: false,
            empty: true,
          });
          return;
        }

        // Success: append text to composer and delete screenshot (don't save it)
        setComposerInput((prev) => {
          const trimmed = prev.trim();
          if (!trimmed) return text;
          return `${trimmed}\n\n${text}`;
        });

        // Delete temporary screenshot and thumbnail immediately after text extraction
        setOcrAttachment(null);
        lastCroppedDataUrlRef.current = null;
      }
    );
  }, []);

  // ── Snip cancellation ─────────────────────────────────────────────────────
  const handleSnipCancel = useCallback(() => {
    setScreenshotUrl(null);
    setIsPanelHiddenForSnip(false);
  }, []);

  // ── Re-run OCR in another mode ────────────────────────────────────────────
  const handleRerunOcr = useCallback((newMode: OCRMode) => {
    if (!lastCroppedDataUrlRef.current) return;

    setOcrAttachment((prev) => (prev ? { ...prev, loading: true, mode: newMode as any } : null));

    chrome.runtime.sendMessage(
      {
        type: 'OCR_RUN',
        dataUrl: lastCroppedDataUrlRef.current,
        mode: newMode,
      },
      (res) => {
        const payload = res && res.data !== undefined ? res.data : res;
        const inner = payload && payload.data !== undefined ? payload.data : payload;
        if (!res?.ok || !payload || !payload.ok || !inner) {
          setOcrAttachment((prev) => (prev ? { ...prev, loading: false } : null));
          return;
        }

        const text = (inner.text || '').trim();

        setOcrAttachment((prev) =>
          prev
            ? {
                ...prev,
                confidence: inner.confidence,
                mode: newMode as any,
                loading: false,
                empty: !text,
              }
            : null
        );

        if (text) {
          setComposerInput(text);
        }
      }
    );
  }, []);

  // ── Auto-popup when mouse moves to right edge ─────────────────────────────
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (screenshotUrl) return;
      if (Date.now() - lastCloseTimeRef.current < 600) return;
      const distFromRight = window.innerWidth - e.clientX;
      if (!openRef.current && distFromRight <= 25) {
        openPanel();
      }
    };

    window.addEventListener('mousemove', onMouseMove, { capture: true, passive: true });
    return () => {
      window.removeEventListener('mousemove', onMouseMove, { capture: true });
    };
  }, [openPanel, screenshotUrl]);

  // ── Keyboard shortcut & messages (Ctrl+Space) ─────────────────────────────
  useEffect(() => {
    const handleMsg = (msg: any) => {
      if (msg.type === 'TOGGLE_HUD') {
        if (openRef.current) closePanel();
        else openPanel();
      }
      if (msg.type === 'START_SNIP') {
        triggerSnip();
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (screenshotUrl) return;

      // Ignore keystrokes that originated inside the shadow root / panel
      // (the event path crosses the shadow host container)
      const path = e.composedPath();
      if (path.includes(container)) return;

      // Ctrl + Space always toggles or opens panel
      if (e.ctrlKey && (e.key === ' ' || e.code === 'Space')) {
        e.preventDefault();
        e.stopPropagation();
        if (openRef.current) closePanel();
        else openPanel();
        return;
      }
      if (e.key === 'Escape' && openRef.current) {
        e.preventDefault();
        closePanel();
      }
    };

    chrome.runtime?.onMessage?.addListener(handleMsg);
    window.addEventListener('keydown', onKeyDown, { capture: true });

    return () => {
      chrome.runtime?.onMessage?.removeListener(handleMsg);
      window.removeEventListener('keydown', onKeyDown, { capture: true });
    };
  }, [openPanel, closePanel, triggerSnip, screenshotUrl, container]);

  // ── Keyboard isolation ────────────────────────────────────────────────────
  // Stop keystrokes inside panel from bubbling up to document and window
  // (so host sites like YouTube, Gmail, GitHub never receive them),
  // while allowing React inside the panel to receive all events normally.
  useEffect(() => {
    const stopBubble = (e: Event) => {
      e.stopPropagation();
    };

    container.addEventListener('keydown',  stopBubble);
    container.addEventListener('keyup',    stopBubble);
    container.addEventListener('keypress', stopBubble);

    return () => {
      container.removeEventListener('keydown',  stopBubble);
      container.removeEventListener('keyup',    stopBubble);
      container.removeEventListener('keypress', stopBubble);
    };
  }, [container]);

  // ── Width resize drag handle ──────────────────────────────────────────────
  const onResizePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    isResizingRef.current = true;
    resizeStartXRef.current = e.clientX;
    resizeStartWidthRef.current = panelWidthRef.current;
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
  }, []);

  const onResizePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isResizingRef.current) return;
    const delta = resizeStartXRef.current - e.clientX;
    const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, resizeStartWidthRef.current + delta));
    setPanelWidth(newWidth);
  }, []);

  const onResizePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isResizingRef.current) return;
    isResizingRef.current = false;
    const finalWidth = panelWidthRef.current;
    chrome.storage.local.set({ [PANEL_WIDTH_KEY]: finalWidth });
  }, []);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', overflow: 'visible' }}>

      {/* EdgeTrigger — only rendered when panel is closed and snip is not active */}
      {!open && !screenshotUrl && (
        <EdgeTrigger mode={edgeTriggerMode} onOpen={openPanel} />
      )}

      {/* SnipOverlay — rendered when screenshot is captured */}
      {screenshotUrl && (
        <SnipOverlay
          screenshotUrl={screenshotUrl}
          onComplete={handleSnipComplete}
          onCancel={handleSnipCancel}
        />
      )}

      <AnimatePresence>
        {open && (
          <motion.div
            key="side-panel"
            className={styles.panelContainer}
            data-theme={resolvedTheme}
            initial={{ x: '100%', opacity: 0.6 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            onAnimationComplete={() => {
              const textarea = container.querySelector?.('textarea');
              if (textarea) (textarea as HTMLTextAreaElement).focus();
            }}
            style={{
              position: 'fixed',
              top: 0,
              right: 0,
              width: `${panelWidth}px`,
              height: '100vh',
              display: isPanelHiddenForSnip ? 'none' : 'flex',
              flexDirection: 'column',
              background: 'var(--panel-bg, rgba(10, 10, 12, 0.96))',
              backdropFilter: 'blur(24px)',
              WebkitBackdropFilter: 'blur(24px)',
              borderLeft: '1px solid var(--panel-border, rgba(255,255,255,0.07))',
              boxShadow: 'var(--panel-shadow, -10px 0 60px rgba(0, 0, 0, 0.9))',
              overflow: 'hidden',
              color: 'var(--text-primary, #e8e8f0)',
              fontFamily: "'Inter', 'IBM Plex Mono', system-ui, sans-serif",
              zIndex: 2147483647,
              overscrollBehavior: 'contain',
              transition: 'background 0.2s ease, color 0.2s ease, border-color 0.2s ease',
            }}
            onKeyDown={(e) => {
              e.stopPropagation();
            }}
            onWheel={(e) => {
              e.stopPropagation();
            }}
          >
            {/* ── Drag resize handle (left edge) ── */}
            <div
              onPointerDown={onResizePointerDown}
              onPointerMove={onResizePointerMove}
              onPointerUp={onResizePointerUp}
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                width: '6px',
                height: '100%',
                cursor: 'ew-resize',
                zIndex: 10,
                background: 'transparent',
              }}
              onMouseOver={(e) => {
                (e.currentTarget as HTMLElement).style.background = 'rgba(36,82,255,0.15)';
              }}
              onMouseOut={(e) => {
                (e.currentTarget as HTMLElement).style.background = 'transparent';
              }}
            />

            {/* ── Tab bar ── */}
            <Tabs
              activeTab={activeTab}
              onTabChange={setActiveTab}
              onClose={closePanel}
            />

            {/* ── Tab content ── */}
            <PanelErrorBoundary>
              <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                {activeTab === 'ai' && (
                  <ChatPanel
                    onStartSnip={triggerSnip}
                    ocrAttachment={ocrAttachment}
                    onRemoveOcrAttachment={() => setOcrAttachment(null)}
                    onRerunOcr={handleRerunOcr}
                    initialInput={composerInput}
                    onInputChange={setComposerInput}
                    ownHost={container}
                  />
                )}

                {activeTab === 'focus' && (
                  <div style={{
                    flex: 1,
                    padding: '20px 16px 12px',
                    overflowY: 'auto',
                    overscrollBehavior: 'contain',
                  }}>
                    <FocusGlance session={currentSession} />
                  </div>
                )}

                {activeTab === 'autofill' && (
                  <AutofillTab ownHost={container} />
                )}
              </div>
            </PanelErrorBoundary>

            {/* Accent line on the left border */}
            <div style={{
              position: 'absolute',
              left: 0,
              top: '20%',
              height: '60%',
              width: '2px',
              background: 'linear-gradient(to bottom, transparent, rgba(36,82,255,0.8), transparent)',
              pointerEvents: 'none',
            }} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}