import { STORAGE_KEYS } from '../../shared/constants';

const sessionAllowed = new Set<string>(); // "Allow once": memory only, per page load

const SENSITIVE_ORIGIN = /(mail\.|outlook\.|bank|login|signin|sign-in|account|checkout|payment|pay\.|paypal|password|\.gov(\.|$|\/))/i;

export const isIncognito = (): boolean => !!(chrome.extension as any)?.inIncognitoContext;
export const looksSensitive = (url: string): boolean => SENSITIVE_ORIGIN.test(url);

export async function isOriginAllowed(origin: string): Promise<boolean> {
  if (sessionAllowed.has(origin)) return true;
  const r = await chrome.storage.local.get(STORAGE_KEYS.originsAllowed);
  return ((r[STORAGE_KEYS.originsAllowed] as string[] | undefined) ?? []).includes(origin);
}

export function allowOnce(origin: string) {
  sessionAllowed.add(origin);
}

export async function allowAlways(origin: string) {
  const r = await chrome.storage.local.get(STORAGE_KEYS.originsAllowed);
  const list = new Set((r[STORAGE_KEYS.originsAllowed] as string[] | undefined) ?? []);
  list.add(origin);
  await chrome.storage.local.set({ [STORAGE_KEYS.originsAllowed]: Array.from(list) });
}

export async function forgetAllOrigins() {
  sessionAllowed.clear();
  await chrome.storage.local.remove(STORAGE_KEYS.originsAllowed);
}

export async function getAllowedOrigins(): Promise<string[]> {
  const r = await chrome.storage.local.get(STORAGE_KEYS.originsAllowed);
  return (r[STORAGE_KEYS.originsAllowed] as string[] | undefined) ?? [];
}
