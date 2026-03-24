import { useState, useEffect, type MouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { getJobs, deleteJob } from '../api/client.ts';
import type { CrawlJob } from '../types.ts';

function JobsTable({
  jobs,
  showRemove,
  onSelect,
  onRemove,
}: {
  jobs: CrawlJob[];
  showRemove: boolean;
  onSelect: (id: string) => void;
  onRemove: (e: MouseEvent, id: string) => void;
}) {
  const formatDate = (epoch: number) => new Date(epoch).toLocaleString();

  return (
    <table className="jobs-table">
      <thead>
        <tr>
          <th>Job ID</th>
          <th>Origin URL</th>
          <th>Status</th>
          <th>Pages</th>
          <th>Started</th>
          {showRemove && <th></th>}
        </tr>
      </thead>
      <tbody>
        {jobs.map(job => (
          <tr key={job.jobId} onClick={() => onSelect(job.jobId)} className="job-row">
            <td className="job-id">{job.jobId.slice(0, 16)}...</td>
            <td className="job-url">{job.originUrl}</td>
            <td>
              <span className={`badge badge-${job.status}`}>{job.status}</span>
            </td>
            <td>{job.pagesCrawled}</td>
            <td>{formatDate(job.createdAt)}</td>
            {showRemove && (
              <td>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={e => onRemove(e, job.jobId)}
                >
                  Remove
                </button>
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function JobList() {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<CrawlJob[]>([]);
  const [showDeleted, setShowDeleted] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchJobs = (isInitial: boolean) => {
      getJobs()
        .then(data => {
          if (cancelled) return;
          setJobs(data);
          setLoadError(null);
        })
        .catch(() => {
          if (cancelled) return;
          if (isInitial) setLoadError('Jobs could not be loaded.');
        })
        .finally(() => {
          if (!cancelled && isInitial) setInitialLoad(false);
        });
    };
    fetchJobs(true);
    const interval = setInterval(() => fetchJobs(false), 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const handleRemove = (e: MouseEvent, id: string) => {
    e.stopPropagation();
    if (!window.confirm('Remove this job from the list?')) return;
    deleteJob(id).then(() => getJobs().then(setJobs)).catch(() => {});
  };

  const activeJobs = jobs.filter(j => j.isActive);
  const deletedJobs = jobs.filter(j => !j.isActive);

  if (initialLoad) {
    return (
      <div className="job-list">
        <h2>Crawl Jobs</h2>
        <div className="job-list-loading" role="status" aria-live="polite">
          <span className="job-list-spinner" aria-hidden />
          <span>Loading jobs…</span>
        </div>
      </div>
    );
  }

  if (loadError && jobs.length === 0) {
    return (
      <div className="job-list">
        <h2>Crawl Jobs</h2>
        <p className="empty-state">{loadError}</p>
        <p className="empty-state subtle">If a crawl is running, the server may be busy writing to the database; try again in a moment.</p>
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <div className="job-list">
        <h2>Crawl Jobs</h2>
        <p className="empty-state">No crawl jobs yet. Start one from the Crawler tab.</p>
      </div>
    );
  }

  return (
    <div className="job-list">
      <h2>Crawl Jobs</h2>

      <section className="job-section">
        <h3 className="job-section-title">Active jobs</h3>
        {activeJobs.length === 0 ? (
          <p className="empty-state subtle">No active jobs.</p>
        ) : (
          <JobsTable
            jobs={activeJobs}
            showRemove
            onSelect={id => navigate(`/jobs/${id}`)}
            onRemove={handleRemove}
          />
        )}
      </section>

      {deletedJobs.length > 0 && (
        <div className="job-deleted-toggle">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setShowDeleted(v => !v)}
            aria-expanded={showDeleted}
          >
            {showDeleted
              ? 'Hide deleted jobs'
              : `Show deleted jobs (${deletedJobs.length})`}
          </button>
        </div>
      )}

      {showDeleted && deletedJobs.length > 0 && (
        <section className="job-section job-section-deleted">
          <h3 className="job-section-title">Deleted jobs</h3>
          <p className="job-section-hint">Removed from the active list; search index data is kept.</p>
          <JobsTable
            jobs={deletedJobs}
            showRemove={false}
            onSelect={id => navigate(`/jobs/${id}`)}
            onRemove={handleRemove}
          />
        </section>
      )}
    </div>
  );
}
