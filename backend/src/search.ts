import db from './db.js';
import { tokenize } from './parser.js';
import type { SearchResponse } from './types.js';

export type SearchMode = 'exact' | 'prefix';

function emptyResponse(query: string, limit: number, offset: number): SearchResponse {
  return { query, results: [], total: 0, limit, offset };
}

const findByWordExact = db.prepare(
  'SELECT url, origin_url, depth, frequency FROM word_index WHERE word = ?'
);

const findByWordPrefix = db.prepare(
  'SELECT url, origin_url, depth, frequency FROM word_index WHERE word LIKE ?'
);

export class SearchEngine {
  search(query: string, limit: number, offset: number, mode: SearchMode = 'exact'): SearchResponse {
    const tokens = tokenize(query);
    if (tokens.length === 0) return emptyResponse(query, limit, offset);

    const scores = new Map<string, { originUrl: string; depth: number; score: number }>();
    const stmt = mode === 'prefix' ? findByWordPrefix : findByWordExact;

    for (const token of tokens) {
      const param = mode === 'prefix' ? `${token}%` : token;
      const rows = stmt.all(param) as Array<{
        url: string;
        origin_url: string;
        depth: number;
        frequency: number;
      }>;

      for (const row of rows) {
        const existing = scores.get(row.url);
        if (existing) {
          existing.score += row.frequency;
        } else {
          scores.set(row.url, {
            originUrl: row.origin_url,
            depth: row.depth,
            score: row.frequency
          });
        }
      }
    }

    const sorted = [...scores.entries()]
      .sort((a, b) => b[1].score - a[1].score);

    const total = sorted.length;
    const paginated = sorted.slice(offset, offset + limit);

    return {
      query,
      results: paginated.map(([url, data]) => ({
        relevantUrl: url,
        originUrl: data.originUrl,
        depth: data.depth,
        score: data.score
      })),
      total,
      limit,
      offset
    };
  }
}
