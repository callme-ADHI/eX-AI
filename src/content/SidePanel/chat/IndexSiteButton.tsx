import React, { useState, useEffect, useRef } from 'react';
import { crawlSite, loadIndex, clearIndex, type IndexState, type Progress } from '../../pageText/siteIndex';
import { isOriginAllowed, allowOnce } from '../../pageText/consent';
import { LIMITS } from '../../../shared/constants';

interface IndexSiteButtonProps {
  onIndexChanged?: (count: number) => void;
}

export default function IndexSiteButton({ onIndexChanged }: IndexSiteButtonProps) {
  const [indexState, setIndexState] = useState<IndexState | null>(null);
  const [isCrawling, setIsCrawling] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const checkIndex = async () => {
    try {
      const idx = await loadIndex(location.origin);
      setIndexState(idx ?? null);
      if (onIndexChanged) onIndexChanged(idx?.pages.length ?? 0);
    } catch {
      setIndexState(null);
    }
  };

  useEffect(() => {
    checkIndex();
  }, []);

  const handleStartCrawl = async () => {
    setError(null);
    const allowed = await isOriginAllowed(location.origin);
    if (!allowed) {
      const confirmConsent = window.confirm(
        `Allow eX-AI to index and read pages from ${location.origin}?`
      );
      if (!confirmConsent) return;
      allowOnce(location.origin);
    }

    const ctl = new AbortController();
    abortRef.current = ctl;
    setIsCrawling(true);
    setProgress({ done: 0, queued: 1, skipped: 0, jsOnly: 0 });

    try {
      const result = await crawlSite({
        startUrl: location.href,
        maxPages: LIMITS.crawlMaxPagesDefault,
        maxDepth: LIMITS.crawlDepthDefault,
        delayMs: LIMITS.crawlDelayMsDefault,
        signal: ctl.signal,
        onProgress: (p) => setProgress(p),
      });
      setIndexState(result);
      if (onIndexChanged) onIndexChanged(result.pages.length);
    } catch (e: any) {
      if (ctl.signal.aborted) {
        setError('Indexing cancelled.');
      } else {
        setError(e?.message || 'Indexing failed.');
      }
      await checkIndex();
    } finally {
      setIsCrawling(false);
      abortRef.current = null;
    }
  };

  const handleCancel = () => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
  };

  const handleClear = async () => {
    await clearIndex(location.origin);
    setIndexState(null);
    setProgress(null);
    if (onIndexChanged) onIndexChanged(0);
  };

  if (isCrawling && progress) {
    return (
      <div style={{ padding: '6px 8px', background: 'rgba(36, 82, 255, 0.1)', borderRadius: '6px', margin: '4px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
          <span style={{ color: '#7094ff', fontWeight: 600, fontSize: '10px' }}>
            Indexing {progress.done}/{LIMITS.crawlMaxPagesDefault}
          </span>
          <button
            onClick={handleCancel}
            style={{
              background: 'none',
              border: 'none',
              color: '#f87171',
              cursor: 'pointer',
              fontSize: '10px',
              padding: '0 4px',
            }}
          >
            Cancel
          </button>
        </div>
        <div style={{ fontSize: '9px', color: 'rgba(232, 232, 240, 0.7)' }}>
          {progress.skipped} skipped · {progress.jsOnly} JS-only
        </div>
      </div>
    );
  }

  if (indexState && indexState.pages.length > 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px', background: 'rgba(74, 222, 128, 0.1)', borderRadius: '6px', margin: '4px 0' }}>
        <span style={{ color: '#4ade80', fontSize: '10px', fontWeight: 600 }}>
          Index: {indexState.pages.length} pages
        </span>
        <button
          onClick={handleClear}
          style={{
            background: 'none',
            border: 'none',
            color: '#f87171',
            cursor: 'pointer',
            fontSize: '10px',
          }}
          title="Clear site index from memory"
        >
          Clear
        </button>
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={handleStartCrawl}
        style={{
          width: '100%',
          textAlign: 'left',
          padding: '6px 8px',
          background: 'none',
          border: 'none',
          color: '#e8e8f0',
          cursor: 'pointer',
          borderRadius: '4px',
          fontSize: '11px',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}
      >
        <span>📑</span>
        <span>Index this site…</span>
      </button>
      {error && (
        <div style={{ fontSize: '9px', color: '#f87171', padding: '2px 8px' }}>
          {error}
        </div>
      )}
    </div>
  );
}
