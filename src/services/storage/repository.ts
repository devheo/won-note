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
} from '../../types';
import { wonbeeDB } from './indexedDb';

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

    if (mode === 'replace') {
      await this.saveWorkspace(imported);
      return imported;
    }

    // Merge Mode: intelligently combine tables and tree items without dropping local state
    const mergedTables: Record<string, TableDocument> = { ...current.tables };
    const mergedTree: TreeItem[] = [...current.tree];

    const currentTreeIdMap = new Set(current.tree.map((t) => t.id));
    const currentTableIdMap = new Set(Object.keys(current.tables));

    // Handle incoming tree items
    for (const item of imported.tree) {
      if (!currentTreeIdMap.has(item.id)) {
        mergedTree.push(item);
      } else if (mode === 'keep_both') {
        // Generate new ID for collision
        const newId = `${item.id}_imported_${Date.now().toString(36)}`;
        mergedTree.push({
          ...item,
          id: newId,
          title: `${item.title} (가져옴)`,
        });
      }
    }

    // Handle incoming tables
    for (const [tId, tDoc] of Object.entries(imported.tables)) {
      if (!currentTableIdMap.has(tId)) {
        mergedTables[tId] = tDoc;
      } else if (mode === 'keep_both') {
        const newTableId = `${tId}_imported_${Date.now().toString(36)}`;
        mergedTables[newTableId] = {
          ...tDoc,
          id: newTableId,
          title: `${tDoc.title} (가져옴)`,
        };
      } else {
        // Overwrite or update with newer version
        mergedTables[tId] = tDoc;
      }
    }

    const mergedWorkspace: WorkspaceData = {
      ...current,
      tree: mergedTree,
      tables: mergedTables,
      exportedAt: Date.now(),
    };

    await this.saveWorkspace(mergedWorkspace);
    return mergedWorkspace;
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
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
      const data = await res.json();
      return data;
    } catch (err) {
      console.warn('Server repository unreachable, loading from local offline cache:', err);
      return this.localFallback.loadWorkspace();
    }
  }

  async saveWorkspace(data: WorkspaceData): Promise<void> {
    // Keep local cache synced
    await this.localFallback.saveWorkspace(data);

    try {
      await fetch(`${this.serverUrl}/workspace`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    } catch (err) {
      console.warn('Server save failed, changes safely preserved in local cache:', err);
    }
  }

  async getTable(tableId: string): Promise<TableDocument | null> {
    try {
      const res = await fetch(`${this.serverUrl}/tables/${tableId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch {
      return this.localFallback.getTable(tableId);
    }
  }

  async saveTable(table: TableDocument): Promise<void> {
    await this.localFallback.saveTable(table);
    try {
      await fetch(`${this.serverUrl}/tables/${table.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(table),
      });
    } catch (err) {
      console.warn('Server saveTable failed:', err);
    }
  }

  async deleteTable(tableId: string): Promise<void> {
    await this.localFallback.deleteTable(tableId);
    try {
      await fetch(`${this.serverUrl}/tables/${tableId}`, {
        method: 'DELETE',
      });
    } catch (err) {
      console.warn('Server deleteTable failed:', err);
    }
  }

  async saveTree(tree: TreeItem[]): Promise<void> {
    await this.localFallback.saveTree(tree);
    try {
      await fetch(`${this.serverUrl}/tree`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tree),
      });
    } catch (err) {
      console.warn('Server saveTree failed:', err);
    }
  }

  async mergeWorkspace(imported: WorkspaceData, mode: 'merge' | 'replace' | 'keep_both' = 'merge'): Promise<WorkspaceData> {
    const merged = await this.localFallback.mergeWorkspace(imported, mode);
    await this.saveWorkspace(merged);
    return merged;
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
        this.serverRepo = new ServerApiWorkspaceRepository(config.serverUrl || 'https://api.wonbee.com/v1');
      }
      return this.serverRepo;
    }

    if (!this.localRepo) {
      this.localRepo = new IndexedDBWorkspaceRepository();
    }
    return this.localRepo;
  }
}
