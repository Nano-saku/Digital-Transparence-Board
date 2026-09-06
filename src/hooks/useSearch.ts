import { useMemo, useState, useCallback } from "react";

/**
 * Generic search + multi-filter hook that replaces the duplicated
 * `searchTerm` / `filterX` / `filteredData` useMemo pattern found in every
 * management section.
 *
 * @example
 * ```ts
 * const { searchTerm, setSearchTerm, filters, setFilter, filtered } = useSearch({
 *   items: students,
 *   searchKeys: ["name", "studentId"],
 *   filters: {
 *     program: (s) => s.program,
 *     yearLevel: (s) => s.yearLevel.toString(),
 *   },
 * });
 * ```
 */
export interface UseSearchOptions<T> {
  /** The full dataset to search/filter. */
  items: T[];
  /** Keys of `T` (or accessor results) to match against the search term. */
  searchKeys: (keyof T | ((item: T) => string))[];
  /** Named filters — each value is either a string key of T or an accessor. */
  filters?: Record<string, (item: T) => string>;
}

export interface UseSearchReturn<T> {
  searchTerm: string;
  setSearchTerm: (v: string) => void;
  filters: Record<string, string>;
  setFilter: (key: string, value: string) => void;
  /** Reset all filters and search to their defaults. */
  resetFilters: () => void;
  /** The derived filtered dataset. */
  filtered: T[];
  /** Number of active filter criteria (excluding search). */
  activeFilterCount: number;
}

export function useSearch<T>({
  items,
  searchKeys,
  filters: filterDefs = {},
}: UseSearchOptions<T>): UseSearchReturn<T> {
  const [searchTerm, setSearchTerm] = useState("");
  const [filters, setFiltersState] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const key of Object.keys(filterDefs)) {
      initial[key] = "";
    }
    return initial;
  });

  const setFilter = useCallback(
    (key: string, value: string) =>
      setFiltersState((prev) => ({ ...prev, [key]: value })),
    [],
  );

  const resetFilters = useCallback(() => {
    const initial: Record<string, string> = {};
    for (const key of Object.keys(filterDefs)) {
      initial[key] = "";
    }
    setFiltersState(initial);
    setSearchTerm("");
  }, [filterDefs]);

  const activeFilterCount = useMemo(
    () => Object.values(filters).filter(Boolean).length,
    [filters],
  );

  const filtered = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    return items.filter((item) => {
      // Search match
      if (query) {
        const matches = searchKeys.some((key) => {
          const value =
            typeof key === "function" ? key(item) : (item[key] as unknown);
          return String(value ?? "")
            .toLowerCase()
            .includes(query);
        });
        if (!matches) return false;
      }

      // Filter matches
      for (const [filterKey, accessor] of Object.entries(filterDefs)) {
        const filterValue = filters[filterKey];
        if (filterValue && accessor(item) !== filterValue) {
          return false;
        }
      }

      return true;
    });
  }, [items, searchKeys, filterDefs, searchTerm, filters]);

  return {
    searchTerm,
    setSearchTerm,
    filters,
    setFilter,
    resetFilters,
    filtered,
    activeFilterCount,
  };
}
