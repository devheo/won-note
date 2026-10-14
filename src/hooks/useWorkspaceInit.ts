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
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<'loading' | 'success' | 'error'>('loading');

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
      if (!isSilent) {
        setSyncError(null);
        setSyncStatus('loading');
      }

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
        setSyncStatus('success');
        setSyncError(null);
        lastLoadedTimestampRef.current = finalData.exportedAt || Date.now();

        if (needsSave && !isSilent) {
          repository.saveWorkspace(finalData).catch(() => {});
        }

        // Active table restoration with guaranteed fallback
        const savedTableId = localStorage.getItem('wonbee_active_table_id');
        const tableKeys = Object.keys(finalData.tables);

        let targetTableId: string | null = null;
        if (savedTableId && finalData.tables[savedTableId]) {
          targetTableId = savedTableId;
        } else if (tableKeys.length > 0) {
          targetTableId = tableKeys[0];
        }

        if (targetTableId) {
          setActiveTableId(targetTableId);
          localStorage.setItem('wonbee_active_table_id', targetTableId);
        } else {
          setActiveTableId(null);
        }
      } catch (err: any) {
        if (err?.name !== 'AbortError') {
          console.error('[useWorkspaceInit] Failed to load workspace:', err);
          const errMsg = err?.message || '서버 데이터베이스 동기화 연결에 실패했습니다.';
          setSyncError(errMsg);
          setSyncStatus('error');
        }
      } finally {
        isFetchingRef.current = false;
        if (!isSilent) setIsLoading(false);
      }
    },
    [repository]
  );

  const retryWorkspaceLoad = useCallback(() => {
    initialFetchDoneRef.current = false;
    isFetchingRef.current = false;
    loadWorkspaceData(false);
  }, [loadWorkspaceData]);

  // Unified single root mount effect with StrictMode double-call guard
  useEffect(() => {
    if (initialFetchDoneRef.current) return;
    initialFetchDoneRef.current = true;

    loadWorkspaceData(false);
  }, [loadWorkspaceData]);

  return {
    workspace,
    setWorkspace,
    activeTableId,
    setActiveTableId,
    isLoading,
    setIsLoading,
    syncError,
    syncStatus,
    loadWorkspaceData,
    retryWorkspaceLoad,
    lastLoadedTimestampRef,
  };
}
