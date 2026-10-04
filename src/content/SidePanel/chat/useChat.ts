import { useState, useEffect, useRef, useCallback } from 'react';
import type {
  ChatMessage,
  ChatSession,
  ChatIndex,
  AIMode,
  ExAISettings,
  ModelEntry,
  PortMessageOut,
  AIErrorCode,
} from '../../../shared/aiTypes';
import { DEFAULT_EXAI_SETTINGS } from '../../../shared/aiTypes';
import {
  generateChatId,
  getChatIndex,
  getActiveChatId,
  setActiveChatId,
  loadChatSession,
  saveChatSession,
  deleteChat as storeDeleteChat,
  renameChat as storeRenameChat,
  exportChatAsMarkdown,
  createDebouncedSave,
} from './chatStore';

export function useChat() {
  const [session, setSession] = useState<ChatSession>({
    id: generateChatId(),
    title: 'New Chat',
    mode: 'general',
    messages: [],
    updatedAt: Date.now(),
  });

  const [chatIndex, setChatIndex] = useState<ChatIndex[]>([]);
  const [settings, setSettings] = useState<ExAISettings>(DEFAULT_EXAI_SETTINGS);
  const [hasKey, setHasKey] = useState(false);
  const [keyHint, setKeyHint] = useState('');
  const [models, setModels] = useState<ModelEntry[]>([]);

  // Streaming states
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState<string | undefined>();
  const [queuedEtaMs, setQueuedEtaMs] = useState<number | null>(null);
  const [currentError, setCurrentError] = useState<{ code: AIErrorCode; message: string } | null>(null);

  const portRef = useRef<chrome.runtime.Port | null>(null);
  const sessionRef = useRef<ChatSession>(session);
  const isStreamingRef = useRef(false);
  const debouncedSaveRef = useRef(createDebouncedSave(400));

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    isStreamingRef.current = isStreaming;
  }, [isStreaming]);

  // ── 1. Load initial settings & models & index ─────────────────────────────
  const refreshSettings = useCallback(async () => {
    try {
      const res = await new Promise<any>((resolve) => {
        chrome.runtime.sendMessage({ type: 'AI_SETTINGS_GET' }, (r) => resolve(r?.data));
      });
      if (res?.settings) {
        setSettings(res.settings);
        setHasKey(res.hasKey);
        setKeyHint(res.keyHint || '');
      }
    } catch (err) {
      console.error('[eX-AI] Failed to fetch settings:', err);
    }
  }, []);

  const refreshModels = useCallback(async (refreshCache = false) => {
    try {
      const res = await new Promise<any>((resolve) => {
        chrome.runtime.sendMessage(
          { type: 'AI_MODELS_LIST', refresh: refreshCache },
          (r) => resolve(r?.data)
        );
      });
      if (res?.models) {
        setModels(res.models);
      }
    } catch (err) {
      console.error('[eX-AI] Failed to fetch models:', err);
    }
  }, []);

  const refreshChatIndex = useCallback(async () => {
    const list = await getChatIndex();
    setChatIndex(list);
  }, []);

  // ── 2. Storage onChanged listener (sync across tabs) ──────────────────────
  useEffect(() => {
    const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== 'local') return;
      if ('exai:chats' in changes) {
        setChatIndex((changes['exai:chats'].newValue as ChatIndex[]) || []);
      }
      if ('exai:settings' in changes) {
        refreshSettings();
      }
    };

    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, [refreshSettings]);

  // ── 3. Page unload handler: mark interrupted stream ───────────────────────
  useEffect(() => {
    const onBeforeUnload = () => {
      if (isStreamingRef.current && sessionRef.current) {
        const msgs = [...sessionRef.current.messages];
        const last = msgs[msgs.length - 1];
        if (last && last.role === 'assistant') {
          last.interrupted = true;
          saveChatSession({ ...sessionRef.current, messages: msgs });
        }
        if (portRef.current) {
          portRef.current.disconnect();
          portRef.current = null;
        }
      }
    };

    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  // ── 4. Initial load of active chat ────────────────────────────────────────
  useEffect(() => {
    (async () => {
      await refreshSettings();
      await refreshModels();
      await refreshChatIndex();

      const activeId = await getActiveChatId();
      if (activeId) {
        const existing = await loadChatSession(activeId);
        if (existing) {
          setSession(existing);
          return;
        }
      }

      // No existing or valid chat: start a new one
      const newId = generateChatId();
      const newSession: ChatSession = {
        id: newId,
        title: 'New Chat',
        mode: 'general',
        messages: [],
        updatedAt: Date.now(),
      };
      setSession(newSession);
      await setActiveChatId(newId);
    })();
  }, [refreshSettings, refreshModels, refreshChatIndex]);

  // ── 5. Connect Port ───────────────────────────────────────────────────────
  const getPort = useCallback(() => {
    if (portRef.current) return portRef.current;

    try {
      const p = chrome.runtime.connect({ name: 'ex-ai-chat' });
      p.onDisconnect.addListener(() => {
        portRef.current = null;
      });
      portRef.current = p;
      return p;
    } catch (e) {
      console.error('[eX-AI] Failed to connect port:', e);
      return null;
    }
  }, []);

  // ── 6. Send Message / Stream ──────────────────────────────────────────────
  const startStream = useCallback(
    (historyMessages: ChatMessage[], assistantMsgId: string) => {
      const port = getPort();
      if (!port) {
        setCurrentError({ code: 'network', message: 'Could not connect to service worker.' });
        setIsStreaming(false);
        return;
      }

      setIsStreaming(true);
      setStreamingMessageId(assistantMsgId);
      setQueuedEtaMs(null);
      setCurrentError(null);

      // Throttling state for UI rendering
      let pendingDelta = '';
      let pendingReasoning = '';
      let throttleTimer: ReturnType<typeof setTimeout> | null = null;

      const flushDeltas = () => {
        if (!pendingDelta && !pendingReasoning) return;
        const currentMsgs = [...sessionRef.current.messages];
        const targetIdx = currentMsgs.findIndex((m) => m.id === assistantMsgId);
        if (targetIdx !== -1) {
          const target = { ...currentMsgs[targetIdx] };
          if (pendingReasoning) {
            target.reasoning = (target.reasoning || '') + pendingReasoning;
            pendingReasoning = '';
          }
          if (pendingDelta) {
            target.content = (target.content || '') + pendingDelta;
            pendingDelta = '';
          }
          currentMsgs[targetIdx] = target;
          const updated = { ...sessionRef.current, messages: currentMsgs };
          setSession(updated);
          debouncedSaveRef.current(updated);
        }
      };

      const portListener = (msg: PortMessageOut) => {
        if (msg.type === 'PING') {
          // Keep-alive heartbeat from service worker
          return;
        }

        if (msg.type === 'QUEUED') {
          setQueuedEtaMs(msg.etaMs);
          return;
        }

        if (msg.type === 'MODEL') {
          setQueuedEtaMs(null);
          // Set answering model on the assistant message
          const currentMsgs = [...sessionRef.current.messages];
          const targetIdx = currentMsgs.findIndex((m) => m.id === assistantMsgId);
          if (targetIdx !== -1) {
            currentMsgs[targetIdx] = { ...currentMsgs[targetIdx], modelId: msg.id };
            setSession({ ...sessionRef.current, messages: currentMsgs });
          }
          return;
        }

        if (msg.type === 'REASONING') {
          pendingReasoning += msg.text;
          if (!throttleTimer) {
            throttleTimer = setTimeout(() => {
              flushDeltas();
              throttleTimer = null;
            }, 40); // 40ms batching for smooth streaming
          }
          return;
        }

        if (msg.type === 'DELTA') {
          pendingDelta += msg.text;
          if (!throttleTimer) {
            throttleTimer = setTimeout(() => {
              flushDeltas();
              throttleTimer = null;
            }, 40); // 40ms batching
          }
          return;
        }

        if (msg.type === 'DONE') {
          if (throttleTimer) {
            clearTimeout(throttleTimer);
            throttleTimer = null;
          }
          flushDeltas();
          setIsStreaming(false);
          setStreamingMessageId(undefined);
          setQueuedEtaMs(null);
          saveChatSession(sessionRef.current);
          port.onMessage.removeListener(portListener);
          return;
        }

        if (msg.type === 'ERROR') {
          if (throttleTimer) {
            clearTimeout(throttleTimer);
            throttleTimer = null;
          }
          flushDeltas();
          setIsStreaming(false);
          setStreamingMessageId(undefined);
          setQueuedEtaMs(null);
          setCurrentError({ code: msg.code, message: msg.message });
          port.onMessage.removeListener(portListener);
          return;
        }
      };

      port.onMessage.addListener(portListener);

      // Send CHAT_START
      port.postMessage({
        type: 'CHAT_START',
        requestId: assistantMsgId,
        messages: historyMessages,
        model: settings.model,
        think: settings.think,
        mode: sessionRef.current.mode,
      });
    },
    [getPort, settings.model, settings.think]
  );

  // Send a new prompt from user
  const sendMessage = useCallback(
    (text: string, fromOcr = false, thumbnail?: string) => {
      if (!text.trim() || isStreaming) return;

      const userMsg: ChatMessage = {
        id: 'u_' + Date.now().toString(36),
        role: 'user',
        content: text.trim(),
        fromOcr,
        thumbnail,
        timestamp: Date.now(),
      };

      const assistantMsg: ChatMessage = {
        id: 'a_' + Date.now().toString(36),
        role: 'assistant',
        content: '',
        modelId: settings.model,
        timestamp: Date.now(),
      };

      const updatedMessages = [...sessionRef.current.messages, userMsg, assistantMsg];
      const updatedSession = { ...sessionRef.current, messages: updatedMessages };
      setSession(updatedSession);
      saveChatSession(updatedSession);

      startStream(updatedMessages.slice(0, -1), assistantMsg.id);
    },
    [isStreaming, settings.model, startStream]
  );

  // Abort ongoing stream
  const stopGenerating = useCallback(() => {
    if (portRef.current) {
      try {
        portRef.current.postMessage({ type: 'ABORT' });
      } catch {
        // Disconnected
      }
    }
    setIsStreaming(false);
    setStreamingMessageId(undefined);
    setQueuedEtaMs(null);
    saveChatSession(sessionRef.current);
  }, []);

  // Regenerate last assistant response
  const regenerate = useCallback(() => {
    if (isStreaming) return;
    const msgs = [...sessionRef.current.messages];
    if (msgs.length === 0) return;

    // Find and remove last assistant message
    const lastIdx = msgs.length - 1;
    if (msgs[lastIdx].role === 'assistant') {
      msgs.pop();
    }

    if (msgs.length === 0) return;

    const assistantMsg: ChatMessage = {
      id: 'a_' + Date.now().toString(36),
      role: 'assistant',
      content: '',
      modelId: settings.model,
      timestamp: Date.now(),
    };

    const newMsgs = [...msgs, assistantMsg];
    const updatedSession = { ...sessionRef.current, messages: newMsgs };
    setSession(updatedSession);
    saveChatSession(updatedSession);

    startStream(msgs, assistantMsg.id);
  }, [isStreaming, settings.model, startStream]);

  // Edit last user message
  const editLastUserMessage = useCallback(
    (setComposerInput: (text: string) => void) => {
      if (isStreaming) return;
      const msgs = [...sessionRef.current.messages];

      // Find last user message
      let lastUserIdx = -1;
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === 'user') {
          lastUserIdx = i;
          break;
        }
      }

      if (lastUserIdx === -1) return;

      const userText = msgs[lastUserIdx].content;
      setComposerInput(userText);

      // Truncate history from that user message onwards
      const truncated = msgs.slice(0, lastUserIdx);
      const updatedSession = { ...sessionRef.current, messages: truncated };
      setSession(updatedSession);
      saveChatSession(updatedSession);
    },
    [isStreaming]
  );

  // New Chat
  const startNewChat = useCallback(async () => {
    if (isStreaming) stopGenerating();

    const newId = generateChatId();
    const newSession: ChatSession = {
      id: newId,
      title: 'New Chat',
      mode: sessionRef.current.mode,
      messages: [],
      updatedAt: Date.now(),
    };

    setSession(newSession);
    setCurrentError(null);
    await setActiveChatId(newId);
    await refreshChatIndex();
  }, [isStreaming, stopGenerating, refreshChatIndex]);

  // Select existing chat
  const selectChat = useCallback(
    async (id: string) => {
      if (isStreaming) stopGenerating();
      const loaded = await loadChatSession(id);
      if (loaded) {
        setSession(loaded);
        setCurrentError(null);
        await setActiveChatId(id);
      }
    },
    [isStreaming, stopGenerating]
  );

  // Delete chat
  const deleteChatSession = useCallback(
    async (id: string) => {
      await storeDeleteChat(id);
      await refreshChatIndex();
      if (sessionRef.current.id === id) {
        await startNewChat();
      }
    },
    [refreshChatIndex, startNewChat]
  );

  // Rename chat
  const renameChatSession = useCallback(
    async (id: string, newTitle: string) => {
      await storeRenameChat(id, newTitle);
      await refreshChatIndex();
      if (sessionRef.current.id === id) {
        setSession((prev) => ({ ...prev, title: newTitle }));
      }
    },
    [refreshChatIndex]
  );

  // Export chat
  const exportChat = useCallback(async (id: string) => {
    const s = await loadChatSession(id);
    if (!s) return;
    const md = exportChatAsMarkdown(s);
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${s.title.replace(/[^a-z0-9_-]/gi, '_')}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  // Update mode
  const setMode = useCallback((mode: AIMode) => {
    setSession((prev) => {
      const updated = { ...prev, mode };
      saveChatSession(updated);
      return updated;
    });
  }, []);

  // Update settings
  const updateSettings = useCallback(
    async (partial: Partial<ExAISettings>) => {
      await new Promise<void>((resolve) => {
        chrome.runtime.sendMessage({ type: 'AI_SETTINGS_SET', settings: partial }, () => resolve());
      });
      await refreshSettings();
      if (partial.showAllModels !== undefined) {
        await refreshModels();
      }
    },
    [refreshSettings, refreshModels]
  );

  // Save key
  const saveKey = useCallback(
    async (key: string) => {
      const res = await new Promise<{ ok: boolean; error?: string }>((resolve) => {
        chrome.runtime.sendMessage({ type: 'AI_KEY_SET', key }, (r) =>
          resolve(r?.data || { ok: false, error: 'Failed' })
        );
      });
      if (res.ok) {
        await refreshSettings();
        await refreshModels(true);
      }
      return res;
    },
    [refreshSettings, refreshModels]
  );

  // Clear key
  const clearKey = useCallback(async () => {
    await new Promise<void>((resolve) => {
      chrome.runtime.sendMessage({ type: 'AI_KEY_CLEAR' }, () => resolve());
    });
    await refreshSettings();
    await refreshModels(true);
  }, [refreshSettings, refreshModels]);

  return {
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
  };
}
