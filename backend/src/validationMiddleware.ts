import type { Request, RequestHandler } from "express";
import type { z } from "zod";
import { formatZodError } from "./validation.js";

export function validateBody<S extends z.ZodType>(schema: S): RequestHandler {
  return (req, res, next) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: formatZodError(parsed.error) });
      return;
    }
    req.validatedBody = parsed.data;
    next();
  };
}

export function validateParams<S extends z.ZodType>(schema: S): RequestHandler {
  return (req, res, next) => {
    const parsed = schema.safeParse(req.params);
    if (!parsed.success) {
      res.status(400).json({ error: formatZodError(parsed.error) });
      return;
    }
    req.validatedParams = parsed.data;
    next();
  };
}

/**
 * Parses query string. Defaults to `req.query` when `select` is omitted.
 * Use `select` when the schema input is not the raw query (renames, extra sources, strict pick).
 */
export function validateQuery<S extends z.ZodType>(
  schema: S,
  select?: (req: Request) => unknown,
): RequestHandler {
  return (req, res, next) => {
    const parsed = schema.safeParse(select ? select(req) : req.query);
    if (!parsed.success) {
      res.status(400).json({ error: formatZodError(parsed.error) });
      return;
    }
    req.validatedQuery = parsed.data;
    next();
  };
}
