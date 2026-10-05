import React, { useState, useEffect, useRef } from 'react';
import type { Scope } from '../../pageText/types';
import type { BrowseMode } from '../../../shared/aiTypes';
import { isOriginAllowed, forgetAllOrigins } from '../../pageText/consent';
import IndexSiteButton from './IndexSiteButton';
import styles from './chat.module.css';

interface BrowseMenuProps {
  pageScope: 'off' | Scope;
  onPageScopeChange: (scope: 'off' | Scope) => void;
  browseMode: BrowseMode;
  onBrowseModeChange: (mode: BrowseMode) => void;
  onTriggerAction: (promptText: string) => void;
  onOpenIndexDrawer?: () => void;
}

export default function BrowseMenu({
  pageScope,
  onPageScopeChange,
  browseMode,
  onBrowseModeChange,
  onTriggerAction,
  onOpenIndexDrawer,
}: BrowseMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isAllowed, setIsAllowed] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      isOriginAllowed(location.origin).then(setIsAllowed);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleAction = (text: string) => {
    setIsOpen(false);
    onTriggerAction(text);
  };

  return (
    <div style={{ position: 'relative' }} ref={menuRef}>
      <button
        className={`${styles.iconBtn} ${pageScope !== 'off' ? styles.browseBtnActive : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        title="Browse & Website Awareness Menu"
        aria-label="Browse Menu"
        style={{
          color: pageScope !== 'off' ? '#7094ff' : 'inherit',
          background: pageScope !== 'off' ? 'rgba(36, 82, 255, 0.15)' : 'none',
        }}
      >
        🌐
      </button>

      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: '6px',
            width: '260px',
            background: '#161622',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            borderRadius: '8px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.65)',
            padding: '10px',
            zIndex: 9999,
            fontSize: '11px',
            color: '#e8e8f0',
          }}
        >
          <div style={{ fontWeight: 700, color: '#7094ff', marginBottom: '8px', fontSize: '12px' }}>
            🌐 Website Browse
          </div>

          {/* Scope Picker */}
          <div style={{ marginBottom: '10px' }}>
            <div style={{ fontSize: '10px', color: 'rgba(232, 232, 240, 0.6)', marginBottom: '4px' }}>
              PAGE CONTEXT
            </div>
            <div style={{ display: 'flex', gap: '3px' }}>
              {(['off', 'main', 'page', 'selection'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => onPageScopeChange(s)}
                  style={{
                    flex: 1,
                    padding: '3px 0',
                    fontSize: '10px',
                    borderRadius: '4px',
                    border: '1px solid',
                    borderColor: pageScope === s ? '#2452ff' : 'rgba(255, 255, 255, 0.1)',
                    background: pageScope === s ? '#2452ff' : 'rgba(255, 255, 255, 0.05)',
                    color: pageScope === s ? '#fff' : 'inherit',
                    cursor: 'pointer',
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Browse Mode */}
          <div style={{ marginBottom: '10px' }}>
            <div style={{ fontSize: '10px', color: 'rgba(232, 232, 240, 0.6)', marginBottom: '4px' }}>
              BROWSE CAPABILITY
            </div>
            <div style={{ display: 'flex', gap: '4px' }}>
              <button
                onClick={() => onBrowseModeChange('context')}
                style={{
                  flex: 1,
                  padding: '4px',
                  fontSize: '10px',
                  borderRadius: '4px',
                  border: '1px solid',
                  borderColor: browseMode === 'context' ? '#2452ff' : 'rgba(255, 255, 255, 0.1)',
                  background: browseMode === 'context' ? 'rgba(36, 82, 255, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                  color: browseMode === 'context' ? '#7094ff' : 'inherit',
                  cursor: 'pointer',
                }}
                title="Send current page text with the user prompt"
              >
                Context only
              </button>
              <button
                onClick={() => onBrowseModeChange('tools')}
                style={{
                  flex: 1,
                  padding: '4px',
                  fontSize: '10px',
                  borderRadius: '4px',
                  border: '1px solid',
                  borderColor: browseMode === 'tools' ? '#2452ff' : 'rgba(255, 255, 255, 0.1)',
                  background: browseMode === 'tools' ? 'rgba(36, 82, 255, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                  color: browseMode === 'tools' ? '#7094ff' : 'inherit',
                  cursor: 'pointer',
                }}
                title="Model can call tools to fetch linked pages and sitemap"
              >
                Tool browse ⚡
              </button>
            </div>
          </div>

          <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.08)', margin: '6px 0' }} />

          {/* Quick Actions */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <button
              className={styles.menuItem}
              onClick={() => handleAction('Show me the structure and headings of this page')}
              style={{ textAlign: 'left', padding: '6px 8px', background: 'none', border: 'none', color: '#e8e8f0', cursor: 'pointer', borderRadius: '4px' }}
            >
              📐 Inspect structure
            </button>
            <button
              className={styles.menuItem}
              onClick={() => handleAction('List all internal links on this page')}
              style={{ textAlign: 'left', padding: '6px 8px', background: 'none', border: 'none', color: '#e8e8f0', cursor: 'pointer', borderRadius: '4px' }}
            >
              🔗 List page links
            </button>
            <button
              className={styles.menuItem}
              onClick={() => handleAction('Check the sitemap for this website')}
              style={{ textAlign: 'left', padding: '6px 8px', background: 'none', border: 'none', color: '#e8e8f0', cursor: 'pointer', borderRadius: '4px' }}
            >
              🗺️ Read sitemap
            </button>

            <IndexSiteButton />

            {onOpenIndexDrawer && (
              <button
                className={styles.menuItem}
                onClick={() => {
                  setIsOpen(false);
                  onOpenIndexDrawer();
                }}
                style={{ textAlign: 'left', padding: '6px 8px', background: 'none', border: 'none', color: '#e8e8f0', cursor: 'pointer', borderRadius: '4px' }}
              >
                📚 Site Index & Search
              </button>
            )}
          </div>

          <div style={{ fontSize: '9px', color: 'rgba(232, 232, 240, 0.4)', marginTop: '4px', fontStyle: 'italic' }}>
            Tools send fetched page text to NVIDIA too.
          </div>

          <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.08)', margin: '6px 0' }} />

          {/* Consent status for origin */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '10px' }}>
            <span style={{ color: isAllowed ? '#4ade80' : 'rgba(232, 232, 240, 0.5)' }}>
              {isAllowed ? '✓ Site allowed' : '○ Consent needed'}
            </span>
            {isAllowed && (
              <button
                onClick={async () => {
                  await forgetAllOrigins();
                  setIsAllowed(false);
                }}
                style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: '10px' }}
              >
                Forget
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
