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
            background: 'var(--dropdown-bg, #161622)',
            border: '1px solid var(--dropdown-border, rgba(255, 255, 255, 0.15))',
            borderRadius: '8px',
            boxShadow: 'var(--dropdown-shadow, 0 8px 32px rgba(0, 0, 0, 0.65))',
            padding: '10px',
            zIndex: 9999,
            fontSize: '11px',
            color: 'var(--text-primary, #e8e8f0)',
          }}
        >
          <div style={{ fontWeight: 700, color: 'var(--accent)', marginBottom: '8px', fontSize: '12px' }}>
            🌐 Website Browse
          </div>

          {/* Scope Picker */}
          <div style={{ marginBottom: '10px' }}>
            <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
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
                    borderColor: pageScope === s ? 'var(--accent)' : 'var(--control-border)',
                    background: pageScope === s ? 'var(--accent)' : 'var(--control-bg)',
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
            <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
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
                  borderColor: browseMode === 'context' ? 'var(--accent)' : 'var(--control-border)',
                  background: browseMode === 'context' ? 'var(--tab-active-bg)' : 'var(--control-bg)',
                  color: browseMode === 'context' ? 'var(--accent)' : 'inherit',
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
                  borderColor: browseMode === 'tools' ? 'var(--accent)' : 'var(--control-border)',
                  background: browseMode === 'tools' ? 'var(--tab-active-bg)' : 'var(--control-bg)',
                  color: browseMode === 'tools' ? 'var(--accent)' : 'inherit',
                  cursor: 'pointer',
                }}
                title="Model can call tools to fetch linked pages and sitemap"
              >
                Tool browse ⚡
              </button>
            </div>
          </div>

          <div style={{ borderTop: '1px solid var(--control-border)', margin: '6px 0' }} />

          {/* Quick Actions */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <button
              className={styles.menuItem}
              onClick={() => handleAction('Show me the structure and headings of this page')}
              style={{ textAlign: 'left', padding: '6px 8px', background: 'none', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', borderRadius: '4px' }}
            >
              📐 Inspect structure
            </button>
            <button
              className={styles.menuItem}
              onClick={() => handleAction('List all internal links on this page')}
              style={{ textAlign: 'left', padding: '6px 8px', background: 'none', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', borderRadius: '4px' }}
            >
              🔗 List page links
            </button>
            <button
              className={styles.menuItem}
              onClick={() => handleAction('Check the sitemap for this website')}
              style={{ textAlign: 'left', padding: '6px 8px', background: 'none', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', borderRadius: '4px' }}
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
                style={{ textAlign: 'left', padding: '6px 8px', background: 'none', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', borderRadius: '4px' }}
              >
                📚 Site Index & Search
              </button>
            )}
          </div>

          <div style={{ fontSize: '9px', color: 'var(--text-muted)', marginTop: '4px', fontStyle: 'italic' }}>
            Tools send fetched page text to NVIDIA too.
          </div>

          <div style={{ borderTop: '1px solid var(--control-border)', margin: '6px 0' }} />

          {/* Consent status for origin */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '10px' }}>
            <span style={{ color: isAllowed ? '#4ade80' : 'var(--text-muted)' }}>
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
