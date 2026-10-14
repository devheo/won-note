import Dexie, { type Table } from 'dexie';
import { WorkspaceData, TableDocument, TreeItem, TableRow, ItemType } from '../../types';
import { INITIAL_WORKSPACE_DATA } from '../../data/initialData';
import { ensureWorkspaceTree } from '../../utils/workspaceTreeUtils';

export interface DexieWorkspaceMeta {
  id: string; // e.g., 'root_workspace'
  version: string;
  exportedAt: number;
  author?: string;
  settings?: any;
}

export interface DexieTreeItem {
  id: string;
  parentId: string | null;
  title: string;
  type: ItemType;
  icon?: string;
  color?: string;
  isExpanded?: boolean;
  sortOrder?: number;
  createdAt?: number;
  updatedAt?: number;
}

export interface DexieTableDoc {
  id: string;
  title: string;
  description?: string;
  defaultView?: 'grid' | 'cards' | 'calendar' | 'memo';
  columns: any[];
  rows: TableRow[];
  createdAt: number;
  updatedAt: number;
  is_dirty?: number; // 1 = dirty (un-synced), 0 = clean
}

export interface DexieNote {
  id: string;
  table_id: string;
  title: string;
  content: string;
  data_json?: string;
  rich_content?: string;
  created_at: number;
  updated_at: number;
  is_dirty?: number; // 1 = dirty (un-synced), 0 = clean
}

export interface DexieAsset {
  id: string; // e.g. 'asset-{uuid}'
  blob: Blob;
  filename: string; // e.g. 'asset_{uuid}.png'
  mime_type: string; // e.g. 'image/png'
  created_at: number;
  is_dirty?: number; // 1 = dirty (un-synced to server), 0 = clean
}

/**
 * High-performance Dexie.js Client Database
 * Replaces 5MB localStorage and un-indexed IDB with indexed storage for 1000MB+ environments.
 */
export class WonBeeDexieDatabase extends Dexie {
  workspace_meta!: Table<DexieWorkspaceMeta, string>;
  tree_items!: Table<DexieTreeItem, string>;
  table_docs!: Table<DexieTableDoc, string>;
  notes!: Table<DexieNote, string>;
  assets!: Table<DexieAsset, string>;

  constructor() {
    super('wonbee_dexie_db');
    this.version(1).stores({
      workspace_meta: 'id',
      tree_items: 'id, parentId, sortOrder, updatedAt',
      table_docs: 'id, title, updatedAt',
      notes: 'id, table_id, updated_at, [table_id+updated_at]',
    });
    this.version(2).stores({
      table_docs: 'id, title, updatedAt, is_dirty',
      notes: 'id, table_id, updated_at, is_dirty, [table_id+updated_at]',
    });
    this.version(3).stores({
      assets: 'id, created_at, is_dirty',
    });
  }

  /**
   * Check if Dexie DB has real saved workspace data (vs fresh uninitialized state)
   */
  async hasRealLocalData(): Promise<boolean> {
    try {
      const meta = await this.workspace_meta.get('root_workspace');
      const tableCount = await this.table_docs.count();
      return Boolean(meta) && tableCount > 0;
    } catch {
      return false;
    }
  }

  /**
   * Fast Stale-While-Revalidate initial load (<10ms)
   */
  async loadWorkspace(): Promise<WorkspaceData> {
    try {
      const [meta, treeList, tablesList] = await Promise.all([
        this.workspace_meta.get('root_workspace'),
        this.tree_items.toArray(),
        this.table_docs.toArray(),
      ]);

      if (!tablesList || tablesList.length === 0) {
        return {
          version: meta?.version || '1.0.0',
          exportedAt: meta?.exportedAt || 0,
          settings: meta?.settings || { theme: 'light', zoom: 100, useServer: true },
          tree: [],
          tables: {},
        };
      }

      const tablesMap: Record<string, TableDocument> = {};
      tablesList.forEach((tbl) => {
        tablesMap[tbl.id] = {
          id: tbl.id,
          title: tbl.title,
          description: tbl.description,
          defaultView: tbl.defaultView,
          columns: tbl.columns || [],
          rows: tbl.rows || [],
          createdAt: tbl.createdAt,
          updatedAt: tbl.updatedAt,
        };
      });

      const treeItems: TreeItem[] = treeList.map((t) => ({
        id: t.id,
        parentId: t.parentId,
        title: t.title,
        type: t.type,
        icon: t.icon,
        color: t.color,
        isExpanded: t.isExpanded,
        createdAt: t.createdAt || Date.now(),
        updatedAt: t.updatedAt || Date.now(),
      }));

      return ensureWorkspaceTree({
        version: meta?.version || '1.0.0',
        exportedAt: meta?.exportedAt || Date.now(),
        settings: meta?.settings || { theme: 'light', zoom: 100, useServer: false },
        tree: treeItems,
        tables: tablesMap,
      });
    } catch (err) {
      console.warn('[Dexie] Failed to load workspace, falling back to initial data:', err);
      return INITIAL_WORKSPACE_DATA;
    }
  }

  /**
   * Save full workspace in a single indexed transaction
   */
  async saveFullWorkspace(workspace: WorkspaceData, isDirty: number = 1): Promise<void> {
    const ensured = ensureWorkspaceTree(workspace);
    const now = Date.now();

    await this.transaction('rw', [this.workspace_meta, this.tree_items, this.table_docs, this.notes], async () => {
      // 1. Meta
      await this.workspace_meta.put({
        id: 'root_workspace',
        version: ensured.version || '1.0.0',
        exportedAt: now,
        author: ensured.author,
        settings: ensured.settings,
      });

      // 2. Clear old data
      await this.tree_items.clear();
      await this.table_docs.clear();
      await this.notes.clear();

      // 3. Insert tree items
      const treeEntries: DexieTreeItem[] = ensured.tree.map((t, idx) => ({
        id: t.id,
        parentId: t.parentId,
        title: t.title,
        type: t.type,
        icon: t.icon,
        color: t.color,
        isExpanded: t.isExpanded,
        sortOrder: idx,
        createdAt: t.createdAt || now,
        updatedAt: t.updatedAt || now,
      }));
      await this.tree_items.bulkPut(treeEntries);

      // 4. Insert tables and notes
      const tableEntries: DexieTableDoc[] = [];
      const noteEntries: DexieNote[] = [];

      Object.values(ensured.tables).forEach((tbl) => {
        const rowsWithDirty = (tbl.rows || []).map((row) => ({
          ...row,
          updatedAt: row.updatedAt || now,
          is_dirty: row.is_dirty !== undefined ? row.is_dirty : isDirty,
        }));

        tableEntries.push({
          id: tbl.id,
          title: tbl.title,
          description: tbl.description,
          defaultView: tbl.defaultView,
          columns: tbl.columns || [],
          rows: rowsWithDirty,
          createdAt: tbl.createdAt || now,
          updatedAt: tbl.updatedAt || now,
          is_dirty: isDirty,
        });

        rowsWithDirty.forEach((row) => {
          const rowTitle = row.data?.name || row.data?.title || Object.values(row.data || {})[0] || row.id;
          noteEntries.push({
            id: row.id,
            table_id: tbl.id,
            title: String(rowTitle),
            content: row.richContent || JSON.stringify(row.data || {}),
            data_json: JSON.stringify(row.data || {}),
            rich_content: row.richContent,
            created_at: row.createdAt || now,
            updated_at: row.updatedAt || now,
            is_dirty: row.is_dirty !== undefined ? row.is_dirty : isDirty,
          });
        });
      });

      await this.table_docs.bulkPut(tableEntries);
      if (noteEntries.length > 0) {
        await this.notes.bulkPut(noteEntries);
      }
    });
  }

  /**
   * Save a single table incrementally
   */
  async saveTable(table: TableDocument, isDirty: number = 1): Promise<void> {
    const now = Date.now();
    await this.transaction('rw', [this.table_docs, this.notes], async () => {
      const rowsWithDirty = (table.rows || []).map((row) => ({
        ...row,
        updatedAt: row.updatedAt || now,
        is_dirty: row.is_dirty !== undefined ? row.is_dirty : isDirty,
      }));

      await this.table_docs.put({
        id: table.id,
        title: table.title,
        description: table.description,
        defaultView: table.defaultView,
        columns: table.columns || [],
        rows: rowsWithDirty,
        createdAt: table.createdAt || now,
        updatedAt: now,
        is_dirty: isDirty,
      });

      // Clear existing notes for this table and re-insert with dirty flag
      await this.notes.where('table_id').equals(table.id).delete();
      if (rowsWithDirty.length > 0) {
        const noteEntries: DexieNote[] = rowsWithDirty.map((row) => {
          const rowTitle = row.data?.name || row.data?.title || Object.values(row.data || {})[0] || row.id;
          return {
            id: row.id,
            table_id: table.id,
            title: String(rowTitle),
            content: row.richContent || JSON.stringify(row.data || {}),
            data_json: JSON.stringify(row.data || {}),
            rich_content: row.richContent,
            created_at: row.createdAt || now,
            updated_at: row.updatedAt || now,
            is_dirty: row.is_dirty !== undefined ? row.is_dirty : isDirty,
          };
        });
        await this.notes.bulkPut(noteEntries);
      }
    });
  }

  /**
   * Delete a table
   */
  async deleteTable(tableId: string): Promise<void> {
    await this.transaction('rw', [this.table_docs, this.tree_items, this.notes], async () => {
      await this.table_docs.delete(tableId);
      await this.tree_items.delete(tableId);
      await this.notes.where('table_id').equals(tableId).delete();
    });
  }

  /**
   * Save tree items
   */
  async saveTree(tree: TreeItem[]): Promise<void> {
    const now = Date.now();
    await this.transaction('rw', [this.tree_items], async () => {
      await this.tree_items.clear();
      const entries: DexieTreeItem[] = tree.map((t, idx) => ({
        id: t.id,
        parentId: t.parentId,
        title: t.title,
        type: t.type,
        icon: t.icon,
        color: t.color,
        isExpanded: t.isExpanded,
        sortOrder: idx,
        createdAt: t.createdAt || now,
        updatedAt: t.updatedAt || now,
      }));
      await this.tree_items.bulkPut(entries);
    });
  }

  /**
   * Apply Delta (Changed) Notes from Server Sync into Dexie
   */
  async applyDeltaNotes(deltaNotes: any[]): Promise<void> {
    if (!deltaNotes || deltaNotes.length === 0) return;

    await this.transaction('rw', [this.notes, this.table_docs], async () => {
      const noteEntries: DexieNote[] = deltaNotes.map((d) => ({
        id: d.id,
        table_id: d.table_id,
        title: d.title || d.id,
        content: d.content || d.rich_content || '',
        data_json: d.data_json,
        rich_content: d.rich_content,
        created_at: d.created_at || Date.now(),
        updated_at: d.updated_at || Date.now(),
        is_dirty: 0,
      }));
      await this.notes.bulkPut(noteEntries);

      // Also merge changed rows into cached tables in Dexie
      const tableGroup = new Map<string, any[]>();
      deltaNotes.forEach((d) => {
        if (!d.table_id) return;
        const list = tableGroup.get(d.table_id) || [];
        list.push(d);
        tableGroup.set(d.table_id, list);
      });

      for (const [tableId, changedNotes] of tableGroup.entries()) {
        let tbl = await this.table_docs.get(tableId);
        if (!tbl) {
          // Auto-create skeleton table document if missing in Dexie so incoming notes are never discarded!
          const firstNote = changedNotes[0];
          const tableTitle = firstNote?.table_title || tableId;
          tbl = {
            id: tableId,
            title: tableTitle,
            columns: [
              { id: 'col-name', name: '이름 / 항목명', type: 'text', width: 220, isPrimaryKey: true },
              { id: 'col-note', name: '상세 노트', type: 'richText', width: 320 },
              { id: 'col-updated-at', name: '수정일', type: 'date', width: 155, autoUpdateDate: true },
            ],
            rows: [],
            createdAt: Date.now(),
            updatedAt: Date.now(),
            is_dirty: 0,
          };
        }

        const rowMap = new Map((tbl.rows || []).map((r) => [r.id, r]));
        changedNotes.forEach((n) => {
          let rowData: any = {};
          if (n.data_json) {
            try { rowData = JSON.parse(n.data_json); } catch {}
          } else if (n.data) {
            rowData = n.data;
          }
          rowMap.set(n.id, {
            id: n.id,
            data: rowData,
            richContent: n.rich_content || undefined,
            createdAt: n.created_at || Date.now(),
            updatedAt: n.updated_at || Date.now(),
            is_dirty: 0,
          });
        });
        tbl.rows = Array.from(rowMap.values());
        await this.table_docs.put(tbl);
      }
    });
  }

  /**
   * Extract all dirty records (is_dirty: 1) for Push Sync to server
   */
  async getDirtyNotes(): Promise<(DexieNote & { table_title?: string })[]> {
    try {
      const dirty = await this.notes.where('is_dirty').equals(1).toArray();
      const tables = await this.table_docs.toArray();
      const tableMap = new Map(tables.map((t) => [t.id, t]));

      if (dirty.length > 0) {
        return dirty.map((n) => {
          const tDoc = tableMap.get(n.table_id);
          return {
            ...n,
            table_title: tDoc?.title || n.table_id,
          };
        });
      }

      // Fallback: check rows in table_docs
      const extracted: (DexieNote & { table_title?: string })[] = [];
      for (const t of tables) {
        if (Array.isArray(t.rows)) {
          for (const r of t.rows) {
            if (r.is_dirty === 1) {
              const rowTitle = r.data?.name || r.data?.title || Object.values(r.data || {})[0] || r.id;
              extracted.push({
                id: r.id,
                table_id: t.id,
                title: String(rowTitle),
                content: r.richContent || JSON.stringify(r.data || {}),
                data_json: JSON.stringify(r.data || {}),
                rich_content: r.richContent,
                created_at: r.createdAt || Date.now(),
                updated_at: r.updatedAt || Date.now(),
                is_dirty: 1,
                table_title: t.title || t.id,
              });
            }
          }
        }
      }
      return extracted;
    } catch (err) {
      console.warn('[Dexie] Failed to get dirty notes:', err);
      return [];
    }
  }

  /**
   * Mark successfully synced notes as clean (is_dirty: 0)
   */
  async markNotesClean(noteIds: string[]): Promise<void> {
    if (!noteIds || noteIds.length === 0) return;
    const idSet = new Set(noteIds);

    await this.transaction('rw', [this.notes, this.table_docs], async () => {
      for (const id of noteIds) {
        await this.notes.update(id, { is_dirty: 0 });
      }

      const allTables = await this.table_docs.toArray();
      for (const tbl of allTables) {
        let changed = false;
        if (Array.isArray(tbl.rows)) {
          tbl.rows.forEach((r) => {
            if (idSet.has(r.id) && r.is_dirty !== 0) {
              r.is_dirty = 0;
              changed = true;
            }
          });
        }
        if (tbl.is_dirty === 1 && (!tbl.rows || tbl.rows.every((r) => r.is_dirty !== 1))) {
          tbl.is_dirty = 0;
          changed = true;
        }
        if (changed) {
          await this.table_docs.put(tbl);
        }
      }
    });
  }

  /**
   * Cursor-based pagination on local Dexie storage
   */
  async getNotesCursor(
    cursor?: string,
    limit: number = 50,
    tableId?: string
  ): Promise<{ data: DexieNote[]; nextCursor: string | null; hasMore: boolean }> {
    let collection = tableId
      ? this.notes.where('table_id').equals(tableId)
      : this.notes.toCollection();

    let sorted = await collection.reverse().sortBy('updated_at');

    if (cursor) {
      const parts = cursor.split('_');
      const cursorTime = parseInt(parts[0], 10);
      const cursorId = parts.slice(1).join('_');
      sorted = sorted.filter(
        (n) => n.updated_at < cursorTime || (n.updated_at === cursorTime && n.id < cursorId)
      );
    }

    const sliced = sorted.slice(0, limit);
    const hasMore = sorted.length > limit;
    let nextCursor: string | null = null;
    if (hasMore && sliced.length > 0) {
      const last = sliced[sliced.length - 1];
      nextCursor = `${last.updated_at}_${last.id}`;
    }

    return {
      data: sliced,
      nextCursor,
      hasMore,
    };
  }

  async getStorageStats(): Promise<{ totalItems: number; sizeEstimatedBytes: number }> {
    const [noteCount, tableCount, treeCount, assetCount] = await Promise.all([
      this.notes.count(),
      this.table_docs.count(),
      this.tree_items.count(),
      this.assets.count(),
    ]);

    return {
      totalItems: noteCount + tableCount + treeCount + assetCount,
      sizeEstimatedBytes: (noteCount * 1024) + (tableCount * 4096) + (assetCount * 50000),
    };
  }

  // --- Asset Storage CRUD Methods ---
  async saveAsset(asset: DexieAsset): Promise<void> {
    await this.assets.put(asset);
  }

  async getAsset(id: string): Promise<DexieAsset | undefined> {
    return this.assets.get(id);
  }

  async getDirtyAssets(): Promise<DexieAsset[]> {
    try {
      return await this.assets.where('is_dirty').equals(1).toArray();
    } catch {
      return [];
    }
  }

  async markAssetsClean(ids: string[]): Promise<void> {
    if (!ids || ids.length === 0) return;
    await this.transaction('rw', [this.assets], async () => {
      for (const id of ids) {
        await this.assets.update(id, { is_dirty: 0 });
      }
    });
  }
}

export const wonbeeDexieDB = new WonBeeDexieDatabase();
