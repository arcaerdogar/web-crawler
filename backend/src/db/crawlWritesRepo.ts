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

export function insertWordsForPage(
  words: Record<string, number>,
  pageUrl: string,
  originUrl: string,
  depth: number,
): void {
  const tx = db.transaction(() => {
    for (const [word, freq] of Object.entries(words)) {
      insertWord.run(word, pageUrl, originUrl, depth, freq);
    }
  });
  tx();
}

export function listQueueRowsForJob(jobId: string): WorkerInput[] {
  return listQueueByJobId.all(jobId) as WorkerInput[];
}

export function listVisitedUrlsForJob(jobId: string): string[] {
  const rows = listVisitedUrlsByJob.all(jobId) as Array<{ url: string }>;
  return rows.map((r) => r.url);
}

export function deleteAllQueuedUrls(): void {
  deleteAllUrlQueue.run();
}

export function deleteAllVisitedRows(): void {
  deleteAllVisitedUrls.run();
}
