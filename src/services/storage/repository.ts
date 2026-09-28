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
} from '../../types';
import { wonbeeDB } from './indexedDb';
import { ensureWorkspaceTree } from '../../utils/workspaceTreeUtils';

export function mergeWorkspaces(
  current: WorkspaceData,
  imported: WorkspaceData,
  mode: 'merge' | 'replace' | 'keep_both' = 'merge'
): WorkspaceData {
  if (mode === 'replace') {
    return ensureWorkspaceTree(imported);
  }

  const mergedTables: Record<string, TableDocument> = { ...current.tables };
  const mergedTree: TreeItem[] = [...current.tree];

  const currentTreeIdMap = new Map(current.tree.map((t, idx) => [t.id, idx]));
  const currentTableIdMap = new Set(Object.keys(current.tables));

  // 1. Handle incoming tree items
  for (const item of imported.tree) {
    if (!currentTreeIdMap.has(item.id)) {
      mergedTree.push({ ...item });
      currentTreeIdMap.set(item.id, mergedTree.length - 1);
    } else if (mode === 'keep_both') {
      const newId = `${item.id}_imported_${Date.now().toString(36)}`;
      mergedTree.push({
        ...item,
        id: newId,
        title: `${item.title} (가져옴)`,
      });
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

  return ensureWorkspaceTree({
    ...current,
    tree: mergedTree,
    tables: mergedTables,
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

  async loadWorkspace(): Promise<WorkspaceData> {
    try {
      const res = await fetch(`${this.serverUrl}/workspace`, {
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
        },
      });
      if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
      const data = await res.json();
      // Keep local cache synced in background without blocking
      this.localFallback.saveWorkspace(data).catch(() => {});
      return data;
    } catch (err) {
      console.warn('Server repository unreachable, loading from local offline cache:', err);
      return this.localFallback.loadWorkspace();
    }
  }

  async saveWorkspace(data: WorkspaceData): Promise<void> {
    const ensured = ensureWorkspaceTree(data);
    // Keep local cache synced in background without blocking
    this.localFallback.saveWorkspace(ensured).catch(() => {});

    try {
      const res = await fetch(`${this.serverUrl}/workspace`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ensured),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `HTTP ${res.status}`);
      }
    } catch (err) {
      console.error('[Repository] Server saveWorkspace failed:', err);
      throw err;
    }
  }

  async getTable(tableId: string): Promise<TableDocument | null> {
    try {
      const res = await fetch(`${this.serverUrl}/tables/${tableId}`, {
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch {
      return this.localFallback.getTable(tableId);
    }
  }

  async saveTable(table: TableDocument): Promise<void> {
    // Fast path: sync to local fallback in background
    this.localFallback.saveTable(table).catch(() => {});
    try {
      const res = await fetch(`${this.serverUrl}/tables/${table.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(table),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `HTTP ${res.status}`);
      }
    } catch (err) {
      console.error('[Repository] Server saveTable failed:', err);
      throw err;
    }
  }

  async renameTable(tableId: string, newTitle: string): Promise<void> {
    try {
      const res = await fetch(`${this.serverUrl}/tables/${tableId}/rename`, {
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
      const res = await fetch(`${this.serverUrl}/workspace/clean`, {
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

  async getWorkspaceMeta() {
    try {
      const res = await fetch(`${this.serverUrl}/workspace/meta`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      return this.localFallback.getWorkspaceMeta();
    }
  }

  async getNotesCursor(cursor?: string, limit: number = 50, tableId?: string) {
    try {
      let url = `${this.serverUrl}/notes?limit=${limit}`;
      if (cursor) url += `&cursor=${encodeURIComponent(cursor)}`;
      if (tableId) url += `&tableId=${encodeURIComponent(tableId)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      return this.localFallback.getNotesCursor(cursor, limit, tableId);
    }
  }

  async syncNotes(since: number) {
    try {
      const res = await fetch(`${this.serverUrl}/notes/sync?since=${since}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (Array.isArray(data.data) && data.data.length > 0) {
        // Sync delta notes into Dexie in background
        wonbeeDB.applyDeltaNotes(data.data).catch(() => {});
      }
      return data;
    } catch (err) {
      return this.localFallback.syncNotes(since);
    }
  }

  async deleteTable(tableId: string): Promise<void> {
    this.localFallback.deleteTable(tableId).catch(() => {});
    try {
      const res = await fetch(`${this.serverUrl}/tables/${tableId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `HTTP ${res.status}`);
      }
    } catch (err) {
      console.error('[Repository] Server deleteTable failed:', err);
      throw err;
    }
  }

  async saveTree(tree: TreeItem[]): Promise<void> {
    this.localFallback.saveTree(tree).catch(() => {});
    try {
      const res = await fetch(`${this.serverUrl}/tree`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tree),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `HTTP ${res.status}`);
      }
    } catch (err) {
      console.error('[Repository] Server saveTree failed:', err);
      throw err;
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
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch {
      return [];
    }
  }

  async saveEvent(event: CalendarEvent, tableId: string): Promise<void> {
    try {
      await fetch(`${this.serverUrl}/events`, {
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
      const res = await fetch(`${this.serverUrl}/events/${encodeURIComponent(eventId)}`, {
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
