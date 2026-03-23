import { getDb } from "./connection.js";

export interface CrawlJobRow {
  job_id: string;
  origin_url: string;
  max_depth: number;
  status: string;
  pages_crawled: number;
  pages_queued: number;
  created_at: number;
  finished_at: number | null;
  is_active: number;
  rate_limit: number;
  max_queue_size: number;
  worker_count: number;
}

const db = getDb();

const insertRunningJob = db.prepare(
  `INSERT INTO crawl_jobs (
    job_id, origin_url, max_depth, status, pages_crawled, pages_queued, created_at,
    is_active, rate_limit, max_queue_size, worker_count
  ) VALUES (?, ?, ?, 'running', 0, 0, ?, 1, ?, ?, ?)`,
);

const listJobsDesc = db.prepare(
  "SELECT * FROM crawl_jobs ORDER BY created_at DESC",
);

const getJobById = db.prepare("SELECT * FROM crawl_jobs WHERE job_id = ?");

const updateInterrupted = db.prepare(
  "UPDATE crawl_jobs SET status = 'interrupted', finished_at = ? WHERE job_id = ?",
);

const updateRunningClearFinished = db.prepare(
  "UPDATE crawl_jobs SET status = 'running', finished_at = NULL WHERE job_id = ?",
);

const updateAllRunningInterrupted = db.prepare(
  "UPDATE crawl_jobs SET status='interrupted' WHERE status='running'",
);

const updateAllRunningInterruptedWithTs = db.prepare(
  "UPDATE crawl_jobs SET status='interrupted', finished_at=? WHERE status='running'",
);

const selectRunningActiveJobs = db.prepare(
  "SELECT * FROM crawl_jobs WHERE status = 'running' AND is_active = 1",
);

const deleteQueueByJobId = db.prepare(
  "DELETE FROM url_queue WHERE job_id = ?",
);

const deleteAllCrawlJobs = db.prepare("DELETE FROM crawl_jobs");

const softDeleteStmt = db.prepare(
  "UPDATE crawl_jobs SET is_active = 0 WHERE job_id = ?",
);

const insertJobFull = db.prepare(
  `INSERT INTO crawl_jobs (
    job_id, origin_url, max_depth, status, pages_crawled, pages_queued, created_at,
    is_active, rate_limit, max_queue_size, worker_count
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
);

const insertJobWithFinished = db.prepare(
  `INSERT INTO crawl_jobs (
    job_id, origin_url, max_depth, status, pages_crawled, pages_queued, created_at, finished_at,
    is_active, rate_limit, max_queue_size, worker_count
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
);

export function insertRunningCrawlJob(
  jobId: string,
  originUrl: string,
  maxDepth: number,
  createdAt: number,
  rateLimit: number,
  maxQueueSize: number,
  workerCount: number,
): void {
  insertRunningJob.run(
    jobId,
    originUrl,
    maxDepth,
    createdAt,
    rateLimit,
    maxQueueSize,
    workerCount,
  );
}

export function listAllCrawlJobs(): CrawlJobRow[] {
  return listJobsDesc.all() as CrawlJobRow[];
}

export function findCrawlJobById(jobId: string): CrawlJobRow | undefined {
  return getJobById.get(jobId) as CrawlJobRow | undefined;
}

export function listRunningActiveCrawlJobs(): CrawlJobRow[] {
  return selectRunningActiveJobs.all() as CrawlJobRow[];
}

export function markCrawlJobInterrupted(
  jobId: string,
  finishedAt: number,
): void {
  updateInterrupted.run(finishedAt, jobId);
}

export function markCrawlJobRunningClearFinished(jobId: string): void {
  updateRunningClearFinished.run(jobId);
}

export function markAllRunningCrawlJobsInterrupted(): void {
  updateAllRunningInterrupted.run();
}

export function markAllRunningCrawlJobsInterruptedAt(finishedAt: number): void {
  updateAllRunningInterruptedWithTs.run(finishedAt);
}

export function softDeleteJob(jobId: string): void {
  softDeleteStmt.run(jobId);
}

export function deleteUrlQueueForJob(jobId: string): void {
  deleteQueueByJobId.run(jobId);
}

export function deleteAllCrawlJobsRows(): void {
  deleteAllCrawlJobs.run();
}

/** Test / seed: insert job without finished_at */
export function insertCrawlJobSeed(params: {
  jobId: string;
  originUrl: string;
  maxDepth: number;
  status: string;
  pagesCrawled: number;
  pagesQueued: number;
  createdAt: number;
}): void {
  insertJobFull.run(
    params.jobId,
    params.originUrl,
    params.maxDepth,
    params.status,
    params.pagesCrawled,
    params.pagesQueued,
    params.createdAt,
    1,
    5,
    1000,
    4,
  );
}

/** Test / seed: insert job with finished_at */
export function insertCrawlJobSeedWithFinishedAt(params: {
  jobId: string;
  originUrl: string;
  maxDepth: number;
  status: string;
  pagesCrawled: number;
  pagesQueued: number;
  createdAt: number;
  finishedAt: number | null;
}): void {
  insertJobWithFinished.run(
    params.jobId,
    params.originUrl,
    params.maxDepth,
    params.status,
    params.pagesCrawled,
    params.pagesQueued,
    params.createdAt,
    params.finishedAt,
    1,
    5,
    1000,
    4,
  );
}
