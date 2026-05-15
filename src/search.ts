import type { Memory, SearchResult } from './types.js';

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1);
}

function buildDocText(m: Memory): string {
  return `${m.key} ${m.content} ${m.tags.join(' ')}`;
}

export function search(
  memories: Memory[],
  query: string,
  opts: { limit?: number; tags?: string[] } = {}
): SearchResult[] {
  const { limit = 10, tags } = opts;

  const candidates = tags?.length
    ? memories.filter(m => tags.some(t => m.tags.includes(t)))
    : memories;

  if (candidates.length === 0) return [];

  const queryTerms = tokenize(query);
  if (queryTerms.length === 0) return [];

  // Pre-tokenize all documents
  const tokenized = candidates.map(m => ({ m, terms: tokenize(buildDocText(m)) }));

  // Compute document frequency for IDF
  const N = candidates.length;
  const df = new Map<string, number>();
  queryTerms.forEach(qt => {
    const count = tokenized.filter(({ terms }) => terms.includes(qt)).length;
    df.set(qt, count);
  });

  const avgLen = tokenized.reduce((a, { terms }) => a + terms.length, 0) / N;
  const k1 = 1.5;
  const b = 0.75;

  const scored = tokenized.map(({ m, terms }) => {
    const tf = new Map<string, number>();
    terms.forEach(t => tf.set(t, (tf.get(t) ?? 0) + 1));

    let bm25 = 0;
    for (const qt of queryTerms) {
      const freq = tf.get(qt) ?? 0;
      if (freq === 0) continue;
      const n = df.get(qt) ?? 0;
      const idf = Math.log((N - n + 0.5) / (n + 0.5) + 1);
      const tfNorm = (freq * (k1 + 1)) / (freq + k1 * (1 - b + b * (terms.length / avgLen)));
      bm25 += idf * tfNorm;
    }

    // Exact key match boost
    const exactBoost = m.key.toLowerCase().includes(query.toLowerCase()) ? 2 : 0;
    // Tag exact match boost
    const tagBoost = m.tags.some(t => queryTerms.includes(t)) ? 1 : 0;
    // Importance weight: shifts score ±25%
    const importanceW = 1 + (m.importance - 5) * 0.05;
    // Gentle recency decay (half-life ~200 days)
    const daysSince = (Date.now() - new Date(m.updatedAt).getTime()) / 86_400_000;
    const recency = Math.exp(-daysSince * 0.003);

    const score = (bm25 + exactBoost + tagBoost) * importanceW * recency;
    const matchType: SearchResult['matchType'] = exactBoost > 0 ? 'exact' : 'keyword';
    return { memory: m, score, matchType };
  });

  return scored
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
