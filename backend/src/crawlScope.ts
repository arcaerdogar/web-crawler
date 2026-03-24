/** How link targets are restricted relative to the effective crawl origin URL. */
export type CrawlScope = "hostname" | "registrableDomain" | "unrestricted";

export const CRAWL_SCOPES: readonly CrawlScope[] = [
  "hostname",
  "registrableDomain",
  "unrestricted",
];

export function isCrawlScope(v: string): v is CrawlScope {
  return (CRAWL_SCOPES as readonly string[]).includes(v);
}

/** DB row may have legacy `allow_subdomains` until fully migrated. */
export function crawlScopeFromRow(row: {
  crawl_scope?: string | null;
  allow_subdomains?: number;
}): CrawlScope {
  const s = row.crawl_scope;
  if (s && isCrawlScope(s)) return s;
  if (row.allow_subdomains === 0) return "hostname";
  return "registrableDomain";
}
