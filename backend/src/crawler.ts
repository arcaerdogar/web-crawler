import { Worker } from 'node:worker_threads';
import fs from 'node:fs';
import path from 'node:path';
import {
  deleteQueuedUrl,
  insertWordsForPage,
  tryInsertQueueItem,
  tryInsertVisited,
  updateCrawlJobState,
  wasCrawledWithin,
} from './db/crawlWritesRepo.js';
import { RateLimiter } from './rateLimiter.js';
import { normalizeUrl } from './normalizeUrl.js';
import type { StartCrawlRequest, CrawlStats, WorkerInput, WorkerOutput } from './types.js';

interface CrawlerConfig extends StartCrawlRequest {
  jobId: string;
}

interface CrawlerCallbacks {
  onStats: (stats: CrawlStats) => void;
  onLog: (message: string) => void;
  onDone: (stats: CrawlStats) => void;
}

/** Skip HTTP fetch if URL was stored in visited_urls within this window (cross-job freshness). */
const RECENT_CRAWL_MS = 10 * 60 * 1000;

export class CrawlerEngine {
  private config: CrawlerConfig;
  private callbacks: CrawlerCallbacks;
  private workers: Worker[] = [];
  private availableWorkers: Worker[] = [];
  private queue: WorkerInput[] = [];
  private visited = new Set<string>();
  private stopped = false;
  private rateLimiter: RateLimiter;
  private stats: CrawlStats;
  private effectiveOrigin: string | null = null;

  constructor(config: CrawlerConfig, callbacks: CrawlerCallbacks) {
    this.config = config;
    this.callbacks = callbacks;
    this.rateLimiter = new RateLimiter(config.rateLimit);
    this.stats = {
      jobId: config.jobId,
      status: 'running',
      pagesCrawled: 0,
      pagesQueued: 0,
      maxQueueSize: config.maxQueueSize,
      currentDepth: 0,
      backPressure: false,
      rps: 0,
      droppedUrls: 0
    };

    const srcDir = path.resolve(process.cwd(), 'src');
    const tsWorker = path.resolve(srcDir, 'worker.ts');
    const jsWorker = path.resolve(srcDir, 'worker.js');
    const isDev = fs.existsSync(tsWorker);
    const workerPath = isDev ? tsWorker : jsWorker;

    for (let i = 0; i < config.workerCount; i++) {
      const worker = isDev
        ? new Worker(workerPath, { execArgv: ['--import', 'tsx'] })
        : new Worker(workerPath);
      this.workers.push(worker);
      this.availableWorkers.push(worker);
    }
  }

  restoreState(queue: WorkerInput[], visited: Set<string>, pagesCrawled: number): void {
    this.queue = queue;
    this.visited = visited;
    this.stats.pagesCrawled = pagesCrawled;
    this.stats.pagesQueued = queue.length;
    if (visited.size > 0) {
      this.effectiveOrigin = this.config.url;
    }
  }

  private getAvailableWorker(): Promise<Worker> {
    if (this.availableWorkers.length > 0) {
      return Promise.resolve(this.availableWorkers.pop()!);
    }
    return new Promise((resolve) => {
      const check = () => {
        if (this.availableWorkers.length > 0) {
          resolve(this.availableWorkers.pop()!);
        } else {
          setTimeout(check, 10);
        }
      };
      check();
    });
  }

  private releaseWorker(worker: Worker): void {
    this.availableWorkers.push(worker);
  }

  private dispatchToWorker(input: WorkerInput): Promise<WorkerOutput> {
    return new Promise((resolve) => {
      const worker = this.availableWorkers.pop()!;
      worker.once('message', (output: WorkerOutput) => {
        this.releaseWorker(worker);
        resolve(output);
      });
      worker.postMessage(input);
    });
  }

  async start(): Promise<void> {
    if (this.queue.length === 0) {
      const normalized = normalizeUrl(this.config.url, this.config.url);
      const startUrl = normalized ?? this.config.url;
      const item: WorkerInput = { url: startUrl, origin: startUrl, depth: 0 };
      this.queue.push(item);
      tryInsertQueueItem(startUrl, startUrl, 0, this.config.jobId, Date.now());
    }

    let lastRpsTime = Date.now();
    let lastRpsCount = 0;

    while (this.queue.length > 0 && !this.stopped) {
      await this.rateLimiter.wait();

      const batchSize = Math.min(this.availableWorkers.length, this.queue.length);
      if (batchSize === 0) {
        await new Promise(r => setTimeout(r, 50));
        continue;
      }

      const batch = this.queue.splice(0, batchSize);
      const itemResults = await Promise.all(
        batch.map(async (item) => {
          if (this.visited.has(item.url)) {
            deleteQueuedUrl(this.config.jobId, item.url);
            return { tag: 'skip-memory' as const, item };
          }
          if (wasCrawledWithin(item.url, RECENT_CRAWL_MS)) {
            this.visited.add(item.url);
            deleteQueuedUrl(this.config.jobId, item.url);
            return { tag: 'skip-ttl' as const, item };
          }
          const output = await this.dispatchToWorker(item);
          return { tag: 'crawled' as const, item, output };
        }),
      );

      for (const ir of itemResults) {
        if (ir.tag === 'skip-memory') {
          continue;
        }
        if (ir.tag === 'skip-ttl') {
          this.callbacks.onLog(
            `Skip recent (DB, <${RECENT_CRAWL_MS / 60000} min): ${ir.item.url}`,
          );
          this.stats.pagesQueued = this.queue.length;
          continue;
        }
        const result = ir.output;
        if (result.error) {
          this.callbacks.onLog(`Error crawling ${result.url}: ${result.error}`);
          deleteQueuedUrl(this.config.jobId, result.url);
          continue;
        }

        if (this.effectiveOrigin === null) {
          this.effectiveOrigin = result.url;
          this.callbacks.onLog(`Effective origin set to ${result.url} (after redirects)`);
        }

        this.visited.add(result.url);
        deleteQueuedUrl(this.config.jobId, result.url);
        tryInsertVisited(
          this.config.jobId,
          result.url,
          this.effectiveOrigin,
          result.depth,
          Date.now(),
        );

        this.callbacks.onLog(`Crawled ${result.url} (depth=${result.depth}) — found ${result.links.length} raw links, ${Object.keys(result.words).length} unique words`);

        const origin = this.effectiveOrigin;
        let added = 0;
        let filtered = {
          crossDomain: 0,
          visited: 0,
          recentDb: 0,
          depthExceeded: 0,
          queueFull: 0,
          duplicate: 0,
        };
        for (const link of result.links) {
          const normalized = normalizeUrl(link, origin);
          if (normalized === null) { filtered.crossDomain++; continue; }
          if (this.visited.has(normalized)) { filtered.visited++; continue; }
          if (wasCrawledWithin(normalized, RECENT_CRAWL_MS)) { filtered.recentDb++; continue; }
          if (result.depth + 1 > this.config.maxDepth) { filtered.depthExceeded++; continue; }
          if (this.queue.length >= this.config.maxQueueSize) {
            this.stats.droppedUrls++;
            filtered.queueFull++;
            if (!this.stats.backPressure) {
              this.stats.backPressure = true;
              this.callbacks.onLog('Back pressure activated — queue full');
            }
            continue;
          }
          if (this.queue.some(q => q.url === normalized)) { filtered.duplicate++; continue; }
          this.queue.push({ url: normalized, origin, depth: result.depth + 1 });
          tryInsertQueueItem(
            normalized,
            origin,
            result.depth + 1,
            this.config.jobId,
            Date.now(),
          );
          added++;
        }
        this.callbacks.onLog(
          `Links: +${added} queued | filtered: ${filtered.crossDomain} cross-domain, ${filtered.visited} in-job, ${filtered.recentDb} recent-DB, ${filtered.depthExceeded} depth, ${filtered.duplicate} duplicate, ${filtered.queueFull} queue-full`,
        );

        if (this.stats.backPressure && this.queue.length < this.config.maxQueueSize * 0.8) {
          this.stats.backPressure = false;
          this.callbacks.onLog('Back pressure relieved');
        }

        if (Object.keys(result.words).length > 0) {
          insertWordsForPage(result.words, result.url, origin, result.depth);
        }

        this.stats.pagesCrawled++;
        this.stats.pagesQueued = this.queue.length;
        this.stats.currentDepth = result.depth;
      }

      const now = Date.now();
      const elapsed = (now - lastRpsTime) / 1000;
      if (elapsed >= 1) {
        this.stats.rps = Math.round((this.stats.pagesCrawled - lastRpsCount) / elapsed * 10) / 10;
        lastRpsTime = now;
        lastRpsCount = this.stats.pagesCrawled;
      }

      this.callbacks.onStats({ ...this.stats });
    }

    if (!this.stopped) {
      this.stats.status = 'completed';
      updateCrawlJobState({
        jobId: this.config.jobId,
        status: "completed",
        finishedAt: Date.now(),
        pagesCrawled: this.stats.pagesCrawled,
        pagesQueued: this.stats.pagesQueued,
      });
      this.callbacks.onDone({ ...this.stats });
    }

    this.terminateWorkers();
  }

  stop(): void {
    this.stopped = true;
    this.stats.status = 'interrupted';
    updateCrawlJobState({
      jobId: this.config.jobId,
      status: "interrupted",
      finishedAt: Date.now(),
      pagesCrawled: this.stats.pagesCrawled,
      pagesQueued: this.stats.pagesQueued,
    });
    this.terminateWorkers();
  }

  /** Live snapshot for API (running jobs). */
  getSnapshot(): CrawlStats {
    return { ...this.stats };
  }

  private terminateWorkers(): void {
    for (const worker of this.workers) {
      worker.terminate().catch(() => {});
    }
    this.workers = [];
    this.availableWorkers = [];
  }
}
