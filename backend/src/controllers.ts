import type { RequestHandler } from "express";
import * as crawlJobsRepo from "./db/crawlJobsRepo.js";
import * as crawlWritesRepo from "./db/crawlWritesRepo.js";
import { startEngineFromPersistedJob } from "./jobResume.js";
import { CrawlerEngine } from "./crawler.js";
import { createCallbacks, runningEngines, sseClients } from "./crawlRuntime.js";
import { SearchEngine } from "./search.js";
import { crawlScopeFromRow } from "./crawlScope.js";
import type { CrawlJob, SSEEvent } from "./types.js";
import type {
  JobIdParams,
  JobUrlsQuery,
  SearchQuery,
  StartCrawlBody,
} from "./validation.js";

function rowToJobBase(row: crawlJobsRepo.CrawlJobRow): CrawlJob {
  const isActive = row.is_active === 1;
  const dbVisited = crawlWritesRepo.countVisitedUrlsForJob(row.job_id);
  const dbQueued = crawlWritesRepo.countQueuedUrlsForJob(row.job_id);
  return {
    jobId: row.job_id,
    originUrl: row.origin_url,
    maxDepth: row.max_depth,
    crawlScope: crawlScopeFromRow(row),
    status: isActive ? (row.status as CrawlJob["status"]) : "deleted",
    pagesCrawled: dbVisited,
    pagesQueued: dbQueued,
    createdAt: row.created_at,
    finishedAt: row.finished_at,
    isActive,
  };
}

export const postIndex: RequestHandler = (req, res) => {
  const { url, maxDepth, rateLimit, maxQueueSize, workerCount, crawlScope } =
    req.validatedBody as StartCrawlBody;

  const jobId = `${Date.now()}_${Math.random().toString(36).slice(2)}`;

  crawlJobsRepo.insertRunningCrawlJob(
    jobId,
    url,
    maxDepth,
    Date.now(),
    rateLimit,
    maxQueueSize,
    workerCount,
    crawlScope,
  );

  const config = {
    jobId,
    url,
    maxDepth,
    rateLimit,
    maxQueueSize,
    workerCount,
    crawlScope,
  };
  const engine = new CrawlerEngine(config, createCallbacks(jobId));
  runningEngines.set(jobId, engine);

  engine.start().catch((err) => {
    console.error(`Crawler ${jobId} error:`, err);
  });

  res.status(201).json({ jobId });
};

export const getJobs: RequestHandler = (_req, res) => {
  const rows = crawlJobsRepo.listAllCrawlJobs();
  const jobs: CrawlJob[] = rows.map((r) => rowToJobBase(r));
  res.json(jobs);
};

export const getJobById: RequestHandler = (req, res) => {
  const { jobId } = req.validatedParams as JobIdParams;
  const row = crawlJobsRepo.findCrawlJobById(jobId);

  if (!row) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  const mapped = rowToJobBase(row);
  const engine = runningEngines.get(jobId);
  const live = engine?.getSnapshot();

  const status: CrawlJob["status"] = !mapped.isActive
    ? "deleted"
    : ((live?.status ?? row.status) as CrawlJob["status"]);

  const dbVisited = crawlWritesRepo.countVisitedUrlsForJob(jobId);
  const dbQueued = crawlWritesRepo.countQueuedUrlsForJob(jobId);

  const base = {
    ...mapped,
    status,
    pagesCrawled: dbVisited,
    pagesQueued: dbQueued,
    maxQueueSize: live?.maxQueueSize ?? row.max_queue_size,
    currentDepth: live?.currentDepth ?? 0,
    backPressure: live?.backPressure ?? false,
    rps: live?.rps ?? 0,
    droppedUrls: live?.droppedUrls ?? 0,
  };

  res.json(base);
};

/** Paginated visited URLs or pending queue rows for a job (from SQLite). */
export const getJobUrls: RequestHandler = (req, res) => {
  const { jobId } = req.validatedParams as JobIdParams;
  const { kind, limit, offset } = req.validatedQuery as JobUrlsQuery;

  if (!crawlJobsRepo.findCrawlJobById(jobId)) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  const data =
    kind === "visited"
      ? crawlWritesRepo.listVisitedPagedForJob(jobId, limit, offset)
      : crawlWritesRepo.listQueuePagedForJob(jobId, limit, offset);

  res.json({
    kind,
    items: data.items,
    total: data.total,
    limit,
    offset,
  });
};

/** Stop crawl: interrupted, queue kept. */
export const postStopJob: RequestHandler = (req, res) => {
  const { jobId } = req.validatedParams as JobIdParams;
  const row = crawlJobsRepo.findCrawlJobById(jobId);

  if (!row) {
    res.status(404).json({ error: "Job not found" });
    return;
  }
  if (row.is_active !== 1) {
    res.status(400).json({ error: "Job is inactive" });
    return;
  }

  const engine = runningEngines.get(jobId);
  if (engine) {
    engine.stop();
    runningEngines.delete(jobId);
  } else if (row.status === "running") {
    crawlJobsRepo.markCrawlJobInterrupted(jobId, Date.now());
  }

  res.json({ ok: true });
};

/** Soft delete: clear queue, is_active = 0; visited / word_index unchanged. */
export const deleteJobById: RequestHandler = (req, res) => {
  const { jobId } = req.validatedParams as JobIdParams;
  const row = crawlJobsRepo.findCrawlJobById(jobId);

  if (!row) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  const engine = runningEngines.get(jobId);
  if (engine) {
    engine.stop();
    runningEngines.delete(jobId);
  } else if (row.status === "running") {
    crawlJobsRepo.markCrawlJobInterrupted(jobId, Date.now());
  }

  crawlJobsRepo.deleteUrlQueueForJob(jobId);
  crawlJobsRepo.softDeleteJob(jobId);

  res.json({ ok: true });
};

export const postRestartJob: RequestHandler = (req, res) => {
  const { jobId } = req.validatedParams as JobIdParams;
  const row = crawlJobsRepo.findCrawlJobById(jobId);

  if (!row) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  if (row.is_active !== 1) {
    res.status(400).json({ error: "Job is inactive" });
    return;
  }

  if (row.status === "running") {
    res.status(400).json({ error: "Job is already running" });
    return;
  }

  crawlJobsRepo.markCrawlJobRunningClearFinished(jobId);
  startEngineFromPersistedJob(row);

  res.status(200).json({ jobId });
};

export const getJobStatusStream: RequestHandler = (req, res) => {
  const { jobId } = req.validatedParams as JobIdParams;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const send = (event: SSEEvent) => {
    res.write(`event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`);
  };

  if (!sseClients.has(jobId)) {
    sseClients.set(jobId, new Set());
  }
  sseClients.get(jobId)!.add(send);

  req.on("close", () => {
    const clients = sseClients.get(jobId);
    if (clients) {
      clients.delete(send);
      if (clients.size === 0) sseClients.delete(jobId);
    }
  });
};

export const getSearch: RequestHandler = (req, res) => {
  const { q, limit, offset, mode } = req.validatedQuery as SearchQuery;

  const searchEngine = new SearchEngine();
  const result = searchEngine.search(q, limit, offset, mode);
  res.json(result);
};
