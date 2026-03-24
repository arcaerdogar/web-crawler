import { z } from "zod";

export const startCrawlBodySchema = z.object({
  url: z
    .string()
    .min(1, "url is required and must be a string")
    .url("url must be a valid URL"),
  maxDepth: z
    .number()
    .int()
    .min(0, "maxDepth must be between 0 and 10")
    .max(10, "maxDepth must be between 0 and 10")
    .optional()
    .default(2),
  rateLimit: z
    .number()
    .int()
    .min(1, "rateLimit must be between 1 and 20")
    .max(20, "rateLimit must be between 1 and 20")
    .optional()
    .default(5),
  maxQueueSize: z
    .number()
    .int()
    .min(100, "maxQueueSize must be between 100 and 5000")
    .max(5000, "maxQueueSize must be between 100 and 5000")
    .optional()
    .default(1000),
  workerCount: z
    .number()
    .int()
    .min(1, "workerCount must be between 1 and 8")
    .max(8, "workerCount must be between 1 and 8")
    .optional()
    .default(4),
  crawlScope: z
    .enum(["hostname", "registrableDomain", "unrestricted"])
    .optional()
    .default("registrableDomain"),
});

export type StartCrawlBody = z.infer<typeof startCrawlBodySchema>;

function clampSearchLimit(v: unknown): number {
  if (v === undefined || v === "") return 20;
  const n = Number(v);
  if (Number.isNaN(n)) return 20;
  return Math.min(Math.max(Math.trunc(n), 1), 100);
}

function clampSearchOffset(v: unknown): number {
  if (v === undefined || v === "") return 0;
  const n = parseInt(String(v), 10);
  if (Number.isNaN(n)) return 0;
  return Math.max(0, n);
}

export const searchQuerySchema = z.object({
  q: z.string().trim().min(1, "q parameter is required"),
  limit: z.preprocess(clampSearchLimit, z.number().int()),
  offset: z.preprocess(clampSearchOffset, z.number().int()),
  mode: z.preprocess(
    (v) => (v === "prefix" ? "prefix" : "exact"),
    z.enum(["exact", "prefix"]),
  ),
});

export type SearchQuery = z.infer<typeof searchQuerySchema>;

export const jobIdParamSchema = z.object({
  jobId: z.string().min(1, "jobId is required"),
});

export type JobIdParams = z.infer<typeof jobIdParamSchema>;

export const jobUrlsQuerySchema = z.object({
  kind: z.enum(["visited", "queued"]),
  limit: z.coerce.number().int().min(1).max(1000).default(200),
  offset: z.coerce.number().int().min(0).default(0),
});

export type JobUrlsQuery = z.infer<typeof jobUrlsQuerySchema>;

export function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length ? issue.path.join(".") : "";
      return path ? `${path}: ${issue.message}` : issue.message;
    })
    .join("; ");
}
