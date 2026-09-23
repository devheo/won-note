import initSqlJs, { Database, SqlJsStatic } from 'sql.js';
import fs from 'fs';
import path from 'path';
import { WorkspaceData, TableDocument, TableRow, TableColumn, TreeItem, CalendarEvent } from '../src/types';
import { ensureWorkspaceTree } from '../src/utils/workspaceTreeUtils';

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

const DATA_URI_REGEX = /data:image\/([a-zA-Z0-9.+_-]+);base64,([A-Za-z0-9+/=\r\n]+)/i;
const IMG_TAG_REGEX = /<img[^>]+src=["'](data:image\/([a-zA-Z0-9.+_-]+);base64,([^"']+))["'][^>]*>/i;

export function toSqliteParam(v: any): any {
  if (v === undefined || v === null) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (Buffer.isBuffer(v) || v instanceof Uint8Array) return v;
  if (typeof v === 'object') return JSON.stringify(v);
  return v;
}

export function extractAndDecodeImage(val: any): { mime: string; buffer: Uint8Array } | null {
  if (typeof val !== 'string' || val.length < 10) return null;
  const str = val.trim();

  // 1. <img> tag containing base64
  const imgMatch = str.match(IMG_TAG_REGEX);
  if (imgMatch) {
    const mime = `image/${imgMatch[2]}`;
    const cleanB64 = imgMatch[3].replace(/\s+/g, '');
    try {
      const buffer = Buffer.from(cleanB64, 'base64');
      return { mime, buffer };
    } catch {
      return null;
    }
  }

  // 2. data:image/...;base64,...
  const uriMatch = str.match(DATA_URI_REGEX);
  if (uriMatch) {
    const mime = `image/${uriMatch[1]}`;
    const cleanB64 = uriMatch[2].replace(/\s+/g, '');
    try {
      const buffer = Buffer.from(cleanB64, 'base64');
      return { mime, buffer };
    } catch {
      return null;
    }
  }

  // 3. Contains 'base64,'
  if (str.includes('base64,')) {
    const parts = str.split('base64,');
    let mime = 'image/png';
    const header = parts[0];
    const mimeMatch = header.match(/data:image\/([a-zA-Z0-9.+_-]+)/);
    if (mimeMatch) mime = `image/${mimeMatch[1]}`;
    const cleanB64 = parts[1].replace(/[\s"'<>]+/g, '');
    try {
      const buffer = Buffer.from(cleanB64, 'base64');
      return { mime, buffer };
    } catch {
      return null;
    }
  }

  return null;
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

    CREATE TABLE IF NOT EXISTS row_images (
      id TEXT PRIMARY KEY,
      table_id TEXT NOT NULL,
      row_id TEXT NOT NULL,
      column_key TEXT NOT NULL,
      mime_type TEXT,
      image_data BLOB NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  // Sync with user_data.json if present
  if (fs.existsSync(USER_DATA_PATH)) {
    console.log('[SQLite] Found user_data.json. Loading and syncing to SQLite DB...');
    try {
      const raw = fs.readFileSync(USER_DATA_PATH, 'utf-8');
      const data: WorkspaceData = JSON.parse(raw);
      const completeData = ensureWorkspaceTree(data);
      importWorkspaceDataToDb(dbInstance, completeData);
      fs.writeFileSync(USER_DATA_PATH, JSON.stringify(completeData, null, 2), 'utf-8');
      console.log(`[SQLite] Loaded ${completeData.tree.length} tree items and ${Object.keys(completeData.tables).length} tables from user_data.json`);
    } catch (err) {
      console.error('[SQLite] Failed to load user_data.json:', err);
    }
  } else {
    // Database initialized: sync current state to user_data.json
    const res = dbInstance.exec("SELECT count(*) FROM tables;");
    const count = Number(res[0]?.values[0]?.[0] || 0);
    console.log(`[SQLite] Database ready with ${count} tables. Syncing to user_data.json...`);
    syncDbToUserDataJson();
  }

  persistDatabase();
  return dbInstance;
}

/**
 * Sync entire database state to user_data.json so workspace tree and tables are always preserved together
 */
export function syncDbToUserDataJson(): void {
  try {
    const ws = getWorkspaceData();
    const completeWs = ensureWorkspaceTree(ws);
    fs.writeFileSync(USER_DATA_PATH, JSON.stringify(completeWs, null, 2), 'utf-8');
  } catch (err) {
    console.error('[Storage] Failed to sync user_data.json:', err);
  }
}

/**
 * Reload database from disk or user_data.json
 */
export function reloadDatabaseFromDisk(): WorkspaceData {
  if (!SQL) throw new Error('SQL.js not initialized');
  if (fs.existsSync(DB_FILE_PATH)) {
    console.log('[SQLite] Reloading database from disk:', DB_FILE_PATH);
    const fileBuffer = fs.readFileSync(DB_FILE_PATH);
    dbInstance = new SQL.Database(fileBuffer);
  } else if (fs.existsSync(USER_DATA_PATH)) {
    console.log('[SQLite] Reloading database from user_data.json:', USER_DATA_PATH);
    const raw = fs.readFileSync(USER_DATA_PATH, 'utf-8');
    const data: WorkspaceData = JSON.parse(raw);
    const complete = ensureWorkspaceTree(data);
    dbInstance = new SQL.Database();
    initDatabase();
    importWorkspaceDataToDb(dbInstance, complete);
    persistDatabase();
  }
  syncDbToUserDataJson();
  return getWorkspaceData();
}

/**
 * Import a complete WorkspaceData payload into SQLite tables
 */
export function importWorkspaceDataToDb(db: Database, rawData: WorkspaceData): void {
  const data = ensureWorkspaceTree(rawData);
  db.run('BEGIN TRANSACTION;');

  try {
    // 1. Meta
    db.run("INSERT OR REPLACE INTO workspace_meta (key, value) VALUES ('version', ?);", [toSqliteParam(data.version || '1.0.0')]);
    db.run("INSERT OR REPLACE INTO workspace_meta (key, value) VALUES ('exportedAt', ?);", [toSqliteParam(String(data.exportedAt || Date.now()))]);
    if (data.settings) {
      db.run("INSERT OR REPLACE INTO workspace_meta (key, value) VALUES ('settings', ?);", [toSqliteParam(JSON.stringify(data.settings))]);
    }

    // 2. Tree Items
    db.run('DELETE FROM tree_items;');
    if (Array.isArray(data.tree)) {
      data.tree.forEach((item, index) => {
        db.run(
          `INSERT INTO tree_items (id, parent_id, title, type, icon, color, is_expanded, created_at, updated_at, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
          [
            toSqliteParam(item.id),
            toSqliteParam(item.parentId),
            toSqliteParam(item.title || '새 데이터 테이블'),
            toSqliteParam(item.type || 'table'),
            toSqliteParam(item.icon),
            toSqliteParam(item.color),
            item.isExpanded ? 1 : 0,
            toSqliteParam(item.createdAt || Date.now()),
            toSqliteParam(item.updatedAt || Date.now()),
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
        if (!tbl || !tbl.id) return;
        const tId = tbl.id;
        const tTitle = tbl.title || '새 데이터 테이블';
        const tCreated = tbl.createdAt || Date.now();
        const tUpdated = tbl.updatedAt || Date.now();

        db.run(
          `INSERT INTO tables (id, title, description, default_view, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?);`,
          [
            toSqliteParam(tId),
            toSqliteParam(tTitle),
            toSqliteParam(tbl.description),
            toSqliteParam(tbl.defaultView || 'grid'),
            toSqliteParam(tCreated),
            toSqliteParam(tUpdated),
          ]
        );

        if (Array.isArray(tbl.columns)) {
          tbl.columns.forEach((col, cIdx) => {
            if (!col || !col.id) return;
            db.run(
              `INSERT INTO table_columns (id, table_id, name, type, width, is_primary_key, auto_update_date, options_json, format, sort_order)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
              [
                toSqliteParam(col.id),
                toSqliteParam(tId),
                toSqliteParam(col.name || col.id),
                toSqliteParam(col.type || 'text'),
                toSqliteParam(col.width || 160),
                col.isPrimaryKey ? 1 : 0,
                col.autoUpdateDate ? 1 : 0,
                col.options ? JSON.stringify(col.options) : null,
                toSqliteParam(col.format),
                cIdx,
              ]
            );
          });
        }

        if (Array.isArray(tbl.rows)) {
          tbl.rows.forEach((row) => {
            if (!row || !row.id) return;
            const rData = row.data && typeof row.data === 'object' ? { ...row.data } : {};
            const rCreated = row.createdAt || Date.now();
            const rUpdated = row.updatedAt || Date.now();

            // Extract & save binary images from row.data
            for (const [colKey, val] of Object.entries(rData)) {
              const ext = extractAndDecodeImage(val);
              if (ext) {
                const imgId = `img_${tId}_${row.id}_${colKey}`;
                try {
                  db.run(
                    `INSERT OR REPLACE INTO row_images (id, table_id, row_id, column_key, mime_type, image_data, created_at, updated_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
                    [imgId, tId, row.id, colKey, ext.mime, ext.buffer, rCreated, rUpdated]
                  );
                } catch (imgErr) {
                  console.warn('[SQLite] Failed to persist row_image:', imgErr);
                }
              }
            }

            // Extract & save binary images from richContent
            if (row.richContent && typeof row.richContent === 'string' && row.richContent.includes('<img')) {
              const matches = row.richContent.matchAll(/<img[^>]+src=["'](data:image\/([a-zA-Z0-9.+_-]+);base64,([^"']+))["'][^>]*>/gi);
              let richIdx = 0;
              for (const m of matches) {
                const mime = `image/${m[2]}`;
                try {
                  const buffer = Buffer.from(m[3].replace(/\s+/g, ''), 'base64');
                  const imgId = `img_${tId}_${row.id}_rich_${richIdx++}`;
                  db.run(
                    `INSERT OR REPLACE INTO row_images (id, table_id, row_id, column_key, mime_type, image_data, created_at, updated_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
                    [imgId, tId, row.id, 'richContent', mime, buffer, rCreated, rUpdated]
                  );
                } catch {}
              }
            }

            db.run(
              `INSERT INTO table_rows (id, table_id, data_json, rich_content, stickers_json, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?);`,
              [
                toSqliteParam(row.id),
                toSqliteParam(tId),
                JSON.stringify(rData),
                toSqliteParam(row.richContent),
                row.stickers ? JSON.stringify(row.stickers) : null,
                toSqliteParam(rCreated),
                toSqliteParam(rUpdated),
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

  return ensureWorkspaceTree({
    version,
    exportedAt,
    tree,
    tables,
    settings,
  });
}

/**
 * Save complete workspace data into SQLite and sync to user_data.json
 */
export function saveWorkspaceData(data: WorkspaceData): void {
  if (!dbInstance) throw new Error('Database not initialized');
  const complete = ensureWorkspaceTree(data);
  importWorkspaceDataToDb(dbInstance, complete);
  persistDatabase();
  syncDbToUserDataJson();
}

/**
 * Get TableDocument by ID
 */
export function getTable(tableId: string): TableDocument | null {
  const ws = getWorkspaceData();
  return ws.tables[tableId] || null;
}

/**
 * Save single TableDocument into SQLite and keep tree synchronized
 */
export function saveTable(table: TableDocument): void {
  if (!dbInstance) throw new Error('Database not initialized');

  dbInstance.run('BEGIN TRANSACTION;');
  try {
    const tCreated = table.createdAt || Date.now();
    const tUpdated = table.updatedAt || Date.now();

    dbInstance.run(
      `INSERT OR REPLACE INTO tables (id, title, description, default_view, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?);`,
      [
        toSqliteParam(table.id),
        toSqliteParam(table.title || '새 데이터 테이블'),
        toSqliteParam(table.description),
        toSqliteParam(table.defaultView || 'grid'),
        toSqliteParam(tCreated),
        toSqliteParam(tUpdated),
      ]
    );

    // Keep tree item title in sync with table title: upsert if missing
    dbInstance.run(
      `INSERT INTO tree_items (id, parent_id, title, type, is_expanded, created_at, updated_at, sort_order)
       VALUES (?, null, ?, 'table', 0, ?, ?, 0)
       ON CONFLICT(id) DO UPDATE SET title = excluded.title, updated_at = excluded.updated_at;`,
      [toSqliteParam(table.id), toSqliteParam(table.title || '새 데이터 테이블'), toSqliteParam(tCreated), toSqliteParam(tUpdated)]
    );

    // Columns
    dbInstance.run("DELETE FROM table_columns WHERE table_id = ?;", [toSqliteParam(table.id)]);
    if (Array.isArray(table.columns)) {
      table.columns.forEach((col, idx) => {
        if (!col || !col.id) return;
        dbInstance!.run(
          `INSERT INTO table_columns (id, table_id, name, type, width, is_primary_key, auto_update_date, options_json, format, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
          [
            toSqliteParam(col.id),
            toSqliteParam(table.id),
            toSqliteParam(col.name || col.id),
            toSqliteParam(col.type || 'text'),
            toSqliteParam(col.width || 160),
            col.isPrimaryKey ? 1 : 0,
            col.autoUpdateDate ? 1 : 0,
            col.options ? JSON.stringify(col.options) : null,
            toSqliteParam(col.format),
            idx,
          ]
        );
      });
    }

    // Rows
    dbInstance.run("DELETE FROM table_rows WHERE table_id = ?;", [toSqliteParam(table.id)]);
    if (Array.isArray(table.rows)) {
      table.rows.forEach((row) => {
        if (!row || !row.id) return;
        const rData = row.data && typeof row.data === 'object' ? { ...row.data } : {};
        const rCreated = row.createdAt || Date.now();
        const rUpdated = row.updatedAt || Date.now();

        // Extract and save binary images
        for (const [colKey, val] of Object.entries(rData)) {
          const ext = extractAndDecodeImage(val);
          if (ext) {
            const imgId = `img_${table.id}_${row.id}_${colKey}`;
            try {
              dbInstance!.run(
                `INSERT OR REPLACE INTO row_images (id, table_id, row_id, column_key, mime_type, image_data, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
                [imgId, toSqliteParam(table.id), toSqliteParam(row.id), colKey, ext.mime, ext.buffer, toSqliteParam(rCreated), toSqliteParam(rUpdated)]
              );
            } catch {}
          }
        }

        dbInstance!.run(
          `INSERT INTO table_rows (id, table_id, data_json, rich_content, stickers_json, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?);`,
          [
            toSqliteParam(row.id),
            toSqliteParam(table.id),
            JSON.stringify(rData),
            toSqliteParam(row.richContent),
            row.stickers ? JSON.stringify(row.stickers) : null,
            toSqliteParam(rCreated),
            toSqliteParam(rUpdated),
          ]
        );
      });
    }

    dbInstance.run('COMMIT;');
  } catch (err) {
    dbInstance.run('ROLLBACK;');
    throw err;
  }

  persistDatabase();
  syncDbToUserDataJson();
}

/**
 * Save Tree items into SQLite and sync to user_data.json
 */
export function saveTree(tree: TreeItem[]): void {
  if (!dbInstance) throw new Error('Database not initialized');
  dbInstance.run('BEGIN TRANSACTION;');
  try {
    dbInstance.run('DELETE FROM tree_items;');
    tree.forEach((item, idx) => {
      dbInstance!.run(
        `INSERT INTO tree_items (id, parent_id, title, type, icon, color, is_expanded, created_at, updated_at, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        [
          toSqliteParam(item.id),
          toSqliteParam(item.parentId),
          toSqliteParam(item.title || '새 데이터 테이블'),
          toSqliteParam(item.type || 'table'),
          toSqliteParam(item.icon),
          toSqliteParam(item.color),
          item.isExpanded ? 1 : 0,
          toSqliteParam(item.createdAt || Date.now()),
          toSqliteParam(item.updatedAt || Date.now()),
          idx,
        ]
      );

      // If item is a table, keep table title in sync with tree item title
      if (item.type === 'table') {
        dbInstance!.run(
          `UPDATE tables SET title = ?, updated_at = ? WHERE id = ?;`,
          [toSqliteParam(item.title), toSqliteParam(item.updatedAt || Date.now()), toSqliteParam(item.id)]
        );
      }
    });
    dbInstance.run('COMMIT;');
  } catch (err) {
    dbInstance.run('ROLLBACK;');
    throw err;
  }

  persistDatabase();
  syncDbToUserDataJson();
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
  syncDbToUserDataJson();
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

/**
 * Retrieve Image BLOB by ID from SQLite
 */
export function getRowImage(imageId: string): { id: string; mimeType: string; data: Uint8Array } | null {
  if (!dbInstance) throw new Error('Database not initialized');
  const res = dbInstance.exec("SELECT id, mime_type, image_data FROM row_images WHERE id = ?", [imageId]);
  if (res.length === 0 || res[0].values.length === 0) return null;
  const val = res[0].values[0];
  return {
    id: String(val[0]),
    mimeType: String(val[1] || 'image/png'),
    data: val[2] as Uint8Array,
  };
}

