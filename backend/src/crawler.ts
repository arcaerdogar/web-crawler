import { Worker } from 'node:worker_threads';
import fs from 'node:fs';
import path from 'node:path';
import db from './db.js';
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

  private insertVisited = db.prepare(
    'INSERT OR IGNORE INTO visited_urls (url, origin_url, depth, crawled_at) VALUES (?, ?, ?, ?)'
  );
  private deleteFromQueue = db.prepare('DELETE FROM url_queue WHERE url = ?');
  private insertQueue = db.prepare(
    'INSERT OR IGNORE INTO url_queue (url, origin_url, depth, job_id, queued_at) VALUES (?, ?, ?, ?, ?)'
  );
  private insertWord = db.prepare(
    'INSERT OR REPLACE INTO word_index (word, url, origin_url, depth, frequency) VALUES (?, ?, ?, ?, ?)'
  );
  private updateJob = db.prepare(
    'UPDATE crawl_jobs SET status = ?, finished_at = ?, pages_crawled = ?, pages_queued = ? WHERE job_id = ?'
  );

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
      this.insertQueue.run(startUrl, startUrl, 0, this.config.jobId, Date.now());
    }

    let lastRpsTime = Date.now();
    let lastRpsCount = 0;

    const insertMany = db.transaction((words: Record<string, number>, url: string, origin: string, depth: number) => {
      for (const [word, freq] of Object.entries(words)) {
        this.insertWord.run(word, url, origin, depth, freq);
      }
    });

    while (this.queue.length > 0 && !this.stopped) {
      await this.rateLimiter.wait();

      const batchSize = Math.min(this.availableWorkers.length, this.queue.length);
      if (batchSize === 0) {
        await new Promise(r => setTimeout(r, 50));
        continue;
      }

      const batch = this.queue.splice(0, batchSize);
      const results = await Promise.all(batch.map(item => this.dispatchToWorker(item)));

      for (const result of results) {
        if (result.error) {
          this.callbacks.onLog(`Error crawling ${result.url}: ${result.error}`);
          this.deleteFromQueue.run(result.url);
          continue;
        }

        if (this.effectiveOrigin === null) {
          this.effectiveOrigin = result.url;
          this.callbacks.onLog(`Effective origin set to ${result.url} (after redirects)`);
        }

        this.visited.add(result.url);
        this.deleteFromQueue.run(result.url);
        this.insertVisited.run(result.url, this.effectiveOrigin, result.depth, Date.now());

        this.callbacks.onLog(`Crawled ${result.url} (depth=${result.depth}) — found ${result.links.length} raw links, ${Object.keys(result.words).length} unique words`);

        const origin = this.effectiveOrigin;
        let added = 0;
        let filtered = { crossDomain: 0, visited: 0, depthExceeded: 0, queueFull: 0, duplicate: 0 };
        for (const link of result.links) {
          const normalized = normalizeUrl(link, origin);
          if (normalized === null) { filtered.crossDomain++; continue; }
          if (this.visited.has(normalized)) { filtered.visited++; continue; }
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
          this.insertQueue.run(normalized, origin, result.depth + 1, this.config.jobId, Date.now());
          added++;
        }
        this.callbacks.onLog(`Links: +${added} queued | filtered: ${filtered.crossDomain} cross-domain, ${filtered.visited} visited, ${filtered.depthExceeded} depth, ${filtered.duplicate} duplicate, ${filtered.queueFull} queue-full`);

        if (this.stats.backPressure && this.queue.length < this.config.maxQueueSize * 0.8) {
          this.stats.backPressure = false;
          this.callbacks.onLog('Back pressure relieved');
        }

        if (Object.keys(result.words).length > 0) {
          insertMany(result.words, result.url, origin, result.depth);
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
      this.updateJob.run('completed', Date.now(), this.stats.pagesCrawled, this.stats.pagesQueued, this.config.jobId);
      this.callbacks.onDone({ ...this.stats });
    }

    this.terminateWorkers();
  }

  stop(): void {
    this.stopped = true;
    this.stats.status = 'interrupted';
    this.updateJob.run('interrupted', Date.now(), this.stats.pagesCrawled, this.stats.pagesQueued, this.config.jobId);
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
