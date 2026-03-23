import request from 'supertest';
import { app } from '../src/server.js';
import { closeDb, crawlJobsRepo, resetAllTables, wordIndexRepo } from '../src/db/index.js';

beforeEach(() => {
  resetAllTables();
});

afterAll(() => {
  closeDb();
});

describe('POST /api/index', () => {
  it('returns 201 with jobId for valid request', async () => {
    const res = await request(app)
      .post('/api/index')
      .send({ url: 'https://example.com', maxDepth: 1, rateLimit: 5, maxQueueSize: 100, workerCount: 1 });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('jobId');
    expect(typeof res.body.jobId).toBe('string');

    await request(app).delete(`/api/jobs/${res.body.jobId}`);
  });

  it('returns 400 when url is missing', async () => {
    const res = await request(app)
      .post('/api/index')
      .send({ maxDepth: 2 });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 400 for invalid url', async () => {
    const res = await request(app)
      .post('/api/index')
      .send({ url: 'not-a-url' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('valid URL');
  });

  it('returns 201 when maxDepth is 0', async () => {
    const res = await request(app)
      .post('/api/index')
      .send({
        url: 'https://example.com',
        maxDepth: 0,
        rateLimit: 5,
        maxQueueSize: 100,
        workerCount: 1,
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('jobId');
    await request(app).delete(`/api/jobs/${res.body.jobId}`);
  });

  it('returns 400 when maxDepth is negative', async () => {
    const res = await request(app)
      .post('/api/index')
      .send({ url: 'https://example.com', maxDepth: -1 });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('maxDepth');
  });

  it('returns 400 when maxDepth exceeds 10', async () => {
    const res = await request(app)
      .post('/api/index')
      .send({ url: 'https://example.com', maxDepth: 11 });

    expect(res.status).toBe(400);
  });

  it('returns 400 when rateLimit is out of range', async () => {
    const res = await request(app)
      .post('/api/index')
      .send({ url: 'https://example.com', rateLimit: 0 });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('rateLimit');
  });

  it('returns 400 when rateLimit exceeds 20', async () => {
    const res = await request(app)
      .post('/api/index')
      .send({ url: 'https://example.com', rateLimit: 21 });

    expect(res.status).toBe(400);
  });

  it('returns 400 when maxQueueSize is below 100', async () => {
    const res = await request(app)
      .post('/api/index')
      .send({ url: 'https://example.com', maxQueueSize: 50 });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('maxQueueSize');
  });

  it('returns 400 when maxQueueSize exceeds 5000', async () => {
    const res = await request(app)
      .post('/api/index')
      .send({ url: 'https://example.com', maxQueueSize: 6000 });

    expect(res.status).toBe(400);
  });

  it('returns 400 when workerCount is out of range', async () => {
    const res = await request(app)
      .post('/api/index')
      .send({ url: 'https://example.com', workerCount: 0 });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('workerCount');
  });

  it('returns 400 when workerCount exceeds 8', async () => {
    const res = await request(app)
      .post('/api/index')
      .send({ url: 'https://example.com', workerCount: 9 });

    expect(res.status).toBe(400);
  });

  it('uses default values when optional fields are omitted', async () => {
    const res = await request(app)
      .post('/api/index')
      .send({ url: 'https://example.com' });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('jobId');

    await request(app).delete(`/api/jobs/${res.body.jobId}`);
  });

  it('creates a job record in the database', async () => {
    const res = await request(app)
      .post('/api/index')
      .send({ url: 'https://example.com', maxDepth: 1, workerCount: 1 });

    const row = crawlJobsRepo.findCrawlJobById(res.body.jobId);
    expect(row).toBeDefined();
    expect(row!.origin_url).toBe('https://example.com');
    expect(row!.status).toBe('running');

    await request(app).delete(`/api/jobs/${res.body.jobId}`);
  });
});

describe('GET /api/jobs', () => {
  it('returns empty array when no jobs exist', async () => {
    const res = await request(app).get('/api/jobs');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns jobs ordered by created_at DESC', async () => {
    crawlJobsRepo.insertCrawlJobSeed({
      jobId: 'job_a',
      originUrl: 'https://a.com',
      maxDepth: 2,
      status: 'completed',
      pagesCrawled: 10,
      pagesQueued: 0,
      createdAt: 1000,
    });

    crawlJobsRepo.insertCrawlJobSeed({
      jobId: 'job_b',
      originUrl: 'https://b.com',
      maxDepth: 3,
      status: 'running',
      pagesCrawled: 5,
      pagesQueued: 20,
      createdAt: 2000,
    });

    const res = await request(app).get('/api/jobs');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].jobId).toBe('job_b');
    expect(res.body[1].jobId).toBe('job_a');
  });

  it('returns properly mapped camelCase fields', async () => {
    crawlJobsRepo.insertCrawlJobSeedWithFinishedAt({
      jobId: 'job_map',
      originUrl: 'https://test.com',
      maxDepth: 5,
      status: 'completed',
      pagesCrawled: 42,
      pagesQueued: 0,
      createdAt: 1234567890,
      finishedAt: 1234567999,
    });

    const res = await request(app).get('/api/jobs');
    const job = res.body[0];

    expect(job).toHaveProperty('jobId', 'job_map');
    expect(job).toHaveProperty('originUrl', 'https://test.com');
    expect(job).toHaveProperty('maxDepth', 5);
    expect(job).toHaveProperty('status', 'completed');
    expect(job).toHaveProperty('pagesCrawled', 42);
    expect(job).toHaveProperty('pagesQueued', 0);
    expect(job).toHaveProperty('createdAt', 1234567890);
    expect(job).toHaveProperty('finishedAt', 1234567999);
    expect(job).toHaveProperty('isActive', true);
  });
});

describe('GET /api/jobs/:jobId', () => {
  it('returns 404 when job does not exist', async () => {
    const res = await request(app).get('/api/jobs/missing_job_xyz');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });

  it('returns job detail with stats fields from database', async () => {
    crawlJobsRepo.insertCrawlJobSeedWithFinishedAt({
      jobId: 'job_detail',
      originUrl: 'https://detail.com',
      maxDepth: 3,
      status: 'interrupted',
      pagesCrawled: 7,
      pagesQueued: 12,
      createdAt: 111,
      finishedAt: 222,
    });

    const res = await request(app).get('/api/jobs/job_detail');

    expect(res.status).toBe(200);
    expect(res.body.jobId).toBe('job_detail');
    expect(res.body.originUrl).toBe('https://detail.com');
    expect(res.body.maxDepth).toBe(3);
    expect(res.body.status).toBe('interrupted');
    expect(res.body.pagesCrawled).toBe(7);
    expect(res.body.pagesQueued).toBe(12);
    expect(res.body.createdAt).toBe(111);
    expect(res.body.finishedAt).toBe(222);
    expect(res.body.maxQueueSize).toBe(1000);
    expect(res.body.currentDepth).toBe(0);
    expect(res.body.backPressure).toBe(false);
    expect(res.body.rps).toBe(0);
    expect(res.body.droppedUrls).toBe(0);
    expect(res.body.isActive).toBe(true);
  });
});

describe('POST /api/jobs/:jobId/stop', () => {
  it('returns 404 when job does not exist', async () => {
    const res = await request(app).post('/api/jobs/missing/stop');
    expect(res.status).toBe(404);
  });

  it('marks running seed job interrupted without removing from list', async () => {
    crawlJobsRepo.insertCrawlJobSeed({
      jobId: 'stop_me',
      originUrl: 'https://example.com',
      maxDepth: 1,
      status: 'running',
      pagesCrawled: 0,
      pagesQueued: 2,
      createdAt: Date.now(),
    });

    const res = await request(app).post('/api/jobs/stop_me/stop');
    expect(res.status).toBe(200);
    const row = crawlJobsRepo.findCrawlJobById('stop_me');
    expect(row?.status).toBe('interrupted');
    expect(row?.is_active).toBe(1);
  });
});

describe('DELETE /api/jobs/:jobId', () => {
  it('returns ok for existing job', async () => {
    crawlJobsRepo.insertCrawlJobSeed({
      jobId: 'del_job',
      originUrl: 'https://example.com',
      maxDepth: 2,
      status: 'running',
      pagesCrawled: 0,
      pagesQueued: 0,
      createdAt: Date.now(),
    });

    const res = await request(app).delete('/api/jobs/del_job');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('soft-deletes job: interrupted if was running, is_active 0', async () => {
    crawlJobsRepo.insertCrawlJobSeed({
      jobId: 'del_job2',
      originUrl: 'https://example.com',
      maxDepth: 2,
      status: 'running',
      pagesCrawled: 0,
      pagesQueued: 0,
      createdAt: Date.now(),
    });

    await request(app).delete('/api/jobs/del_job2');

    const row = crawlJobsRepo.findCrawlJobById('del_job2');
    expect(row?.status).toBe('interrupted');
    expect(row?.is_active).toBe(0);
  });

  it('returns 404 for non-existent job', async () => {
    const res = await request(app).delete('/api/jobs/nonexistent');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });

  it('GET /api/jobs still returns soft-deleted job with isActive false', async () => {
    crawlJobsRepo.insertCrawlJobSeed({
      jobId: 'soft_del',
      originUrl: 'https://x.com',
      maxDepth: 1,
      status: 'completed',
      pagesCrawled: 1,
      pagesQueued: 0,
      createdAt: 1,
    });
    await request(app).delete('/api/jobs/soft_del');
    const list = await request(app).get('/api/jobs');
    const j = list.body.find((x: { jobId: string }) => x.jobId === 'soft_del');
    expect(j).toBeDefined();
    expect(j.isActive).toBe(false);
  });
});

describe('GET /api/search', () => {
  beforeEach(() => {
    wordIndexRepo.upsertWordIndexEntry({
      word: 'typescript',
      url: 'https://example.com/ts',
      originUrl: 'https://example.com',
      depth: 0,
      frequency: 10,
    });
    wordIndexRepo.upsertWordIndexEntry({
      word: 'javascript',
      url: 'https://example.com/js',
      originUrl: 'https://example.com',
      depth: 1,
      frequency: 5,
    });
  });

  it('returns search results for valid query', async () => {
    const res = await request(app).get('/api/search?q=typescript');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('query', 'typescript');
    expect(res.body.results).toHaveLength(1);
    expect(res.body.results[0].relevantUrl).toBe('https://example.com/ts');
  });

  it('returns 400 when q parameter is missing', async () => {
    const res = await request(app).get('/api/search');
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 400 when q is empty', async () => {
    const res = await request(app).get('/api/search?q=');
    expect(res.status).toBe(400);
  });

  it('respects limit and offset parameters', async () => {
    const res = await request(app).get('/api/search?q=typescript&limit=1&offset=0');
    expect(res.status).toBe(200);
    expect(res.body.limit).toBe(1);
    expect(res.body.offset).toBe(0);
  });

  it('caps limit at 100', async () => {
    const res = await request(app).get('/api/search?q=typescript&limit=999');
    expect(res.body.limit).toBe(100);
  });

  it('defaults limit to 20 and offset to 0', async () => {
    const res = await request(app).get('/api/search?q=typescript');
    expect(res.body.limit).toBe(20);
    expect(res.body.offset).toBe(0);
  });

  it('returns empty results for non-matching query', async () => {
    const res = await request(app).get('/api/search?q=nonexistent');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
    expect(res.body.results).toHaveLength(0);
  });
});

describe('GET /api/status/:jobId (SSE)', () => {
  it('returns correct SSE headers', (done) => {
    const server = app.listen(0, () => {
      const addr = server.address() as { port: number };
      const http = require('node:http');
      const req = http.get(`http://127.0.0.1:${addr.port}/api/status/test_sse`, (res: { headers: Record<string, string>; destroy: () => void }) => {
        expect(res.headers['content-type']).toBe('text/event-stream');
        expect(res.headers['cache-control']).toBe('no-cache');
        expect(res.headers['connection']).toBe('keep-alive');
        res.destroy();
        req.destroy();
        server.close(done);
      });
    });
  });
});

describe('CORS', () => {
  it('sets CORS headers on responses', async () => {
    const res = await request(app).get('/api/jobs');
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });

  it('handles preflight OPTIONS request', async () => {
    const res = await request(app).options('/api/index');
    expect(res.status).toBe(204);
  });
});
