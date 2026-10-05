import React, { useState } from 'react';
import type { ChatMessage, AIErrorCode } from '../../../shared/aiTypes';
import Markdown from './Markdown';
import ThinkingBlock from './ThinkingBlock';
import ActivityLines from './ActivityLines';
import { ComponentErrorBoundary } from './ComponentErrorBoundary';
import { sanitizeAssistantAttribution } from '../../../shared/aiSanitizer';
import ChatFillButtons from './ChatFillButtons';
import styles from './chat.module.css';

interface MessageBubbleProps {
  message: ChatMessage;
  isLastAssistant: boolean;
  isLastUser: boolean;
  isStreaming?: boolean;
  error?: { code: AIErrorCode; message: string } | null;
  onCopy: (text: string) => void;
  onRegenerate?: () => void;
  onEdit?: (text: string) => void;
  onRetry?: () => void;
}

const MessageBubble = React.memo(function MessageBubble({
  message,
  isLastAssistant,
  isLastUser,
  isStreaming = false,
  error,
  onCopy,
  onRegenerate,
  onEdit,
  onRetry,
}: MessageBubbleProps) {
  const [copied, setCopied] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const handleCopy = () => {
    const textToCopy =
      message.role === 'assistant'
        ? sanitizeAssistantAttribution(message.content)
        : message.content;
    onCopy(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const getErrorDescription = (code: AIErrorCode, msg: string) => {
    switch (code) {
      case 'auth':
        return 'Invalid or missing API key. Please check your settings.';
      case 'forbidden-model':
        return 'This model family requires registration at build.nvidia.com.';
      case 'rate-limit':
        return 'Rate limit reached (~40 requests/min). Please wait a moment.';
      case 'network':
        return 'Network connection error. Check your connection.';
      case 'timeout':
        return 'Request timed out after 45s with no response.';
      default:
        return msg || 'An error occurred while generating the response.';
    }
  };

  if (message.role === 'user') {
    return (
      <div className={styles.userRow}>
        <div className={styles.userBubble}>
          {message.pageMeta && (
            <div
              style={{
                fontSize: '10px',
                color: '#7094ff',
                background: 'rgba(36, 82, 255, 0.15)',
                border: '1px solid rgba(36, 82, 255, 0.3)',
                borderRadius: '4px',
                padding: '2px 6px',
                marginBottom: '6px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                maxWidth: '100%',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title={message.pageMeta.url}
            >
              <span>📄</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {message.pageMeta.title || message.pageMeta.url}
              </span>
              <span style={{ color: 'rgba(232, 232, 240, 0.55)', flexShrink: 0 }}>
                ({(message.pageMeta.chars / 1000).toFixed(1)}k chars · {message.pageMeta.links} links)
              </span>
            </div>
          )}

          {message.thumbnail && (
            <div style={{ marginBottom: '8px' }}>
              <img
                src={message.thumbnail}
                alt="OCR Snip"
                onClick={() => setLightboxOpen(true)}
                style={{
                  maxWidth: '120px',
                  maxHeight: '80px',
                  borderRadius: '4px',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  cursor: 'pointer',
                  display: 'block',
                }}
                title="Click to enlarge thumbnail"
              />
            </div>
          )}

          <div>{message.content}</div>

          <div className={styles.bubbleActions} style={{ marginTop: '6px' }}>
            <button
              className={styles.actionBtnSmall}
              onClick={handleCopy}
              aria-label="Copy message"
            >
              {copied ? '✓ Copied' : 'Copy'}
            </button>
            {isLastUser && onEdit && (
              <button
                className={styles.actionBtnSmall}
                onClick={() => onEdit(message.content)}
                aria-label="Edit message"
              >
                ✏️ Edit
              </button>
            )}
          </div>
        </div>

        {/* Lightbox for thumbnail */}
        {lightboxOpen && message.thumbnail && (
          <div
            onClick={() => setLightboxOpen(false)}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0, 0, 0, 0.85)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 999999,
              cursor: 'zoom-out',
            }}
          >
            <img
              src={message.thumbnail}
              alt="Enlarged snip"
              style={{
                maxWidth: '90vw',
                maxHeight: '90vh',
                borderRadius: '8px',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6)',
              }}
            />
          </div>
        )}
      </div>
    );
  }

  // Assistant bubble
  return (
    <div className={styles.assistantRow}>
      <div className={styles.assistantBubble}>
        {message.activity && message.activity.length > 0 && (
          <ComponentErrorBoundary>
            <ActivityLines items={message.activity} isStreaming={isStreaming && isLastAssistant} />
          </ComponentErrorBoundary>
        )}

        {message.reasoning && (
          <ThinkingBlock
            reasoning={message.reasoning}
            isStreaming={isStreaming && !message.content}
          />
        )}

        <Markdown content={message.content} />

        {isStreaming && <span className={styles.caret} />}

        {message.interrupted && (
          <div
            style={{
              fontSize: '11px',
              fontStyle: 'italic',
              color: 'rgba(232, 232, 240, 0.45)',
              marginTop: '6px',
            }}
          >
            (interrupted)
          </div>
        )}

        {message.modelId && (
          <div className={styles.modelBadge}>
            <span>⚡</span>
            <span>{message.modelId}</span>
          </div>
        )}

        <div className={styles.bubbleActions} style={{ marginTop: '8px' }}>
          <button
            className={styles.actionBtnSmall}
            onClick={handleCopy}
            aria-label="Copy assistant response"
          >
            {copied ? '✓ Copied' : 'Copy'}
          </button>
          {isLastAssistant && !isStreaming && onRegenerate && (
            <button
              className={styles.actionBtnSmall}
              onClick={onRegenerate}
              aria-label="Regenerate response"
            >
              🔄 Regenerate
            </button>
          )}

          {message.role === 'assistant' && !isStreaming && (
            <ChatFillButtons content={message.content} />
          )}
        </div>
      </div>

      {/* Inline error row if generation failed */}
      {error && isLastAssistant && (
        <div className={styles.errorRow}>
          <div className={styles.errorText}>
            <strong>Error:</strong> {getErrorDescription(error.code, error.message)}
          </div>
          {onRetry && (
            <button className={styles.retryBtn} onClick={onRetry}>
              Retry
            </button>
          )}
        </div>
      )}
    </div>
  );
});

export default MessageBubble;
