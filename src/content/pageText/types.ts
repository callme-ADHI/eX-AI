export type Scope = 'selection' | 'main' | 'page';

export interface ExtractResult {
  title: string;
  url: string;              // display URL (query stripped unless keepQuery)
  text: string;
  chars: number;
  truncated: boolean;
  omittedChars: number;
  skippedFrames: number;    // cross-origin iframes we could not read
  source: Scope;            // what was actually used
  rendered: boolean;        // false => looks like a JS-only app shell with no readable text
}

export type Region = 'main' | 'nav' | 'header' | 'aside' | 'footer' | 'other';

export interface LinkInfo {
  id: string;               // registry id, e.g. "kq12"
  text: string;
  url: string;              // full cleaned URL (tracking params removed)
  scope: 'internal' | 'external';
  host: string;
  region: Region;
}

export interface Contacts { mailto: string[]; tel: string[] }

export interface ContextMeta {
  title: string; url: string; chars: number; estTokens: number;
  truncated: boolean; links: number; skippedFrames: number; rendered: boolean;
  passages: number;
}
export interface ContextPack { block: string; meta: ContextMeta }

export interface ActivityItem {
  id: string;
  label: string;            // e.g. "Fetched /pricing"
  state: 'running' | 'done' | 'blocked' | 'error';
  url?: string;
}
