import db from '../src/db.js';
import { SearchEngine } from '../src/search.js';

const insertWord = db.prepare(
  'INSERT OR REPLACE INTO word_index (word, url, origin_url, depth, frequency) VALUES (?, ?, ?, ?, ?)'
);

function seedTestData() {
  const insert = db.transaction(() => {
    insertWord.run('typescript', 'https://example.com/ts', 'https://example.com', 0, 10);
    insertWord.run('javascript', 'https://example.com/ts', 'https://example.com', 0, 5);
    insertWord.run('typescript', 'https://example.com/docs', 'https://example.com', 1, 8);
    insertWord.run('react', 'https://example.com/react', 'https://example.com', 1, 15);
    insertWord.run('typescript', 'https://example.com/react', 'https://example.com', 1, 3);
    insertWord.run('node', 'https://example.com/node', 'https://example.com', 2, 20);
    insertWord.run('javascript', 'https://example.com/node', 'https://example.com', 2, 12);
  });
  insert();
}

function cleanTestData() {
  db.prepare('DELETE FROM word_index').run();
}

describe('SearchEngine', () => {
  const engine = new SearchEngine();

  beforeEach(() => {
    cleanTestData();
    seedTestData();
  });

  afterAll(() => {
    db.close();
  });

  it('returns results for a single-word query', () => {
    const result = engine.search('typescript', 20, 0);
    expect(result.query).toBe('typescript');
    expect(result.total).toBe(3);
    expect(result.results).toHaveLength(3);
  });

  it('sorts results by score descending', () => {
    const result = engine.search('typescript', 20, 0);
    const scores = result.results.map(r => r.score);
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]).toBeLessThanOrEqual(scores[i - 1]);
    }
  });

  it('aggregates scores for multi-word queries', () => {
    const result = engine.search('typescript javascript', 20, 0);
    expect(result.total).toBeGreaterThanOrEqual(3);

    const tsPage = result.results.find(r => r.relevantUrl === 'https://example.com/ts');
    expect(tsPage).toBeDefined();
    expect(tsPage!.score).toBe(15); // 10 + 5
  });

  it('returns empty results for only stop words', () => {
    const result = engine.search('the is a', 20, 0);
    expect(result.total).toBe(0);
    expect(result.results).toHaveLength(0);
  });

  it('returns empty results for empty query', () => {
    const result = engine.search('', 20, 0);
    expect(result.total).toBe(0);
    expect(result.results).toHaveLength(0);
  });

  it('returns empty results for unknown words', () => {
    const result = engine.search('xyznonexistent', 20, 0);
    expect(result.total).toBe(0);
  });

  it('respects limit parameter', () => {
    const result = engine.search('typescript', 2, 0);
    expect(result.results).toHaveLength(2);
    expect(result.total).toBe(3);
    expect(result.limit).toBe(2);
  });

  it('respects offset parameter', () => {
    const full = engine.search('typescript', 20, 0);
    const offset = engine.search('typescript', 20, 1);
    expect(offset.results).toHaveLength(full.total - 1);
    expect(offset.results[0].relevantUrl).toBe(full.results[1].relevantUrl);
    expect(offset.offset).toBe(1);
  });

  it('handles pagination beyond results', () => {
    const result = engine.search('typescript', 20, 100);
    expect(result.results).toHaveLength(0);
    expect(result.total).toBe(3);
  });

  it('includes correct metadata in results', () => {
    const result = engine.search('react', 20, 0);
    expect(result.results).toHaveLength(1);
    const r = result.results[0];
    expect(r.relevantUrl).toBe('https://example.com/react');
    expect(r.originUrl).toBe('https://example.com');
    expect(r.depth).toBe(1);
    expect(r.score).toBe(15);
  });

  it('returns correct response structure', () => {
    const result = engine.search('node', 10, 5);
    expect(result).toHaveProperty('query', 'node');
    expect(result).toHaveProperty('results');
    expect(result).toHaveProperty('total');
    expect(result).toHaveProperty('limit', 10);
    expect(result).toHaveProperty('offset', 5);
  });
});
