import React, { useRef, useEffect } from 'react';
import type { OCRMode } from '../../../shared/aiTypes';
import styles from './chat.module.css';

export interface AttachmentChipData {
  thumbnail?: string;
  confidence?: number;
  mode?: OCRMode;
  loading?: boolean;
  empty?: boolean;
}

interface ComposerProps {
  input: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  isStreaming: boolean;
  onStartSnip: () => void;
  attachment?: AttachmentChipData | null;
  onRemoveAttachment?: () => void;
  onRerunOcr?: (newMode: OCRMode) => void;
}

export default function Composer({
  input,
  onChange,
  onSend,
  onStop,
  isStreaming,
  onStartSnip,
  attachment,
  onRemoveAttachment,
  onRerunOcr,
}: ComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-grow textarea up to ~8 lines (max 160px)
  useEffect(() => {
    if (!textareaRef.current) return;
    textareaRef.current.style.height = 'auto';
    textareaRef.current.style.height = `${Math.min(160, Math.max(36, textareaRef.current.scrollHeight))}px`;
  }, [input]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      if (e.shiftKey) {
        // Shift + Enter: allow default newline insertion
        return;
      }
      // Enter: send chat
      e.preventDefault();
      if (!isStreaming && input.trim()) {
        onSend();
      }
    }
  };

  const getConfidenceClass = (conf = 0) => {
    if (conf >= 80) return styles.confidenceHigh;
    if (conf >= 60) return styles.confidenceMedium;
    return styles.confidenceLow;
  };

  const isOcrLoading = attachment?.loading ?? false;
  const canSend = !isStreaming && input.trim().length > 0 && !isOcrLoading;
  const isLargeInput = input.length > 20_000;

  return (
    <div className={styles.composer}>
      {/* Attachment Chip Area */}
      {attachment && (
        <div className={styles.attachmentArea}>
          <div className={styles.attachmentChip}>
            {isOcrLoading ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#7094ff' }}>
                <span>🔄</span>
                <span>Reading screenshot...</span>
              </span>
            ) : attachment.empty ? (
              <span style={{ color: '#f87171' }}>No text detected</span>
            ) : (
              <>
                {attachment.thumbnail && (
                  <img
                    src={attachment.thumbnail}
                    alt="Snippet thumbnail"
                    className={styles.chipThumb}
                  />
                )}
                {attachment.confidence !== undefined && (
                  <span
                    className={`${styles.confidenceBadge} ${getConfidenceClass(attachment.confidence)}`}
                    title={
                      attachment.confidence < 60
                        ? 'Low confidence — please check the extracted text'
                        : `${Math.round(attachment.confidence)}% OCR confidence`
                    }
                  >
                    {Math.round(attachment.confidence)}%
                    {attachment.confidence < 60 ? ' ⚠️' : ''}
                  </span>
                )}
                {onRerunOcr && attachment.mode && (
                  <button
                    className={styles.actionBtnSmall}
                    onClick={() =>
                      onRerunOcr(attachment.mode === 'text' ? 'code' : 'text')
                    }
                    title={`Switch to ${attachment.mode === 'text' ? 'Code' : 'Text'} mode`}
                  >
                    {attachment.mode === 'text' ? 'Re-run as Code' : 'Re-run as Text'}
                  </button>
                )}
              </>
            )}

            {onRemoveAttachment && (
              <button
                className={styles.actionBtnSmall}
                onClick={onRemoveAttachment}
                title="Remove snippet"
                style={{ marginLeft: '4px' }}
              >
                ✕
              </button>
            )}
          </div>
        </div>
      )}

      {/* Input row */}
      <div className={styles.inputRow}>
        <div className={styles.textareaWrapper}>
          <textarea
            ref={textareaRef}
            className={styles.composerTextarea}
            value={input}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isOcrLoading ? 'Extracting text...' : 'Ask a problem, paste code, or type here... (Enter to send)'}
            rows={1}
            disabled={isOcrLoading}
          />
          {isLargeInput && (
            <div className={styles.charWarn}>
              ⚠️ Large input ({input.length.toLocaleString()} chars). May approach token limit.
            </div>
          )}
        </div>

        <div className={styles.composerButtons}>
          {/* Snip Button */}
          <button
            className={styles.snipBtn}
            onClick={onStartSnip}
            title="Snip screen to text (Alt+Shift+S)"
            aria-label="Snip screen to text"
            disabled={isStreaming || isOcrLoading}
          >
            ✂️
          </button>

          {/* Send / Stop Button */}
          {isStreaming ? (
            <button
              className={styles.stopBtn}
              onClick={onStop}
              title="Stop generating"
              aria-label="Stop generating"
            >
              ⏹
            </button>
          ) : (
            <button
              className={styles.sendBtn}
              onClick={onSend}
              disabled={!canSend}
              title="Send message (Enter)"
              aria-label="Send message"
            >
              ➤
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
