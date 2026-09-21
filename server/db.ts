import initSqlJs, { Database, SqlJsStatic } from 'sql.js';
import fs from 'fs';
import path from 'path';
import { WorkspaceData, TableDocument, TableRow, TableColumn, TreeItem, CalendarEvent } from '../src/types';

const DB_FILE_PATH = path.resolve(process.cwd(), 'wonbee.sqlite');
const USER_DATA_PATH = path.resolve(process.cwd(), 'user_data.json');
const DEFAULT_DATA_PATH = path.resolve(process.cwd(), 'public/wonbee_data.json');

let SQL: SqlJsStatic | null = null;
let dbInstance: Database | null = null;

/**
 * Persist SQLite WebAssembly memory database to disk file
 */
export function persistDatabase(): void {
  if (!dbInstance) return;
  try {
    const data = dbInstance.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_FILE_PATH, buffer);
  } catch (err) {
    console.error('[SQLite] Failed to persist database to disk:', err);
  }
}

/**
 * Initialize SQLite Database & Schema
 */
export async function initDatabase(): Promise<Database> {
  if (dbInstance) return dbInstance;

  SQL = await initSqlJs();

  if (fs.existsSync(DB_FILE_PATH)) {
    console.log('[SQLite] Loading existing database from:', DB_FILE_PATH);
    const fileBuffer = fs.readFileSync(DB_FILE_PATH);
    dbInstance = new SQL.Database(fileBuffer);
  } else {
    console.log('[SQLite] Creating new database file at:', DB_FILE_PATH);
    dbInstance = new SQL.Database();
  }

  // Create tables if they do not exist
  dbInstance.run(`
    CREATE TABLE IF NOT EXISTS workspace_meta (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS tree_items (
      id TEXT PRIMARY KEY,
      parent_id TEXT,
      title TEXT NOT NULL,
      type TEXT NOT NULL,
      icon TEXT,
      color TEXT,
      is_expanded INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      sort_order INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS tables (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      default_view TEXT DEFAULT 'grid',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS table_columns (
      id TEXT NOT NULL,
      table_id TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      width INTEGER DEFAULT 160,
      is_primary_key INTEGER DEFAULT 0,
      auto_update_date INTEGER DEFAULT 0,
      options_json TEXT,
      format TEXT,
      sort_order INTEGER DEFAULT 0,
      PRIMARY KEY (id, table_id)
    );

    CREATE TABLE IF NOT EXISTS table_rows (
      id TEXT PRIMARY KEY,
      table_id TEXT NOT NULL,
      data_json TEXT NOT NULL,
      rich_content TEXT,
      stickers_json TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS calendar_events (
      id TEXT PRIMARY KEY,
      table_id TEXT NOT NULL,
      table_row_id TEXT,
      title TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      start_time TEXT,
      end_time TEXT,
      is_all_day INTEGER DEFAULT 1,
      category TEXT DEFAULT 'work',
      color TEXT,
      location TEXT,
      description TEXT,
      priority TEXT DEFAULT 'normal',
      completed INTEGER DEFAULT 0,
      reminder_json TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS document_chunks (
      id TEXT PRIMARY KEY,
      doc_id TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      embedding_json TEXT,
      created_at INTEGER NOT NULL
    );
  `);

  // Check if database needs initial seeding/migration
  const res = dbInstance.exec("SELECT COUNT(*) as count FROM tables");
  const tableCount = (res[0]?.values[0]?.[0] as number) || 0;

  if (tableCount === 0) {
    console.log('[SQLite] Empty database detected. Running migration...');
    migrateJsonToSqlite(dbInstance);
  } else {
    // If user_data.json exists and is newer or explicit, we check if backup is needed
    if (fs.existsSync(USER_DATA_PATH)) {
      const backupPath = `${USER_DATA_PATH}.bak.${Date.now()}`;
      console.log(`[Migration] Backing up existing user_data.json to ${backupPath}`);
      fs.copyFileSync(USER_DATA_PATH, backupPath);
    }
  }

  persistDatabase();
  return dbInstance;
}

/**
 * Migrate user_data.json or wonbee_data.json into SQLite
 */
function migrateJsonToSqlite(db: Database): void {
  let sourcePath = USER_DATA_PATH;
  if (!fs.existsSync(sourcePath)) {
    sourcePath = DEFAULT_DATA_PATH;
  }

  if (!fs.existsSync(sourcePath)) {
    console.warn('[Migration] No JSON source file found to migrate.');
    return;
  }

  try {
    const raw = fs.readFileSync(sourcePath, 'utf-8');
    const data: WorkspaceData = JSON.parse(raw);

    // Backup source if it is user_data.json
    if (sourcePath === USER_DATA_PATH) {
      const backupPath = `${USER_DATA_PATH}.bak.${Date.now()}`;
      fs.copyFileSync(USER_DATA_PATH, backupPath);
      console.log(`[Migration] Backed up ${USER_DATA_PATH} to ${backupPath}`);
    }

    importWorkspaceDataToDb(db, data);
    console.log(`[Migration] Successfully imported workspace from ${sourcePath}`);
  } catch (err) {
    console.error('[Migration] Failed to migrate JSON data to SQLite:', err);
  }
}

/**
 * Import a complete WorkspaceData payload into SQLite tables
 */
export function importWorkspaceDataToDb(db: Database, data: WorkspaceData): void {
  db.run('BEGIN TRANSACTION;');

  try {
    // 1. Meta
    db.run("INSERT OR REPLACE INTO workspace_meta (key, value) VALUES ('version', ?);", [data.version || '1.0.0']);
    db.run("INSERT OR REPLACE INTO workspace_meta (key, value) VALUES ('exportedAt', ?);", [String(data.exportedAt || Date.now())]);
    if (data.settings) {
      db.run("INSERT OR REPLACE INTO workspace_meta (key, value) VALUES ('settings', ?);", [JSON.stringify(data.settings)]);
    }

    // 2. Tree Items
    db.run('DELETE FROM tree_items;');
    if (Array.isArray(data.tree)) {
      data.tree.forEach((item, index) => {
        db.run(
          `INSERT INTO tree_items (id, parent_id, title, type, icon, color, is_expanded, created_at, updated_at, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
          [
            item.id,
            item.parentId,
            item.title,
            item.type,
            item.icon || null,
            item.color || null,
            item.isExpanded ? 1 : 0,
            item.createdAt || Date.now(),
            item.updatedAt || Date.now(),
            index,
          ]
        );
      });
    }

    // 3. Tables, Columns, Rows
    db.run('DELETE FROM tables;');
    db.run('DELETE FROM table_columns;');
    db.run('DELETE FROM table_rows;');

    if (data.tables && typeof data.tables === 'object') {
      Object.values(data.tables).forEach((tbl) => {
        db.run(
          `INSERT INTO tables (id, title, description, default_view, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?);`,
          [
            tbl.id,
            tbl.title,
            tbl.description || null,
            tbl.defaultView || 'grid',
            tbl.createdAt || Date.now(),
            tbl.updatedAt || Date.now(),
          ]
        );

        if (Array.isArray(tbl.columns)) {
          tbl.columns.forEach((col, cIdx) => {
            db.run(
              `INSERT INTO table_columns (id, table_id, name, type, width, is_primary_key, auto_update_date, options_json, format, sort_order)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
              [
                col.id,
                tbl.id,
                col.name,
                col.type,
                col.width || 160,
                col.isPrimaryKey ? 1 : 0,
                col.autoUpdateDate ? 1 : 0,
                col.options ? JSON.stringify(col.options) : null,
                col.format || null,
                cIdx,
              ]
            );
          });
        }

        if (Array.isArray(tbl.rows)) {
          tbl.rows.forEach((row) => {
            db.run(
              `INSERT INTO table_rows (id, table_id, data_json, rich_content, stickers_json, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?);`,
              [
                row.id,
                tbl.id,
                JSON.stringify(row.data || {}),
                row.richContent || null,
                row.stickers ? JSON.stringify(row.stickers) : null,
                row.createdAt || Date.now(),
                row.updatedAt || Date.now(),
              ]
            );
          });
        }
      });
    }

    db.run('COMMIT;');
  } catch (e) {
    db.run('ROLLBACK;');
    throw e;
  }
}

/**
 * Load complete WorkspaceData from SQLite
 */
export function getWorkspaceData(): WorkspaceData {
  if (!dbInstance) throw new Error('Database not initialized');

  // Meta
  const metaRes = dbInstance.exec("SELECT key, value FROM workspace_meta");
  let version = '1.0.0';
  let exportedAt = Date.now();
  let settings = {};

  if (metaRes.length > 0) {
    for (const [k, v] of metaRes[0].values) {
      if (k === 'version') version = String(v);
      if (k === 'exportedAt') exportedAt = Number(v) || Date.now();
      if (k === 'settings' && typeof v === 'string') {
        try { settings = JSON.parse(v); } catch {}
      }
    }
  }

  // Tree
  const tree: TreeItem[] = [];
  const treeRes = dbInstance.exec("SELECT id, parent_id, title, type, icon, color, is_expanded, created_at, updated_at FROM tree_items ORDER BY sort_order ASC, created_at ASC");
  if (treeRes.length > 0) {
    for (const val of treeRes[0].values) {
      tree.push({
        id: String(val[0]),
        parentId: val[1] ? String(val[1]) : null,
        title: String(val[2]),
        type: val[3] as any,
        icon: val[4] ? String(val[4]) : undefined,
        color: val[5] ? String(val[5]) : undefined,
        isExpanded: Boolean(val[6]),
        createdAt: Number(val[7]),
        updatedAt: Number(val[8]),
      });
    }
  }

  // Tables
  const tables: Record<string, TableDocument> = {};
  const tablesRes = dbInstance.exec("SELECT id, title, description, default_view, created_at, updated_at FROM tables");
  if (tablesRes.length > 0) {
    for (const val of tablesRes[0].values) {
      const tableId = String(val[0]);
      tables[tableId] = {
        id: tableId,
        title: String(val[1]),
        description: val[2] ? String(val[2]) : undefined,
        defaultView: (val[3] as any) || 'grid',
        createdAt: Number(val[4]),
        updatedAt: Number(val[5]),
        columns: [],
        rows: [],
      };
    }
  }

  // Columns
  const colsRes = dbInstance.exec("SELECT id, table_id, name, type, width, is_primary_key, auto_update_date, options_json, format FROM table_columns ORDER BY sort_order ASC");
  if (colsRes.length > 0) {
    for (const val of colsRes[0].values) {
      const tableId = String(val[1]);
      if (tables[tableId]) {
        let options = undefined;
        if (val[7] && typeof val[7] === 'string') {
          try { options = JSON.parse(val[7]); } catch {}
        }
        tables[tableId].columns.push({
          id: String(val[0]),
          name: String(val[2]),
          type: val[3] as any,
          width: Number(val[4]) || 160,
          isPrimaryKey: Boolean(val[5]),
          autoUpdateDate: Boolean(val[6]),
          options,
          format: val[8] ? String(val[8]) : undefined,
        });
      }
    }
  }

  // Rows
  const rowsRes = dbInstance.exec("SELECT id, table_id, data_json, rich_content, stickers_json, created_at, updated_at FROM table_rows ORDER BY created_at ASC");
  if (rowsRes.length > 0) {
    for (const val of rowsRes[0].values) {
      const tableId = String(val[1]);
      if (tables[tableId]) {
        let data = {};
        let stickers = [];
        try { data = JSON.parse(String(val[2])); } catch {}
        if (val[4] && typeof val[4] === 'string') {
          try { stickers = JSON.parse(val[4]); } catch {}
        }
        tables[tableId].rows.push({
          id: String(val[0]),
          data,
          richContent: val[3] ? String(val[3]) : undefined,
          stickers,
          createdAt: Number(val[5]),
          updatedAt: Number(val[6]),
        });
      }
    }
  }

  return {
    version,
    exportedAt,
    tree,
    tables,
    settings,
  };
}

/**
 * Save complete workspace data into SQLite
 */
export function saveWorkspaceData(data: WorkspaceData): void {
  if (!dbInstance) throw new Error('Database not initialized');
  importWorkspaceDataToDb(dbInstance, data);
  persistDatabase();
}

/**
 * Get TableDocument by ID
 */
export function getTable(tableId: string): TableDocument | null {
  const ws = getWorkspaceData();
  return ws.tables[tableId] || null;
}

/**
 * Save single TableDocument into SQLite
 */
export function saveTable(table: TableDocument): void {
  if (!dbInstance) throw new Error('Database not initialized');

  dbInstance.run('BEGIN TRANSACTION;');
  try {
    dbInstance.run(
      `INSERT OR REPLACE INTO tables (id, title, description, default_view, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?);`,
      [table.id, table.title, table.description || null, table.defaultView || 'grid', table.createdAt, table.updatedAt]
    );

    // Columns
    dbInstance.run("DELETE FROM table_columns WHERE table_id = ?;", [table.id]);
    table.columns.forEach((col, idx) => {
      dbInstance!.run(
        `INSERT INTO table_columns (id, table_id, name, type, width, is_primary_key, auto_update_date, options_json, format, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        [
          col.id,
          table.id,
          col.name,
          col.type,
          col.width,
          col.isPrimaryKey ? 1 : 0,
          col.autoUpdateDate ? 1 : 0,
          col.options ? JSON.stringify(col.options) : null,
          col.format || null,
          idx,
        ]
      );
    });

    // Rows
    dbInstance.run("DELETE FROM table_rows WHERE table_id = ?;", [table.id]);
    table.rows.forEach((row) => {
      dbInstance!.run(
        `INSERT INTO table_rows (id, table_id, data_json, rich_content, stickers_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?);`,
        [
          row.id,
          table.id,
          JSON.stringify(row.data || {}),
          row.richContent || null,
          row.stickers ? JSON.stringify(row.stickers) : null,
          row.createdAt,
          row.updatedAt,
        ]
      );
    });

    dbInstance.run('COMMIT;');
  } catch (err) {
    dbInstance.run('ROLLBACK;');
    throw err;
  }

  persistDatabase();
}

/**
 * Delete a TableDocument from SQLite
 */
export function deleteTable(tableId: string): void {
  if (!dbInstance) throw new Error('Database not initialized');
  dbInstance.run('BEGIN TRANSACTION;');
  try {
    dbInstance.run("DELETE FROM table_rows WHERE table_id = ?;", [tableId]);
    dbInstance.run("DELETE FROM table_columns WHERE table_id = ?;", [tableId]);
    dbInstance.run("DELETE FROM calendar_events WHERE table_id = ?;", [tableId]);
    dbInstance.run("DELETE FROM tables WHERE id = ?;", [tableId]);
    dbInstance.run("DELETE FROM tree_items WHERE id = ?;", [tableId]);
    dbInstance.run('COMMIT;');
  } catch (err) {
    dbInstance.run('ROLLBACK;');
    throw err;
  }
  persistDatabase();
}

/**
 * Calendar Events CRUD
 */
export function getCalendarEvents(tableId?: string): CalendarEvent[] {
  if (!dbInstance) throw new Error('Database not initialized');
  const sql = tableId
    ? "SELECT id, table_id, table_row_id, title, start_date, end_date, start_time, end_time, is_all_day, category, color, location, description, priority, completed, reminder_json, created_at, updated_at FROM calendar_events WHERE table_id = ?"
    : "SELECT id, table_id, table_row_id, title, start_date, end_date, start_time, end_time, is_all_day, category, color, location, description, priority, completed, reminder_json, created_at, updated_at FROM calendar_events";
  
  const res = tableId ? dbInstance.exec(sql, [tableId]) : dbInstance.exec(sql);
  const events: CalendarEvent[] = [];

  if (res.length > 0) {
    for (const val of res[0].values) {
      let reminder = undefined;
      if (val[15] && typeof val[15] === 'string') {
        try { reminder = JSON.parse(val[15]); } catch {}
      }
      events.push({
        id: String(val[0]),
        tableRowId: val[2] ? String(val[2]) : undefined,
        title: String(val[3]),
        startDate: String(val[4]),
        endDate: String(val[5]),
        startTime: val[6] ? String(val[6]) : undefined,
        endTime: val[7] ? String(val[7]) : undefined,
        isAllDay: Boolean(val[8]),
        category: val[9] as any,
        color: val[10] ? String(val[10]) : undefined,
        location: val[11] ? String(val[11]) : undefined,
        description: val[12] ? String(val[12]) : undefined,
        priority: val[13] as any,
        completed: Boolean(val[14]),
        reminder,
        createdAt: Number(val[16]),
        updatedAt: Number(val[17]),
      });
    }
  }

  return events;
}

export function saveCalendarEvent(event: CalendarEvent, tableId: string): void {
  if (!dbInstance) throw new Error('Database not initialized');
  dbInstance.run(
    `INSERT OR REPLACE INTO calendar_events
     (id, table_id, table_row_id, title, start_date, end_date, start_time, end_time, is_all_day, category, color, location, description, priority, completed, reminder_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    [
      event.id,
      tableId,
      event.tableRowId || null,
      event.title,
      event.startDate,
      event.endDate,
      event.startTime || null,
      event.endTime || null,
      event.isAllDay ? 1 : 0,
      event.category || 'work',
      event.color || null,
      event.location || null,
      event.description || null,
      event.priority || 'normal',
      event.completed ? 1 : 0,
      event.reminder ? JSON.stringify(event.reminder) : null,
      event.createdAt || Date.now(),
      event.updatedAt || Date.now(),
    ]
  );
  persistDatabase();
}

export function deleteCalendarEvent(eventId: string): void {
  if (!dbInstance) throw new Error('Database not initialized');
  console.log('[SQLite DB] Executing DELETE FROM calendar_events WHERE id =', eventId);
  dbInstance.run("DELETE FROM calendar_events WHERE id = ?;", [eventId]);
  // Also check if any table_row is associated with it
  if (eventId.startsWith('row_evt_')) {
    const rowId = eventId.replace('row_evt_', '');
    dbInstance.run("DELETE FROM table_rows WHERE id = ?;", [rowId]);
  }
  persistDatabase();
}

/**
 * RAG Document Chunks Storage and Search
 */
export function insertDocumentChunk(chunk: { id: string; docId: string; title: string; content: string; embedding?: number[] }): void {
  if (!dbInstance) throw new Error('Database not initialized');
  dbInstance.run(
    `INSERT OR REPLACE INTO document_chunks (id, doc_id, title, content, embedding_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?);`,
    [
      chunk.id,
      chunk.docId,
      chunk.title,
      chunk.content,
      chunk.embedding ? JSON.stringify(chunk.embedding) : null,
      Date.now(),
    ]
  );
  persistDatabase();
}

export function searchDocumentChunks(query: string, limit = 5): Array<{ id: string; docId: string; title: string; content: string; score: number }> {
  if (!dbInstance) throw new Error('Database not initialized');
  const res = dbInstance.exec("SELECT id, doc_id, title, content, embedding_json FROM document_chunks");
  if (res.length === 0) return [];

  const queryTerms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const scored = res[0].values.map((val) => {
    const content = String(val[3]).toLowerCase();
    const title = String(val[2]).toLowerCase();
    let score = 0;
    queryTerms.forEach((term) => {
      if (title.includes(term)) score += 3;
      if (content.includes(term)) score += 1;
    });
    return {
      id: String(val[0]),
      docId: String(val[1]),
      title: String(val[2]),
      content: String(val[3]),
      score,
    };
  });

  return scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score).slice(0, limit);
}
