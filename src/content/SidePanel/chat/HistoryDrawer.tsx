import React, { useState } from 'react';
import type { ChatIndex } from '../../../shared/aiTypes';
import styles from './chat.module.css';

interface HistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  chats: ChatIndex[];
  activeChatId: string;
  onSelectChat: (id: string) => void;
  onRenameChat: (id: string, newTitle: string) => void;
  onDeleteChat: (id: string) => void;
  onExportChat: (id: string) => void;
}

export default function HistoryDrawer({
  isOpen,
  onClose,
  chats,
  activeChatId,
  onSelectChat,
  onRenameChat,
  onDeleteChat,
  onExportChat,
}: HistoryDrawerProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');

  if (!isOpen) return null;

  const startRename = (id: string, currentTitle: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(id);
    setEditTitle(currentTitle);
  };

  const saveRename = (id: string) => {
    if (editTitle.trim()) {
      onRenameChat(id, editTitle.trim());
    }
    setEditingId(null);
  };

  return (
    <div className={styles.drawerOverlay}>
      <div className={styles.drawerHeader}>
        <span>🕒 Chat History</span>
        <button
          className={styles.iconBtn}
          onClick={onClose}
          aria-label="Close history"
        >
          ✕
        </button>
      </div>

      <div className={styles.drawerBody}>
        {chats.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'rgba(232, 232, 240, 0.4)', padding: '24px 0' }}>
            No chat history yet.
          </div>
        ) : (
          chats.map((chat) => (
            <div
              key={chat.id}
              className={`${styles.drawerItem} ${chat.id === activeChatId ? styles.drawerItemActive : ''}`}
              onClick={() => {
                onSelectChat(chat.id);
                onClose();
              }}
            >
              <div style={{ flex: 1, minWidth: 0, paddingRight: '8px' }}>
                {editingId === chat.id ? (
                  <input
                    type="text"
                    value={editTitle}
                    autoFocus
                    onChange={(e) => setEditTitle(e.target.value)}
                    onBlur={() => saveRename(chat.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveRename(chat.id);
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className={styles.fieldInput}
                    style={{ padding: '2px 6px', fontSize: '12px', width: '90%' }}
                  />
                ) : (
                  <>
                    <div
                      style={{
                        fontWeight: 600,
                        fontSize: '12px',
                        color: chat.id === activeChatId ? '#ffffff' : '#e8e8f0',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {chat.title}
                    </div>
                    <div style={{ fontSize: '10px', color: 'rgba(232, 232, 240, 0.45)', marginTop: '2px' }}>
                      {chat.mode.toUpperCase()} · {new Date(chat.updatedAt).toLocaleDateString()}
                    </div>
                  </>
                )}
              </div>

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: '4px' }}>
                <button
                  className={styles.actionBtnSmall}
                  title="Rename chat"
                  onClick={(e) => startRename(chat.id, chat.title, e)}
                >
                  ✏️
                </button>
                <button
                  className={styles.actionBtnSmall}
                  title="Export as Markdown"
                  onClick={(e) => {
                    e.stopPropagation();
                    onExportChat(chat.id);
                  }}
                >
                  📥
                </button>
                <button
                  className={styles.actionBtnSmall}
                  title="Delete chat"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(`Delete chat "${chat.title}"?`)) {
                      onDeleteChat(chat.id);
                    }
                  }}
                >
                  🗑️
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
