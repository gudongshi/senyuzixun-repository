import { useState, useEffect, useRef, useCallback } from 'react';
import type { Employee } from '@/types/contacts';
import { searchEmployees } from './api';
import { SEARCH_DEBOUNCE_MS } from './types';

// ============================================================
// useEmployeeSearch — Debounced employee search with pagination
//
// Returns reactive search state: results, loading, error, etc.
// Supports "load more" via scrolling.
// ============================================================

export interface UseEmployeeSearchReturn {
  results: Employee[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => void;
}

export function useEmployeeSearch(query: string): UseEmployeeSearchReturn {
  const [results, setResults] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const offsetRef = useRef(0);
  const hasMoreRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const executeSearch = useCallback(async (searchQuery: string, append: boolean) => {
    if (!searchQuery.trim()) {
      setResults([]);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const currentOffset = append ? offsetRef.current : 0;
      const data = await searchEmployees(searchQuery, currentOffset);
      const items = Array.isArray(data?.items) ? data.items : [];
      offsetRef.current = currentOffset + items.length;
      hasMoreRef.current = data?.has_more ?? false;
      setResults((previous: Employee[]) => (append ? [...previous, ...items] : items));
    } catch (searchError: unknown) {
      const message = searchError instanceof Error ? searchError.message : '搜索失败';
      setError(message);
      if (!append) setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounced search on query change
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      offsetRef.current = 0;
      executeSearch(query, false);
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, executeSearch]);

  const loadMore = useCallback(() => {
    if (hasMoreRef.current && !loading) {
      executeSearch(query, true);
    }
  }, [query, loading, executeSearch]);

  return {
    results,
    loading,
    error,
    hasMore: hasMoreRef.current,
    loadMore,
  };
}
