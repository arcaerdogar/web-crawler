import type { WorkerInput } from "../types.js";
import { getDb } from "./connection.js";

const db = getDb();

const upsertVisited = db.prepare(
  `INSERT INTO visited_urls (job_id, url, origin_url, depth, crawled_at) VALUES (?, ?, ?, ?, ?)
   ON CONFLICT(job_id, url) DO UPDATE SET
     origin_url = excluded.origin_url,
     depth = excluded.depth,
     crawled_at = excluded.crawled_at`,
);

const selectRecentCrawl = db.prepare(
  "SELECT 1 FROM visited_urls WHERE url = ? AND crawled_at > ? LIMIT 1",
);

const deleteFromQueue = db.prepare(
  "DELETE FROM url_queue WHERE job_id = ? AND url = ?",
);

const insertQueue = db.prepare(
  "INSERT OR IGNORE INTO url_queue (job_id, url, origin_url, depth, queued_at) VALUES (?, ?, ?, ?, ?)",
);

const insertWord = db.prepare(
  "INSERT OR REPLACE INTO word_index (word, url, origin_url, depth, frequency) VALUES (?, ?, ?, ?, ?)",
);

const updateJob = db.prepare(
  "UPDATE crawl_jobs SET status = ?, finished_at = ?, pages_crawled = ?, pages_queued = ? WHERE job_id = ?",
);

const listQueueByJobId = db.prepare(
  "SELECT url, origin_url AS origin, depth FROM url_queue WHERE job_id = ?",
);

const listVisitedUrlsByJob = db.prepare(
  "SELECT url FROM visited_urls WHERE job_id = ?",
);

const listVisitedPaged = db.prepare(
  `SELECT url, depth, crawled_at AS at FROM visited_urls
   WHERE job_id = ? ORDER BY crawled_at DESC LIMIT ? OFFSET ?`,
);

const countVisitedByJob = db.prepare(
  "SELECT COUNT(*) AS n FROM visited_urls WHERE job_id = ?",
);

const listQueuePaged = db.prepare(
  `SELECT url, depth, queued_at AS at FROM url_queue
   WHERE job_id = ? ORDER BY depth ASC, queued_at ASC LIMIT ? OFFSET ?`,
);

const countQueueByJob = db.prepare(
  "SELECT COUNT(*) AS n FROM url_queue WHERE job_id = ?",
);

const deleteAllUrlQueue = db.prepare("DELETE FROM url_queue");

const deleteAllVisitedUrls = db.prepare("DELETE FROM visited_urls");

/** Global TTL: any job's recent crawl of this URL counts. */
export function wasCrawledWithin(url: string, windowMs: number): boolean {
  const cutoff = Date.now() - windowMs;
  const row = selectRecentCrawl.get(url, cutoff);
  return row !== undefined;
}

export function tryInsertVisited(
  jobId: string,
  url: string,
  originUrl: string,
  depth: number,
  crawledAt: number,
): void {
  upsertVisited.run(jobId, url, originUrl, depth, crawledAt);
}

export function deleteQueuedUrl(jobId: string, url: string): void {
  deleteFromQueue.run(jobId, url);
}

export function tryInsertQueueItem(
  url: string,
  originUrl: string,
  depth: number,
  jobId: string,
  queuedAt: number,
): void {
  insertQueue.run(jobId, url, originUrl, depth, queuedAt);
}

export function updateCrawlJobState(params: {
  jobId: string;
  status: string;
  finishedAt: number;
  pagesCrawled: number;
  pagesQueued: number;
}): void {
  updateJob.run(
    params.status,
    params.finishedAt,
    params.pagesCrawled,
    params.pagesQueued,
    params.jobId,
  );
}

/** Smaller write transactions than “whole page” — shorter locks, acceptable if a crash leaves partial index for one URL. */
const WORD_INDEX_TX_BATCH = 200;

export function insertWordsForPage(
  words: Record<string, number>,
  pageUrl: string,
  originUrl: string,
  depth: number,
): void {
  const entries = Object.entries(words);
  if (entries.length === 0) return;

  for (let i = 0; i < entries.length; i += WORD_INDEX_TX_BATCH) {
    const slice = entries.slice(i, i + WORD_INDEX_TX_BATCH);
    const tx = db.transaction(() => {
      for (const [word, freq] of slice) {
        insertWord.run(word, pageUrl, originUrl, depth, freq);
      }
    });
    tx();
  }
}

export function listQueueRowsForJob(jobId: string): WorkerInput[] {
  return listQueueByJobId.all(jobId) as WorkerInput[];
}

export function listVisitedUrlsForJob(jobId: string): string[] {
  const rows = listVisitedUrlsByJob.all(jobId) as Array<{ url: string }>;
  return rows.map((r) => r.url);
}

export interface JobUrlEntry {
  url: string;
  depth: number;
  at: number;
}

function countAsNumber(row: { n: number | bigint } | undefined): number {
  if (row == null) return 0;
  return Number(row.n);
}

export function listVisitedPagedForJob(
  jobId: string,
  limit: number,
  offset: number,
): { items: JobUrlEntry[]; total: number } {
  const items = listVisitedPaged.all(jobId, limit, offset) as JobUrlEntry[];
  const totalRow = countVisitedByJob.get(jobId) as { n: number | bigint } | undefined;
  return { items, total: countAsNumber(totalRow) };
}

export function listQueuePagedForJob(
  jobId: string,
  limit: number,
  offset: number,
): { items: JobUrlEntry[]; total: number } {
  const items = listQueuePaged.all(jobId, limit, offset) as JobUrlEntry[];
  const totalRow = countQueueByJob.get(jobId) as { n: number | bigint } | undefined;
  return { items, total: countAsNumber(totalRow) };
}

/** Row count in `visited_urls` for this job (source of truth for “pages crawled”). */
export function countVisitedUrlsForJob(jobId: string): number {
  const totalRow = countVisitedByJob.get(jobId) as { n: number | bigint } | undefined;
  return countAsNumber(totalRow);
}

/** Row count in `url_queue` for this job (matches queued URL list). */
export function countQueuedUrlsForJob(jobId: string): number {
  const totalRow = countQueueByJob.get(jobId) as { n: number | bigint } | undefined;
  return countAsNumber(totalRow);
}

export function deleteAllQueuedUrls(): void {
  deleteAllUrlQueue.run();
}

export function deleteAllVisitedRows(): void {
  deleteAllVisitedUrls.run();
}
