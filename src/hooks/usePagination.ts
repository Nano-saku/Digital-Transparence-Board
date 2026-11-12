import { useMemo, useState } from "react";

/**
 * Client-side pagination. The chosen page survives list refreshes (e.g.
 * realtime refetches), clamped when the list shrinks, and returns to page 1
 * only when `resetKey` changes — pass the active search/filter values.
 */
export function usePagination<T>(items: T[], pageSize = 10, resetKey: unknown = "") {
  // Remember which filter the chosen page belongs to, so a new filter starts
  // at 1 without a reset effect.
  const [state, setState] = useState({ page: 1, key: resetKey });
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const page = Object.is(state.key, resetKey) ? Math.min(state.page, totalPages) : 1;

  const pageItems = useMemo(() => items.slice((page - 1) * pageSize, page * pageSize), [items, page, pageSize]);

  return {
    pageItems,
    /** Spread onto <Pagination />. */
    pagination: { page, totalPages, totalItems: items.length, pageSize, onPage: (p: number) => setState({ page: p, key: resetKey }) },
  };
}
