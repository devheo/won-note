import { useState, useCallback } from 'react';

export function useColumnFilters() {
  const [columnFilters, setColumnFilters] = useState<Record<string, string[]>>({});
  const [enabledFilterColIds, setEnabledFilterColIds] = useState<Set<string>>(new Set());

  const handleToggleColumnFilter = useCallback((colId: string) => {
    setEnabledFilterColIds((prev) => {
      const next = new Set(prev);
      if (next.has(colId)) {
        next.delete(colId);
      } else {
        next.add(colId);
      }
      return next;
    });
  }, []);

  const handleUpdateColumnFilter = useCallback((colId: string, allowedKeys: string[]) => {
    setColumnFilters((prev) => ({
      ...prev,
      [colId]: allowedKeys,
    }));
  }, []);

  const handleClearAllColumnFilters = useCallback(() => {
    setColumnFilters({});
    setEnabledFilterColIds(new Set());
  }, []);

  return {
    columnFilters,
    enabledFilterColIds,
    handleToggleColumnFilter,
    handleUpdateColumnFilter,
    handleClearAllColumnFilters,
  };
}
