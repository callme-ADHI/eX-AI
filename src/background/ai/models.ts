// ─── Model List Manager ───────────────────────────────────────────────────────
// Fetches and caches /v1/models from NVIDIA NIM.
// Cache TTL: 24 hours.

import type { ModelEntry, AIModelsListResponse } from '../../shared/aiTypes';
import { loadSettings, getApiKey } from './settings';

const MODELS_CACHE_KEY = 'exai:models';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface ModelsCache {
  models: ModelEntry[];
  fetchedAt: number;
}

/**
 * Patterns to filter out non-chat models by id.
 * We keep everything that doesn't match these patterns.
 */
const NON_CHAT_PATTERN = /embed|rerank|guard|safety|reward|parse|clip|translate|retriev|vila|neva|deplot|kosmos|fuyu|cosmos|calibration|topic-control/i;

export function isChatModel(id: string, showAll: boolean): boolean {
  if (showAll) return true;
  return !NON_CHAT_PATTERN.test(id);
}

function toLabel(id: string): string {
  // Convert "nvidia/nemotron-3-super-120b-a12b" → "Nemotron 3 Super 120B"
  const parts = id.split('/');
  const name = parts[parts.length - 1];
  return name
    .split('-')
    .map(p => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ');
}

async function fetchModelsFromAPI(apiKey: string): Promise<ModelEntry[]> {
  const res = await fetch('https://integrate.api.nvidia.com/v1/models', {
    headers: { 'Authorization': `Bearer ${apiKey}` },
  });

  if (!res.ok) {
    throw new Error(`Models fetch failed: ${res.status}`);
  }

  const json = await res.json();
  const rawModels: { id: string }[] = json.data ?? [];
  return rawModels.map(m => ({ id: m.id, label: toLabel(m.id) }));
}

export async function getModels(refresh = false): Promise<{ models: ModelEntry[]; fetchedAt: number }> {
  if (!refresh) {
    const cached = await new Promise<ModelsCache | null>((resolve) => {
      chrome.storage.local.get(MODELS_CACHE_KEY, (res) => {
        resolve((res[MODELS_CACHE_KEY] as ModelsCache) ?? null);
      });
    });

    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return cached;
    }
  }

  const apiKey = await getApiKey();
  if (!apiKey) {
    return { models: [], fetchedAt: 0 };
  }

  try {
    const models = await fetchModelsFromAPI(apiKey);
    const entry: ModelsCache = { models, fetchedAt: Date.now() };
    await new Promise<void>((resolve) => {
      chrome.storage.local.set({ [MODELS_CACHE_KEY]: entry }, resolve);
    });
    return entry;
  } catch (e) {
    console.error('[eX-AI] Models fetch error:', e);
    // Return empty on failure
    return { models: [], fetchedAt: 0 };
  }
}

/** Handler: AI_MODELS_LIST */
export async function handleModelsList(refresh = false): Promise<AIModelsListResponse> {
  const settings = await loadSettings();
  const { models: allModels } = await getModels(refresh);

  const filtered = allModels.filter(m => isChatModel(m.id, settings.showAllModels));

  // Determine default model
  let defaultId = settings.model;

  if (filtered.length > 0 && !filtered.find(m => m.id === defaultId)) {
    // Configured default not in list — try fallback chain
    const fallback = settings.fallbackChain.find(id => filtered.find(m => m.id === id));
    if (fallback) {
      defaultId = fallback;
    } else {
      defaultId = filtered[0].id;
    }
  }

  return {
    models: filtered.length > 0 ? filtered : [{ id: settings.model, label: toLabel(settings.model) }],
    defaultId,
  };
}
