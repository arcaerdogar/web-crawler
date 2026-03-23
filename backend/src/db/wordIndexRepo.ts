import { getDb } from "./connection.js";

export interface WordIndexRow {
  url: string;
  origin_url: string;
  depth: number;
  frequency: number;
}

const db = getDb();

const findByWordExact = db.prepare(
  "SELECT url, origin_url, depth, frequency FROM word_index WHERE word = ?",
);

const findByWordPrefix = db.prepare(
  "SELECT url, origin_url, depth, frequency FROM word_index WHERE word LIKE ?",
);

const upsertWord = db.prepare(
  "INSERT OR REPLACE INTO word_index (word, url, origin_url, depth, frequency) VALUES (?, ?, ?, ?, ?)",
);

const deleteAllWords = db.prepare("DELETE FROM word_index");

export function searchWordExact(word: string): WordIndexRow[] {
  return findByWordExact.all(word) as WordIndexRow[];
}

export function searchWordPrefix(likeParam: string): WordIndexRow[] {
  return findByWordPrefix.all(likeParam) as WordIndexRow[];
}

export function upsertWordIndexEntry(params: {
  word: string;
  url: string;
  originUrl: string;
  depth: number;
  frequency: number;
}): void {
  upsertWord.run(
    params.word,
    params.url,
    params.originUrl,
    params.depth,
    params.frequency,
  );
}

export function clearWordIndex(): void {
  deleteAllWords.run();
}
