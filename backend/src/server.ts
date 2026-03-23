import express from "express";
import * as crawlJobsRepo from "./db/crawlJobsRepo.js";
import { startEngineFromPersistedJob } from "./jobResume.js";
import { runningEngines } from "./crawlRuntime.js";
import {
  deleteJobById,
  getJobById,
  getJobStatusStream,
  getJobs,
  getSearch,
  postIndex,
  postRestartJob,
  postStopJob,
} from "./controllers.js";
import {
  jobIdParamSchema,
  searchQuerySchema,
  startCrawlBodySchema,
} from "./validation.js";
import { validateBody, validateParams, validateQuery } from "./validationMiddleware.js";

const app = express();
const PORT = 3001;

app.use(express.json());

app.use((_req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "http://localhost:5173");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  next();
});

app.options("*", (_req, res) => res.sendStatus(204));

app.post("/api/index", validateBody(startCrawlBodySchema), postIndex);
app.get("/api/jobs", getJobs);
app.get("/api/jobs/:jobId", validateParams(jobIdParamSchema), getJobById);
app.post(
  "/api/jobs/:jobId/stop",
  validateParams(jobIdParamSchema),
  postStopJob,
);
app.delete("/api/jobs/:jobId", validateParams(jobIdParamSchema), deleteJobById);
app.post(
  "/api/jobs/:jobId/restart",
  validateParams(jobIdParamSchema),
  postRestartJob,
);
app.get(
  "/api/status/:jobId",
  validateParams(jobIdParamSchema),
  getJobStatusStream,
);
app.get("/api/search", validateQuery(searchQuerySchema), getSearch);

function shutdown() {
  console.log("Shutting down...");
  for (const engine of runningEngines.values()) {
    engine.stop();
  }
  crawlJobsRepo.markAllRunningCrawlJobsInterruptedAt(Date.now());
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

export { app };

if (!process.env["JEST_WORKER_ID"]) {
  const rows = crawlJobsRepo.listRunningActiveCrawlJobs();
  for (const row of rows) {
    startEngineFromPersistedJob(row);
  }
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}
