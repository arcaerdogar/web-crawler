import { useCallback, useEffect, useRef, useState } from 'react';
import { getJobUrls } from '../api/client.ts';
import type { JobUrlItem } from '../types.ts';

const PAGE = 200;

interface Props {
  jobId: string;
  /** When true, refetch lists periodically so queue/visited stay fresh. */
  live: boolean;
  /** Increment to force a reload (e.g. crawl finished or stopped). */
  refreshKey?: number;
  /** Fired after each successful reload so stat cards match list totals (DB counts). */
  onTotalsChange?: (t: { visited: number; queued: number }) => void;
}

function formatTs(ms: number): string {
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return String(ms);
  }
}

export function JobUrlLists({
  jobId,
  live,
  refreshKey = 0,
  onTotalsChange,
}: Props) {
  const [visited, setVisited] = useState<JobUrlItem[]>([]);
  const [visitedTotal, setVisitedTotal] = useState(0);
  const [queue, setQueue] = useState<JobUrlItem[]>([]);
  const [queueTotal, setQueueTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMoreV, setLoadingMoreV] = useState(false);
  const [loadingMoreQ, setLoadingMoreQ] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const visitedLenRef = useRef(0);
  const queueLenRef = useRef(0);
  visitedLenRef.current = visited.length;
  queueLenRef.current = queue.length;

  const reload = useCallback(async () => {
    setError(null);
    const vCap = Math.min(Math.max(visitedLenRef.current, PAGE), 1000);
    const qCap = Math.min(Math.max(queueLenRef.current, PAGE), 1000);
    try {
      const [v, q] = await Promise.all([
        getJobUrls(jobId, 'visited', vCap, 0),
        getJobUrls(jobId, 'queued', qCap, 0),
      ]);
      setVisited(v.items);
      setVisitedTotal(v.total);
      setQueue(q.items);
      setQueueTotal(q.total);
      onTotalsChange?.({ visited: v.total, queued: q.total });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load URL lists');
    } finally {
      setLoading(false);
    }
  }, [jobId, onTotalsChange]);

  useEffect(() => {
    setLoading(true);
    setVisited([]);
    setVisitedTotal(0);
    setQueue([]);
    setQueueTotal(0);
    void reload();
  }, [jobId, refreshKey, reload]);

  useEffect(() => {
    if (!live) return;
    const t = window.setInterval(() => {
      void reload();
    }, 4000);
    return () => window.clearInterval(t);
  }, [live, reload]);

  const loadMoreVisited = async () => {
    if (visited.length >= visitedTotal) return;
    setLoadingMoreV(true);
    try {
      const r = await getJobUrls(jobId, 'visited', PAGE, visited.length);
      setVisited(prev => [...prev, ...r.items]);
      setVisitedTotal(r.total);
    } catch {
      /* keep list */
    } finally {
      setLoadingMoreV(false);
    }
  };

  const loadMoreQueue = async () => {
    if (queue.length >= queueTotal) return;
    setLoadingMoreQ(true);
    try {
      const r = await getJobUrls(jobId, 'queued', PAGE, queue.length);
      setQueue(prev => [...prev, ...r.items]);
      setQueueTotal(r.total);
    } catch {
      /* keep list */
    } finally {
      setLoadingMoreQ(false);
    }
  };

  return (
    <div className="job-url-lists">
      <div className="job-url-lists-toolbar">
        <h3 className="job-url-lists-heading">Ziyaret edilen ve kuyruk</h3>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={loading}
          onClick={() => {
            setLoading(true);
            void reload();
          }}
        >
          Yenile
        </button>
      </div>
      {error && <p className="error-text job-url-lists-error">{error}</p>}
      {loading && visited.length === 0 && queue.length === 0 && !error && (
        <p className="log-empty">URL listeleri yükleniyor…</p>
      )}
      <div className="job-url-lists-grid">
        <section className="job-url-panel">
          <h4 className="job-url-panel-title">
            Taranan URL’ler
            <span className="job-url-panel-count">
              {visitedTotal === 0 ? '0' : `${visited.length} / ${visitedTotal}`}
            </span>
          </h4>
          <ul className="job-url-list">
            {visited.map(row => (
              <li key={row.url} className="job-url-row">
                <a href={row.url} target="_blank" rel="noreferrer" className="job-url-link">
                  {row.url}
                </a>
                <span className="job-url-meta">
                  d{row.depth} · {formatTs(row.at)}
                </span>
              </li>
            ))}
          </ul>
          {visited.length < visitedTotal && (
            <button
              type="button"
              className="btn btn-secondary btn-sm job-url-more"
              disabled={loadingMoreV}
              onClick={() => void loadMoreVisited()}
            >
              {loadingMoreV ? 'Yükleniyor…' : 'Daha fazla göster'}
            </button>
          )}
        </section>
        <section className="job-url-panel">
          <h4 className="job-url-panel-title">
            Kuyrukta bekleyenler
            <span className="job-url-panel-count">
              {queueTotal === 0 ? '0' : `${queue.length} / ${queueTotal}`}
            </span>
          </h4>
          <ul className="job-url-list">
            {queue.map(row => (
              <li key={`${row.url}-${row.at}`} className="job-url-row">
                <span className="job-url-text">{row.url}</span>
                <span className="job-url-meta">
                  d{row.depth} · sıraya alındı {formatTs(row.at)}
                </span>
              </li>
            ))}
          </ul>
          {queue.length < queueTotal && (
            <button
              type="button"
              className="btn btn-secondary btn-sm job-url-more"
              disabled={loadingMoreQ}
              onClick={() => void loadMoreQueue()}
            >
              {loadingMoreQ ? 'Yükleniyor…' : 'Daha fazla göster'}
            </button>
          )}
        </section>
      </div>
    </div>
  );
}
