import React, { useEffect, useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { FocusSession } from '../../shared/types';
import { KEYS } from '../../shared/storage';
import FocusGlance from './FocusGlance';
import EdgeTrigger from './EdgeTrigger';
import Tabs from './Tabs';
import ChatPanel from './chat/ChatPanel';

interface Props {
  container: HTMLDivElement;
  shadowRoot: ShadowRoot;
  defaultWidth: number;
  applyOpenStyles: (el: HTMLElement, width: number) => void;
  applyClosedStyles: (el: HTMLElement) => void;
}

type TabId = 'ai' | 'focus';

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
}: Props) {
  const [currentSession, setCurrentSession] = useState<FocusSession | null>(null);
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('ai');
  const [panelWidth, setPanelWidth] = useState(defaultWidth);
  const [edgeTriggerMode, setEdgeTriggerMode] = useState<'strip' | 'handle' | 'off'>('strip');

  const openRef = useRef(false);
  const panelWidthRef = useRef(panelWidth);
  const previousFocusRef = useRef<Element | null>(null);
  const isResizingRef = useRef(false);
  const resizeStartXRef = useRef(0);
  const resizeStartWidthRef = useRef(0);

  // Keep ref in sync
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
    });
  }, []);

  // ── Container styles ──────────────────────────────────────────────────────
  useEffect(() => {
    if (open) {
      applyOpenStyles(container, panelWidth);
    } else {
      applyClosedStyles(container);
    }
  }, [open, panelWidth, container, applyOpenStyles, applyClosedStyles]);

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
    // Remember where focus was before opening
    previousFocusRef.current = document.activeElement;
    setOpen(true);
  }, []);

  // ── Close panel ──────────────────────────────────────────────────────────
  const closePanel = useCallback(() => {
    setOpen(false);
    // Restore focus after animation
    setTimeout(() => {
      if (previousFocusRef.current && (previousFocusRef.current as HTMLElement).focus) {
        (previousFocusRef.current as HTMLElement).focus();
      }
    }, 320);
  }, []);

  // ── Keyboard shortcut & messages ──────────────────────────────────────────
  useEffect(() => {
    const handleMsg = (msg: any) => {
      if (msg.type === 'TOGGLE_HUD') {
        if (openRef.current) closePanel();
        else openPanel();
      }
      if (msg.type === 'START_SNIP') {
        // Phase 5: forward snip trigger
        openPanel();
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Space toggles panel (skip when IME is composing)
      if (e.ctrlKey && !e.isComposing && (e.key === ' ' || e.code === 'Space')) {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (openRef.current) closePanel();
        else openPanel();
        return;
      }
      // Esc closes panel
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
  }, [openPanel, closePanel]);

  // ── Keyboard isolation ────────────────────────────────────────────────────
  // Prevent keystrokes in the panel from triggering site shortcuts
  // (YouTube, Gmail, GitHub, etc.)
  useEffect(() => {
    const stopIfInPanel = (e: KeyboardEvent) => {
      const path = e.composedPath();
      if (path.includes(container)) {
        e.stopImmediatePropagation();
      }
    };

    // Capture phase: we see it first before page handlers
    window.addEventListener('keydown',  stopIfInPanel, { capture: true });
    window.addEventListener('keyup',    stopIfInPanel, { capture: true });
    window.addEventListener('keypress', stopIfInPanel, { capture: true });

    return () => {
      window.removeEventListener('keydown',  stopIfInPanel, { capture: true });
      window.removeEventListener('keyup',    stopIfInPanel, { capture: true });
      window.removeEventListener('keypress', stopIfInPanel, { capture: true });
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
    // Persist
    chrome.storage.local.set({ [PANEL_WIDTH_KEY]: finalWidth });
  }, []);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', overflow: 'visible' }}>

      {/* EdgeTrigger — only rendered when panel is closed */}
      {!open && (
        <EdgeTrigger mode={edgeTriggerMode} onOpen={openPanel} />
      )}

      <AnimatePresence>
        {open && (
          <motion.div
            key="side-panel"
            initial={{ x: '100%', opacity: 0.6 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            onAnimationComplete={() => {
              // After open animation, focus the chat textarea (Phase 4 will wire this up)
              const textarea = container.querySelector?.('textarea');
              if (textarea) (textarea as HTMLTextAreaElement).focus();
            }}
            style={{
              position: 'fixed',
              top: 0,
              right: 0,
              width: `${panelWidth}px`,
              height: '100vh',
              display: 'flex',
              flexDirection: 'column',
              background: 'rgba(10, 10, 12, 0.96)',
              backdropFilter: 'blur(24px)',
              WebkitBackdropFilter: 'blur(24px)',
              borderLeft: '1px solid rgba(255,255,255,0.07)',
              overflow: 'hidden',
              color: '#e8e8f0',
              fontFamily: "'Inter', 'IBM Plex Mono', system-ui, sans-serif",
              zIndex: 2147483647,
              overscrollBehavior: 'contain',
            }}
            onKeyDown={(e) => {
              // Also stop at React level for good measure
              e.stopPropagation();
            }}
            onWheel={(e) => {
              // Prevent page scroll behind panel when panel scroller is at end
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
                  <ChatPanel />
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