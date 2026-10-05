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
import { sanitizeAssistantAttribution } from '../../../shared/aiSanitizer';
import type { Scope, ContextPack, ActivityItem } from '../../pageText/types';
import { collectContext } from '../../pageText/collectContext';
import { isOriginAllowed, allowOnce, allowAlways, isIncognito, looksSensitive } from '../../pageText/consent';
import { refersToPage } from '../../pageText/intent';
import { executeTool } from '../../pageText/tools';

interface UseChatOptions {
  ownHost?: Element | null;
}

export function useChat(options: UseChatOptions = {}) {
  const { ownHost } = options;

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

  // Website Awareness UI states
  const [pageScope, setPageScope] = useState<'off' | Scope>('off');
  const [consentPrompt, setConsentPrompt] = useState<{
    origin: string;
    isSensitive?: boolean;
    customMessage?: string;
    onAllowOnce: () => void;
    onAllowAlways?: () => void;
    onCancel: () => void;
    allowAlwaysLabel?: string;
    cancelLabel?: string;
  } | null>(null);
  const [jsOnlyNotice, setJsOnlyNotice] = useState(false);

  // Sync default scope when settings load once
  const scopeInitRef = useRef(false);
  useEffect(() => {
    if (!scopeInitRef.current && settings.pageContext) {
      setPageScope(settings.pageContext);
      scopeInitRef.current = true;
    }
  }, [settings.pageContext]);

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

  // ── 3. Initial load of active session ────────────────────────────────────
  useEffect(() => {
    (async () => {
      await refreshSettings();
      await refreshModels();
      await refreshChatIndex();

      const activeId = await getActiveChatId();
      if (activeId) {
        const stored = await loadChatSession(activeId);
        if (stored) {
          // If the last message was left streaming when tab unloaded, mark it interrupted
          const msgs = stored.messages.map((m, idx) => {
            if (idx === stored.messages.length - 1 && m.role === 'assistant' && !m.content) {
              return { ...m, interrupted: true, content: '*(Generation interrupted)*' };
            }
            return m;
          });
          setSession({ ...stored, messages: msgs });
          return;
        }
      }
      // Or create initial session
      const newSess: ChatSession = {
        id: generateChatId(),
        title: 'New Chat',
        mode: 'general',
        messages: [],
        updatedAt: Date.now(),
      };
      setSession(newSess);
      await saveChatSession(newSess);
      await setActiveChatId(newSess.id);
    })();
  }, [refreshSettings, refreshModels, refreshChatIndex]);

  // ── 4. Connect long-lived port to service worker ──────────────────────────
  const getPort = useCallback(() => {
    if (portRef.current) return portRef.current;
    try {
      const port = chrome.runtime.connect({ name: 'ex-ai-chat' });
      port.onDisconnect.addListener(() => {
        portRef.current = null;
        if (isStreamingRef.current) {
          setIsStreaming(false);
          setStreamingMessageId(undefined);
          setQueuedEtaMs(null);
          setCurrentError({
            code: 'network',
            message: 'Connection to background worker lost. Please retry.',
          });
        }
      });
      portRef.current = port;
      return port;
    } catch (err: any) {
      console.error('[eX-AI] Failed to connect port:', err);
      return null;
    }
  }, []);

  // Cleanup port on unmount
  useEffect(() => {
    return () => {
      if (portRef.current) {
        try {
          portRef.current.disconnect();
        } catch {
          // ignore
        }
        portRef.current = null;
      }
    };
  }, []);

  // ── 5. Unload handler (mark in-flight message interrupted) ─────────────────
  useEffect(() => {
    const handleUnload = () => {
      if (isStreamingRef.current) {
        const msgs = [...sessionRef.current.messages];
        const last = msgs[msgs.length - 1];
        if (last && last.role === 'assistant') {
          msgs[msgs.length - 1] = {
            ...last,
            interrupted: true,
            content: last.content ? last.content + '\n\n*(Generation interrupted)*' : '*(Generation interrupted)*',
          };
          const updated = { ...sessionRef.current, messages: msgs };
          saveChatSession(updated);
        }
        if (portRef.current) {
          try {
            portRef.current.postMessage({ type: 'ABORT' });
          } catch {
            // ignore
          }
        }
      }
    };

    window.addEventListener('beforeunload', handleUnload);
    return () => window.removeEventListener('beforeunload', handleUnload);
  }, []);

  // ── 6. Send Message / Stream ──────────────────────────────────────────────
  const startStream = useCallback(
    (historyMessages: ChatMessage[], assistantMsgId: string, contextPack?: ContextPack | null) => {
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
            target.content = sanitizeAssistantAttribution((target.content || '') + pendingDelta);
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

        if (msg.type === 'TOOL_CALL') {
          flushDeltas();

          const activityId = msg.id;
          const currentMsgs = [...sessionRef.current.messages];
          const targetIdx = currentMsgs.findIndex((m) => m.id === assistantMsgId);

          const runningActivity: ActivityItem = {
            id: activityId,
            label: `Calling ${msg.name}...`,
            state: 'running',
          };

          if (targetIdx !== -1) {
            const prevActivity = currentMsgs[targetIdx].activity || [];
            currentMsgs[targetIdx] = {
              ...currentMsgs[targetIdx],
              activity: [...prevActivity, runningActivity],
            };
            setSession({ ...sessionRef.current, messages: currentMsgs });
          }

          executeTool(msg.name, msg.args, ownHost ?? null, async (confirmMsg) => {
            return window.confirm(confirmMsg);
          })
            .then((result) => {
              const msgsAfter = [...sessionRef.current.messages];
              const idxAfter = msgsAfter.findIndex((m) => m.id === assistantMsgId);
              if (idxAfter !== -1) {
                const actList = (msgsAfter[idxAfter].activity || []).map((a) =>
                  a.id === activityId
                    ? {
                        ...a,
                        label: result.activityLabel,
                        state: result.ok ? ('done' as const) : ('blocked' as const),
                        url: result.url,
                      }
                    : a
                );
                msgsAfter[idxAfter] = { ...msgsAfter[idxAfter], activity: actList };
                setSession({ ...sessionRef.current, messages: msgsAfter });
              }

              port.postMessage({
                type: 'TOOL_RESULT',
                id: msg.id,
                ok: result.ok,
                content: result.content,
              });
            })
            .catch((err) => {
              port.postMessage({
                type: 'TOOL_RESULT',
                id: msg.id,
                ok: false,
                content: `<tool_result name="${msg.name}" untrusted="true">Execution error: ${err.message || 'unknown'}</tool_result>`,
              });
            });

          return;
        }

        if (msg.type === 'DONE') {
          if (throttleTimer) {
            clearTimeout(throttleTimer);
            throttleTimer = null;
          }
          flushDeltas();
          const currentMsgs = [...sessionRef.current.messages];
          const targetIdx = currentMsgs.findIndex((m) => m.id === assistantMsgId);
          if (targetIdx !== -1) {
            currentMsgs[targetIdx] = {
              ...currentMsgs[targetIdx],
              content: sanitizeAssistantAttribution(currentMsgs[targetIdx].content),
            };
            const updated = { ...sessionRef.current, messages: currentMsgs };
            setSession(updated);
            saveChatSession(updated);
          } else {
            saveChatSession(sessionRef.current);
          }
          setIsStreaming(false);
          setStreamingMessageId(undefined);
          setQueuedEtaMs(null);
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
        context: contextPack ? { block: contextPack.block, meta: contextPack.meta } : undefined,
        tools: settings.browseMode === 'tools',
      });
    },
    [getPort, settings.model, settings.think, settings.browseMode]
  );

  // Directly dispatch message to session and streaming
  const doSend = useCallback(
    (trimmedText: string, fromOcr: boolean, thumbnail: string | undefined, pack: ContextPack | null) => {
      const userMsg: ChatMessage = {
        id: 'u_' + Date.now().toString(36),
        role: 'user',
        content: trimmedText,
        fromOcr,
        thumbnail,
        pageMeta: pack ? pack.meta : undefined,
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

      startStream(updatedMessages.slice(0, -1), assistantMsg.id, pack);
    },
    [settings.model, startStream]
  );

  const executeWithContext = useCallback(
    async (trimmedText: string, fromOcr: boolean, thumbnail: string | undefined, scope: 'off' | Scope) => {
      let pack: ContextPack | null = null;
      if (scope !== 'off') {
        try {
          pack = await collectContext(
            {
              pageContext: scope,
              pageContextMaxChars: settings.pageContextMaxChars || 60_000,
              pageContextKeepQuery: settings.pageContextKeepQuery ?? false,
            },
            trimmedText,
            ownHost ?? null
          );
          if (pack && !pack.meta.rendered) {
            setJsOnlyNotice(true);
          } else {
            setJsOnlyNotice(false);
          }
        } catch (e) {
          console.warn('[eX-AI] Failed to collect context:', e);
        }
      }

      doSend(trimmedText, fromOcr, thumbnail, pack);
    },
    [settings.pageContextMaxChars, settings.pageContextKeepQuery, ownHost, doSend]
  );

  // Send a new prompt from user with Website Awareness & consent gates
  const sendMessage = useCallback(
    async (text: string, fromOcr = false, thumbnail?: string, overrideScope?: 'off' | Scope) => {
      if (!text.trim() || isStreaming) return;

      const trimmedText = text.trim();
      const currentScope = overrideScope !== undefined ? overrideScope : pageScope;

      // Intent check when scope is off
      if (currentScope === 'off') {
        if (refersToPage(trimmedText)) {
          setConsentPrompt({
            origin: location.origin,
            customMessage: "Include this page's text to help answer your question?",
            onAllowOnce: () => {
              setConsentPrompt(null);
              setPageScope('main');
              executeWithContext(trimmedText, fromOcr, thumbnail, 'main');
            },
            onAllowAlways: async () => {
              setConsentPrompt(null);
              setPageScope('main');
              await allowAlways(location.origin);
              executeWithContext(trimmedText, fromOcr, thumbnail, 'main');
            },
            onCancel: () => {
              setConsentPrompt(null);
              doSend(trimmedText, fromOcr, thumbnail, null);
            },
            allowAlwaysLabel: 'Always on this site',
            cancelLabel: 'No, send anyway',
          });
          return;
        }
        doSend(trimmedText, fromOcr, thumbnail, null);
        return;
      }

      // Scope is active: check incognito
      if (isIncognito() && !settings.pageContextAllowIncognito) {
        setCurrentError({
          code: 'auth',
          message: 'Page context is disabled in Incognito mode by default (enable in Settings).',
        });
        return;
      }

      // Check consent
      const origin = location.origin;
      const sensitive = looksSensitive(location.href);
      const allowed = await isOriginAllowed(origin);

      if (sensitive || !allowed) {
        setConsentPrompt({
          origin,
          isSensitive: sensitive,
          onAllowOnce: () => {
            allowOnce(origin);
            setConsentPrompt(null);
            executeWithContext(trimmedText, fromOcr, thumbnail, currentScope);
          },
          onAllowAlways: async () => {
            await allowAlways(origin);
            setConsentPrompt(null);
            executeWithContext(trimmedText, fromOcr, thumbnail, currentScope);
          },
          onCancel: () => {
            setConsentPrompt(null);
          },
        });
        return;
      }

      await executeWithContext(trimmedText, fromOcr, thumbnail, currentScope);
    },
    [isStreaming, pageScope, settings, executeWithContext, doSend]
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
    const newSess: ChatSession = {
      id: generateChatId(),
      title: 'New Chat',
      mode: sessionRef.current.mode,
      messages: [],
      updatedAt: Date.now(),
    };
    setSession(newSess);
    await saveChatSession(newSess);
    await setActiveChatId(newSess.id);
    await refreshChatIndex();
  }, [isStreaming, stopGenerating, refreshChatIndex]);

  // Switch Chat
  const selectChat = useCallback(
    async (id: string) => {
      if (id === sessionRef.current.id) return;
      if (isStreaming) stopGenerating();

      const stored = await loadChatSession(id);
      if (stored) {
        setSession(stored);
        await setActiveChatId(id);
      }
    },
    [isStreaming, stopGenerating]
  );

  // Delete Chat
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

  // Rename Chat
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

  // Export Chat
  const exportChat = useCallback(() => {
    exportChatAsMarkdown(sessionRef.current);
  }, []);

  // Set Assistant Mode
  const setMode = useCallback(
    (mode: AIMode) => {
      const updated = { ...sessionRef.current, mode };
      setSession(updated);
      saveChatSession(updated);
      updateSettings({ mode });
    },
    []
  );

  // Update Settings
  const updateSettings = useCallback(
    async (partial: Partial<ExAISettings>) => {
      const updated = { ...settings, ...partial };
      setSettings(updated);
      await new Promise<void>((resolve) => {
        chrome.runtime.sendMessage({ type: 'AI_SETTINGS_SET', settings: partial }, () => resolve());
      });
    },
    [settings]
  );

  // Save API Key
  const saveKey = useCallback(
    async (key: string): Promise<{ ok: boolean; error?: string }> => {
      const res = await new Promise<any>((resolve) => {
        chrome.runtime.sendMessage({ type: 'AI_KEY_SET', key }, (r) => resolve(r?.data));
      });
      if (res?.ok) {
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
    // Website Awareness
    pageScope,
    setPageScope,
    consentPrompt,
    setConsentPrompt,
    jsOnlyNotice,
    setJsOnlyNotice,
  };
}
