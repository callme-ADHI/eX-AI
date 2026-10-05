// ─── Autofill Audit Log ────────────────────────────────────────────────────────

const KEY = 'exai:autofillAudit';

export interface AuditEntry {
  t: number;
  host: string;
  mode: 'ai' | 'qa' | 'chat';
  fields: number;
  filled: number;
  skipped: number;
  failed: number;
}

export async function addAudit(e: AuditEntry): Promise<void> {
  const r = await chrome.storage.local.get(KEY);
  const current = (r[KEY] as AuditEntry[] | undefined) ?? [];
  const list = [...current, e].slice(-200);
  await chrome.storage.local.set({ [KEY]: list });
}

export async function getAudit(): Promise<AuditEntry[]> {
  return ((await chrome.storage.local.get(KEY))[KEY] ?? []) as AuditEntry[];
}

export async function clearAudit(): Promise<void> {
  await chrome.storage.local.remove(KEY);
}
