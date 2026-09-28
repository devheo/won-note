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
  defaultView?: 'grid' | 'cards' | 'calendar';
  columns: any[];
  rows: TableRow[];
  createdAt: number;
  updatedAt: number;
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

  constructor() {
    super('wonbee_dexie_db');
    this.version(1).stores({
      workspace_meta: 'id',
      tree_items: 'id, parentId, sortOrder, updatedAt',
      table_docs: 'id, title, updatedAt',
      notes: 'id, table_id, updated_at, [table_id+updated_at]',
    });
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
        return INITIAL_WORKSPACE_DATA;
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
  async saveFullWorkspace(workspace: WorkspaceData): Promise<void> {
    const ensured = ensureWorkspaceTree(workspace);
    const now = Date.now();

    await this.transaction('rw', [this.workspace_meta, this.tree_items, this.table_docs, this.notes], async () => {
      // 1. Meta
      await this.workspace_meta.put({
        id: 'root_workspace',
        version: ensured.version || '1.0.0',
        exportedAt: ensured.exportedAt || now,
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
        tableEntries.push({
          id: tbl.id,
          title: tbl.title,
          description: tbl.description,
          defaultView: tbl.defaultView,
          columns: tbl.columns || [],
          rows: tbl.rows || [],
          createdAt: tbl.createdAt || now,
          updatedAt: tbl.updatedAt || now,
        });

        if (Array.isArray(tbl.rows)) {
          tbl.rows.forEach((row) => {
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
            });
          });
        }
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
  async saveTable(table: TableDocument): Promise<void> {
    const now = Date.now();
    await this.transaction('rw', [this.table_docs, this.notes], async () => {
      await this.table_docs.put({
        id: table.id,
        title: table.title,
        description: table.description,
        defaultView: table.defaultView,
        columns: table.columns || [],
        rows: table.rows || [],
        createdAt: table.createdAt || now,
        updatedAt: table.updatedAt || now,
      });

      // Clear existing notes for this table and re-insert
      await this.notes.where('table_id').equals(table.id).delete();
      if (Array.isArray(table.rows) && table.rows.length > 0) {
        const noteEntries: DexieNote[] = table.rows.map((row) => {
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
        const tbl = await this.table_docs.get(tableId);
        if (tbl) {
          const rowMap = new Map(tbl.rows.map((r) => [r.id, r]));
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
            });
          });
          tbl.rows = Array.from(rowMap.values());
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
    const [noteCount, tableCount, treeCount] = await Promise.all([
      this.notes.count(),
      this.table_docs.count(),
      this.tree_items.count(),
    ]);

    return {
      totalItems: noteCount + tableCount + treeCount,
      sizeEstimatedBytes: (noteCount * 1024) + (tableCount * 4096),
    };
  }
}

export const wonbeeDexieDB = new WonBeeDexieDatabase();
