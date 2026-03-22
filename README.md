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
| GET | /api/jobs | List all crawl jobs |
| DELETE | /api/jobs/:jobId | Stop a running crawl |
| GET | /api/status/:jobId | SSE stream for real-time stats |
| GET | /api/search?q=&limit=&offset= | Search the index |

## Features

- Concurrent crawling with configurable worker threads (1-8)
- Rate limiting (1-20 requests/second)
- Back pressure mechanism with configurable queue size
- Real-time progress monitoring via Server-Sent Events
- Search works concurrently during indexing (SQLite WAL mode)
- Job persistence and resume after server restart
- Same-domain only crawling with URL normalization
