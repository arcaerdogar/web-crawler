import Database from "better-sqlite3";
import path from "node:path";

type SqliteDatabase = InstanceType<typeof Database>;

const dbPath =
  process.env["DATABASE_PATH"] ?? path.resolve(process.cwd(), "crawler.db");

const db: SqliteDatabase = new Database(dbPath);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS visited_urls (
    job_id      TEXT NOT NULL,
    url         TEXT NOT NULL,
    origin_url  TEXT NOT NULL,
    depth       INTEGER NOT NULL,
    crawled_at  INTEGER NOT NULL,
    PRIMARY KEY (job_id, url)
  );

  CREATE TABLE IF NOT EXISTS url_queue (
    job_id      TEXT NOT NULL,
    url         TEXT NOT NULL,
    origin_url  TEXT NOT NULL,
    depth       INTEGER NOT NULL,
    queued_at   INTEGER NOT NULL,
    PRIMARY KEY (job_id, url)
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
    finished_at   INTEGER,
    is_active     INTEGER NOT NULL DEFAULT 1,
    rate_limit    INTEGER NOT NULL DEFAULT 5,
    max_queue_size INTEGER NOT NULL DEFAULT 1000,
    worker_count  INTEGER NOT NULL DEFAULT 4
  );

  CREATE INDEX IF NOT EXISTS idx_word ON word_index(word);
`);

function tableColumnNames(table: string): string[] {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{
    name: string;
  }>;
  return rows.map((r) => r.name);
}

function migrateVisitedUrlsToJobScoped(): void {
  const cols = tableColumnNames("visited_urls");
  if (cols.includes("job_id")) return;

  db.exec(`
    ALTER TABLE visited_urls RENAME TO visited_urls_legacy;
    CREATE TABLE visited_urls (
      job_id      TEXT NOT NULL,
      url         TEXT NOT NULL,
      origin_url  TEXT NOT NULL,
      depth       INTEGER NOT NULL,
      crawled_at  INTEGER NOT NULL,
      PRIMARY KEY (job_id, url)
    );
    CREATE INDEX IF NOT EXISTS idx_visited_job ON visited_urls(job_id);
    CREATE INDEX IF NOT EXISTS idx_visited_url ON visited_urls(url);
    DROP TABLE visited_urls_legacy;
  `);
}

function migrateUrlQueueCompositePk(): void {
  const row = db
    .prepare(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='url_queue'",
    )
    .get() as { sql: string } | undefined;
  if (!row?.sql) return;
  const s = row.sql.replace(/\s+/g, " ").toLowerCase();
  if (s.includes("primary key (job_id, url)")) return;

  db.exec(`
    ALTER TABLE url_queue RENAME TO url_queue_legacy;
    CREATE TABLE url_queue (
      job_id      TEXT NOT NULL,
      url         TEXT NOT NULL,
      origin_url  TEXT NOT NULL,
      depth       INTEGER NOT NULL,
      queued_at   INTEGER NOT NULL,
      PRIMARY KEY (job_id, url)
    );
    CREATE INDEX IF NOT EXISTS idx_job_queue ON url_queue(job_id);
    INSERT INTO url_queue (job_id, url, origin_url, depth, queued_at)
      SELECT job_id, url, origin_url, depth, queued_at FROM url_queue_legacy;
    DROP TABLE url_queue_legacy;
  `);
}

function migrateCrawlJobsColumns(): void {
  const cols = tableColumnNames("crawl_jobs");
  if (!cols.includes("is_active")) {
    db.exec(
      "ALTER TABLE crawl_jobs ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1",
    );
  }
  if (!cols.includes("rate_limit")) {
    db.exec(
      "ALTER TABLE crawl_jobs ADD COLUMN rate_limit INTEGER NOT NULL DEFAULT 5",
    );
  }
  if (!cols.includes("max_queue_size")) {
    db.exec(
      "ALTER TABLE crawl_jobs ADD COLUMN max_queue_size INTEGER NOT NULL DEFAULT 1000",
    );
  }
  if (!cols.includes("worker_count")) {
    db.exec(
      "ALTER TABLE crawl_jobs ADD COLUMN worker_count INTEGER NOT NULL DEFAULT 4",
    );
  }
}

migrateVisitedUrlsToJobScoped();
migrateUrlQueueCompositePk();
migrateCrawlJobsColumns();

/** Must run after migrations: legacy DB had visited/url_queue without job_id — indexing job_id before migrate caused "no such column: job_id". */
function ensureVisitedAndQueueIndexes(): void {
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_job_queue ON url_queue(job_id);
    CREATE INDEX IF NOT EXISTS idx_visited_job ON visited_urls(job_id);
    CREATE INDEX IF NOT EXISTS idx_visited_url ON visited_urls(url);
  `);
}

ensureVisitedAndQueueIndexes();

export function getDb(): SqliteDatabase {
  return db;
}

export function closeDb(): void {
  db.close();
}
