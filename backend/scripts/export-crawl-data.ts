/**
 * Exports SQLite crawl data to a JSON file for committing to the repo.
 * Run from backend: npm run export-crawl-data
 *
 * DATABASE_PATH — same as the API (default: backend/crawler.db)
 * CRAWL_EXPORT_OUT — output file (default: repo root data/crawl-snapshot.json)
 * CRAWL_EXPORT_WORD_INDEX_LIMIT — word_index rows: unset = 10000 (repo-friendly);
 *   0 = full table (can be slow / very large)
 * --full — export entire word_index (same as CRAWL_EXPORT_WORD_INDEX_LIMIT=0)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDb, closeDb } from "../src/db/connection.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DEFAULT_WORD_INDEX_LIMIT = 10_000;

function defaultOutPath(): string {
  const env = process.env["CRAWL_EXPORT_OUT"];
  if (env && env.length > 0) return path.resolve(env);
  const backendRoot = path.resolve(__dirname, "..");
  const repoRoot = path.resolve(backendRoot, "..");
  return path.join(repoRoot, "data", "crawl-snapshot.json");
}

/** Returns { mode: 'all' } or { mode: 'limit', n: number } */
function resolveWordIndexLimit(): { mode: "all" } | { mode: "limit"; n: number } {
  if (process.argv.includes("--full")) {
    return { mode: "all" };
  }
  const raw = process.env["CRAWL_EXPORT_WORD_INDEX_LIMIT"];
  if (raw === undefined || raw === "") {
    return { mode: "limit", n: DEFAULT_WORD_INDEX_LIMIT };
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) {
    return { mode: "limit", n: DEFAULT_WORD_INDEX_LIMIT };
  }
  if (n === 0) return { mode: "all" };
  return { mode: "limit", n: Math.floor(n) };
}

function main(): void {
  const outPath = defaultOutPath();
  const wordSpec = resolveWordIndexLimit();

  const db = getDb();

  const crawl_jobs = db.prepare("SELECT * FROM crawl_jobs ORDER BY created_at").all();
  const visited_urls = db
    .prepare("SELECT * FROM visited_urls ORDER BY job_id, crawled_at")
    .all();
  const url_queue = db.prepare("SELECT * FROM url_queue ORDER BY job_id, queued_at").all();

  const wordTotal = (db.prepare("SELECT COUNT(*) AS n FROM word_index").get() as { n: number })
    .n;

  let word_index: unknown[];
  let wordIndexNote: { exported: number; total: number; limit: number | null } | undefined;

  if (wordSpec.mode === "all") {
    word_index = db.prepare("SELECT * FROM word_index ORDER BY word, url").all();
    wordIndexNote =
      word_index.length > 0
        ? { exported: word_index.length, total: wordTotal, limit: null }
        : undefined;
  } else {
    word_index = db
      .prepare("SELECT * FROM word_index ORDER BY word, url LIMIT ?")
      .all(wordSpec.n);
    wordIndexNote =
      word_index.length < wordTotal || wordSpec.n < wordTotal
        ? {
            exported: word_index.length,
            total: wordTotal,
            limit: wordSpec.n,
          }
        : { exported: word_index.length, total: wordTotal, limit: wordSpec.n };
  }

  const payload = {
    exportedAt: new Date().toISOString(),
    databasePath:
      process.env["DATABASE_PATH"] ??
      path.resolve(process.cwd(), "crawler.db"),
    wordIndexExport: wordIndexNote,
    tables: {
      crawl_jobs,
      visited_urls,
      url_queue,
      word_index,
    },
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), "utf8");

  closeDb();

  console.log(`Wrote ${outPath}`);
  console.log(
    `Rows: crawl_jobs=${crawl_jobs.length}, visited_urls=${visited_urls.length}, url_queue=${url_queue.length}, word_index=${word_index.length}${wordIndexNote && wordIndexNote.limit !== null && wordIndexNote.exported < wordIndexNote.total ? ` (total ${wordIndexNote.total}, limit ${wordIndexNote.limit}; set CRAWL_EXPORT_WORD_INDEX_LIMIT=0 or use npm run export-crawl-data:full)` : ""}`,
  );
}

main();
