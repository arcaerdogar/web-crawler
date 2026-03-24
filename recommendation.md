# Recommendations

Next-step product ideas and a pre-production checklist. The app is localhost-oriented today; treat items as options to consider, not as shipped features.

## Product and crawling

Cross-host crawling already exists via `crawlScope: 'unrestricted'`; default is `registrableDomain`, single-host is `hostname`. Further ideas: per-job host **allow/block lists**, hard caps on **pages or wall-clock time** per job, and **robots.txt / crawl-delay** if the service is public.

More product ideas: a **URL priority** (e.g. breadth-first vs depth-first, or boosting links from the same page), optional **content-type filters** (focus on HTML and skip heavy binaries), a clear stance on **login-gated or cookie-heavy sites** (often out of scope unless you add auth flows), a **crawl budget** per job (bytes downloaded or wall-clock cap in addition to depth/queue), and **revisit policy** (how often the same URL may be recrawled across jobs or time). **Scheduled / recurring crawls** (cron-like) are a natural extension if the system stays long-running.

## Search and indexing

Queries match tokens exactly or by prefix today, so typos and paraphrases weak. Next steps: bounded **fuzzy** token match, **trigram / FTS** (SQLite or Postgres **`pg_trgm`**), small **synonym lists**; expose modes and **result limits** in the UI to control latency. Beyond matching, consider **ranking** (frequency, depth, recency—not only “does it match”), **snippets** (short quoted context from the page), and optional **language-aware** tokenization when queries mix scripts or languages. **Embeddings / semantic search** are a heavier, optional path for “meaning similar” results. **Faceted filters** (e.g. restrict to a domain or depth band) help narrow results without new index types. Product-wise, fuzzy + ranking + snippets often matter before investing in trie/autocomplete infrastructure.

**Postgres “trie”:** No mainstream trie extension. Use **B-tree + prefix queries** for completion-style lookup; **`pg_trgm`** for similarity. **`ltree`** is for hierarchical labels, not a word trie.

**Redis:** Core has no TRIE type. **Redis Stack / RediSearch** `FT.SUGADD` / `FT.SUGGET` give managed **prefix suggestions**; keep SQL as source of truth and **sync terms** on a schedule (extra service, RAM, eventual consistency).

**In-process trie:** Build a **trie in application RAM** (e.g. load distinct tokens from SQL at startup or on a timer) for fast prefix completion without Redis. Trade-offs: **process memory** and **startup or rebuild** cost; **stale** until the next full reload; **one copy per node** if you scale horizontally unless you add coordination.

## Production readiness

**Security:** Verify TLS in production; add **auth** or network controls; **CORS** per environment; mitigate **SSRF** (block private/metadata targets); store secrets in **env / a secret manager**.

**Operations:** Run under a **supervisor**; add **`/health`**; use **structured logs** and optional **metrics**.

**Data:** SQLite is one-file and concurrency-limited; for multiple processes or heavy writes prefer **Postgres** (or similar), **versioned migrations**, **backups**, and **retention** policy.

**Network:** **Edge rate limits** on the proxy; replace the single **global** crawl RPS with **per-host limits** (and optional per-host queues); **cap response body size**.

**Policy and delivery:** For multi-tenant or public use: **terms of use**, identifiable **User-Agent**, **audit** of who started crawls. **CI** (tests, lint), dependency **audits**, one deploy artifact and **`.env.example`**.

**Frontend:** Configurable **API base URL** in production builds; **CSP** and security headers for static hosting.
