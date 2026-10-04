// ─── AI Settings Manager ──────────────────────────────────────────────────────
// Handles exai:settings and exai:apiKey (key stays in service worker only)

import type {
  ExAISettings,
  AISettingsGetResponse,
  AIKeySetResponse,
} from '../../shared/aiTypes';
import { DEFAULT_EXAI_SETTINGS } from '../../shared/aiTypes';

const SETTINGS_KEY = 'exai:settings';
const API_KEY_KEY  = 'exai:apiKey';

/** Merge stored settings with defaults, tolerating missing/old fields */
export async function loadSettings(): Promise<ExAISettings> {
  return new Promise((resolve) => {
    chrome.storage.local.get(SETTINGS_KEY, (res) => {
      const stored = (res[SETTINGS_KEY] ?? {}) as Partial<ExAISettings>;
      resolve({ ...DEFAULT_EXAI_SETTINGS, ...stored });
    });
  });
}

export async function saveSettings(partial: Partial<ExAISettings>): Promise<void> {
  const current = await loadSettings();
  const merged = { ...current, ...partial };
  return new Promise((resolve) => {
    chrome.storage.local.set({ [SETTINGS_KEY]: merged }, resolve);
  });
}

export async function getApiKey(): Promise<string | null> {
  return new Promise((resolve) => {
    chrome.storage.local.get(API_KEY_KEY, (res) => {
      resolve((res[API_KEY_KEY] as string) || null);
    });
  });
}

export async function setApiKey(key: string): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [API_KEY_KEY]: key }, resolve);
  });
}

export async function clearApiKey(): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.remove(API_KEY_KEY, resolve);
  });
}

/** Return key hint: "nvapi-…abcd" (never the full key) */
function buildKeyHint(key: string): string {
  if (key.length <= 8) return '••••••••';
  return key.slice(0, 6) + '…' + key.slice(-4);
}

/** Handler: AI_SETTINGS_GET */
export async function handleSettingsGet(): Promise<AISettingsGetResponse> {
  const [settings, key] = await Promise.all([loadSettings(), getApiKey()]);
  return {
    settings,
    hasKey: !!key,
    keyHint: key ? buildKeyHint(key) : '',
  };
}

/** Handler: AI_SETTINGS_SET */
export async function handleSettingsSet(partial: Partial<ExAISettings>): Promise<void> {
  await saveSettings(partial);
}

/** Handler: AI_KEY_SET — validates prefix, stores, verifies via models endpoint */
export async function handleKeySet(key: string): Promise<AIKeySetResponse> {
  if (!key.startsWith('nvapi-')) {
    return { ok: false, error: 'Key must start with "nvapi-"' };
  }

  // Try to verify by calling /v1/models
  try {
    const res = await fetch('https://integrate.api.nvidia.com/v1/models', {
      headers: { 'Authorization': `Bearer ${key}` },
    });
    if (res.status === 401) {
      return { ok: false, error: 'Invalid API key (401 Unauthorized)' };
    }
    if (!res.ok && res.status !== 200) {
      // Store anyway — might just be a transient error
      await setApiKey(key);
      return { ok: true };
    }
    await setApiKey(key);
    return { ok: true };
  } catch (e) {
    // Network error — store anyway, will fail on first chat attempt
    await setApiKey(key);
    return { ok: true };
  }
}

/** Handler: AI_KEY_CLEAR */
export async function handleKeyClear(): Promise<void> {
  await clearApiKey();
}
