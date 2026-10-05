import React from 'react';
import type { AIMode, ModelEntry, BrowseMode } from '../../../shared/aiTypes';
import type { Scope } from '../../pageText/types';
import BrowseMenu from './BrowseMenu';
import styles from './chat.module.css';

interface ChatHeaderProps {
  mode: AIMode;
  onModeChange: (mode: AIMode) => void;
  models: ModelEntry[];
  selectedModel: string;
  onModelChange: (model: string) => void;
  think: boolean;
  onToggleThink: () => void;
  onNewChat: () => void;
  onOpenHistory: () => void;
  onOpenSettings: () => void;
  // Website Awareness
  pageScope: 'off' | Scope;
  onPageScopeChange: (scope: 'off' | Scope) => void;
  browseMode: BrowseMode;
  onBrowseModeChange: (mode: BrowseMode) => void;
  onTriggerAction: (promptText: string) => void;
  onOpenIndexDrawer?: () => void;
}

export default function ChatHeader({
  mode,
  onModeChange,
  models,
  selectedModel,
  onModelChange,
  think,
  onToggleThink,
  onNewChat,
  onOpenHistory,
  onOpenSettings,
  pageScope,
  onPageScopeChange,
  browseMode,
  onBrowseModeChange,
  onTriggerAction,
  onOpenIndexDrawer,
}: ChatHeaderProps) {
  const modes: Array<{ id: AIMode; label: string }> = [
    { id: 'general', label: 'General' },
    { id: 'aptitude', label: 'Aptitude' },
    { id: 'coding', label: 'Coding' },
    { id: 'reasoning', label: 'Reasoning' },
  ];

  return (
    <div className={styles.header}>
      {/* Brand title bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '2px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '13px', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.02em' }}>
            ⚡ eX-AI
          </span>
          <span style={{ fontSize: '10px', color: '#7094ff', fontWeight: 600, background: 'rgba(36, 82, 255, 0.15)', padding: '1px 6px', borderRadius: '4px' }}>
            by ADHI
          </span>
        </div>
      </div>

      {/* Top row: Mode selector + action icons */}
      <div className={styles.headerRowTop}>
        <div className={styles.modeSelector}>
          {modes.map((m) => (
            <button
              key={m.id}
              className={`${styles.modeBtn} ${mode === m.id ? styles.modeBtnActive : ''}`}
              onClick={() => onModeChange(m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>

        <div className={styles.headerActions}>
          <BrowseMenu
            pageScope={pageScope}
            onPageScopeChange={onPageScopeChange}
            browseMode={browseMode}
            onBrowseModeChange={onBrowseModeChange}
            onTriggerAction={onTriggerAction}
            onOpenIndexDrawer={onOpenIndexDrawer}
          />
          <button
            className={styles.iconBtn}
            onClick={onNewChat}
            title="Start new chat"
            aria-label="New chat"
          >
            ➕
          </button>
          <button
            className={styles.iconBtn}
            onClick={onOpenHistory}
            title="Chat history"
            aria-label="History"
          >
            🕒
          </button>
          <button
            className={styles.iconBtn}
            onClick={onOpenSettings}
            title="Settings"
            aria-label="Settings"
          >
            ⚙️
          </button>
        </div>
      </div>

      {/* Sub row: Model dropdown + Think toggle */}
      <div className={styles.headerRowSub}>
        <select
          className={styles.modelSelect}
          style={{ colorScheme: 'dark', backgroundColor: '#14141c', color: '#e8e8f0' }}
          value={selectedModel}
          onChange={(e) => onModelChange(e.target.value)}
          title="Active NIM Model"
        >
          {models.map((m) => (
            <option key={m.id} value={m.id} style={{ backgroundColor: '#161622', color: '#e8e8f0' }}>
              {m.label || m.id}
            </option>
          ))}
        </select>

        <div
          className={`${styles.thinkToggle} ${think ? styles.thinkToggleActive : ''}`}
          onClick={onToggleThink}
          role="button"
          tabIndex={0}
          title="Toggle Reasoning / Thinking output"
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onToggleThink();
            }
          }}
        >
          <span>🧠</span>
          <span>Think</span>
        </div>
      </div>
    </div>
  );
}
