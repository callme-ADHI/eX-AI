import { STORAGE_KEYS } from '../../shared/constants';

export interface PassageHit {
  passage: {
    title: string;
    url: string;
    heading: string;
    text: string;
  };
  score: number;
}

export async function searchIndex(origin: string, query: string, k: number): Promise<PassageHit[]> {
  try {
    const key = STORAGE_KEYS.siteIndexPrefix + origin;
    const r = await chrome.storage.session.get(key);
    const data = r[key] as { pages?: Array<{ url: string; title: string; text: string }> } | undefined;
    if (!data?.pages || !data.pages.length) return [];
    
    // Simple substring / word match fallback until BM25 in Phase D
    const qWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    if (!qWords.length) return [];

    const hits: PassageHit[] = [];
    for (const page of data.pages) {
      const lower = page.text.toLowerCase();
      let matches = 0;
      for (const w of qWords) {
        if (lower.includes(w)) matches++;
      }
      if (matches > 0) {
        hits.push({
          passage: {
            title: page.title || '',
            url: page.url,
            heading: '',
            text: page.text.slice(0, 800),
          },
          score: matches,
        });
      }
    }
    return hits.sort((a, b) => b.score - a.score).slice(0, k);
  } catch {
    return [];
  }
}
