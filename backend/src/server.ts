import express from "express";
import db from "./db.js";
import { CrawlerEngine } from "./crawler.js";
import { SearchEngine } from "./search.js";
import type {
  StartCrawlRequest,
  CrawlStats,
  CrawlJob,
  SSEEvent,
  WorkerInput,
} from "./types.js";

const app = express();
const PORT = 3001;

app.use(express.json());

app.use((_req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "http://localhost:5173");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  next();
});

app.options("*", (_req, res) => res.sendStatus(204));

const runningEngines = new Map<string, CrawlerEngine>();
const sseClients = new Map<string, Set<(event: SSEEvent) => void>>();

function createCallbacks(jobId: string) {
  const send = (event: SSEEvent) => {
    const clients = sseClients.get(jobId);
    if (clients) {
      for (const fn of clients) fn(event);
    }
  };

  return {
    onStats: (stats: CrawlStats) => send({ type: "stats", data: stats }),
    onLog: (message: string) => {
      console.log(`[${jobId}] ${message}`);
      send({ type: "log", data: { message, timestamp: Date.now() } });
    },
    onDone: (stats: CrawlStats) => {
      send({ type: "done", data: stats });
      runningEngines.delete(jobId);
    },
  };
}

// --- POST /api/index ---
app.post("/api/index", (req, res) => {
  const body = req.body as Partial<StartCrawlRequest>;

  if (!body.url || typeof body.url !== "string") {
    res.status(400).json({ error: "url is required and must be a string" });
    return;
  }
  try {
    new URL(body.url);
  } catch {
    res.status(400).json({ error: "url must be a valid URL" });
    return;
  }

  const maxDepth = body.maxDepth ?? 2;
  const rateLimit = body.rateLimit ?? 5;
  const maxQueueSize = body.maxQueueSize ?? 1000;
  const workerCount = body.workerCount ?? 4;

  if (maxDepth < 1 || maxDepth > 10) {
    res.status(400).json({ error: "maxDepth must be between 1 and 10" });
    return;
  }
  if (rateLimit < 1 || rateLimit > 20) {
    res.status(400).json({ error: "rateLimit must be between 1 and 20" });
    return;
  }
  if (maxQueueSize < 100 || maxQueueSize > 5000) {
    res
      .status(400)
      .json({ error: "maxQueueSize must be between 100 and 5000" });
    return;
  }
  if (workerCount < 1 || workerCount > 8) {
    res.status(400).json({ error: "workerCount must be between 1 and 8" });
    return;
  }

  const jobId = `${Date.now()}_${Math.random().toString(36).slice(2)}`;

  db.prepare(
    "INSERT INTO crawl_jobs (job_id, origin_url, max_depth, status, pages_crawled, pages_queued, created_at) VALUES (?, ?, ?, ?, 0, 0, ?)",
  ).run(jobId, body.url, maxDepth, "running", Date.now());

  const config = {
    jobId,
    url: body.url,
    maxDepth,
    rateLimit,
    maxQueueSize,
    workerCount,
  };
  const engine = new CrawlerEngine(config, createCallbacks(jobId));
  runningEngines.set(jobId, engine);

  engine.start().catch((err) => {
    console.error(`Crawler ${jobId} error:`, err);
  });

  res.status(201).json({ jobId });
});

// --- GET /api/jobs ---
app.get("/api/jobs", (_req, res) => {
  const rows = db
    .prepare("SELECT * FROM crawl_jobs ORDER BY created_at DESC")
    .all() as Array<{
    job_id: string;
    origin_url: string;
    max_depth: number;
    status: string;
    pages_crawled: number;
    pages_queued: number;
    created_at: number;
    finished_at: number | null;
  }>;

  const jobs: CrawlJob[] = rows.map((r) => ({
    jobId: r.job_id,
    originUrl: r.origin_url,
    maxDepth: r.max_depth,
    status: r.status as CrawlJob["status"],
    pagesCrawled: r.pages_crawled,
    pagesQueued: r.pages_queued,
    createdAt: r.created_at,
    finishedAt: r.finished_at,
  }));

  res.json(jobs);
});

// --- GET /api/jobs/:jobId ---
app.get("/api/jobs/:jobId", (req, res) => {
  const { jobId } = req.params;
  const row = db
    .prepare("SELECT * FROM crawl_jobs WHERE job_id = ?")
    .get(jobId) as {
    job_id: string;
    origin_url: string;
    max_depth: number;
    status: string;
    pages_crawled: number;
    pages_queued: number;
    created_at: number;
    finished_at: number | null;
  } | undefined;

  if (!row) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  const engine = runningEngines.get(jobId);
  const live = engine?.getSnapshot();

  const base = {
    jobId: row.job_id,
    originUrl: row.origin_url,
    maxDepth: row.max_depth,
    status: (live?.status ?? row.status) as CrawlJob["status"],
    pagesCrawled: live?.pagesCrawled ?? row.pages_crawled,
    pagesQueued: live?.pagesQueued ?? row.pages_queued,
    createdAt: row.created_at,
    finishedAt: row.finished_at,
    maxQueueSize: live?.maxQueueSize ?? 1000,
    currentDepth: live?.currentDepth ?? 0,
    backPressure: live?.backPressure ?? false,
    rps: live?.rps ?? 0,
    droppedUrls: live?.droppedUrls ?? 0,
  };

  res.json(base);
});

// --- DELETE /api/jobs/:jobId ---
app.delete("/api/jobs/:jobId", (req, res) => {
  const { jobId } = req.params;
  const engine = runningEngines.get(jobId);
  if (engine) {
    engine.stop();
    runningEngines.delete(jobId);
  } else {
    db.prepare(
      "UPDATE crawl_jobs SET status = 'interrupted', finished_at = ? WHERE job_id = ?",
    ).run(Date.now(), jobId);
  }
  res.json({ ok: true });
});

// --- POST /api/jobs/:jobId/restart ---
app.post("/api/jobs/:jobId/restart", (req, res) => {
  const { jobId } = req.params;
  const row = db
    .prepare("SELECT * FROM crawl_jobs WHERE job_id = ?")
    .get(jobId) as {
    job_id: string;
    origin_url: string;
    max_depth: number;
    status: string;
    pages_crawled: number;
  } | undefined;

  if (!row) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  if (row.status === "running") {
    res.status(400).json({ error: "Job is already running" });
    return;
  }

  const maxDepth = row.max_depth;
  const rateLimit = 5;
  const maxQueueSize = 1000;
  const workerCount = 4;

  const queueRows = db
    .prepare("SELECT url, origin_url AS origin, depth FROM url_queue WHERE job_id = ?")
    .all(jobId) as WorkerInput[];

  const visitedRows = db
    .prepare("SELECT url FROM visited_urls WHERE origin_url = ?")
    .all(row.origin_url) as Array<{ url: string }>;
  const visited = new Set(visitedRows.map((r) => r.url));

  db.prepare(
    "UPDATE crawl_jobs SET status = 'running', finished_at = NULL WHERE job_id = ?",
  ).run(jobId);

  const config = {
    jobId,
    url: row.origin_url,
    maxDepth,
    rateLimit,
    maxQueueSize,
    workerCount,
  };
  const engine = new CrawlerEngine(config, createCallbacks(jobId));

  if (queueRows.length > 0 || visited.size > 0) {
    engine.restoreState(queueRows, visited, row.pages_crawled);
    console.log(`Resuming job ${jobId} with ${queueRows.length} URLs in queue, ${visited.size} visited`);
  }

  runningEngines.set(jobId, engine);

  engine.start().catch((err) => {
    console.error(`Crawler ${jobId} error:`, err);
  });

  res.status(200).json({ jobId });
});

// --- GET /api/status/:jobId (SSE) ---
app.get("/api/status/:jobId", (req, res) => {
  const { jobId } = req.params;

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
});

// --- GET /api/search ---
app.get("/api/search", (req, res) => {
  const q = req.query.q as string | undefined;
  if (!q || q.trim().length === 0) {
    res.status(400).json({ error: "q parameter is required" });
    return;
  }

  const limit = Math.min(
    Math.max(parseInt(String(req.query.limit)) || 20, 1),
    100,
  );
  const offset = Math.max(parseInt(String(req.query.offset)) || 0, 0);
  const mode = req.query.mode === "prefix" ? "prefix" as const : "exact" as const;

  const searchEngine = new SearchEngine();
  const result = searchEngine.search(q, limit, offset, mode);
  res.json(result);
});

// --- Resume interrupted jobs on startup ---
function resumeJobs() {
  const runningJobs = db
    .prepare("SELECT * FROM crawl_jobs WHERE status = 'running'")
    .all() as Array<{
    job_id: string;
    origin_url: string;
    max_depth: number;
    status: string;
    pages_crawled: number;
    pages_queued: number;
    created_at: number;
    finished_at: number | null;
  }>;

  for (const job of runningJobs) {
    const queueRows = db
      .prepare(
        "SELECT url, origin_url AS origin, depth FROM url_queue WHERE job_id = ?",
      )
      .all(job.job_id) as WorkerInput[];

    const visitedRows = db
      .prepare("SELECT url FROM visited_urls")
      .all() as Array<{ url: string }>;
    const visited = new Set(visitedRows.map((r) => r.url));

    const config = {
      jobId: job.job_id,
      url: job.origin_url,
      maxDepth: job.max_depth,
      rateLimit: 5,
      maxQueueSize: 1000,
      workerCount: 4,
    };

    const engine = new CrawlerEngine(config, createCallbacks(job.job_id));
    engine.restoreState(queueRows, visited, job.pages_crawled);
    runningEngines.set(job.job_id, engine);

    engine.start().catch((err) => {
      console.error(`Resume crawler ${job.job_id} error:`, err);
    });

    console.log(
      `Resuming job ${job.job_id} with ${queueRows.length} URLs in queue`,
    );
  }
}

// --- Graceful shutdown ---
function shutdown() {
  console.log("Shutting down...");
  for (const engine of runningEngines.values()) {
    engine.stop();
  }
  db.prepare(
    "UPDATE crawl_jobs SET status='interrupted' WHERE status='running'",
  ).run();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

export { app };

if (!process.env["JEST_WORKER_ID"]) {
  const crashedJobs = db.prepare("SELECT job_id FROM crawl_jobs WHERE status='running'").all() as Array<{ job_id: string }>;
  for (const { job_id } of crashedJobs) {
    db.prepare("DELETE FROM url_queue WHERE job_id = ?").run(job_id);
  }
  db.prepare("UPDATE crawl_jobs SET status='interrupted', finished_at=? WHERE status='running'").run(Date.now());
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}
