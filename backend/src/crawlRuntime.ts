import type { CrawlerEngine } from "./crawler.js";
import type { CrawlStats, SSEEvent } from "./types.js";

export const runningEngines = new Map<string, CrawlerEngine>();
export const sseClients = new Map<string, Set<(event: SSEEvent) => void>>();

export function createCallbacks(jobId: string) {
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
