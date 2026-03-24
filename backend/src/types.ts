import type { CrawlScope } from "./crawlScope.js";

export type { CrawlScope };

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
  /** false = soft-deleted; row kept for history / search side-effects */
  isActive: boolean;
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

export interface WorkerInput {
  url: string;
  origin: string;
  depth: number;
  crawlScope?: CrawlScope;
}

export interface WorkerOutput {
  url: string;
  origin: string;
  depth: number;
  links: string[];
  words: Record<string, number>;
  error: string | null;
}

export type SSEEvent =
  | { type: 'stats'; data: CrawlStats }
  | { type: 'log'; data: { message: string; timestamp: number } }
  | { type: 'done'; data: CrawlStats };
