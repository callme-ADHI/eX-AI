import { LIMITS } from '../../shared/constants';

export interface StoredPage { url: string; title: string; text: string }
export interface Passage { id: number; url: string; title: string; heading: string; text: string }

const STOP = new Set(('a an and are as at be but by for from has have he her his i if in into is it its of on or our she so that the their ' +
  'them then there these they this to was we were what when where which who will with you your not no do does did can could should would').split(' '));

export const tokenize = (s: string): string[] =>
  s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(t => t.length > 1 && !STOP.has(t));

export function chunkPage(page: StoredPage, size = LIMITS.passageSize, overlap = LIMITS.passageOverlap): Passage[] {
  const out: Passage[] = [];
  let heading = '';
  let buf = '';
  const flush = () => { const t = buf.trim(); if (t) out.push({ id: 0, url: page.url, title: page.title, heading, text: t }); buf = ''; };
  const add = (piece: string) => {
    if (buf.length + piece.length + 1 > size && buf.trim()) { const tail = buf.slice(-overlap); flush(); buf = tail; }
    buf += piece + '\n';
  };
  for (const rawLine of page.text.split('\n')) {
    const m = /^(#{1,6})\s+(.*)$/.exec(rawLine);
    if (m) { flush(); heading = m[2].trim(); buf = rawLine + '\n'; continue; }
    let line = rawLine;
    while (line.length > size) {
      const sp = line.lastIndexOf(' ', size);
      const cut = sp > size * 0.5 ? sp : size;
      add(line.slice(0, cut)); line = line.slice(cut).trimStart();
    }
    add(line);
  }
  flush();
  return out;
}

export class Bm25Index {
  private docs: { p: Passage; tf: Map<string, number>; len: number }[] = [];
  private df = new Map<string, number>();
  private total = 0;
  constructor(private k1 = 1.2, private b = 0.75) {}

  add(p: Passage): void {
    const toks = [...tokenize(p.title), ...tokenize(p.title), ...tokenize(p.heading), ...tokenize(p.heading), ...tokenize(p.text)]; // title/heading x2
    const tf = new Map<string, number>();
    for (const t of toks) tf.set(t, (tf.get(t) ?? 0) + 1);
    for (const t of tf.keys()) this.df.set(t, (this.df.get(t) ?? 0) + 1);
    p.id = this.docs.length;
    this.docs.push({ p, tf, len: toks.length });
    this.total += toks.length;
  }

  get size(): number { return this.docs.length; }

  search(query: string, k = 5): { passage: Passage; score: number }[] {
    const q = Array.from(new Set(tokenize(query)));
    if (!q.length || !this.docs.length) return [];
    const N = this.docs.length;
    const avg = this.total / N || 1;
    const scored: { passage: Passage; score: number }[] = [];
    for (const d of this.docs) {
      let s = 0;
      for (const t of q) {
        const f = d.tf.get(t);
        if (!f) continue;
        const n = this.df.get(t) ?? 0;
        const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
        s += idf * ((f * (this.k1 + 1)) / (f + this.k1 * (1 - this.b + this.b * (d.len / avg))));
      }
      if (s > 0) scored.push({ passage: d.p, score: s });
    }
    return scored.sort((a, b) => b.score - a.score).slice(0, k);
  }
}
