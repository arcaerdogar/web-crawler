import request from 'supertest';
import { app } from '../src/server.js';
import db from '../src/db.js';

function cleanDb() {
  db.prepare('DELETE FROM word_index').run();
  db.prepare('DELETE FROM crawl_jobs').run();
  db.prepare('DELETE FROM url_queue').run();
  db.prepare('DELETE FROM visited_urls').run();
}

beforeEach(() => {
  cleanDb();
});

afterAll(() => {
  db.close();
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

  it('returns 400 when maxDepth is below 1', async () => {
    const res = await request(app)
      .post('/api/index')
      .send({ url: 'https://example.com', maxDepth: 0 });

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

    const row = db.prepare('SELECT * FROM crawl_jobs WHERE job_id = ?').get(res.body.jobId) as Record<string, unknown>;
    expect(row).toBeDefined();
    expect(row['origin_url']).toBe('https://example.com');
    expect(row['status']).toBe('running');

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
    db.prepare(
      'INSERT INTO crawl_jobs (job_id, origin_url, max_depth, status, pages_crawled, pages_queued, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run('job_a', 'https://a.com', 2, 'completed', 10, 0, 1000);

    db.prepare(
      'INSERT INTO crawl_jobs (job_id, origin_url, max_depth, status, pages_crawled, pages_queued, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run('job_b', 'https://b.com', 3, 'running', 5, 20, 2000);

    const res = await request(app).get('/api/jobs');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].jobId).toBe('job_b');
    expect(res.body[1].jobId).toBe('job_a');
  });

  it('returns properly mapped camelCase fields', async () => {
    db.prepare(
      'INSERT INTO crawl_jobs (job_id, origin_url, max_depth, status, pages_crawled, pages_queued, created_at, finished_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run('job_map', 'https://test.com', 5, 'completed', 42, 0, 1234567890, 1234567999);

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
  });
});

describe('GET /api/jobs/:jobId', () => {
  it('returns 404 when job does not exist', async () => {
    const res = await request(app).get('/api/jobs/missing_job_xyz');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });

  it('returns job detail with stats fields from database', async () => {
    db.prepare(
      'INSERT INTO crawl_jobs (job_id, origin_url, max_depth, status, pages_crawled, pages_queued, created_at, finished_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run('job_detail', 'https://detail.com', 3, 'interrupted', 7, 12, 111, 222);

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
  });
});

describe('DELETE /api/jobs/:jobId', () => {
  it('returns ok for existing job', async () => {
    db.prepare(
      'INSERT INTO crawl_jobs (job_id, origin_url, max_depth, status, pages_crawled, pages_queued, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run('del_job', 'https://example.com', 2, 'running', 0, 0, Date.now());

    const res = await request(app).delete('/api/jobs/del_job');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('marks non-engine job as interrupted in database', async () => {
    db.prepare(
      'INSERT INTO crawl_jobs (job_id, origin_url, max_depth, status, pages_crawled, pages_queued, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run('del_job2', 'https://example.com', 2, 'running', 0, 0, Date.now());

    await request(app).delete('/api/jobs/del_job2');

    const row = db.prepare('SELECT status FROM crawl_jobs WHERE job_id = ?').get('del_job2') as Record<string, unknown>;
    expect(row['status']).toBe('interrupted');
  });

  it('returns ok even for non-existent job', async () => {
    const res = await request(app).delete('/api/jobs/nonexistent');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});

describe('GET /api/search', () => {
  beforeEach(() => {
    db.prepare(
      'INSERT OR REPLACE INTO word_index (word, url, origin_url, depth, frequency) VALUES (?, ?, ?, ?, ?)'
    ).run('typescript', 'https://example.com/ts', 'https://example.com', 0, 10);
    db.prepare(
      'INSERT OR REPLACE INTO word_index (word, url, origin_url, depth, frequency) VALUES (?, ?, ?, ?, ?)'
    ).run('javascript', 'https://example.com/js', 'https://example.com', 1, 5);
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
