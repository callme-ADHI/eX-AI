import React, { useState, useCallback, useEffect } from 'react';
import { useChat } from './useChat';
import ChatHeader from './ChatHeader';
import MessageList from './MessageList';
import Composer, { AttachmentChipData } from './Composer';
import SettingsDrawer from './SettingsDrawer';
import HistoryDrawer from './HistoryDrawer';
import type { OCRMode } from '../../../shared/aiTypes';
import styles from './chat.module.css';

interface ChatPanelProps {
  onStartSnip?: () => void;
  // External attachment state passed from Phase 5 snip flow
  ocrAttachment?: AttachmentChipData | null;
  onRemoveOcrAttachment?: () => void;
  onRerunOcr?: (mode: OCRMode) => void;
  initialInput?: string;
  onInputChange?: (val: string) => void;
  ownHost?: Element | null;
}

export default function ChatPanel({
  onStartSnip,
  ocrAttachment,
  onRemoveOcrAttachment,
  onRerunOcr,
  initialInput,
  onInputChange,
  ownHost,
}: ChatPanelProps) {
  const {
    session,
    chatIndex,
    settings,
    hasKey,
    keyHint,
    models,
    isStreaming,
    streamingMessageId,
    queuedEtaMs,
    currentError,
    sendMessage,
    stopGenerating,
    regenerate,
    editLastUserMessage,
    startNewChat,
    selectChat,
    deleteChatSession,
    renameChatSession,
    exportChat,
    setMode,
    updateSettings,
    saveKey,
    clearKey,
    toggleTheme,
    pageScope,
    setPageScope,
    consentPrompt,
    jsOnlyNotice,
    setJsOnlyNotice,
  } = useChat({ ownHost });

  const resolvedTheme: 'light' | 'dark' =
    settings.themeMode === 'auto'
      ? (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
      : (settings.themeMode === 'light' ? 'light' : 'dark');

  const [composerText, setComposerText] = useState(initialInput || '');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  // Sync external input changes (e.g. from OCR or parent SidePanel)
  useEffect(() => {
    if (initialInput !== undefined && initialInput !== composerText) {
      setComposerText(initialInput);
    }
  }, [initialInput]);

  // Sync external input changes (e.g. from OCR)
  const handleComposerChange = useCallback(
    (text: string) => {
      setComposerText(text);
      if (onInputChange) onInputChange(text);
    },
    [onInputChange]
  );

  const handleSend = () => {
    if (!composerText.trim()) return;
    const isFromOcr = Boolean(ocrAttachment && !ocrAttachment.empty);
    const thumb = ocrAttachment?.thumbnail;

    sendMessage(composerText, isFromOcr, thumb);
    setComposerText('');
    if (onInputChange) onInputChange('');
    if (onRemoveOcrAttachment) onRemoveOcrAttachment();
  };

  const handleCopyMessage = (text: string) => {
    navigator.clipboard.writeText(text).catch((err) => {
      console.error('Failed to copy text:', err);
    });
  };

  const handleEdit = (text: string) => {
    editLastUserMessage((val) => {
      setComposerText(val);
      if (onInputChange) onInputChange(val);
    });
  };

  return (
    <div className={styles.chatContainer} data-theme={resolvedTheme}>
      <ChatHeader
        mode={session.mode}
        onModeChange={setMode}
        models={models}
        selectedModel={settings.model}
        onModelChange={(model) => updateSettings({ model })}
        think={settings.think}
        onToggleThink={() => updateSettings({ think: !settings.think })}
        onNewChat={startNewChat}
        onOpenHistory={() => setIsHistoryOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        pageScope={pageScope}
        onPageScopeChange={setPageScope}
        browseMode={settings.browseMode || 'context'}
        onBrowseModeChange={(mode) => updateSettings({ browseMode: mode })}
        onTriggerAction={(text) => sendMessage(text)}
        themeMode={settings.themeMode}
        resolvedTheme={resolvedTheme}
        onToggleTheme={toggleTheme}
      />

      <MessageList
        messages={session.messages}
        streamingMessageId={streamingMessageId}
        isStreaming={isStreaming}
        queuedEtaMs={queuedEtaMs}
        error={currentError}
        hasKey={hasKey}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onCopy={handleCopyMessage}
        onRegenerate={regenerate}
        onEdit={handleEdit}
        onRetry={regenerate}
      />

      <Composer
        input={composerText}
        onChange={handleComposerChange}
        onSend={handleSend}
        onStop={stopGenerating}
        isStreaming={isStreaming}
        onStartSnip={onStartSnip || (() => {})}
        attachment={ocrAttachment}
        onRemoveAttachment={onRemoveOcrAttachment}
        onRerunOcr={onRerunOcr}
        pageScope={pageScope}
        onPageScopeChange={setPageScope}
        consentPrompt={consentPrompt}
        jsOnlyNotice={jsOnlyNotice}
        onDismissJsNotice={() => setJsOnlyNotice(false)}
        ownHost={ownHost}
        maxChars={settings.pageContextMaxChars}
        keepQuery={settings.pageContextKeepQuery}
      />

      {/* Settings Drawer */}
      <SettingsDrawer
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onUpdateSettings={updateSettings}
        hasKey={hasKey}
        keyHint={keyHint}
        onSaveKey={saveKey}
        onClearKey={clearKey}
        models={models}
      />

      {/* History Drawer */}
      <HistoryDrawer
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        chats={chatIndex}
        activeChatId={session.id}
        onSelectChat={selectChat}
        onRenameChat={renameChatSession}
        onDeleteChat={deleteChatSession}
        onExportChat={exportChat}
      />
    </div>
  );
}
