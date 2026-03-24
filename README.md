# Web Crawler & Search Engine

A functional web crawler and real-time search engine built with TypeScript. The system crawls web pages recursively from a starting URL, builds an inverted index of words, and allows searching the index even while crawling is in progress.

## Tech Stack

- **Backend:** Node.js 18+, Express.js, SQLite (better-sqlite3), Worker Threads
- **Frontend:** React 18, TypeScript, Vite
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

```bash
# Build backend
cd backend
npm run build

# Build frontend
cd ../frontend
npm run build

# Start backend (serves API)
cd ../backend
npm start
```

## Architecture

### Backend

- **server.ts** - Express API server with REST endpoints and SSE streaming
- **crawler.ts** - CrawlerEngine class coordinating worker threads
- **worker.ts** - Worker thread for fetching and parsing web pages
- **search.ts** - SearchEngine class for querying the inverted index
- **db.ts** - SQLite database setup with WAL mode
- **rateLimiter.ts** - Request rate limiting
- **normalizeUrl.ts** - URL normalization and deduplication

### Frontend

- **CrawlerForm** - Start new crawl jobs with configurable parameters
- **CrawlerDashboard** - Real-time monitoring via SSE (pages crawled, queue depth, RPS)
- **SearchPanel** - Search the index with debounced input and pagination
- **JobList** - View and manage all crawl jobs

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/index | Start a new crawl job |
| GET | /api/jobs | List all jobs (includes `isActive`; soft-deleted stay visible) |
| GET | /api/jobs/:jobId | Job detail + live stats when running |
| POST | /api/jobs/:jobId/stop | Stop crawl (`interrupted`); **keeps** URL queue for resume |
| DELETE | /api/jobs/:jobId | Soft delete (`is_active=0`); **clears** queue; `visited_urls` / `word_index` unchanged |
| POST | /api/jobs/:jobId/restart | Resume interrupted job from DB queue + per-job visited |
| GET | /api/status/:jobId | SSE stream for real-time stats |
| GET | /api/search?q=&limit=&offset= | Search the index |

## Features

- Concurrent crawling with configurable worker threads (1-8)
- Rate limiting (1-20 HTTP fetches per second total across all workers, not per worker)
- Back pressure mechanism with configurable queue size
- Real-time progress monitoring via Server-Sent Events
- Search works concurrently during indexing (SQLite WAL mode)
- Crash recovery: jobs still `running` resume automatically on server start (same code path as POST restart)
- Per-job `visited_urls` and `url_queue` primary keys include `job_id` (same URL may appear in different jobs’ queues)
- Same-domain only crawling with URL normalization

## Observations

Implementation and behavior notes that are easy to miss from the UI alone.

### URL deduplication

Within a **single crawl job**, each normalized URL is crawled at most once: the engine keeps an in-memory visited set and avoids enqueueing duplicates.

**Across different jobs**, a URL is not fetched again if it appears in `visited_urls` with a `crawled_at` timestamp within the last **10 minutes** (checked after the in-job `visited` check when enqueueing links and again before dispatching a queued URL). After that window, the page may be crawled again and the row is updated. Older duplicate network work for the same URL within the TTL window is therefore avoided.
