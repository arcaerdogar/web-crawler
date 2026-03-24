# Recommendations

## Product / crawl behaviour

**Cross-domain crawling can be added as an opt-in flag.** Today the indexer restricts link following to the same registrable base domain as the crawl’s effective origin (after redirects), which keeps scope predictable and avoids pulling in arbitrary external sites (e.g. a Wikipedia page linking to `itu.edu.tr`). The Brightwave exercise text does not mandate this boundary; it is an implementation choice.

A practical extension would be:

- Default: current behaviour (same base domain).
- When enabled (e.g. `allowCrossDomain: true` on `POST /api/index` and persisted per job): relax `normalizeUrl` / crawler filtering so any `http(s)` link within depth `k` may be queued, still subject to deduplication, rate limits, queue depth, and redirect safety rules.

Ship with clear UI copy and safe defaults so large crawls do not accidentally fan out across the open web without operator intent.

## Search beyond exact / prefix token match

**Search over non-exact matches can be added as an opt-in mode or secondary ranking pass.** Today the index matches normalized word tokens (exact or `LIKE` prefix). That misses typos and natural-language queries that do not share tokens with the page (e.g. `ysrdım` vs `yardım`, or a long phrase such as “öğrenci işlerine nasıl giderim” when the site mainly uses the heading **öğrenci işleri**).

Reasonable next steps:

- **Fuzzy / edit-distance on tokens** — After tokenizing the query, also search the lexicon for terms within a small Levenshtein or Damerau-Levenshtein distance (with length guards to avoid exploding matches). SQLite can support this via a user-defined function, a precomputed “suggestion” table, or post-filtering candidate rows.
- **Trigram / n-gram similarity** — SQLite 3 FTS or the `sqlite3` trigram extension (if acceptable) can rank near-misses; alternatively store character n-grams in a side table.
- **Query expansion / synonyms** — A small domain dictionary (e.g. “öğrenci işleri” ↔ “öğrenci işlerine”, “başvuru”) or lightweight embeddings (heavier operation) to map user phrases to indexed vocabulary before hitting the inverted index.
- **UI** — Expose as `mode=fuzzy` or a “Include similar words” toggle; cap `maxEditDistance` and result count so latency stays predictable.

This stays aligned with the exercise spirit (language-native building blocks) if fuzzy matching is implemented with explicit algorithms and tests rather than opaque full-text black boxes—unless you deliberately adopt SQLite FTS5 as a documented dependency.
