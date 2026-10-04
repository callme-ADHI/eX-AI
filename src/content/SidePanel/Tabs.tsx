import React from 'react';

type TabId = 'ai' | 'focus';

interface TabsProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  onClose: () => void;
}

/**
 * Panel tab bar: AI | Focus, with a close button.
 */
export default function Tabs({ activeTab, onTabChange, onClose }: TabsProps) {
  const tabStyle = (id: TabId): React.CSSProperties => ({
    flex: 1,
    padding: '8px 12px',
    background: activeTab === id ? 'rgba(36,82,255,0.18)' : 'transparent',
    border: 'none',
    borderBottom: activeTab === id ? '2px solid rgba(36,82,255,0.9)' : '2px solid transparent',
    color: activeTab === id ? '#e8e8f0' : 'rgba(232,232,240,0.45)',
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase' as const,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    fontFamily: 'inherit',
  });

  return (
    <div style={{
      display: 'flex',
      alignItems: 'stretch',
      borderBottom: '1px solid rgba(255,255,255,0.07)',
      flexShrink: 0,
      minHeight: '36px',
    }}>
      <button style={tabStyle('ai')} onClick={() => onTabChange('ai')}>
        AI
      </button>
      <button style={tabStyle('focus')} onClick={() => onTabChange('focus')}>
        Focus
      </button>
      {/* Spacer */}
      <div style={{ flex: 0, width: '1px', background: 'rgba(255,255,255,0.07)', margin: '6px 0' }} />
      {/* Close button */}
      <button
        onClick={onClose}
        aria-label="Close panel"
        style={{
          width: '36px',
          flexShrink: 0,
          background: 'transparent',
          border: 'none',
          color: 'rgba(232,232,240,0.45)',
          fontSize: '16px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'color 0.15s',
          fontFamily: 'inherit',
        }}
        onMouseOver={(e) => { (e.currentTarget as HTMLElement).style.color = '#e8e8f0'; }}
        onMouseOut={(e) => { (e.currentTarget as HTMLElement).style.color = 'rgba(232,232,240,0.45)'; }}
      >
        ×
      </button>
    </div>
  );
}
