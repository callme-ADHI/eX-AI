// ─── Chat Storage Manager ─────────────────────────────────────────────────────
// Storage schema:
//   exai:activeChat -> string (active chat id)
//   exai:chats -> ChatIndex[] (sorted by updatedAt desc, max 50)
//   exai:chat:<id> -> ChatSession

import type { ChatMessage, ChatSession, ChatIndex, AIMode } from '../../../shared/aiTypes';

const ACTIVE_CHAT_KEY = 'exai:activeChat';
const CHATS_INDEX_KEY = 'exai:chats';
const CHAT_PREFIX = 'exai:chat:';
const MAX_CHATS = 50;

/** Generate unique ID */
export function generateChatId(): string {
  return 'c_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
}

/** Get list of chat index entries */
export async function getChatIndex(): Promise<ChatIndex[]> {
  return new Promise((resolve) => {
    chrome.storage.local.get(CHATS_INDEX_KEY, (res) => {
      resolve((res[CHATS_INDEX_KEY] as ChatIndex[]) || []);
    });
  });
}

/** Get active chat id */
export async function getActiveChatId(): Promise<string | null> {
  return new Promise((resolve) => {
    chrome.storage.local.get(ACTIVE_CHAT_KEY, (res) => {
      resolve((res[ACTIVE_CHAT_KEY] as string) || null);
    });
  });
}

/** Set active chat id */
export async function setActiveChatId(id: string): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [ACTIVE_CHAT_KEY]: id }, resolve);
  });
}

/** Load a full chat session */
export async function loadChatSession(id: string): Promise<ChatSession | null> {
  return new Promise((resolve) => {
    const key = CHAT_PREFIX + id;
    chrome.storage.local.get(key, (res) => {
      resolve((res[key] as ChatSession) || null);
    });
  });
}

/** Save a chat session and update the index */
export async function saveChatSession(session: ChatSession): Promise<void> {
  try {
    const sessionKey = CHAT_PREFIX + session.id;
    const index = await getChatIndex();

    // Generate title from first user message if not custom
    let title = session.title;
    if (!title || title === 'New Chat') {
      const firstUserMsg = session.messages.find(m => m.role === 'user');
      if (firstUserMsg && firstUserMsg.content) {
        title = firstUserMsg.content.trim().slice(0, 40);
        if (firstUserMsg.content.length > 40) title += '…';
      } else {
        title = 'New Chat';
      }
    }

    const updatedSession: ChatSession = {
      ...session,
      title,
      updatedAt: Date.now(),
    };

    // Update index entry
    const existingIdx = index.findIndex(i => i.id === session.id);
    const newEntry: ChatIndex = {
      id: session.id,
      title,
      mode: session.mode,
      updatedAt: updatedSession.updatedAt,
    };

    let updatedIndex: ChatIndex[];
    if (existingIdx !== -1) {
      updatedIndex = [...index];
      updatedIndex[existingIdx] = newEntry;
    } else {
      updatedIndex = [newEntry, ...index];
    }

    // Sort by updatedAt desc
    updatedIndex.sort((a, b) => b.updatedAt - a.updatedAt);

    // Enforce max 50 chats, delete oldest from storage
    const keysToRemove: string[] = [];
    if (updatedIndex.length > MAX_CHATS) {
      const toRemove = updatedIndex.slice(MAX_CHATS);
      for (const item of toRemove) {
        keysToRemove.push(CHAT_PREFIX + item.id);
      }
      updatedIndex = updatedIndex.slice(0, MAX_CHATS);
    }

    await new Promise<void>((resolve) => {
      chrome.storage.local.set(
        {
          [sessionKey]: updatedSession,
          [CHATS_INDEX_KEY]: updatedIndex,
          [ACTIVE_CHAT_KEY]: session.id,
        },
        () => {
          if (keysToRemove.length > 0) {
            chrome.storage.local.remove(keysToRemove, () => resolve());
          } else {
            resolve();
          }
        }
      );
    });
  } catch (err) {
    console.error('[eX-AI] Failed to save chat session:', err);
  }
}

/** Rename an existing chat */
export async function renameChat(id: string, newTitle: string): Promise<void> {
  const session = await loadChatSession(id);
  if (!session) return;
  session.title = newTitle.trim() || 'Untitled Chat';
  await saveChatSession(session);
}

/** Delete a chat */
export async function deleteChat(id: string): Promise<void> {
  const index = await getChatIndex();
  const filtered = index.filter(item => item.id !== id);
  const activeId = await getActiveChatId();

  await new Promise<void>((resolve) => {
    chrome.storage.local.remove(CHAT_PREFIX + id, () => {
      chrome.storage.local.set(
        {
          [CHATS_INDEX_KEY]: filtered,
          ...(activeId === id ? { [ACTIVE_CHAT_KEY]: filtered[0]?.id || '' } : {}),
        },
        () => resolve()
      );
    });
  });
}

/** Export a chat session as formatted Markdown text */
export function exportChatAsMarkdown(session: ChatSession): string {
  const lines: string[] = [
    `# ${session.title}`,
    `*Mode: ${session.mode} | Date: ${new Date(session.updatedAt).toLocaleString()}*`,
    '',
    '---',
    '',
  ];

  for (const msg of session.messages) {
    if (msg.role === 'user') {
      lines.push('### 👤 User');
      if (msg.fromOcr) {
        lines.push('*(Captured via OCR)*');
      }
      lines.push('', msg.content, '', '---', '');
    } else if (msg.role === 'assistant') {
      const modelNote = msg.modelId ? ` (${msg.modelId})` : '';
      lines.push(`### 🤖 Assistant${modelNote}`);
      if (msg.reasoning) {
        lines.push('<details><summary>Thinking Process</summary>', '', msg.reasoning, '', '</details>', '');
      }
      lines.push('', msg.content, '', '---', '');
    }
  }

  return lines.join('\n');
}

/** Debounce helper for saving session */
export function createDebouncedSave(delayMs = 400) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return (session: ChatSession) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      saveChatSession(session);
      timer = null;
    }, delayMs);
  };
}
