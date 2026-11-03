import { useState, useCallback } from 'react';

export function useTableSort() {
  const [sortColumnId, setSortColumnId] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const handleSortChange = useCallback((colId: string) => {
    setSortColumnId((prevCol) => {
      if (prevCol === colId) {
        setSortDirection((prevDir) => (prevDir === 'asc' ? 'desc' : 'asc'));
        return colId;
      } else {
        setSortDirection('asc');
        return colId;
      }
    });
  }, []);

  const handleClearSort = useCallback(() => {
    setSortColumnId(null);
    setSortDirection('asc');
  }, []);

  return {
    sortColumnId,
    sortDirection,
    handleSortChange,
    handleClearSort,
  };
}
