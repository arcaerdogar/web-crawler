export type CrawlScope = 'hostname' | 'registrableDomain' | 'unrestricted';

export interface StartCrawlRequest {
  url: string;
  maxDepth: number;
  rateLimit: number;
  maxQueueSize: number;
  workerCount: number;
  crawlScope: CrawlScope;
}

export interface CrawlJob {
  jobId: string;
  originUrl: string;
  maxDepth: number;
  crawlScope: CrawlScope;
  status: 'running' | 'completed' | 'interrupted' | 'deleted';
  pagesCrawled: number;
  pagesQueued: number;
  createdAt: number;
  finishedAt: number | null;
  isActive: boolean;
}

/** GET /api/jobs/:jobId — job row + live stats fields */
export interface JobDetail extends CrawlJob {
  maxQueueSize: number;
  currentDepth: number;
  backPressure: boolean;
  rps: number;
  droppedUrls: number;
}

export interface CrawlStats {
  jobId: string;
  status: CrawlJob['status'];
  pagesCrawled: number;
  pagesQueued: number;
  maxQueueSize: number;
  currentDepth: number;
  backPressure: boolean;
  rps: number;
  droppedUrls: number;
}

export interface SearchResult {
  relevantUrl: string;
  originUrl: string;
  depth: number;
  score: number;
}

export interface SearchResponse {
  query: string;
  results: SearchResult[];
  total: number;
  limit: number;
  offset: number;
}

export interface JobUrlItem {
  url: string;
  depth: number;
  at: number;
}

export interface JobUrlsResponse {
  kind: 'visited' | 'queued';
  items: JobUrlItem[];
  total: number;
  limit: number;
  offset: number;
}

export type SSEEvent =
  | { type: 'stats'; data: CrawlStats }
  | { type: 'log'; data: { message: string; timestamp: number } }
  | { type: 'done'; data: CrawlStats };
