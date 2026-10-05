import React, { useState } from 'react';
import type { ActivityItem } from '../../pageText/types';

interface ActivityLinesProps {
  items: ActivityItem[];
  isStreaming?: boolean;
}

export default function ActivityLines({ items, isStreaming = false }: ActivityLinesProps) {
  const [collapsed, setCollapsed] = useState(false);

  if (!items || items.length === 0) return null;

  return (
    <div
      style={{
        background: 'rgba(255, 255, 255, 0.03)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '6px',
        padding: '6px 10px',
        marginBottom: '8px',
        fontSize: '11px',
        color: 'rgba(232, 232, 240, 0.75)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: 'pointer',
          userSelect: 'none',
        }}
        onClick={() => setCollapsed(!collapsed)}
      >
        <span style={{ fontWeight: 600, color: '#7094ff', display: 'flex', alignItems: 'center', gap: '6px' }}>
          {isStreaming ? (
            <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>🔄</span>
          ) : (
            <span>⚡</span>
          )}
          <span>Browsing activity ({items.length} {items.length === 1 ? 'step' : 'steps'})</span>
        </span>
        <span style={{ fontSize: '10px', color: 'rgba(232, 232, 240, 0.4)' }}>
          {collapsed ? '▾ Expand' : '▴ Collapse'}
        </span>
      </div>

      {!collapsed && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '6px' }}>
          {items.map((item) => (
            <div
              key={item.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '11px',
              }}
            >
              <span>
                {item.state === 'running' && '⏳'}
                {item.state === 'done' && '✓'}
                {item.state === 'blocked' && '🚫'}
                {item.state === 'error' && '⚠️'}
              </span>
              <span>{item.label}</span>
              {item.url && (
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: '#7094ff', textDecoration: 'underline', marginLeft: 'auto', fontSize: '10px' }}
                >
                  view ↗
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
