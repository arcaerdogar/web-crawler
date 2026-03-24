# Product requirements document — how to read this file

This file is the **original** product requirements document (PRD) as given at project kickoff. Sections **§3–§8**, **§12**, and **§17** in particular describe the target architecture and “out of scope” assumptions **at that time**.

The **current implementation** has diverged in places from this schema and API: multi-job support, crawl scope options, per-job URL listings, and database-backed counters were added later. For runnable code and setup, see **`README.md`**. Rationale for post-PRD behavior is summarized at the **end of this file** in **“Additions after the baseline PRD”**.

---

# Product Requirements Document
## Project: Web Crawler & Search Engine ("Google in a Day")

**Course:** Istanbul Technical University — AI Aided Computer Engineering  
**Language:** TypeScript (Node.js backend + React frontend)  
**Runtime:** Node.js 18+  
**Database:** SQLite (via `better-sqlite3`)  
**UI:** React 18 + TypeScript (Vite, no UI component library — plain CSS)  
**Target:** localhost only

---

## 1. Project Overview

Build a functional web crawler and real-time search engine from scratch using TypeScript. The system has two core capabilities:

- **Indexer:** Given a starting URL and a depth limit `k`, crawl the web recursively and build an inverted index of words found on each page.
- **Searcher:** Given a query string, search the inverted index and return ranked results — even while the crawler is still running.

The system runs entirely on localhost. The backend serves the REST API and SSE stream. The frontend is a React SPA served by Vite in development (proxying `/api` calls to Express), or built statically and served by Express in production.

---

## 2. Technical Constraints

These constraints are non-negotiable and must be respected throughout:

- Use **language-native HTTP** (`node:http` / `node:https`) for all network requests. Do NOT use `axios`, `got`, `node-fetch`, or any other HTTP library.
- Use **regex-based HTML parsing** for link and text extraction. Do NOT use `cheerio`, `jsdom`, or similar libraries.
- Use **Worker Threads** (`node:worker_threads`) for concurrent crawling. Do NOT use `child_process`.
- Use **SQLite** (`better-sqlite3`) for all persistence. No other database.
- Use **Express.js** for the HTTP server and routing only. No other backend frameworks.
- Frontend uses **React 18** with **TypeScript**. No UI component libraries (MUI, Chakra, Ant Design, etc.). Plain CSS only.
- Strict TypeScript: `"strict": true` in both `tsconfig.json` files. No `any` types.

---

## 3. Repository Structure

```
project-root/
├── backend/
│   ├── src/
│   │   ├── server.ts           # Express server, API routes, SSE
│   │   ├── crawler.ts          # CrawlerEngine class (main thread coordinator)
│   │   ├── worker.ts           # Worker thread: fetch + parse
│   │   ├── search.ts           # SearchEngine class
│   │   ├── db.ts               # SQLite setup, WAL mode, schema creation
│   │   ├── rateLimiter.ts      # RateLimiter class
│   │   ├── normalizeUrl.ts     # URL normalization utility
│   │   └── types.ts            # All shared TypeScript interfaces
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── api/
│   │   │   └── client.ts       # Typed fetch() wrappers
│   │   ├── components/
│   │   │   ├── CrawlerForm.tsx
│   │   │   ├── CrawlerDashboard.tsx
│   │   │   ├── SearchPanel.tsx
│   │   │   ├── JobList.tsx
│   │   │   └── StatusStream.tsx
│   │   ├── hooks/
│   │   │   ├── useCrawlerSSE.ts
│   │   │   └── useSearch.ts
│   │   └── types.ts            # Mirrors backend/src/types.ts
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
├── crawler.db                  # Auto-created, gitignored
├── README.md
├── product_prd.md
└── recommendation.md
```

---

## 4. Shared TypeScript Types

Define in `backend/src/types.ts` and mirror in `frontend/src/types.ts`:

```typescript
export interface StartCrawlRequest {
  url: string;
  maxDepth: number;        // 1–10
  rateLimit: number;       // requests per second, 1–20
  maxQueueSize: number;    // 100–5000
  workerCount: number;     // 1–8
}

export interface CrawlJob {
  jobId: string;           // format: `${epochMs}_${threadId}`
  originUrl: string;
  maxDepth: number;
  status: 'running' | 'completed' | 'interrupted';
  pagesCrawled: number;
  pagesQueued: number;
  createdAt: number;       // epoch ms
  finishedAt: number | null;
}

export interface CrawlStats {
  jobId: string;
  status: CrawlJob['status'];
  pagesCrawled: number;
  pagesQueued: number;
  currentDepth: number;
  backPressure: boolean;
  rps: number;
  droppedUrls: number;
}

export interface SearchResult {
  relevantUrl: string;
  originUrl: string;
  depth: number;
  score: number;
}

export interface SearchResponse {
  query: string;
  results: SearchResult[];
  total: number;
  limit: number;
  offset: number;
}

export interface WorkerInput {
  url: string;
  origin: string;
  depth: number;
}

export interface WorkerOutput {
  url: string;
  origin: string;
  depth: number;
  links: string[];
  words: Record<string, number>;
  error: string | null;
}

export type SSEEvent =
  | { type: 'stats'; data: CrawlStats }
  | { type: 'log';   data: { message: string; timestamp: number } }
  | { type: 'done';  data: CrawlStats };
```

---

## 5. Database Schema

File: `backend/src/db.ts`

Open the database, enable WAL mode immediately, then create all tables:

```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS visited_urls (
  url         TEXT PRIMARY KEY,
  origin_url  TEXT NOT NULL,
  depth       INTEGER NOT NULL,
  crawled_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS url_queue (
  url         TEXT PRIMARY KEY,
  origin_url  TEXT NOT NULL,
  depth       INTEGER NOT NULL,
  job_id      TEXT NOT NULL,
  queued_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS word_index (
  word        TEXT NOT NULL,
  url         TEXT NOT NULL,
  origin_url  TEXT NOT NULL,
  depth       INTEGER NOT NULL,
  frequency   INTEGER NOT NULL,
  PRIMARY KEY (word, url)
);

CREATE TABLE IF NOT EXISTS crawl_jobs (
  job_id        TEXT PRIMARY KEY,
  origin_url    TEXT NOT NULL,
  max_depth     INTEGER NOT NULL,
  status        TEXT NOT NULL CHECK(status IN ('running','completed','interrupted')),
  pages_crawled INTEGER NOT NULL DEFAULT 0,
  pages_queued  INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL,
  finished_at   INTEGER
);

CREATE INDEX IF NOT EXISTS idx_word      ON word_index(word);
CREATE INDEX IF NOT EXISTS idx_job_queue ON url_queue(job_id);
```

`better-sqlite3` is fully synchronous — never use `async/await` with it.

Export a single `db` instance used by all modules.

---

## 6. Backend — Crawler Engine

File: `backend/src/crawler.ts`

### CrawlerEngine class interface

```typescript
interface CrawlerConfig extends StartCrawlRequest {
  jobId: string;
}

interface CrawlerCallbacks {
  onStats: (stats: CrawlStats) => void;
  onLog:   (message: string)   => void;
  onDone:  (stats: CrawlStats) => void;
}

class CrawlerEngine {
  constructor(config: CrawlerConfig, callbacks: CrawlerCallbacks)
  async start(): Promise<void>
  stop(): void

  // For resume: allow injecting pre-loaded queue and visited set
  restoreState(queue: WorkerInput[], visited: Set<string>): void
}
```

### Main thread crawl loop

The `start()` method runs this loop. All state (queue, visited set) lives exclusively here.

```
while queue.length > 0 AND not stopped:
  await rateLimiter.wait()

  batch = queue.splice(0, workerCount)  // take up to workerCount items

  results = await Promise.all(batch.map(item => dispatchToWorker(item)))

  for each WorkerOutput result:
    if result.error:
      onLog(`Error crawling ${result.url}: ${result.error}`)
      continue

    visited.add(result.url)
    db.run('DELETE FROM url_queue WHERE url = ?', result.url)
    db.run('INSERT OR IGNORE INTO visited_urls ...', result.url, ...)

    for each link in result.links:
      normalized = normalizeUrl(link, result.origin)
      if normalized is null: continue
      if visited.has(normalized): continue
      if result.depth + 1 > config.maxDepth: continue
      if queue.length >= config.maxQueueSize:
        stats.droppedUrls++
        if not stats.backPressure:
          stats.backPressure = true
          onLog('Back pressure activated — queue full')
        continue
      queue.push({ url: normalized, origin: result.origin, depth: result.depth + 1 })
      db.run('INSERT OR IGNORE INTO url_queue ...', ...)

    if stats.backPressure AND queue.length < config.maxQueueSize * 0.8:
      stats.backPressure = false
      onLog('Back pressure relieved')

    // Batch insert word frequencies
    const insertWord = db.prepare('INSERT OR REPLACE INTO word_index VALUES (?,?,?,?,?)')
    const insertMany = db.transaction((words) => {
      for (const [word, freq] of Object.entries(result.words)) {
        insertWord.run(word, result.url, result.origin, result.depth, freq)
      }
    })
    insertMany(result.words)

    stats.pagesCrawled++
    stats.pagesQueued = queue.length
    stats.currentDepth = result.depth

  onStats({ ...stats })

db.run('UPDATE crawl_jobs SET status=?, finished_at=?, pages_crawled=? WHERE job_id=?',
        'completed', Date.now(), stats.pagesCrawled, config.jobId)
onDone({ ...stats })
```

### Worker dispatch

Workers are spawned once in the constructor (worker pool). `dispatchToWorker` sends a message and returns a Promise that resolves when the worker replies:

```typescript
private dispatchToWorker(input: WorkerInput): Promise<WorkerOutput> {
  return new Promise((resolve) => {
    const worker = this.getAvailableWorker()
    worker.once('message', (output: WorkerOutput) => {
      this.releaseWorker(worker)
      resolve(output)
    })
    worker.postMessage(input)
  })
}
```

---

## 7. Worker Thread

File: `backend/src/worker.ts`

Compiled separately. Receives `WorkerInput`, returns `WorkerOutput`.

```typescript
import { parentPort } from 'node:worker_threads'
import * as https from 'node:https'
import * as http from 'node:http'

const STOP_WORDS = new Set([
  'the','a','an','is','it','in','on','at','to','of','and','or','but',
  'for','with','from','this','that','are','was','be','as','by','we',
  'he','she','they','do','not','have','has','had','will','would','can',
  'could','should','may','might','its','our','your','their','been'
])

parentPort!.on('message', async (input: WorkerInput) => {
  try {
    const output = await processUrl(input)
    parentPort!.postMessage(output)
  } catch (err) {
    parentPort!.postMessage({ ...input, links: [], words: {}, error: String(err) })
  }
})
```

`processUrl` implementation:

1. **Fetch with redirect following:** Use `node:https` or `node:http` based on protocol. Follow up to 3 redirects by checking `statusCode` (301/302/303/307/308) and `location` header. Set `request.setTimeout(10000, () => request.destroy())`.
2. **Check Content-Type:** If response header does not contain `text/html`, return empty links and words.
3. **Collect body:** Concatenate chunks, decode as UTF-8.
4. **Extract links:** `/(<a[^>]+href=["'])([^"']+)(["'])/gi` — resolve each href with `new URL(href, input.url).toString()`.
5. **Extract text:** `html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ')`.
6. **Tokenize:** `text.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length >= 2 && !STOP_WORDS.has(w))`.
7. **Count frequencies:** reduce to `Record<string, number>`.
8. Return `WorkerOutput`.

---

## 8. URL Normalization

File: `backend/src/normalizeUrl.ts`

```typescript
export function normalizeUrl(raw: string, base: string): string | null {
  let url: URL
  try { url = new URL(raw, base) } catch { return null }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null

  const originHost = new URL(base).hostname
  if (url.hostname !== originHost) return null   // stay on same domain

  url.hostname = url.hostname.toLowerCase()
  url.hash = ''

  const trackingParams = ['utm_source','utm_medium','utm_campaign','utm_term',
                          'utm_content','ref','fbclid','gclid']
  trackingParams.forEach(p => url.searchParams.delete(p))

  if (url.pathname !== '/' && url.pathname.endsWith('/')) {
    url.pathname = url.pathname.slice(0, -1)
  }

  return url.toString()
}
```

---

## 9. Rate Limiter

File: `backend/src/rateLimiter.ts`

```typescript
export class RateLimiter {
  private intervalMs: number
  private lastTick = 0

  constructor(requestsPerSecond: number) {
    this.intervalMs = 1000 / requestsPerSecond
  }

  async wait(): Promise<void> {
    const elapsed = Date.now() - this.lastTick
    if (elapsed < this.intervalMs) {
      await new Promise(r => setTimeout(r, this.intervalMs - elapsed))
    }
    this.lastTick = Date.now()
  }
}
```

---

## 10. Express API Server

File: `backend/src/server.ts`

Port: `3001`. Enable CORS for `http://localhost:5173`.

### Endpoints

**POST /api/index**
- Body: `StartCrawlRequest`
- Validate all fields. Return `400` with error message on invalid input.
- Generate `jobId = ${Date.now()}_${Math.random().toString(36).slice(2)}`.
- Insert into `crawl_jobs` with `status: 'running'`.
- Instantiate `CrawlerEngine` and call `engine.start()` without awaiting.
- Response `201`: `{ jobId: string }`

**GET /api/jobs**
- Response `200`: all rows from `crawl_jobs` ordered by `created_at DESC`.

**DELETE /api/jobs/:jobId**
- Call `engine.stop()`, update `status = 'interrupted'` in DB.
- Response `200`: `{ ok: true }`

**GET /api/status/:jobId** (SSE)
```typescript
res.setHeader('Content-Type', 'text/event-stream')
res.setHeader('Cache-Control', 'no-cache')
res.setHeader('Connection', 'keep-alive')
res.flushHeaders()

const send = (event: SSEEvent) => {
  res.write(`event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`)
}

// Register send in a Map<jobId, Set<sender>>
// On req.on('close'), remove from map
```

**GET /api/search**
- Params: `q` (required), `limit` (default 20, max 100), `offset` (default 0).
- Instantiate `SearchEngine` and call `.search()`.
- Response `200`: `SearchResponse`

---

## 11. Search Engine

File: `backend/src/search.ts`

```typescript
export class SearchEngine {
  search(query: string, limit: number, offset: number): SearchResponse {
    const tokens = tokenize(query)   // same logic as worker
    if (tokens.length === 0) return emptyResponse(query, limit, offset)

    const scores = new Map<string, { originUrl: string; depth: number; score: number }>()

    for (const token of tokens) {
      const rows = db.prepare(
        'SELECT url, origin_url, depth, frequency FROM word_index WHERE word = ?'
      ).all(token) as Array<{ url: string; origin_url: string; depth: number; frequency: number }>

      for (const row of rows) {
        const existing = scores.get(row.url)
        if (existing) {
          existing.score += row.frequency
        } else {
          scores.set(row.url, { originUrl: row.origin_url, depth: row.depth, score: row.frequency })
        }
      }
    }

    const sorted = [...scores.entries()]
      .sort((a, b) => b[1].score - a[1].score)

    const total = sorted.length
    const paginated = sorted.slice(offset, offset + limit)

    return {
      query,
      results: paginated.map(([url, data]) => ({
        relevantUrl: url,
        originUrl: data.originUrl,
        depth: data.depth,
        score: data.score,
      })),
      total,
      limit,
      offset,
    }
  }
}
```

---

## 12. Persistence & Resume

On `server.ts` startup, before starting the Express listener:

```typescript
const runningJobs = db.prepare(
  "SELECT * FROM crawl_jobs WHERE status = 'running'"
).all() as CrawlJob[]

for (const job of runningJobs) {
  const queueRows = db.prepare(
    'SELECT url, origin_url AS origin, depth FROM url_queue WHERE job_id = ?'
  ).all(job.jobId) as WorkerInput[]

  const visitedRows = db.prepare('SELECT url FROM visited_urls').all() as { url: string }[]
  const visited = new Set(visitedRows.map(r => r.url))

  const engine = new CrawlerEngine({ ...job, ...config }, callbacks)
  engine.restoreState(queueRows, visited)
  engine.start()

  console.log(`Resuming job ${job.jobId} with ${queueRows.length} URLs in queue`)
}
```

On shutdown (`SIGINT` / `SIGTERM`):
```typescript
process.on('SIGINT', () => {
  for (const engine of runningEngines) engine.stop()
  db.prepare("UPDATE crawl_jobs SET status='interrupted' WHERE status='running'").run()
  process.exit(0)
})
```

---

## 13. Frontend — React Components

### Vite config (frontend/vite.config.ts)

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { '/api': 'http://localhost:3001' }
  }
})
```

### useCrawlerSSE hook

```typescript
export function useCrawlerSSE(jobId: string | null) {
  const [stats, setStats] = useState<CrawlStats | null>(null)
  const [logs, setLogs] = useState<string[]>([])
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!jobId) return
    const es = new EventSource(`/api/status/${jobId}`)
    es.addEventListener('stats', e => setStats(JSON.parse(e.data)))
    es.addEventListener('log',   e => setLogs(prev => [...prev.slice(-499), JSON.parse(e.data).message]))
    es.addEventListener('done',  e => { setStats(JSON.parse(e.data)); setDone(true); es.close() })
    return () => es.close()
  }, [jobId])

  return { stats, logs, done }
}
```

### CrawlerDashboard component

Displays after a crawl starts. Shows:
- Pages crawled counter.
- Queue depth with a `<progress>` bar — turns red (CSS class) when `stats.backPressure` is true.
- Requests/sec.
- Dropped URLs counter.
- Scrollable `<div>` for logs (auto-scroll to bottom via `useEffect` on `logs` change, `ref.current.scrollTop = ref.current.scrollHeight`).
- "Stop crawl" button.

### SearchPanel component

- Controlled `<input>` with 300ms debounce before triggering search.
- Results as a list of cards.
- Each card: URL (clickable link), origin URL, depth badge, score badge.
- Prev/Next pagination buttons. Show "Showing X–Y of Z results".

### JobList component

- `useEffect` fetches `GET /api/jobs` on mount and polls every 5 seconds.
- Table with columns: Job ID, Origin URL, Status (colored badge: green=completed, blue=running, gray=interrupted), Pages crawled, Started.
- Clicking a row sets the active jobId in App state, switching to the Crawler tab and showing that job's dashboard.

---

## 14. Backend package.json

```json
{
  "name": "web-crawler-backend",
  "version": "1.0.0",
  "scripts": {
    "dev":   "tsx watch src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js"
  },
  "dependencies": {
    "better-sqlite3": "^9.4.3",
    "express": "^4.18.2"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.8",
    "@types/express": "^4.17.21",
    "@types/node": "^20.11.0",
    "tsx": "^4.7.0",
    "typescript": "^5.3.3"
  }
}
```

---

## 15. Backend tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

---

## 16. Evaluation Criteria

- **Functionality (40%):** Crawls accurately, search works concurrently during indexing, back pressure and rate limiting work correctly, persistence/resume works after restart.
- **Architectural Sensibility (40%):** Clean separation of concerns, all state in main thread (no race conditions), WAL mode enables concurrent reads, typed interfaces throughout.
- **AI Stewardship (20%):** Developer can explain every part of the generated code and justify design decisions.

---

## 17. Out of Scope

- Multi-machine / distributed crawling.
- TLS certificate validation (disable with `rejectUnauthorized: false` if needed).
- `robots.txt` compliance.
- Authentication.
- Full TF-IDF (frequency sum is sufficient).
- Cross-domain crawling (stay on origin domain only).
- Docker / containerization.

---

## Additions after the baseline PRD

The following items were built on top of the initial PRD. Goals: improve usability and observability, and make behavior easier to compare with external reference crawlers (e.g. file-based demos).

### Crawl scope (`crawlScope`)

- **What:** Per-job choice of `hostname` | `registrableDomain` | `unrestricted`; `normalizeUrl` and HTTP redirect handling in the worker follow the same policy.
- **Why:** PRD §8 and §17 assumed a single-origin / same-domain crawl only. This adds flexibility for strict hostname-only crawls, registrable-domain (subdomain-inclusive) crawls, or unrestricted `http`/`https` link following.

### Multi-job persistence and schema evolution

- **What:** `visited_urls` and `url_queue` are scoped to a job (composite keys, migrations); `crawl_jobs` gained `is_active`, `crawl_scope`, rate/queue/worker fields, and related columns.
- **Why:** Instead of one global `visited` / `queue` model from the PRD, isolate concurrent or sequential jobs and keep search provenance meaningful per job.

### API and lifecycle

- **What:** `GET /api/jobs/:jobId`, `POST .../stop`, `POST .../restart`, soft delete (`DELETE` clears queue and sets `is_active`), request validation with **Zod** and middleware.
- **Why:** Job detail, safe stop, resume after interruption, and consistent error responses.

### Visited / queue listings and observability

- **What:** `GET /api/jobs/:jobId/urls?kind=visited|queued` with pagination; UI `JobUrlLists` (crawled URLs and pending queue, manual refresh, periodic refresh while a job is live).
- **Why:** Validate progress and back pressure against real rows, not only aggregate counters.

### Counters aligned with the database

- **What:** `pagesCrawled` / `pagesQueued` in list and detail APIs use **COUNT** on `visited_urls` and `url_queue` where appropriate; on resume the engine counter is seeded from `visited.size`.
- **Why:** The `crawl_jobs.pages_crawled` row could drift from actual rows (especially after resume), which confused users; database counts are treated as the source of truth for displayed totals.

### Cross-job “recently crawled” skip

- **What:** TTL-based guard (`wasCrawledWithin`) to avoid re-fetching the same URL from another job within a short window.
- **Why:** Reduce redundant network work; not in the PRD, pragmatic on a single machine.

### Frontend routing

- **What:** **React Router** for job detail routes (`/jobs/:jobId`).
- **Why:** Shareable URLs and smoother navigation from the job list; the PRD assumed a simpler single-view flow.

### Documentation

- **What:** `recommendation.md` (production-oriented next steps); README clarifies that the rate limit is **total** HTTP fetches per second across all workers, not per worker.
- **Why:** Match take-home expectations (short “next steps” narrative) and operator clarity.
