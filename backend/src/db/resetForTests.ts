import * as crawlJobsRepo from "./crawlJobsRepo.js";
import * as crawlWritesRepo from "./crawlWritesRepo.js";
import * as wordIndexRepo from "./wordIndexRepo.js";

/** Clears all application tables (for test isolation). */
export function resetAllTables(): void {
  wordIndexRepo.clearWordIndex();
  crawlWritesRepo.deleteAllQueuedUrls();
  crawlWritesRepo.deleteAllVisitedRows();
  crawlJobsRepo.deleteAllCrawlJobsRows();
}
