import React, { useState, useEffect } from 'react';
import styles from './chat.module.css';

interface ThinkingBlockProps {
  reasoning: string;
  isStreaming?: boolean;
}

export default function ThinkingBlock({ reasoning, isStreaming = false }: ThinkingBlockProps) {
  // Collapsed by default, but if currently streaming we can expand live
  const [isOpen, setIsOpen] = useState(isStreaming);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // If streaming starts, open it; when streaming ends, keep current state or user preference
  useEffect(() => {
    if (isStreaming) {
      setIsOpen(true);
      const timer = setInterval(() => {
        setElapsedSeconds((s) => s + 1);
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [isStreaming]);

  if (!reasoning && !isStreaming) return null;

  return (
    <div className={styles.thinkingBlock}>
      <div
        className={styles.thinkingHeader}
        onClick={() => setIsOpen((prev) => !prev)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setIsOpen((prev) => !prev);
          }
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span>🧠</span>
          <span>
            {isStreaming
              ? `Thinking (${elapsedSeconds}s)...`
              : elapsedSeconds > 0
              ? `Thought for ${elapsedSeconds}s`
              : 'Thinking process'}
          </span>
        </span>
        <span style={{ fontSize: '10px' }}>{isOpen ? '▲ Hide' : '▼ View'}</span>
      </div>

      {isOpen && (
        <div className={styles.thinkingContent}>
          {reasoning || (isStreaming ? 'Pondering steps...' : '')}
        </div>
      )}
    </div>
  );
}
