import { useRef, useEffect, useState, useCallback } from 'react';
import { useCrawlerSSE } from '../hooks/useCrawlerSSE.ts';
import { stopJob, restartJob, getJob, deleteJob } from '../api/client.ts';
import { JobUrlLists } from './JobUrlLists.tsx';
import type { CrawlJob, CrawlStats, CrawlScope, JobDetail } from '../types.ts';

function crawlScopeLabel(s: CrawlScope): string {
  switch (s) {
    case 'hostname':
      return 'yalnızca hostname';
    case 'unrestricted':
      return 'kısıtsız (tüm http/https linkler)';
    default:
      return 'aynı kök domain (alt alan adları dahil)';
  }
}

interface Props {
  jobId: string;
  job: CrawlJob | null;
}

function toCrawlStats(j: CrawlJob | JobDetail): CrawlStats {
  const d = 'maxQueueSize' in j ? j : null;
  return {
    jobId: j.jobId,
    status: j.status,
    pagesCrawled: j.pagesCrawled,
    pagesQueued: j.pagesQueued,
    maxQueueSize: d?.maxQueueSize ?? 1000,
    currentDepth: d?.currentDepth ?? 0,
    backPressure: d?.backPressure ?? false,
    rps: d?.rps ?? 0,
    droppedUrls: d?.droppedUrls ?? 0,
  };
}

export function CrawlerDashboard({ jobId, job }: Props) {
  const [listDbTotals, setListDbTotals] = useState<{
    visited: number;
    queued: number;
  } | null>(null);
  const [urlListRefreshKey, setUrlListRefreshKey] = useState(0);
  const [resumed, setResumed] = useState(false);
  const [stopped, setStopped] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [detail, setDetail] = useState<JobDetail | null>(null);
  /** False until first GET /jobs/:id for this jobId settles (skipped when parent passes seed `job`). */
  const [detailHydrated, setDetailHydrated] = useState(() => job != null);

  useEffect(() => {
    setDetailHydrated(job != null);
    setDetail(null);
    setListDbTotals(null);
  }, [jobId, job]);

  useEffect(() => {
    if (urlListRefreshKey === 0) return;
    setListDbTotals(null);
  }, [urlListRefreshKey]);

  const refreshDetail = useCallback(() => {
    return getJob(jobId)
      .then(setDetail)
      .catch(() => setDetail(null))
      .finally(() => setDetailHydrated(true));
  }, [jobId]);

  useEffect(() => {
    refreshDetail();
  }, [refreshDetail]);

  const base = detail ?? job;
  /** Stop sonrası SSE kapat; tamamlanınca API'den status güncellenene kadar açık kalabilir */
  const streamActive =
    !stopped &&
    base?.status !== 'deleted' &&
    (resumed || base == null || base.status === 'running');
  const { stats, logs, done } = useCrawlerSSE(jobId, streamActive);
  const logRef = useRef<HTMLDivElement>(null);

  const viewingLiveLogs = streamActive;

  useEffect(() => {
    if (done) {
      setResumed(false);
      refreshDetail();
      setUrlListRefreshKey(k => k + 1);
    }
  }, [done, refreshDetail]);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs]);

  const handleStop = async () => {
    await stopJob(jobId);
    setStopped(true);
    setResumed(false);
    refreshDetail();
    setUrlListRefreshKey(k => k + 1);
  };

  const handleRestart = async () => {
    setRestarting(true);
    try {
      await restartJob(jobId);
      setStopped(false);
      setResumed(true);
      refreshDetail();
    } catch {
      // keep current state
    } finally {
      setRestarting(false);
    }
  };

  const handleSoftDelete = async () => {
    if (!window.confirm('Remove this job from the active list? Crawl history in search stays.')) return;
    setDeleting(true);
    try {
      await deleteJob(jobId);
      refreshDetail();
    } catch {
      // ignore
    } finally {
      setDeleting(false);
    }
  };

  const finished = (done || stopped || (base != null && base.status !== 'running')) && !resumed;
  const jobActive = base?.isActive !== false;
  const canRestart = finished && !restarting && jobActive;

  const statusLabel = (() => {
    if (base?.status === 'deleted') return 'deleted';
    if (resumed && !done) return 'running';
    if (stopped) return 'Stopped';
    if (base?.status === 'interrupted') return 'Interrupted';
    if (done) return 'Completed';
    return base?.status ?? 'running';
  })();

  if (!detailHydrated && job == null) {
    return (
      <div className="dashboard">
        <div className="job-list-loading dashboard-loading" role="status" aria-live="polite">
          <span className="job-list-spinner" aria-hidden />
          <span>Loading job details…</span>
        </div>
      </div>
    );
  }

  const rawDisplayStats = (() => {
    if (base?.status === 'deleted' || detail?.status === 'deleted') {
      const src = detail ?? base;
      return src ? toCrawlStats(src as JobDetail) : null;
    }
    if (stopped) {
      if (detail?.status === 'interrupted') return toCrawlStats(detail);
      const snap = stats ?? (base ? toCrawlStats(base) : null);
      return snap ? { ...snap, status: 'interrupted' as const } : null;
    }
    if (done && stats) return stats;
    return stats ?? (base ? toCrawlStats(base) : null);
  })();

  const displayStats =
    rawDisplayStats && listDbTotals
      ? {
          ...rawDisplayStats,
          pagesCrawled: listDbTotals.visited,
          pagesQueued: listDbTotals.queued,
        }
      : rawDisplayStats;

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <div className="dashboard-title">
          <h2>Job: {jobId}</h2>
          {base && (
            <>
              <p className="dashboard-url">{base.originUrl}</p>
              <p className="dashboard-meta">
                Tarama kapsamı: {crawlScopeLabel(base.crawlScope)}
              </p>
            </>
          )}
        </div>
        <div className="dashboard-actions">
          {viewingLiveLogs && !finished && jobActive && (
            <button className="btn btn-danger" onClick={handleStop}>Stop Crawl</button>
          )}
          {(finished || base?.status === 'deleted') && (
            <>
              <span className={`badge badge-${statusLabel.toLowerCase()}`}>{statusLabel}</span>
              {canRestart && (
                <button className="btn btn-primary" onClick={handleRestart}>
                  Resume
                </button>
              )}
            </>
          )}
          {jobActive && (
            <button
              type="button"
              className="btn btn-secondary"
              disabled={deleting}
              onClick={handleSoftDelete}
            >
              {deleting ? 'Removing…' : 'Remove from list'}
            </button>
          )}
        </div>
      </div>

      {displayStats && (
        <div className="stats-grid">
          <div className="stat-card">
            <span className="stat-label">Pages Crawled</span>
            <span className="stat-value">{displayStats.pagesCrawled}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Queue Depth</span>
            <span className="stat-value">{displayStats.pagesQueued}</span>
            <div className="queue-bar">
              <div
                className={`queue-bar-fill ${displayStats.backPressure ? 'back-pressure' : ''}`}
                style={{ width: `${Math.min(100, (displayStats.pagesQueued / displayStats.maxQueueSize) * 100)}%` }}
              />
            </div>
          </div>
          <div className="stat-card">
            <span className="stat-label">Requests/sec</span>
            <span className="stat-value">{displayStats.rps}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Current Depth</span>
            <span className="stat-value">{displayStats.currentDepth}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Dropped URLs</span>
            <span className="stat-value">{displayStats.droppedUrls}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Status</span>
            <span className={`badge badge-${displayStats.status}`}>{displayStats.status}</span>
          </div>
        </div>
      )}

      {base && (
        <JobUrlLists
          jobId={jobId}
          live={viewingLiveLogs && base.status !== 'deleted'}
          refreshKey={urlListRefreshKey}
          onTotalsChange={setListDbTotals}
        />
      )}

      {viewingLiveLogs && (
        <div className="log-panel">
          <h3>Logs</h3>
          <div className="log-container" ref={logRef}>
            {logs.length === 0 && <p className="log-empty">Waiting for log messages...</p>}
            {logs.map((msg, i) => (
              <div key={i} className="log-entry">{msg}</div>
            ))}
          </div>
        </div>
      )}

      {!viewingLiveLogs && (
        <div className="log-panel">
          <p className="log-empty">Logs are only available for running jobs.</p>
        </div>
      )}
    </div>
  );
}
