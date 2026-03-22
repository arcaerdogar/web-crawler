import { useState, useEffect, useRef, useCallback } from 'react';
import { search as apiSearch } from '../api/client.ts';
import type { SearchResponse } from '../types.ts';

export type SearchMode = 'exact' | 'prefix';

export function useSearch() {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<SearchMode>('exact');
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [offset, setOffset] = useState(0);
  const limit = 20;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSearch = useCallback(async (q: string, off: number, m: SearchMode) => {
    if (q.trim().length === 0) {
      setResults(null);
      return;
    }
    setLoading(true);
    try {
      const res = await apiSearch(q, limit, off, m);
      setResults(res);
    } catch {
      setResults(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setOffset(0);
    timerRef.current = setTimeout(() => {
      doSearch(query, 0, mode);
    }, 300);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query, mode, doSearch]);

  const nextPage = () => {
    const newOffset = offset + limit;
    setOffset(newOffset);
    doSearch(query, newOffset, mode);
  };

  const prevPage = () => {
    const newOffset = Math.max(0, offset - limit);
    setOffset(newOffset);
    doSearch(query, newOffset, mode);
  };

  return { query, setQuery, mode, setMode, results, loading, offset, limit, nextPage, prevPage };
}
