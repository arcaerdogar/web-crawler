import { useState, useEffect } from 'react';
import type { CrawlStats } from '../types.ts';

/**
 * @param jobId - crawl job id (always defined while dashboard open)
 * @param streamActive - false: close SSE but keep last stats/logs/done (e.g. user stopped)
 */
export function useCrawlerSSE(jobId: string, streamActive = true) {
  const [stats, setStats] = useState<CrawlStats | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!jobId) {
      setStats(null);
      setLogs([]);
      setDone(false);
      return;
    }

    if (!streamActive) {
      return;
    }

    setStats(null);
    setLogs([]);
    setDone(false);

    const es = new EventSource(`/api/status/${jobId}`);

    es.addEventListener('stats', (e) => {
      setStats(JSON.parse(e.data));
    });

    es.addEventListener('log', (e) => {
      const parsed = JSON.parse(e.data) as { message: string };
      setLogs(prev => [...prev.slice(-499), parsed.message]);
    });

    es.addEventListener('done', (e) => {
      setStats(JSON.parse(e.data));
      setDone(true);
      es.close();
    });

    return () => es.close();
  }, [jobId, streamActive]);

  return { stats, logs, done };
}
