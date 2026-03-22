import { useState, useEffect } from 'react';
import { getJobs } from '../api/client.ts';
import { CrawlerDashboard } from './CrawlerDashboard.tsx';
import type { CrawlJob } from '../types.ts';

interface Props {
  focusJobId: string | null;
  onFocusConsumed: () => void;
}

export function JobList({ focusJobId, onFocusConsumed }: Props) {
  const [jobs, setJobs] = useState<CrawlJob[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  useEffect(() => {
    if (focusJobId) {
      setSelectedJobId(focusJobId);
      onFocusConsumed();
    }
  }, [focusJobId, onFocusConsumed]);

  useEffect(() => {
    const fetchJobs = () => {
      getJobs().then(setJobs).catch(() => {});
    };
    fetchJobs();
    const interval = setInterval(fetchJobs, 5000);
    return () => clearInterval(interval);
  }, []);

  const formatDate = (epoch: number) => new Date(epoch).toLocaleString();

  if (selectedJobId) {
    const job = jobs.find(j => j.jobId === selectedJobId);
    return (
      <div className="job-detail-view">
        <button className="btn btn-secondary back-btn" onClick={() => setSelectedJobId(null)}>
          &larr; Back to Jobs
        </button>
        <CrawlerDashboard jobId={selectedJobId} job={job ?? null} />
      </div>
    );
  }

  return (
    <div className="job-list">
      <h2>Crawl Jobs</h2>
      {jobs.length === 0 ? (
        <p className="empty-state">No crawl jobs yet. Start one from the Crawler tab.</p>
      ) : (
        <table className="jobs-table">
          <thead>
            <tr>
              <th>Job ID</th>
              <th>Origin URL</th>
              <th>Status</th>
              <th>Pages</th>
              <th>Started</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map(job => (
              <tr key={job.jobId} onClick={() => setSelectedJobId(job.jobId)} className="job-row">
                <td className="job-id">{job.jobId.slice(0, 16)}...</td>
                <td className="job-url">{job.originUrl}</td>
                <td>
                  <span className={`badge badge-${job.status}`}>{job.status}</span>
                </td>
                <td>{job.pagesCrawled}</td>
                <td>{formatDate(job.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
