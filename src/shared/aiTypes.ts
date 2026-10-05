// ─── eX-AI Shared AI Types ────────────────────────────────────────────────────

import type { Scope, ContextMeta, ActivityItem } from '../content/pageText/types';

/** Modes for the AI assistant */
export type AIMode = 'general' | 'aptitude' | 'coding' | 'reasoning';

/** Edge trigger display mode */
export type EdgeTriggerMode = 'strip' | 'handle' | 'off';

/** OCR recognition mode */
export type OCRMode = 'text' | 'code';

/** Browse mode: context only vs tool-augmented */
export type BrowseMode = 'context' | 'tools';

/** eX-AI settings shape — all fields have defaults */
export interface ExAISettings {
  model: string;
  fallbackChain: string[];
  think: boolean;
  mode: AIMode;
  edgeTrigger: EdgeTriggerMode;
  autoCloseOnLeave: boolean;
  toggleShortcutInPage: boolean;
  ocrDefaultMode: OCRMode;
  securityEngineEnabled: boolean;
  showAllModels: boolean;
  // Website Awareness settings
  pageContext: 'off' | Scope;
  pageContextMaxChars: number;
  pageContextKeepQuery: boolean;
  pageContextAllowIncognito: boolean;
  browseMode: BrowseMode;
  crawlMaxPages: number;
  crawlDepth: number;
  crawlDelayMs: number;
  // Autofill settings
  autofillEnabled: boolean;
  autofillAllow: string[];
  autofillDelayMs: number;
  autofillOverwrite: boolean;
  autofillThink: boolean;
}

export const DEFAULT_EXAI_SETTINGS: ExAISettings = {
  model: 'nvidia/nemotron-3-super-120b-a12b',
  fallbackChain: ['openai/gpt-oss-20b', 'nvidia/nemotron-nano-3-30b-a3b'],
  think: true,
  mode: 'general',
  edgeTrigger: 'strip',
  autoCloseOnLeave: false,
  toggleShortcutInPage: true,
  ocrDefaultMode: 'text',
  securityEngineEnabled: false,
  showAllModels: false,
  pageContext: 'off',
  pageContextMaxChars: 60_000,
  pageContextKeepQuery: false,
  pageContextAllowIncognito: false,
  browseMode: 'context',
  crawlMaxPages: 25,
  crawlDepth: 2,
  crawlDelayMs: 400,
  autofillEnabled: false,
  autofillAllow: [],
  autofillDelayMs: 80,
  autofillOverwrite: false,
  autofillThink: true,
};

/** A chat message in the conversation */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  reasoning?: string;       // collapsed <think> content
  fromOcr?: boolean;        // was this from a snip?
  modelId?: string;         // which model answered
  interrupted?: boolean;    // stream ended by tab unload
  thumbnail?: string;       // OCR crop thumbnail data URL
  pageMeta?: ContextMeta;   // only metadata, never raw page block
  activity?: ActivityItem[];// tool activity items during answer generation
  timestamp: number;
}

/** A stored chat session */
export interface ChatSession {
  id: string;
  title: string;
  mode: AIMode;
  messages: ChatMessage[];
  updatedAt: number;
}

/** Index entry for history list */
export interface ChatIndex {
  id: string;
  title: string;
  mode: AIMode;
  updatedAt: number;
}

/** Model entry from NVIDIA /v1/models */
export interface ModelEntry {
  id: string;
  label: string;
}

// ─── Port message types (content ⇄ service worker via port 'ex-ai-chat') ────

export type PortMessageIn =
  | {
      type: 'CHAT_START';
      requestId: string;
      messages: ChatMessage[];
      model?: string;
      think: boolean;
      mode: AIMode;
      context?: { block: string; meta: ContextMeta };
      tools?: boolean;
    }
  | { type: 'ABORT' }
  | { type: 'TOOL_RESULT'; id: string; ok: boolean; content: string };

export type PortMessageOut =
  | { type: 'QUEUED'; etaMs: number }
  | { type: 'MODEL'; id: string }
  | { type: 'REASONING'; text: string }
  | { type: 'DELTA'; text: string }
  | { type: 'DONE'; finishReason: string; usage?: { prompt_tokens: number; completion_tokens: number } }
  | { type: 'ERROR'; code: AIErrorCode; message: string }
  | { type: 'PING' }
  | { type: 'TOOL_CALL'; id: string; name: string; args: Record<string, unknown> };

export type AIErrorCode = 'auth' | 'forbidden-model' | 'rate-limit' | 'network' | 'timeout' | 'unknown';

// ─── Runtime message types (request/response) ───────────────────────────────

export type AIRuntimeMessage =
  | { type: 'AI_SETTINGS_GET' }
  | { type: 'AI_SETTINGS_SET'; settings: Partial<ExAISettings> }
  | { type: 'AI_KEY_SET'; key: string }
  | { type: 'AI_KEY_CLEAR' }
  | { type: 'AI_MODELS_LIST'; refresh?: boolean }
  | { type: 'SNIP_CAPTURE' }
  | { type: 'OCR_RUN'; dataUrl: string; mode: OCRMode; psmHint?: number }
  | { type: 'OCR_WARM' };

export interface AISettingsGetResponse {
  settings: ExAISettings;
  hasKey: boolean;
  keyHint: string;
}

export interface AIModelsListResponse {
  models: ModelEntry[];
  defaultId: string;
}

export interface AIKeySetResponse {
  ok: boolean;
  error?: string;
}
