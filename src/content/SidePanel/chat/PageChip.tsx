import React, { useState, useEffect, useRef } from 'react';
import type { Scope, ExtractResult } from '../../pageText/types';
import { extractFromDocument } from '../../pageText/extract';
import { buildStructure } from '../../pageText/structure';
import { collectLinks, buildLinksBlock } from '../../pageText/links';
import { estimateTokens } from '../../pageText/text';
import styles from './chat.module.css';

interface PageChipProps {
  scope: 'off' | Scope;
  onScopeChange: (scope: 'off' | Scope) => void;
  maxChars?: number;
  keepQuery?: boolean;
  ownHost?: Element | null;
}

export default function PageChip({
  scope,
  onScopeChange,
  maxChars = 60_000,
  keepQuery = false,
  ownHost,
}: PageChipProps) {
  const [showPopover, setShowPopover] = useState(false);
  const [hasSelection, setHasSelection] = useState(false);
  const [previewData, setPreviewData] = useState<{
    page: ExtractResult;
    structure: string;
    linksText: string;
    totalLinks: number;
  } | null>(null);

  const popoverRef = useRef<HTMLDivElement>(null);

  // Check if text is selected on the page
  useEffect(() => {
    const checkSel = () => {
      const sel = window.getSelection()?.toString().trim();
      setHasSelection(!!sel);
    };
    checkSel();
    document.addEventListener('selectionchange', checkSel);
    return () => document.removeEventListener('selectionchange', checkSel);
  }, []);

  // Compute preview when popover opens or when scope becomes active
  const updatePreview = () => {
    try {
      const currentScope: Scope = scope === 'off' ? 'main' : scope;
      const page = extractFromDocument(document, {
        scope: currentScope,
        maxChars,
        keepQuery,
        live: true,
        pageUrl: location.href,
        ownHost,
      });
      const structure = buildStructure(document, location.href);
      const { links, contacts } = collectLinks(document, location.href, location.origin);
      const linksBlock = buildLinksBlock(links, contacts, { limit: 20, maxChars: 3000 });

      setPreviewData({
        page,
        structure,
        linksText: linksBlock.text,
        totalLinks: links.length,
      });
    } catch {
      // preview error
    }
  };

  useEffect(() => {
    if (scope !== 'off') {
      updatePreview();
    }
  }, [scope]);

  // Click cycles: off -> main -> page -> selection -> off
  const handleCycleScope = () => {
    if (scope === 'off') {
      onScopeChange('main');
    } else if (scope === 'main') {
      onScopeChange('page');
    } else if (scope === 'page') {
      onScopeChange('selection');
    } else {
      onScopeChange('off');
    }
  };

  const getScopeLabel = () => {
    switch (scope) {
      case 'main':
        return '📄 Page: Main';
      case 'page':
        return '📄 Page: Full';
      case 'selection':
        return '📄 Page: Selection';
      default:
        return '📄 Page: Off';
    }
  };

  // Close popover when clicking outside
  useEffect(() => {
    if (!showPopover) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setShowPopover(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showPopover]);

  const active = scope !== 'off';

  return (
    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
      <div
        className={`${styles.attachmentChip} ${active ? styles.pageChipActive : ''}`}
        style={{
          cursor: 'pointer',
          userSelect: 'none',
          backgroundColor: active ? 'rgba(36, 82, 255, 0.18)' : 'rgba(255, 255, 255, 0.06)',
          border: `1px solid ${active ? '#2452ff' : 'rgba(255, 255, 255, 0.12)'}`,
          color: active ? '#7094ff' : 'rgba(232, 232, 240, 0.65)',
          gap: '4px',
        }}
      >
        <span onClick={handleCycleScope} title="Click to cycle scope (Main → Page → Selection → Off)">
          {getScopeLabel()}
        </span>

        {active && previewData && (
          <span style={{ fontSize: '10px', color: 'rgba(232, 232, 240, 0.55)', marginLeft: '2px' }}>
            ({(previewData.page.chars / 1000).toFixed(1)}k chars · ~{estimateTokens(previewData.page.chars)} tok)
          </span>
        )}

        {active && previewData?.page.truncated && (
          <span
            style={{ fontSize: '9px', background: '#f59e0b', color: '#000', padding: '1px 3px', borderRadius: '3px' }}
            title="Page text truncated to maximum characters"
          >
            truncated
          </span>
        )}

        {active && previewData && !previewData.page.rendered && (
          <span
            style={{ fontSize: '9px', background: '#ef4444', color: '#fff', padding: '1px 3px', borderRadius: '3px' }}
            title="This page is JavaScript-rendered and has little readable text. Use Snip for visual content."
          >
            JS-only
          </span>
        )}

        <button
          onClick={(e) => {
            e.stopPropagation();
            updatePreview();
            setShowPopover(!showPopover);
          }}
          style={{
            background: 'none',
            border: 'none',
            color: 'inherit',
            cursor: 'pointer',
            padding: '0 2px',
            fontSize: '10px',
          }}
          title="Scope options & preview"
          aria-label="Scope options & preview"
        >
          ▾
        </button>
      </div>

      {/* Suggestion to use selection if text is selected */}
      {hasSelection && scope !== 'selection' && (
        <button
          onClick={() => onScopeChange('selection')}
          style={{
            marginLeft: '6px',
            fontSize: '10px',
            background: 'rgba(59, 130, 246, 0.15)',
            border: '1px solid rgba(59, 130, 246, 0.3)',
            borderRadius: '4px',
            color: '#60a5fa',
            cursor: 'pointer',
            padding: '2px 6px',
          }}
          title="Use currently highlighted text as page context"
        >
          Use selection
        </button>
      )}

      {/* Popover */}
      {showPopover && (
        <div
          ref={popoverRef}
          style={{
            position: 'absolute',
            bottom: '100%',
            left: 0,
            marginBottom: '8px',
            width: '320px',
            maxHeight: '380px',
            overflowY: 'auto',
            background: '#161622',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            borderRadius: '8px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6)',
            padding: '12px',
            zIndex: 9999,
            fontSize: '11px',
            color: '#e8e8f0',
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: '8px', display: 'flex', justifyContent: 'space-between' }}>
            <span>Page Context Options</span>
            <button
              onClick={() => setShowPopover(false)}
              style={{ background: 'none', border: 'none', color: 'rgba(232, 232, 240, 0.5)', cursor: 'pointer' }}
            >
              ✕
            </button>
          </div>

          <div style={{ display: 'flex', gap: '4px', marginBottom: '10px' }}>
            {(['main', 'page', 'selection', 'off'] as const).map((s) => (
              <button
                key={s}
                onClick={() => onScopeChange(s)}
                style={{
                  flex: 1,
                  padding: '4px 6px',
                  borderRadius: '4px',
                  fontSize: '10px',
                  border: '1px solid',
                  borderColor: scope === s ? '#2452ff' : 'rgba(255, 255, 255, 0.1)',
                  background: scope === s ? '#2452ff' : 'rgba(255, 255, 255, 0.05)',
                  color: scope === s ? '#fff' : 'inherit',
                  cursor: 'pointer',
                }}
              >
                {s}
              </button>
            ))}
          </div>

          {previewData && (
            <div>
              <div style={{ fontWeight: 600, color: '#7094ff', marginBottom: '4px' }}>
                Preview ({previewData.page.chars.toLocaleString()} chars · {previewData.totalLinks} links)
              </div>
              <div
                style={{
                  background: 'rgba(0, 0, 0, 0.3)',
                  padding: '6px',
                  borderRadius: '4px',
                  maxHeight: '120px',
                  overflowY: 'auto',
                  whiteSpace: 'pre-wrap',
                  fontFamily: 'monospace',
                  fontSize: '10px',
                  color: 'rgba(232, 232, 240, 0.8)',
                  marginBottom: '8px',
                }}
              >
                {previewData.page.text.slice(0, 1500) || '(No text extracted)'}
              </div>

              {previewData.structure && (
                <>
                  <div style={{ fontWeight: 600, color: '#7094ff', marginBottom: '4px' }}>Structure</div>
                  <div
                    style={{
                      background: 'rgba(0, 0, 0, 0.3)',
                      padding: '6px',
                      borderRadius: '4px',
                      maxHeight: '80px',
                      overflowY: 'auto',
                      whiteSpace: 'pre-wrap',
                      fontFamily: 'monospace',
                      fontSize: '10px',
                      color: 'rgba(232, 232, 240, 0.8)',
                    }}
                  >
                    {previewData.structure}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
