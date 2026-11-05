/**
 * Storage Repository Pattern Implementation
 * Decouples application UI logic from the persistence layer (IndexedDB vs Server REST API).
 */
import {
  IWorkspaceRepository,
  WorkspaceData,
  TableDocument,
  TreeItem,
  StorageConfig,
  CalendarEvent,
  WonNoteDocument,
} from '../../types';
import { wonbeeDB } from './indexedDb';
import { wonbeeDexieDB } from './dexieDb';
import { ensureWorkspaceTree, mergeTrees } from '../../utils/workspaceTreeUtils';
import { deduplicatedFetchJson } from '../api/requestDeduplicator';
import { fetchBridge } from '../httpBridge';

export function mergeWorkspaces(
  current: WorkspaceData,
  imported: WorkspaceData,
  mode: 'merge' | 'replace' | 'keep_both' = 'merge'
): WorkspaceData {
  if (mode === 'replace') {
    return ensureWorkspaceTree(imported);
  }

  const mergedTables: Record<string, TableDocument> = { ...current.tables };
  const mergedDocuments = { ...(current.documents || {}) };
  const mergedTree: TreeItem[] = [...current.tree];

  const currentTreeIdMap = new Map(current.tree.map((t, idx) => [t.id, idx]));
  const currentTableIdMap = new Set(Object.keys(current.tables));
  const importedTreeIdMap = new Map<string, string>();

  // 1. Handle incoming tree items
  for (const item of imported.tree) {
    if (!currentTreeIdMap.has(item.id)) {
      mergedTree.push({ ...item });
      currentTreeIdMap.set(item.id, mergedTree.length - 1);
      importedTreeIdMap.set(item.id, item.id);
    } else if (mode === 'keep_both') {
      const newId = `${item.id}_imported_${Date.now().toString(36)}`;
      mergedTree.push({
        ...item,
        id: newId,
        title: `${item.title} (가져옴)`,
      });
      importedTreeIdMap.set(item.id, newId);
    } else {
      // In 'merge' mode: update the existing tree item with incoming item's properties
      const existingIdx = currentTreeIdMap.get(item.id)!;
      mergedTree[existingIdx] = {
        ...mergedTree[existingIdx],
        ...item,
        title: item.title,
        updatedAt: item.updatedAt || Date.now(),
      };
    }
  }

  // 2. Handle incoming tables
  for (const [tId, tDoc] of Object.entries(imported.tables)) {
    let targetTableId = tId;
    let targetTableDoc = { ...tDoc };

    if (!currentTableIdMap.has(tId)) {
      mergedTables[tId] = targetTableDoc;
    } else if (mode === 'keep_both') {
      targetTableId = `${tId}_imported_${Date.now().toString(36)}`;
      targetTableDoc = {
        ...tDoc,
        id: targetTableId,
        title: `${tDoc.title} (가져옴)`,
      };
      mergedTables[targetTableId] = targetTableDoc;
    } else {
      // Overwrite/update table
      mergedTables[tId] = targetTableDoc;
    }

    // Crucial: Keep tree item title synchronized with the table document title!
    const treeIdx = mergedTree.findIndex((t) => t.id === targetTableId);
    if (treeIdx >= 0) {
      mergedTree[treeIdx] = {
        ...mergedTree[treeIdx],
        title: targetTableDoc.title,
        updatedAt: targetTableDoc.updatedAt || Date.now(),
      };
    } else {
      // If table wasn't in tree, add it
      mergedTree.push({
        id: targetTableId,
        parentId: null,
        title: targetTableDoc.title || '새 데이터 테이블',
        type: 'table',
        isExpanded: false,
        createdAt: targetTableDoc.createdAt || Date.now(),
        updatedAt: targetTableDoc.updatedAt || Date.now(),
      });
    }
  }

  for (const [docId, document] of Object.entries(imported.documents || {})) {
    let targetDocumentId = docId;
    let targetDocument = { ...document };
    if (mode === 'keep_both' && mergedDocuments[docId]) {
      targetDocumentId = `${docId}_imported_${Date.now().toString(36)}`;
      targetDocument = { ...document, id: targetDocumentId, title: `${document.title} (가져옴)` };
      const treeId = importedTreeIdMap.get(docId);
      if (treeId) targetDocumentId = treeId;
      targetDocument = { ...document, id: targetDocumentId, title: `${document.title} (가져옴)` };
      mergedDocuments[targetDocumentId] = targetDocument;
    } else {
      mergedDocuments[docId] = { ...document };
    }
  }

  return ensureWorkspaceTree({
    ...current,
    tree: mergedTree,
    tables: mergedTables,
    documents: mergedDocuments,
    exportedAt: Date.now(),
  });
}

/**
 * 1. Serverless Implementation (IndexedDB in Browser)
 */
export class IndexedDBWorkspaceRepository implements IWorkspaceRepository {
  async loadWorkspace(): Promise<WorkspaceData> {
    return wonbeeDB.loadWorkspace();
  }

  async saveWorkspace(data: WorkspaceData): Promise<void> {
    return wonbeeDB.saveFullWorkspace(data);
  }

  async getTable(tableId: string): Promise<TableDocument | null> {
    const ws = await wonbeeDB.loadWorkspace();
    return ws.tables[tableId] || null;
  }

  async saveTable(table: TableDocument): Promise<void> {
    return wonbeeDB.saveTable(table);
  }

  async deleteTable(tableId: string): Promise<void> {
    return wonbeeDB.deleteTable(tableId);
  }

  async saveTree(tree: TreeItem[]): Promise<void> {
    return wonbeeDB.saveTree(tree);
  }

  async saveDocument(document: WonNoteDocument): Promise<void> {
    return wonbeeDB.saveDocument(document);
  }

  async deleteDocument(documentId: string): Promise<void> {
    return wonbeeDB.deleteDocument(documentId);
  }

  async mergeWorkspace(
    imported: WorkspaceData,
    mode: 'merge' | 'replace' | 'keep_both' = 'merge'
  ): Promise<WorkspaceData> {
    const current = await this.loadWorkspace();
    const merged = mergeWorkspaces(current, imported, mode);
    await this.saveWorkspace(merged);
    return merged;
  }

  async getStorageInfo() {
    const stats = await wonbeeDB.getStorageStats();
    return {
      type: 'indexeddb' as const,
      status: 'connected' as const,
      totalItems: stats.totalItems,
      sizeBytes: stats.sizeEstimatedBytes,
    };
  }

  async renameTable(tableId: string, newTitle: string): Promise<void> {
    const ws = await this.loadWorkspace();
    const updatedTables = { ...ws.tables };
    if (updatedTables[tableId]) {
      updatedTables[tableId] = { ...updatedTables[tableId], title: newTitle, updatedAt: Date.now() };
    }
    const updatedTree = ws.tree.map((t) =>
      t.id === tableId ? { ...t, title: newTitle, updatedAt: Date.now() } : t
    );
    await this.saveWorkspace({ ...ws, tables: updatedTables, tree: updatedTree });
  }

  async cleanDatabase(keepTableIds?: string[]): Promise<any> {
    return { success: true };
  }

  async getWorkspaceMeta() {
    const ws = await this.loadWorkspace();
    const rowCount = Object.values(ws.tables).reduce((sum, t) => sum + (t.rows?.length || 0), 0);
    return {
      last_updated_at: ws.exportedAt || Date.now(),
      total_count: rowCount,
      table_count: Object.keys(ws.tables).length,
      tree_count: ws.tree.length,
    };
  }

  async getNotesCursor(cursor?: string, limit: number = 50, tableId?: string) {
    const ws = await this.loadWorkspace();
    let rows: any[] = [];
    if (tableId && ws.tables[tableId]) {
      rows = ws.tables[tableId].rows || [];
    } else {
      rows = Object.values(ws.tables).flatMap((t) => t.rows || []);
    }
    rows.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

    if (cursor) {
      const parts = cursor.split('_');
      const curTime = parseInt(parts[0], 10);
      const curId = parts.slice(1).join('_');
      rows = rows.filter((r) => (r.updatedAt || 0) < curTime || ((r.updatedAt || 0) === curTime && r.id < curId));
    }

    const sliced = rows.slice(0, limit);
    const hasMore = rows.length > limit;
    let nextCursor: string | null = null;
    if (hasMore && sliced.length > 0) {
      const last = sliced[sliced.length - 1];
      nextCursor = `${last.updatedAt || 0}_${last.id}`;
    }

    return {
      data: sliced,
      pagination: {
        next_cursor: nextCursor,
        has_more: hasMore,
      },
    };
  }

  async syncNotes(since: number) {
    const ws = await this.loadWorkspace();
    const changed = Object.values(ws.tables).flatMap((t) => (t.rows || []).filter((r) => (r.updatedAt || 0) > since));
    return {
      data: changed,
      since,
      latest_updated_at: Date.now(),
      count: changed.length,
    };
  }

  async getDirtyNotes() {
    return wonbeeDexieDB.getDirtyNotes();
  }

  async markNotesClean(noteIds: string[]) {
    return wonbeeDexieDB.markNotesClean(noteIds);
  }

  async pushSync(notes?: any[]) {
    return { success: true, upsertedCount: 0 };
  }
}

/**
 * 2. Server Implementation (REST API with Local Fallback)
 */
export class ServerApiWorkspaceRepository implements IWorkspaceRepository {
  private serverUrl: string;
  private localFallback = new IndexedDBWorkspaceRepository();

  constructor(serverUrl: string = 'https://api.wonbee.com/v1') {
    this.serverUrl = serverUrl;
  }

  async getDirtyNotes() {
    return wonbeeDexieDB.getDirtyNotes();
  }

  async markNotesClean(noteIds: string[]) {
    return wonbeeDexieDB.markNotesClean(noteIds);
  }

  private async pushDirtyAssets(): Promise<boolean> {
    let succeeded = true;
    const assets = await wonbeeDexieDB.getDirtyAssets();
    const upload = async (asset: (typeof assets)[number]) => {
      try {
        const mimeType = asset.mime_type || asset.blob.type || 'application/octet-stream';
        const response = await fetchBridge(`${this.serverUrl}/assets?assetId=${encodeURIComponent(asset.id)}&filename=${encodeURIComponent(asset.filename)}`, {
          method: 'POST',
          headers: { 'Content-Type': mimeType },
          body: asset.blob,
        });
        if (!response.ok) throw new Error(`Asset push HTTP ${response.status}`);
        await wonbeeDexieDB.markAssetsClean([asset.id]);
      } catch (error) {
        succeeded = false;
        console.warn(`[Repository] Failed to sync image asset ${asset.id}:`, error);
      }
    };
    // A small bounded batch avoids serial latency without flooding the API or memory.
    for (let i = 0; i < assets.length; i += 4) {
      await Promise.all(assets.slice(i, i + 4).map(upload));
    }
    return succeeded;
  }

  async pushSync(notes?: any[]): Promise<{ success: boolean; upsertedCount: number; last_updated_at?: number }> {
    const assetsSucceeded = await this.pushDirtyAssets();
    try {
      const dirtyNotes = notes && notes.length > 0 ? notes : await wonbeeDexieDB.getDirtyNotes();
      if (!dirtyNotes || dirtyNotes.length === 0) {
        return { success: assetsSucceeded, upsertedCount: 0 };
      }

      let totalUpserted = 0;
      const BATCH_SIZE = 100;

      for (let i = 0; i < dirtyNotes.length; i += BATCH_SIZE) {
        const batch = dirtyNotes.slice(i, i + BATCH_SIZE);
        const res = await fetchBridge(`${this.serverUrl}/notes/push-sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(batch),
        });

        if (!res.ok) {
          throw new Error(`Push sync HTTP ${res.status}`);
        }

        const result = await res.json();
        if (result.success) {
          totalUpserted += result.upsertedCount || batch.length;
          const batchIds = batch.map((n: any) => n.id);
          await wonbeeDexieDB.markNotesClean(batchIds);
        }
      }

      return { success: assetsSucceeded, upsertedCount: totalUpserted };
    } catch (err) {
      console.warn('[Repository] pushSync failed:', err);
      return { success: false, upsertedCount: 0 };
    }
  }

  /**
   * 2. Initial Loading Flow (Zero 100MB+ dumps):
   * 1단계: 신규 클라이언트 브라우저일 경우 서버에서 전체 워크스페이스(/api/workspace)를 동기화 받음.
   * 2단계: 기존 로컬 캐시가 존재하는 경우 오프라인 미동기화 변경사항 Push Sync 실행.
   * 3단계: /api/workspace/meta 및 Pull Sync 실행하여 최신 차분 데이터 머지.
   */
  /**
   * 2. Initial Loading Flow (Zero 100MB+ dumps):
   * 1단계: Cold Start (신규 브라우저/시크릿 창) 감지 - 스키마 및 전체 데이터 Bootstrap 실행.
   * 2단계: 기존 로컬 캐시 존재 시 오프라인 미동기화 변경사항 Push Sync 실행.
   * 3단계: /api/workspace/meta 및 차분(Delta) Sync 실행하여 최신 변경사항 머지.
   */
  async loadWorkspace(signal?: AbortSignal): Promise<WorkspaceData> {
    const isFileProtocol = typeof window !== 'undefined' && window.location.protocol.startsWith('file:');
    let localWs = await this.localFallback.loadWorkspace();
    if (isFileProtocol) {
      return localWs;
    }

    const isRealLocal = await wonbeeDexieDB.hasRealLocalData();
    const lastSyncStr = localStorage.getItem('wonbee_last_sync_timestamp');
    const isColdStart = !isRealLocal || !lastSyncStr;

    try {
      // 1. Cold Start (최초 동기화) 로직: 스키마 골격 및 초기 데이터베이스 Bootstrap
      if (isColdStart) {
        console.log('[Repository] Cold start detected. Initializing full workspace bootstrap...');
        try {
          // 1단계: 전체 워크스페이스 직접 수신 시도 (bypassing deduplication for cold start)
          const serverWs = await deduplicatedFetchJson<WorkspaceData>(`${this.serverUrl}/workspace`, {
            cache: 'no-store',
            bypassDeduplication: true,
            signal,
          });

          if (serverWs && Object.keys(serverWs.tables || {}).length > 0) {
            const ensuredServerWs = ensureWorkspaceTree(serverWs);
            await wonbeeDexieDB.saveFullWorkspace(ensuredServerWs, 0);
            await this.pushDirtyAssets();
            const syncTime = ensuredServerWs.exportedAt || Date.now();
            localStorage.setItem('wonbee_last_sync_timestamp', String(syncTime));
            return ensuredServerWs;
          }
        } catch (fetchErr: any) {
          if (fetchErr?.name === 'AbortError') throw fetchErr;
          console.warn('[Repository] Full workspace fetch fallback, trying meta + notes bootstrap:', fetchErr);
        }

        // 2단계: 메타데이터 수신 및 테이블 스키마 골격 사전 빌드
        const meta = await this.getWorkspaceMeta(signal);
        if (meta && meta.tables) {
          const skeletonTables: Record<string, TableDocument> = {};
          Object.values(meta.tables).forEach((t: any) => {
            skeletonTables[t.id] = {
              id: t.id,
              title: t.title,
              description: t.description,
              defaultView: t.defaultView || 'grid',
              visibility: t.visibility,
              ownerId: t.ownerId,
              accessLevel: t.accessLevel,
              columns: t.columns || [],
              rows: [],
              createdAt: t.createdAt || Date.now(),
              updatedAt: t.updatedAt || Date.now(),
            };
          });

          const initialWs: WorkspaceData = {
            version: meta.version || '1.0.0',
            exportedAt: meta.last_updated_at || Date.now(),
            settings: meta.settings,
            tree: meta.tree || [],
            tables: skeletonTables,
            documents: meta.documents || {},
          };

          await wonbeeDexieDB.saveFullWorkspace(initialWs, 0);
          await this.syncNotes(0, signal);
          await this.pushDirtyAssets();

          localWs = await this.localFallback.loadWorkspace();
          const syncTime = meta.last_updated_at || Date.now();
          localStorage.setItem('wonbee_last_sync_timestamp', String(syncTime));
          localWs.exportedAt = syncTime;
          return localWs;
        }
      }

      // 2. 기존 로컬 캐시가 존재하는 경우 오프라인 변경 사항(is_dirty: 1) Push Sync
      await this.pushSync();

      // 3. /api/workspace/meta 조회 및 서버 트리 머지 (사용자 드래그앤드롭 순서 유지)
      const meta = await this.getWorkspaceMeta(signal);
      if (meta) {
        for (const [id, tableMeta] of Object.entries(meta.tables || {}) as Array<[string, any]>) {
          if (localWs.tables[id]) localWs.tables[id] = { ...localWs.tables[id], visibility: tableMeta.visibility, ownerId: tableMeta.ownerId, accessLevel: tableMeta.accessLevel };
        }
        if (meta.documents) {
          localWs.documents = meta.documents;
          await wonbeeDexieDB.saveFullWorkspace(localWs, 0);
        }
        if (meta.tree && Array.isArray(meta.tree)) {
          const mergedTree = mergeTrees(localWs.tree, meta.tree);
          await this.localFallback.saveTree(mergedTree);
          localWs.tree = mergedTree;
        }
      } else {
        return localWs;
      }

      const serverLastUpdated = meta.last_updated_at || 0;
      const lastSyncTimestamp = Number(localStorage.getItem('wonbee_last_sync_timestamp') || localWs.exportedAt || 0);

      // 4. 차분(Delta) Mode Sync 실행 (서버 노트/행 변경사항 로컬 머지)
      if (serverLastUpdated > lastSyncTimestamp) {
        await this.syncNotes(lastSyncTimestamp, signal);
        localWs = await this.localFallback.loadWorkspace();
        localWs.exportedAt = Math.max(serverLastUpdated, Date.now());
        localStorage.setItem('wonbee_last_sync_timestamp', String(serverLastUpdated));
      }

      // Ensure tree is up-to-date with meta.tree without losing user position
      if (meta.tree && Array.isArray(meta.tree)) {
        localWs.tree = mergeTrees(localWs.tree, meta.tree);
      }

      return localWs;
    } catch (err: any) {
      if (err?.name === 'AbortError') throw err;
      console.warn('[Repository] Server loadWorkspace offline fallback:', err);
      return localWs;
    }
  }

  async saveWorkspace(data: WorkspaceData): Promise<void> {
    const ensured = ensureWorkspaceTree(data);
    await this.localFallback.saveWorkspace(ensured);

    try {
      if (!(await this.pushDirtyAssets())) throw new Error('Image assets are waiting for server synchronization');
      const res = await fetchBridge(`${this.serverUrl}/workspace`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ensured),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `HTTP ${res.status}`);
      }
    } catch (err) {
      console.warn('[Repository] Server saveWorkspace offline fallback:', err);
    }
  }

  async getTable(tableId: string, signal?: AbortSignal): Promise<TableDocument | null> {
    try {
      return await deduplicatedFetchJson<TableDocument>(`${this.serverUrl}/tables/${tableId}`, {
        cache: 'no-store',
        signal,
      });
    } catch (err: any) {
      if (err?.name === 'AbortError') throw err;
      return this.localFallback.getTable(tableId);
    }
  }

  async saveTable(table: TableDocument): Promise<void> {
    await this.localFallback.saveTable(table);

    try {
      if (!(await this.pushDirtyAssets())) throw new Error('Image assets are waiting for server synchronization');
      const res = await fetchBridge(`${this.serverUrl}/tables/${table.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(table),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `HTTP ${res.status}`);
      }
      await wonbeeDexieDB.markTableClean(table.id);
    } catch (err) {
      console.warn('[Repository] Server saveTable offline fallback:', err);
    }
  }

  async renameTable(tableId: string, newTitle: string): Promise<void> {
    try {
      const res = await fetchBridge(`${this.serverUrl}/tables/${tableId}/rename`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle }),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
    } catch (err) {
      console.warn('[Repository] Server renameTable warning:', err);
    }
  }

  async cleanDatabase(keepTableIds?: string[]): Promise<any> {
    try {
      const res = await fetchBridge(`${this.serverUrl}/workspace/clean`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keepTableIds }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.error('[Repository] cleanDatabase failed:', err);
      throw err;
    }
  }

  async getWorkspaceMeta(signal?: AbortSignal) {
    try {
      return await deduplicatedFetchJson(`${this.serverUrl}/workspace/meta`, { signal });
    } catch (err: any) {
      if (err?.name === 'AbortError') throw err;
      return this.localFallback.getWorkspaceMeta();
    }
  }

  async getNotesCursor(cursor?: string, limit: number = 50, tableId?: string, signal?: AbortSignal) {
    try {
      let url = `${this.serverUrl}/notes?limit=${limit}`;
      if (cursor) url += `&cursor=${encodeURIComponent(cursor)}`;
      if (tableId) url += `&tableId=${encodeURIComponent(tableId)}`;
      return await deduplicatedFetchJson(url, { signal });
    } catch (err: any) {
      if (err?.name === 'AbortError') throw err;
      return this.localFallback.getNotesCursor(cursor, limit, tableId);
    }
  }

  async syncNotes(since: number, signal?: AbortSignal) {
    try {
      let cursor: string | null = null;
      let totalCount = 0;
      let latestUpdatedAt = since;
      let lastResponse: any = { data: [], since, latest_updated_at: since, count: 0 };
      const seenCursors = new Set<string>();
      do {
        const params = new URLSearchParams({ since: String(since), limit: '1000' });
        if (cursor) params.set('cursor', cursor);
        const page = await deduplicatedFetchJson<any>(`${this.serverUrl}/notes/sync?${params.toString()}`, { signal });
        const rows = Array.isArray(page.data) ? page.data : [];
        if (rows.length > 0) {
          // Apply each page before requesting the next so the workspace can be reloaded safely.
          await wonbeeDB.applyDeltaNotes(rows);
          totalCount += rows.length;
        }
        latestUpdatedAt = Math.max(latestUpdatedAt, Number(page.latest_updated_at) || since);
        lastResponse = page;
        const nextCursor = typeof page.next_cursor === 'string' ? page.next_cursor : null;
        if (!page.has_more || !nextCursor) break;
        if (seenCursors.has(nextCursor)) throw new Error('Notes sync returned a repeated cursor');
        seenCursors.add(nextCursor);
        cursor = nextCursor;
      } while (true);
      return { ...lastResponse, data: [], since, latest_updated_at: latestUpdatedAt, count: totalCount, has_more: false, next_cursor: null };
    } catch (err: any) {
      if (err?.name === 'AbortError') throw err;
      return this.localFallback.syncNotes(since);
    }
  }

  async deleteTable(tableId: string): Promise<void> {
    await this.localFallback.deleteTable(tableId);

    try {
      const res = await fetchBridge(`${this.serverUrl}/tables/${tableId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `HTTP ${res.status}`);
      }
    } catch (err) {
      console.warn('[Repository] Server deleteTable offline fallback:', err);
    }
  }

  async saveTree(tree: TreeItem[]): Promise<void> {
    await this.localFallback.saveTree(tree);

    try {
      const res = await fetchBridge(`${this.serverUrl}/tree`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tree),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `HTTP ${res.status}`);
      }
    } catch (err) {
      console.warn('[Repository] Server saveTree offline fallback:', err);
    }
  }

  async saveDocument(document: WonNoteDocument): Promise<void> {
    await this.localFallback.saveDocument(document);
    try {
      if (!(await this.pushDirtyAssets())) throw new Error('Image assets are waiting for server synchronization');
      const res = await fetchBridge(`${this.serverUrl}/documents/${encodeURIComponent(document.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(document),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      console.warn('[Repository] Server saveDocument offline fallback:', err);
    }
  }

  async deleteDocument(documentId: string): Promise<void> {
    await this.localFallback.deleteDocument(documentId);
    try {
      const res = await fetchBridge(`${this.serverUrl}/documents/${encodeURIComponent(documentId)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      console.warn('[Repository] Server deleteDocument offline fallback:', err);
    }
  }

  async mergeWorkspace(imported: WorkspaceData, mode: 'merge' | 'replace' | 'keep_both' = 'merge'): Promise<WorkspaceData> {
    const current = await this.loadWorkspace();
    const merged = mergeWorkspaces(current, imported, mode);
    await this.saveWorkspace(merged);
    return merged;
  }

  async getEvents(tableId?: string): Promise<CalendarEvent[]> {
    try {
      const url = tableId ? `${this.serverUrl}/events?tableId=${encodeURIComponent(tableId)}` : `${this.serverUrl}/events`;
      const res = await fetchBridge(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch {
      return [];
    }
  }

  async saveEvent(event: CalendarEvent, tableId: string): Promise<void> {
    try {
      await fetchBridge(`${this.serverUrl}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event, tableId }),
      });
    } catch (err) {
      console.warn('Server saveEvent failed:', err);
    }
  }

  async deleteEvent(eventId: string): Promise<void> {
    try {
      console.log(`[Repository] Requesting server delete for event: ${eventId}`);
      const res = await fetchBridge(`${this.serverUrl}/events/${encodeURIComponent(eventId)}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      console.log(`[Repository] Server successfully deleted event: ${eventId}`);
    } catch (err) {
      console.warn('Server deleteEvent failed:', err);
    }
  }

  async getStorageInfo() {
    return {
      type: 'server' as const,
      status: 'connected' as const,
      totalItems: 0,
    };
  }
}

/**
 * 3. Repository Factory
 */
export class WorkspaceRepositoryFactory {
  private static localRepo: IndexedDBWorkspaceRepository | null = null;
  private static serverRepo: ServerApiWorkspaceRepository | null = null;

  public static getRepository(config: StorageConfig): IWorkspaceRepository {
    if (config.useServer) {
      if (!this.serverRepo || (config.serverUrl && (this.serverRepo as any).serverUrl !== config.serverUrl)) {
        this.serverRepo = new ServerApiWorkspaceRepository(config.serverUrl || '/api');
      }
      return this.serverRepo;
    }

    if (!this.localRepo) {
      this.localRepo = new IndexedDBWorkspaceRepository();
    }
    return this.localRepo;
  }
}
