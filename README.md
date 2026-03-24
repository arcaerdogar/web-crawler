# Web Crawler & Search Engine

A functional web crawler and real-time search engine built with TypeScript. The system crawls web pages recursively from a starting URL, builds an inverted index of words, and allows searching the index even while crawling is in progress.

**Repository:** [github.com/arcaerdogar/web-crawler](https://github.com/arcaerdogar/web-crawler)

## Tech Stack

- **Backend:** Node.js 18+, Express.js, SQLite (better-sqlite3), Worker Threads
- **Frontend:** React 19, TypeScript, Vite, React Router
- **Validation:** Zod (request bodies and query params)
- **Database:** SQLite with WAL mode for concurrent read/write

## Getting Started

### Prerequisites

- Node.js 18 or higher
- npm

### Installation

```bash
# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

### Development

Start both servers in separate terminals:

```bash
# Terminal 1 - Backend (port 3001)
cd backend
npm run dev

# Terminal 2 - Frontend (port 5173)
cd frontend
npm run dev
```

Open http://localhost:5173 in your browser.

### Production

The API server does **not** serve the built SPA; run the backend and frontend separately (or put both behind a reverse proxy).

```bash
# Build and start backend (API on port 3001)
cd backend
npm run build
npm start

# Build frontend, then preview or host `frontend/dist` as static files
cd ../frontend
npm run build
npm run preview   # serves SPA only; /api calls need same-origin proxy or CORS changes (dev uses Vite proxy in vite.config.ts)
```

Optional: set **`DATABASE_PATH`** to choose where SQLite stores data (defaults to `backend/crawler.db` relative to the process working directory).

## Architecture

### Backend

- **server.ts** — Express app: routes, CORS, startup resume of `running` jobs
- **controllers.ts** — HTTP handlers (jobs, search, SSE, URL lists)
- **validation.ts** / **validationMiddleware.ts** — Zod schemas for bodies and queries
- **crawler.ts** — `CrawlerEngine`: queue, workers, rate limit, persistence hooks
- **worker.ts** — Worker thread: HTTP(S) fetch, link extraction, word frequencies
- **jobResume.ts** / **crawlRuntime.ts** — Restart and in-memory engine registry
- **search.ts** — Search over `word_index` via **wordIndexRepo**
- **db/connection.ts** — SQLite open, WAL, migrations, schema
- **db/crawlWritesRepo.ts** — Queue, visited rows, word inserts, paginated URL lists
- **db/crawlJobsRepo.ts** — Job metadata CRUD
- **rateLimiter.ts** — Global request pacing (shared across workers)
- **normalizeUrl.ts** / **crawlScope.ts** — URL normalization and crawl boundary rules
- **parser.ts** — Query tokenization for search

### Frontend

- **CrawlerForm** — Start crawls (`maxDepth`, `rateLimit`, `maxQueueSize`, `workerCount`, **`crawlScope`**)
- **CrawlerDashboard** — Live stats via SSE; **JobUrlLists** for paginated visited / queued URLs
- **SearchPanel** — Debounced search with pagination
- **JobList** — Jobs table; stop, soft-delete, restart

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/index | Start a new crawl job |
| GET | /api/jobs | List all jobs (includes `isActive`; soft-deleted stay visible) |
| GET | /api/jobs/:jobId | Job detail + live stats when running |
| GET | /api/jobs/:jobId/urls | Paginated URLs: query `kind=visited` or `kind=queued`, plus `limit`, `offset` |
| POST | /api/jobs/:jobId/stop | Stop crawl (`interrupted`); **keeps** URL queue for resume |
| DELETE | /api/jobs/:jobId | Soft delete (`is_active=0`); **clears** queue; `visited_urls` / `word_index` unchanged |
| POST | /api/jobs/:jobId/restart | Resume interrupted job from DB queue + per-job visited |
| GET | /api/status/:jobId | SSE stream for real-time stats |
| GET | /api/search | Query params: `q`, `limit`, `offset`, optional `mode=exact` or `prefix` |

## Features

- Concurrent crawling with configurable worker threads (1-8)
- Rate limiting (1-20 HTTP fetches per second total across all workers, not per worker)
- Back pressure mechanism with configurable queue size
- Real-time progress monitoring via Server-Sent Events
- Search works concurrently during indexing (SQLite WAL mode)
- Crash recovery: jobs still `running` resume automatically on server start (same code path as POST restart)
- Per-job `visited_urls` and `url_queue` primary keys include `job_id` (same URL may appear in different jobs’ queues)
- **Crawl scope** (per job, `POST /api/index`): `registrableDomain` (default), `hostname` (single host), or `unrestricted` (any HTTP(S) link within depth/queue limits), with URL normalization and deduplication

## Observations

Implementation and behavior notes that are easy to miss from the UI alone.

### URL deduplication

Within a **single crawl job**, each normalized URL is crawled at most once: the engine keeps an in-memory visited set and avoids enqueueing duplicates.

**Across different jobs**, a URL is not fetched again if it appears in `visited_urls` with a `crawled_at` timestamp within the last **10 minutes** (checked after the in-job `visited` check when enqueueing links and again before dispatching a queued URL). After that window, the page may be crawled again and the row is updated. Older duplicate network work for the same URL within the TTL window is therefore avoided.
