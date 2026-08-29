/**
 * WonBee IndexedDB Storage Engine
 * Ultra-fast, zero-dependency browser database for Serverless Mode
 */
import { WorkspaceData, TableDocument, TreeItem } from '../../types';
import { INITIAL_WORKSPACE_DATA } from '../../data/initialData';

const DB_NAME = 'wonbee_workspace_db';
const DB_VERSION = 1;
const STORE_WORKSPACE = 'workspace_meta';
const STORE_TABLES = 'tables';
const STORE_TREE = 'tree_nodes';

export class WonBeeIndexedDB {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<IDBDatabase> | null = null;

  public async getDb(): Promise<IDBDatabase> {
    if (this.db) return this.db;
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof window === 'undefined' || !window.indexedDB) {
        reject(new Error('IndexedDB is not supported in this environment'));
        return;
      }

      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_WORKSPACE)) {
          db.createObjectStore(STORE_WORKSPACE, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_TABLES)) {
          db.createObjectStore(STORE_TABLES, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_TREE)) {
          db.createObjectStore(STORE_TREE, { keyPath: 'id' });
        }
      };

      request.onsuccess = (event) => {
        this.db = (event.target as IDBOpenDBRequest).result;
        resolve(this.db);
      };

      request.onerror = (event) => {
        console.error('Failed to open WonBee IndexedDB:', (event.target as IDBOpenDBRequest).error);
        reject((event.target as IDBOpenDBRequest).error);
      };
    });

    return this.initPromise;
  }

  public async loadWorkspace(): Promise<WorkspaceData> {
    try {
      const db = await this.getDb();
      return new Promise<WorkspaceData>((resolve) => {
        const tx = db.transaction([STORE_WORKSPACE, STORE_TABLES, STORE_TREE], 'readonly');
        const wsStore = tx.objectStore(STORE_WORKSPACE);
        const tablesStore = tx.objectStore(STORE_TABLES);
        const treeStore = tx.objectStore(STORE_TREE);

        const wsReq = wsStore.get('root_workspace');
        const tablesReq = tablesStore.getAll();
        const treeReq = treeStore.getAll();

        let metaResult: any = null;
        let tablesResult: TableDocument[] = [];
        let treeResult: TreeItem[] = [];

        wsReq.onsuccess = () => {
          metaResult = wsReq.result;
        };
        tablesReq.onsuccess = () => {
          tablesResult = tablesReq.result || [];
        };
        treeReq.onsuccess = () => {
          treeResult = treeReq.result || [];
        };

        tx.oncomplete = () => {
          if (!metaResult || (tablesResult.length === 0 && treeResult.length === 0)) {
            // First time launch - seed initial data
            console.info('🐝 WonBee: Seeding initial workspace data into IndexedDB');
            this.saveFullWorkspace(INITIAL_WORKSPACE_DATA).then(() => {
              resolve(INITIAL_WORKSPACE_DATA);
            });
            return;
          }

          const tablesMap: Record<string, TableDocument> = {};
          tablesResult.forEach((t) => {
            tablesMap[t.id] = t;
          });

          resolve({
            version: metaResult.version || '1.0.0',
            exportedAt: metaResult.exportedAt || Date.now(),
            author: metaResult.author || 'WonBee User',
            settings: metaResult.settings || { theme: 'light', zoom: 100, useServer: false },
            tree: treeResult.length > 0 ? treeResult : INITIAL_WORKSPACE_DATA.tree,
            tables: Object.keys(tablesMap).length > 0 ? tablesMap : INITIAL_WORKSPACE_DATA.tables,
          });
        };

        tx.onerror = () => {
          console.warn('IndexedDB read transaction failed, falling back to initial data');
          resolve(INITIAL_WORKSPACE_DATA);
        };
      });
    } catch (err) {
      console.warn('IndexedDB error:', err);
      return INITIAL_WORKSPACE_DATA;
    }
  }

  public async saveFullWorkspace(workspace: WorkspaceData): Promise<void> {
    const db = await this.getDb();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction([STORE_WORKSPACE, STORE_TABLES, STORE_TREE], 'readwrite');
      const wsStore = tx.objectStore(STORE_WORKSPACE);
      const tablesStore = tx.objectStore(STORE_TABLES);
      const treeStore = tx.objectStore(STORE_TREE);

      // Save Workspace Meta
      wsStore.put({
        id: 'root_workspace',
        version: workspace.version,
        exportedAt: Date.now(),
        author: workspace.author,
        settings: workspace.settings,
      });

      // Clear and rewrite tables
      tablesStore.clear();
      Object.values(workspace.tables).forEach((table) => {
        tablesStore.put(table);
      });

      // Clear and rewrite tree
      treeStore.clear();
      workspace.tree.forEach((item) => {
        treeStore.put(item);
      });

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  public async saveTable(table: TableDocument): Promise<void> {
    const db = await this.getDb();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_TABLES, 'readwrite');
      const store = tx.objectStore(STORE_TABLES);
      store.put({
        ...table,
        updatedAt: Date.now(),
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  public async deleteTable(tableId: string): Promise<void> {
    const db = await this.getDb();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_TABLES, 'readwrite');
      const store = tx.objectStore(STORE_TABLES);
      store.delete(tableId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  public async saveTree(tree: TreeItem[]): Promise<void> {
    const db = await this.getDb();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_TREE, 'readwrite');
      const store = tx.objectStore(STORE_TREE);
      store.clear();
      tree.forEach((item) => store.put(item));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  public async getStorageStats(): Promise<{ totalItems: number; sizeEstimatedBytes: number }> {
    const db = await this.getDb();
    return new Promise((resolve) => {
      const tx = db.transaction([STORE_TABLES, STORE_TREE], 'readonly');
      const tablesReq = tx.objectStore(STORE_TABLES).getAll();
      const treeReq = tx.objectStore(STORE_TREE).getAll();

      let tables: any[] = [];
      let tree: any[] = [];

      tablesReq.onsuccess = () => { tables = tablesReq.result || []; };
      treeReq.onsuccess = () => { tree = treeReq.result || []; };

      tx.oncomplete = () => {
        const jsonStr = JSON.stringify({ tables, tree });
        resolve({
          totalItems: tables.length + tree.length,
          sizeEstimatedBytes: new Blob([jsonStr]).size,
        });
      };
      tx.onerror = () => {
        resolve({ totalItems: 0, sizeEstimatedBytes: 0 });
      };
    });
  }
}

export const wonbeeDB = new WonBeeIndexedDB();
