import React, { useEffect, useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { FocusSession } from '../../shared/types';
import { KEYS } from '../../shared/storage';
import FocusGlance from './FocusGlance';

interface Props {
  container: HTMLDivElement;
}

// How many px from the right edge triggers the panel to open on mouse slide
const TRIGGER_ZONE_PX = 20;
// How many px from right edge — beyond this, schedule a close
const CLOSE_ZONE_PX = 320;

export default function SidePanel({ container }: Props) {
  const [currentSession, setCurrentSession] = useState<FocusSession | null>(null);
  const [open, setOpen] = useState(false);

  // Use ref so event handlers always read current value without re-registering
  const openRef      = useRef(false);
  const leaveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep ref in sync with state
  useEffect(() => { openRef.current = open; }, [open]);

  // ── Container styles: apply immediately on open/close ────────────────────
  // CRITICAL: pointer-events:none when closed so the page is fully interactive
  useEffect(() => {
    if (open) {
      container.style.setProperty('width',          '300px', 'important');
      container.style.setProperty('pointer-events', 'auto',  'important');
    } else {
      container.style.setProperty('width',          '0px',   'important');
      container.style.setProperty('pointer-events', 'none',  'important');
    }
    container.style.setProperty('position', 'fixed',      'important');
    container.style.setProperty('top',      '0',          'important');
    container.style.setProperty('bottom',   '0',          'important');
    container.style.setProperty('right',    '0',          'important');
    container.style.setProperty('left',     'auto',       'important');
    container.style.setProperty('z-index',  '2147483647', 'important');
    container.style.setProperty('overflow', 'visible',    'important');
  }, [open, container]);

  // ── Read focus session from storage ──────────────────────────────────────
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

  // ── Open/close helpers ────────────────────────────────────────────────────
  const clearClose = useCallback(() => {
    if (leaveTimeout.current) {
      clearTimeout(leaveTimeout.current);
      leaveTimeout.current = null;
    }
  }, []);

  const scheduleClose = useCallback(() => {
    if (!leaveTimeout.current) {
      leaveTimeout.current = setTimeout(() => {
        setOpen(false);
        leaveTimeout.current = null;
      }, 500);
    }
  }, []);

  // ── Keyboard shortcut & Chrome command messages (Ctrl+Space) ─────────────
  useEffect(() => {
    const handleMsg = (msg: any) => {
      if (msg.type === 'TOGGLE_HUD') {
        setOpen(prev => !prev);
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && (e.key === ' ' || e.code === 'Space')) {
        e.preventDefault();
        e.stopPropagation();
        setOpen(prev => !prev);
      }
    };

    chrome.runtime?.onMessage?.addListener(handleMsg);
    window.addEventListener('keydown', onKeyDown, { capture: true });

    return () => {
      chrome.runtime?.onMessage?.removeListener(handleMsg);
      window.removeEventListener('keydown', onKeyDown, { capture: true });
    };
  }, []);

  // ── Mouse tracking ────────────────────────────────────────────────────────
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      const distFromRight = window.innerWidth - e.clientX;

      if (!openRef.current) {
        if (distFromRight <= TRIGGER_ZONE_PX) {
          clearClose();
          setOpen(true);
        }
      } else {
        if (distFromRight > CLOSE_ZONE_PX) {
          scheduleClose();
        } else {
          clearClose();
        }
      }
    };

    const onMouseLeave = () => {
      if (openRef.current) scheduleClose();
    };

    document.addEventListener('mousemove', onMouseMove, { capture: true, passive: true });
    document.addEventListener('mouseleave', onMouseLeave);

    return () => {
      document.removeEventListener('mousemove', onMouseMove, { capture: true });
      document.removeEventListener('mouseleave', onMouseLeave);
      clearClose();
    };
  }, [clearClose, scheduleClose]);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', overflow: 'visible' }}>

      {!open && (
        <div style={{
          position: 'fixed',
          right: 0,
          top: 0,
          width: '2px',
          height: '100vh',
          background: 'linear-gradient(to bottom, transparent 10%, rgba(36,82,255,0.25) 50%, transparent 90%)',
          pointerEvents: 'none',
          zIndex: 2147483646,
        }} />
      )}

      <AnimatePresence>
        {open && (
          <motion.div
            key="side-panel"
            initial={{ x: '100%', opacity: 0.6 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            style={{
              position: 'fixed',
              top: 0,
              right: 0,
              width: '300px',
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
            }}
          >
            {/* ── Top section: Focus timer ── */}
            <div style={{ flex: 1, padding: '20px 16px 12px', overflowY: 'auto' }}>
              <FocusGlance session={currentSession} />
            </div>

            {/* ── Divider ── */}
            <div style={{
              height: '1px',
              margin: '0 16px',
              flexShrink: 0,
              background: 'rgba(255,255,255,0.06)',
            }} />

            {/* ── Bottom section: AI Chat placeholder (Phase 2 replaces this) ── */}
            <div style={{ flex: 3, padding: '12px 16px 20px', overflowY: 'auto' }}>
              <div />
            </div>

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