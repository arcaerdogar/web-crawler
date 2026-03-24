import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { search as apiSearch } from '../api/client.ts';
import type { SearchResponse } from '../types.ts';

export type SearchMode = 'exact' | 'prefix';

const limit = 20;

export function useSearch() {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlQuery = searchParams.get('q') ?? '';
  const mode = (searchParams.get('mode') === 'prefix' ? 'prefix' : 'exact') as SearchMode;
  const page = Math.max(0, parseInt(searchParams.get('page') ?? '0', 10) || 0);
  const offset = page * limit;

  const [inputQuery, setInputQuery] = useState(urlQuery);
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setInputQuery(urlQuery);
  }, [urlQuery]);

  useEffect(() => {
    const t = setTimeout(() => {
      const trimmed = inputQuery.trim();
      const current = urlQuery.trim();
      if (trimmed === current) return;
      setSearchParams(
        sp => {
          const p = new URLSearchParams(sp);
          if (trimmed) p.set('q', trimmed);
          else p.delete('q');
          p.set('page', '0');
          return p;
        },
        { replace: true },
      );
    }, 300);
    return () => clearTimeout(t);
  }, [inputQuery, urlQuery, setSearchParams]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!urlQuery.trim()) {
        setResults(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const res = await apiSearch(urlQuery, limit, offset, mode);
        if (!cancelled) setResults(res);
      } catch {
        if (!cancelled) setResults(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [urlQuery, offset, mode]);

  const setMode = useCallback(
    (m: SearchMode) => {
      setSearchParams(
        sp => {
          const p = new URLSearchParams(sp);
          p.set('mode', m);
          p.set('page', '0');
          return p;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const nextPage = useCallback(() => {
    if (!results || offset + limit >= results.total) return;
    setSearchParams(
      sp => {
        const p = new URLSearchParams(sp);
        p.set('page', String(page + 1));
        return p;
      },
      { replace: true },
    );
  }, [results, offset, limit, page, setSearchParams]);

  const prevPage = useCallback(() => {
    if (page <= 0) return;
    setSearchParams(
      sp => {
        const p = new URLSearchParams(sp);
        p.set('page', String(page - 1));
        return p;
      },
      { replace: true },
    );
  }, [page, setSearchParams]);

  return {
    query: inputQuery,
    setQuery: setInputQuery,
    searchedQuery: urlQuery,
    mode,
    setMode,
    results,
    loading,
    offset,
    limit,
    nextPage,
    prevPage,
  };
}
