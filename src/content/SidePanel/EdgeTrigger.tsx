import React, { useRef } from 'react';

interface EdgeTriggerProps {
  mode: 'strip' | 'handle' | 'off';
  onOpen: () => void;
}

/**
 * EdgeTrigger — rendered inside the shadow root when the panel is closed.
 * 
 * A transparent 6px strip + a visible pill handle sit at position:fixed; right:0.
 * A fixed element at right:0 sits LEFT of the page scrollbar, so it correctly
 * receives mouseenter even when a page scrollbar is visible.
 *
 * pointer-events:auto on this element only (parent host is pointer-events:none).
 */
export default function EdgeTrigger({ mode, onOpen }: EdgeTriggerProps) {
  const dwellTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (mode === 'off') return null;

  const cancelDwell = () => {
    if (dwellTimer.current) {
      clearTimeout(dwellTimer.current);
      dwellTimer.current = null;
    }
  };

  const handleMouseEnter = (e: React.MouseEvent) => {
    // Only open if no mouse button is pressed (not dragging)
    if (e.buttons !== 0) return;
    cancelDwell();
    dwellTimer.current = setTimeout(() => {
      dwellTimer.current = null;
      onOpen();
    }, 120);
  };

  const handleMouseLeave = () => {
    cancelDwell();
  };

  const handleHandleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    cancelDwell();
    onOpen();
  };

  return (
    <div
      style={{
        position: 'fixed',
        right: 0,
        top: 0,
        bottom: 0,
        width: mode === 'handle' ? '10px' : '6px',
        pointerEvents: 'auto',
        zIndex: 2147483646,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
      }}
      onMouseEnter={mode === 'strip' ? handleMouseEnter : undefined}
      onMouseLeave={mode === 'strip' ? handleMouseLeave : undefined}
    >
      {/* Visible pill handle — always shown */}
      <div
        onClick={handleHandleClick}
        onMouseEnter={mode === 'handle' ? handleMouseEnter : undefined}
        onMouseLeave={mode === 'handle' ? handleMouseLeave : undefined}
        style={{
          width: '10px',
          height: '96px',
          borderRadius: '6px 0 0 6px',
          background: 'linear-gradient(to bottom, rgba(36,82,255,0.6), rgba(100,140,255,0.6))',
          opacity: 0.45,
          cursor: 'pointer',
          transition: 'opacity 0.2s, width 0.15s',
          flexShrink: 0,
        }}
        onMouseOver={(e) => {
          (e.currentTarget as HTMLElement).style.opacity = '1';
        }}
        onMouseOut={(e) => {
          (e.currentTarget as HTMLElement).style.opacity = '0.45';
        }}
        title="Open eX-AI panel"
        aria-label="Open eX-AI panel"
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') handleHandleClick(e as any);
        }}
      />
    </div>
  );
}
