import { useState, useEffect, useCallback, useRef } from 'react';
import { WorkspaceData } from '../types';
import { INITIAL_WORKSPACE_DATA } from '../data/initialData';
import { ensureWorkspaceTree } from '../utils/workspaceTreeUtils';
import { ensureUpdateDateColumnInTable } from '../utils/dateColumnUtils';
import { wonbeeDexieDB } from '../services/storage/dexieDb';
import { IWorkspaceRepository } from '../types';

interface UseWorkspaceInitOptions {
  repository: IWorkspaceRepository;
}

/**
 * Single-Root Custom Hook for Workspace Initialization
 * Guarantees zero duplicate API invocations under React StrictMode via:
 * 1. AbortController cleanup
 * 2. In-flight fetch lock (useRef)
 * 3. Stale-While-Revalidate from Dexie IndexedDB
 */
export function useWorkspaceInit({ repository }: UseWorkspaceInitOptions) {
  const [workspace, setWorkspace] = useState<WorkspaceData>(INITIAL_WORKSPACE_DATA);
  const [activeTableId, setActiveTableId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const lastLoadedTimestampRef = useRef<number>(0);
  const isFetchingRef = useRef<boolean>(false);
  const initialFetchDoneRef = useRef<boolean>(false);

  // Single centralized load function with in-flight lock and AbortSignal support
  const loadWorkspaceData = useCallback(
    async (isSilent = false, signal?: AbortSignal) => {
      // Prevent overlapping concurrent executions
      if (isFetchingRef.current && !isSilent) {
        return;
      }
      isFetchingRef.current = true;

      // 1. Stale-While-Revalidate: load cached Dexie IndexedDB data immediately (<10ms)
      if (!isSilent) {
        try {
          const cached = await wonbeeDexieDB.loadWorkspace();
          if (cached && Object.keys(cached.tables).length > 0) {
            setWorkspace(cached);
            setIsLoading(false);
          } else {
            setIsLoading(true);
          }
        } catch {
          setIsLoading(true);
        }
      }

      try {
        const rawData = await repository.loadWorkspace(signal);
        if (signal?.aborted) return;

        const data = ensureWorkspaceTree(rawData);

        // Sanitize legacy greeting text if present
        let needsSave = false;
        const cleanedTables = { ...data.tables };
        Object.keys(cleanedTables).forEach((tId) => {
          let table = cleanedTables[tId];
          let tableChanged = false;
          const cleanedRows = table.rows.map((row) => {
            if (
              row.richContent &&
              (row.richContent.includes('환영합니다') ||
                row.richContent.includes('새 테이블이 성공적으로 생성되었습니다'))
            ) {
              tableChanged = true;
              return { ...row, richContent: '' };
            }
            return row;
          });
          if (tableChanged) {
            table = { ...table, rows: cleanedRows };
            needsSave = true;
          }

          // Auto-ensure update date column
          const { table: ensuredTable, created } = ensureUpdateDateColumnInTable(table);
          if (created) {
            table = ensuredTable;
            needsSave = true;
          }

          cleanedTables[tId] = table;
        });

        const finalData = needsSave ? { ...data, tables: cleanedTables } : data;
        setWorkspace(finalData);
        lastLoadedTimestampRef.current = finalData.exportedAt || Date.now();

        if (needsSave && !isSilent) {
          repository.saveWorkspace(finalData).catch(() => {});
        }

        // Active table restoration
        const savedTableId = localStorage.getItem('wonbee_active_table_id');
        const tableKeys = Object.keys(finalData.tables);
        if (savedTableId && finalData.tables[savedTableId]) {
          setActiveTableId(savedTableId);
        } else {
          setActiveTableId((prev) => {
            if (prev && finalData.tables[prev]) return prev;
            const firstTableId = tableKeys[0] || null;
            if (firstTableId) {
              localStorage.setItem('wonbee_active_table_id', firstTableId);
            }
            return firstTableId;
          });
        }
      } catch (err: any) {
        if (err?.name !== 'AbortError') {
          console.error('[useWorkspaceInit] Failed to load workspace:', err);
        }
      } finally {
        isFetchingRef.current = false;
        if (!isSilent) setIsLoading(false);
      }
    },
    [repository]
  );

  // Unified single root mount effect with AbortController and StrictMode double-call guard
  useEffect(() => {
    // If already initiated on this mount lifecycle, skip duplicate StrictMode trigger
    if (initialFetchDoneRef.current) return;
    initialFetchDoneRef.current = true;

    const controller = new AbortController();

    loadWorkspaceData(false, controller.signal);

    return () => {
      // Abort in-flight requests if unmounted early
      controller.abort();
    };
  }, [loadWorkspaceData]);

  return {
    workspace,
    setWorkspace,
    activeTableId,
    setActiveTableId,
    isLoading,
    setIsLoading,
    loadWorkspaceData,
    lastLoadedTimestampRef,
  };
}
