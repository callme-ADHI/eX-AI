import React from 'react';
import styles from './chat.module.css';

interface ConsentBarProps {
  origin: string;
  isSensitive?: boolean;
  customMessage?: string;
  onAllowOnce: () => void;
  onAllowAlways?: () => void;
  onCancel: () => void;
  allowAlwaysLabel?: string;
  cancelLabel?: string;
}

export default function ConsentBar({
  origin,
  isSensitive = false,
  customMessage,
  onAllowOnce,
  onAllowAlways,
  onCancel,
  allowAlwaysLabel,
  cancelLabel = 'Cancel',
}: ConsentBarProps) {
  return (
    <div
      className={styles.consentBar}
      role="alert"
      aria-live="polite"
      style={{
        background: isSensitive ? 'rgba(239, 68, 68, 0.12)' : 'rgba(36, 82, 255, 0.12)',
        border: `1px solid ${isSensitive ? 'rgba(239, 68, 68, 0.35)' : 'rgba(36, 82, 255, 0.35)'}`,
        borderRadius: '8px',
        padding: '10px 12px',
        marginBottom: '8px',
        fontSize: '12px',
        color: 'var(--text-primary, #e8e8f0)',
      }}
    >
      <div style={{ marginBottom: '6px', fontWeight: 600 }}>
        {isSensitive ? '⚠️ Sensitive Page Detected' : '🌐 Share Page Context?'}
      </div>

      <div style={{ fontSize: '11px', color: 'var(--text-secondary, rgba(232, 232, 240, 0.75))', marginBottom: '8px', lineHeight: 1.4 }}>
        {customMessage || (
          <>
            This sends the visible text of this page, its structure and its links to NVIDIA&apos;s API to answer your question.
            {isSensitive && (
              <div style={{ color: '#f87171', marginTop: '4px', fontWeight: 500 }}>
                This looks like a login, banking, mail, or government page. Please verify before sharing.
              </div>
            )}
          </>
        )}
      </div>

      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        <button
          className={styles.actionBtnSmall}
          style={{ background: '#2452ff', color: '#fff', border: 'none', padding: '4px 10px' }}
          onClick={onAllowOnce}
        >
          Allow once
        </button>

        {onAllowAlways && (
          <button
            className={styles.actionBtnSmall}
            style={{ background: 'rgba(255, 255, 255, 0.1)', color: '#e8e8f0', padding: '4px 10px' }}
            onClick={onAllowAlways}
            title={`Always allow page context on ${origin}`}
          >
            {allowAlwaysLabel || `Always on ${origin.replace(/^https?:\/\//, '')}`}
          </button>
        )}

        <button
          className={styles.actionBtnSmall}
          style={{ background: 'transparent', color: 'rgba(232, 232, 240, 0.6)', padding: '4px 8px' }}
          onClick={onCancel}
        >
          {cancelLabel}
        </button>
      </div>
    </div>
  );
}
