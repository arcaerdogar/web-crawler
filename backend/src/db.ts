import Database from 'better-sqlite3';
import path from 'node:path';

const dbPath = process.env['DATABASE_PATH'] ?? path.resolve(process.cwd(), 'crawler.db');

const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
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
`);

export default db;
