import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { ChatMessage, AIErrorCode } from '../../../shared/aiTypes';
import MessageBubble from './MessageBubble';
import styles from './chat.module.css';

interface MessageListProps {
  messages: ChatMessage[];
  streamingMessageId?: string;
  isStreaming: boolean;
  queuedEtaMs?: number | null;
  error?: { code: AIErrorCode; message: string } | null;
  hasKey: boolean;
  onOpenSettings: () => void;
  onCopy: (text: string) => void;
  onRegenerate: () => void;
  onEdit: (text: string) => void;
  onRetry: () => void;
}

export default function MessageList({
  messages,
  streamingMessageId,
  isStreaming,
  queuedEtaMs,
  error,
  hasKey,
  onOpenSettings,
  onCopy,
  onRegenerate,
  onEdit,
  onRetry,
}: MessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [showJumpToBottom, setShowJumpToBottom] = useState(false);
  const isNearBottomRef = useRef(true);

  // Check scroll position
  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const distFromBottom = scrollHeight - (scrollTop + clientHeight);
    const nearBottom = distFromBottom < 100;
    isNearBottomRef.current = nearBottom;
    setShowJumpToBottom(!nearBottom && messages.length > 2);
  }, [messages.length]);

  const scrollToBottom = (smooth = true) => {
    if (!containerRef.current) return;
    containerRef.current.scrollTo({
      top: containerRef.current.scrollHeight,
      behavior: smooth ? 'smooth' : 'auto',
    });
  };

  // Auto-scroll when messages or streaming tokens change, only if near bottom
  useEffect(() => {
    if (isNearBottomRef.current) {
      scrollToBottom(false);
    }
  }, [messages, isStreaming]);

  // First-run empty state
  if (messages.length === 0) {
    if (!hasKey) {
      return (
        <div className={styles.messageListWrapper}>
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>🔑</div>
            <div className={styles.emptyTitle}>Welcome to eX-AI by ADHI</div>
            <div className={styles.emptyText}>
              To start practising aptitude, coding, and reasoning questions, please provide your free NVIDIA API key.
            </div>
            <button className={styles.setupBtn} onClick={onOpenSettings}>
              Open Settings to add Key
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className={styles.messageListWrapper}>
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>⚡</div>
          <div className={styles.emptyTitle}>eX-AI Practice Assistant</div>
          <div style={{ fontSize: '11px', color: '#7094ff', fontWeight: 600, marginTop: '-6px' }}>Built by ADHI</div>
          <div className={styles.emptyText}>
            Ask any aptitude problem, coding question, or puzzle. Or click <strong>Snip</strong> to OCR questions directly from the screen!
          </div>
        </div>
      </div>
    );
  }

  // Find last assistant and user indices
  let lastAssistantIdx = -1;
  let lastUserIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (lastAssistantIdx === -1 && messages[i].role === 'assistant') {
      lastAssistantIdx = i;
    }
    if (lastUserIdx === -1 && messages[i].role === 'user') {
      lastUserIdx = i;
    }
    if (lastAssistantIdx !== -1 && lastUserIdx !== -1) break;
  }

  return (
    <div className={styles.messageListWrapper}>
      <div
        ref={containerRef}
        className={styles.messageList}
        onScroll={handleScroll}
        aria-live="polite"
      >
        {queuedEtaMs && queuedEtaMs > 0 && (
          <div className={styles.queuedNotice}>
            <span>⏳</span>
            <span>Waiting for rate limit (≈{Math.round(queuedEtaMs / 1000)}s)...</span>
          </div>
        )}

        {messages.map((msg, idx) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            isLastAssistant={idx === lastAssistantIdx}
            isLastUser={idx === lastUserIdx}
            isStreaming={msg.id === streamingMessageId && isStreaming}
            error={idx === lastAssistantIdx ? error : null}
            onCopy={onCopy}
            onRegenerate={onRegenerate}
            onEdit={onEdit}
            onRetry={onRetry}
          />
        ))}
      </div>

      {showJumpToBottom && (
        <button
          className={styles.jumpLatestBtn}
          onClick={() => scrollToBottom(true)}
          aria-label="Jump to latest message"
        >
          ↓ Jump to latest
        </button>
      )}
    </div>
  );
}
