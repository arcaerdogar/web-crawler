import { CrawlerEngine } from "./crawler.js";
import { crawlScopeFromRow } from "./crawlScope.js";
import * as crawlWritesRepo from "./db/crawlWritesRepo.js";
import type { CrawlJobRow } from "./db/crawlJobsRepo.js";
import { createCallbacks, runningEngines } from "./crawlRuntime.js";

/** Shared path: load queue + per-job visited from DB, start engine. */
export function startEngineFromPersistedJob(row: CrawlJobRow): void {
  const jobId = row.job_id;
  if (runningEngines.has(jobId)) return;

  const queueRows = crawlWritesRepo.listQueueRowsForJob(jobId);
  const visitedUrls = crawlWritesRepo.listVisitedUrlsForJob(jobId);
  const visited = new Set(visitedUrls);

  const config = {
    jobId,
    url: row.origin_url,
    maxDepth: row.max_depth,
    rateLimit: row.rate_limit,
    maxQueueSize: row.max_queue_size,
    workerCount: row.worker_count,
    crawlScope: crawlScopeFromRow(row),
  };

  const engine = new CrawlerEngine(config, createCallbacks(jobId));
  if (queueRows.length > 0 || visited.size > 0) {
    engine.restoreState(queueRows, visited, visited.size);
  }

  runningEngines.set(jobId, engine);
  engine.start().catch((err) => {
    console.error(`Crawler ${jobId} error:`, err);
  });
}
