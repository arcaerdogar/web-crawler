import type { StartCrawlRequest, CrawlJob, JobDetail, SearchResponse } from '../types.ts';

const BASE = '/api';

export async function startCrawl(req: StartCrawlRequest): Promise<{ jobId: string }> {
  const res = await fetch(`${BASE}/index`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req)
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error ?? 'Failed to start crawl');
  }
  return res.json();
}

export async function getJobs(): Promise<CrawlJob[]> {
  const res = await fetch(`${BASE}/jobs`);
  if (!res.ok) throw new Error('Failed to fetch jobs');
  return res.json();
}

export async function getJob(jobId: string): Promise<JobDetail> {
  const res = await fetch(`${BASE}/jobs/${encodeURIComponent(jobId)}`);
  if (!res.ok) throw new Error('Failed to fetch job');
  return res.json();
}

export async function stopJob(jobId: string): Promise<void> {
  const res = await fetch(`${BASE}/jobs/${encodeURIComponent(jobId)}/stop`, {
    method: 'POST',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? 'Failed to stop job');
  }
}

/** Soft delete: clears queue, marks job inactive; history kept. */
export async function deleteJob(jobId: string): Promise<void> {
  const res = await fetch(`${BASE}/jobs/${encodeURIComponent(jobId)}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? 'Failed to delete job');
  }
}

export async function restartJob(jobId: string): Promise<{ jobId: string }> {
  const res = await fetch(`${BASE}/jobs/${jobId}/restart`, { method: 'POST' });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error ?? 'Failed to restart job');
  }
  return res.json();
}

export async function search(q: string, limit = 20, offset = 0, mode: 'exact' | 'prefix' = 'exact'): Promise<SearchResponse> {
  const params = new URLSearchParams({ q, limit: String(limit), offset: String(offset), mode });
  const res = await fetch(`${BASE}/search?${params}`);
  if (!res.ok) throw new Error('Failed to search');
  return res.json();
}
