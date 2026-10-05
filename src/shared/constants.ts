export const LIMITS = {
  // page text
  pageMaxCharsDefault: 60_000,
  pageMaxCharsHard: 200_000,
  walkMaxChars: 1_000_000,       // stop walking the DOM after this many raw chars
  elementWalkCap: 60_000,        // stop after visiting this many elements
  // links / structure
  linksMax: 150,
  linksBlockMaxChars: 12_000,
  linkTextMax: 80,
  headingsMax: 60,
  thirdPartyHostsMax: 30,
  // fetching
  fetchTimeoutMs: 10_000,
  fetchMaxBytes: 2_000_000,
  minGapMs: 300,                 // min spacing between requests to the site
  // tools
  toolResultMaxChars: 20_000,
  toolBudgetPerTurnChars: 80_000,
  maxToolCallsPerTurn: 6,
  maxToolRounds: 3,
  toolCallTimeoutMs: 60_000,
  // crawl / index
  crawlMaxPagesDefault: 25,
  crawlMaxPagesHard: 100,
  crawlDepthDefault: 2,
  crawlDelayMsDefault: 400,
  crawlConcurrency: 2,
  crawlLinksPerPage: 30,
  storedPageMaxChars: 20_000,
  sitemapMaxUrls: 300,
  sitemapMaxChildren: 3,
  passageSize: 800,
  passageOverlap: 100,
  autoPassagesK: 5,
} as const;

export const STORAGE_KEYS = {
  settings: 'exai:settings',
  originsAllowed: 'exai:pageContextOrigins',
  toolSupport: 'exai:toolSupport',          // { [modelId]: boolean }
  siteIndexPrefix: 'exai:siteindex:',       // chrome.storage.session, per origin
} as const;
