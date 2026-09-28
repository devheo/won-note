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
let persistTimer: NodeJS.Timeout | null = null;
let syncJsonTimer: NodeJS.Timeout | null = null;
let lastServerUpdate: number = Date.now();

export function getLastUpdatedTimestamp(): number {
  return lastServerUpdate;
}

export function touchServerUpdate(): void {
  lastServerUpdate = Date.now();
}

/**
 * Persist SQLite WebAssembly memory database to disk file (debounced by 600ms for high performance)
 */
export function persistDatabase(immediate = false): void {
  touchServerUpdate();
  if (!dbInstance) return;

  const doExportAndSave = () => {
    try {
      if (!dbInstance) return;
      const data = dbInstance.export();
      const buffer = Buffer.from(data);
      fs.writeFile(DB_FILE_PATH, buffer, (err) => {
        if (err) console.error('[SQLite] Failed writing DB to disk:', err);
      });
    } catch (err) {
      console.error('[SQLite] Failed exporting DB to disk:', err);
    }
  };

  if (immediate) {
    if (persistTimer) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }
    doExportAndSave();
  } else {
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      persistTimer = null;
      doExportAndSave();
    }, 600);
  }
}

/**
 * Sync entire database state to user_data.json asynchronously (debounced by 1500ms)
 */
export function syncDbToUserDataJson(immediate = false): void {
  if (syncJsonTimer) clearTimeout(syncJsonTimer);

  const doSync = () => {
    try {
      const ws = getWorkspaceData();
      const completeWs = ensureWorkspaceTree(ws);
      fs.writeFile(USER_DATA_PATH, JSON.stringify(completeWs), 'utf-8', (err) => {
        if (err) console.error('[Storage] Failed to sync user_data.json:', err);
      });
    } catch (err) {
      console.error('[Storage] Failed to sync user_data.json:', err);
    }
  };

  if (immediate) {
    syncJsonTimer = null;
    doSync();
  } else {
    syncJsonTimer = setTimeout(() => {
      syncJsonTimer = null;
      doSync();
    }, 1500);
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
 * Ensure table_rows table has composite primary key (id, table_id) to avoid cross-table ID collisions
 */
function ensureTableRowsCompositePrimaryKey(db: Database): void {
  try {
    const info = db.exec("PRAGMA table_info(table_rows);");
    if (info.length > 0 && info[0].values) {
      const tableIdCol = info[0].values.find((v) => v[1] === 'table_id');
      // If table_id is not part of primary key (pk column index is 0)
      if (tableIdCol && Number(tableIdCol[5]) === 0) {
        console.log('[SQLite DB] Migrating table_rows to composite PRIMARY KEY (id, table_id)...');
        db.run('BEGIN TRANSACTION;');
        db.run(`
          CREATE TABLE IF NOT EXISTS table_rows_migrated (
            id TEXT NOT NULL,
            table_id TEXT NOT NULL,
            data_json TEXT NOT NULL,
            rich_content TEXT,
            stickers_json TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            PRIMARY KEY (id, table_id)
          );
        `);
        db.run(`INSERT OR REPLACE INTO table_rows_migrated SELECT id, table_id, data_json, rich_content, stickers_json, created_at, updated_at FROM table_rows;`);
        db.run(`DROP TABLE table_rows;`);
        db.run(`ALTER TABLE table_rows_migrated RENAME TO table_rows;`);
        db.run('COMMIT;');
        console.log('[SQLite DB] Successfully migrated table_rows to composite PRIMARY KEY (id, table_id).');
      }
    }
  } catch (err) {
    console.error('[SQLite DB] Failed to migrate table_rows schema:', err);
    try { db.run('ROLLBACK;'); } catch {}
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
      id TEXT NOT NULL,
      table_id TEXT NOT NULL,
      data_json TEXT NOT NULL,
      rich_content TEXT,
      stickers_json TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (id, table_id)
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

  // Auto-migrate schema if existing table_rows table lacked composite primary key
  ensureTableRowsCompositePrimaryKey(dbInstance);

  // Count existing tables in SQLite DB
  const res = dbInstance.exec("SELECT count(*) FROM tables;");
  const dbTableCount = Number(res[0]?.values[0]?.[0] || 0);

  const treeRes = dbInstance.exec("SELECT count(*) FROM tree_items;");
  const dbTreeCount = Number(treeRes[0]?.values[0]?.[0] || 0);

  console.log(`[SQLite] Database initialized. Loaded tables: ${dbTableCount}, tree items: ${dbTreeCount}`);

  // Auto-heal: If tables exist in SQLite but tree_items is empty, recreate tree items so UI displays them
  if (dbTableCount > 0 && dbTreeCount === 0) {
    console.log('[SQLite] Auto-healing: tables exist but tree_items table is empty. Generating tree items from tables...');
    const tblListRes = dbInstance.exec("SELECT id, title, created_at, updated_at FROM tables;");
    if (tblListRes.length > 0 && tblListRes[0].values) {
      tblListRes[0].values.forEach(([tId, tTitle, tCreated, tUpdated], idx) => {
        dbInstance?.run(
          `INSERT OR REPLACE INTO tree_items (id, parent_id, title, type, is_expanded, created_at, updated_at, sort_order)
           VALUES (?, NULL, ?, 'table', 0, ?, ?, ?);`,
          [toSqliteParam(tId), toSqliteParam(tTitle || '새 데이터 테이블'), toSqliteParam(tCreated || Date.now()), toSqliteParam(tUpdated || Date.now()), idx]
        );
      });
      console.log(`[SQLite] Restored ${tblListRes[0].values.length} tree items from tables.`);
    }
  }

  // If SQLite already has tables, SQLite IS THE SINGLE SOURCE OF TRUTH.
  // NEVER overwrite it with user_data.json!
  if (dbTableCount > 0) {
    console.log(`[SQLite] Keeping existing SQLite database as authoritative source (${dbTableCount} tables).`);
    syncDbToUserDataJson();
    return dbInstance;
  }

  // Only if SQLite DB is completely fresh/empty (0 tables), try loading seed data:
  if (fs.existsSync(USER_DATA_PATH)) {
    console.log(`[SQLite] Fresh database with 0 tables. Checking user_data.json for seed data...`);
    try {
      const raw = fs.readFileSync(USER_DATA_PATH, 'utf-8');
      const data: WorkspaceData = JSON.parse(raw);
      const completeData = ensureWorkspaceTree(data);
      const jsonTableCount = Object.keys(completeData.tables).length;
      if (jsonTableCount > 0) {
        console.log(`[SQLite] Seeding fresh database with ${jsonTableCount} tables from user_data.json...`);
        importWorkspaceDataToDb(dbInstance, completeData);
        persistDatabase();
      }
    } catch (err) {
      console.error('[SQLite] Failed to load user_data.json for fresh database:', err);
    }
  } else if (fs.existsSync(DEFAULT_DATA_PATH)) {
    try {
      const raw = fs.readFileSync(DEFAULT_DATA_PATH, 'utf-8');
      const data: WorkspaceData = JSON.parse(raw);
      const completeData = ensureWorkspaceTree(data);
      console.log(`[SQLite] Seeding fresh database from public/wonbee_data.json...`);
      importWorkspaceDataToDb(dbInstance, completeData);
      persistDatabase();
    } catch (err) {
      console.error('[SQLite] Failed to seed from public/wonbee_data.json:', err);
    }
  }

  return dbInstance;
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
          `INSERT OR REPLACE INTO tables (id, title, description, default_view, created_at, updated_at)
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
              `INSERT OR REPLACE INTO table_columns (id, table_id, name, type, width, is_primary_key, auto_update_date, options_json, format, sort_order)
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
              `INSERT OR REPLACE INTO table_rows (id, table_id, data_json, rich_content, stickers_json, created_at, updated_at)
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

    // Drop any physical SQLite tables that are not in data.tables (keeps database consistent)
    try {
      const existingPhys = db.exec(`
        SELECT name FROM sqlite_master 
        WHERE type='table' 
          AND (name LIKE 'table\\_%' ESCAPE '\\' OR name LIKE 'tbl\\_%' ESCAPE '\\') 
          AND name NOT IN ('table_columns', 'table_rows', 'tables', 'workspace_meta', 'tree_items', 'calendar_events', 'document_chunks', 'row_images');
      `);
      if (existingPhys.length > 0 && existingPhys[0].values) {
        const allowedKeys = new Set(
          Object.keys(data.tables || {}).flatMap((k) => [
            k,
            k.replace(/-/g, '_'),
            k.replace(/_/g, '-'),
            k.replace(/^table[-_]/, ''),
            `table_${k}`,
            `table_${k.replace(/^table[-_]/, '')}`,
          ])
        );

        for (const [rawName] of existingPhys[0].values) {
          const ptName = String(rawName);
          if (!allowedKeys.has(ptName)) {
            console.log(`[SQLite] Dropping removed physical table: ${ptName}`);
            db.run(`DROP TABLE IF EXISTS "${ptName}";`);
          }
        }
      }
    } catch (cleanErr) {
      console.warn('[SQLite] Error dropping orphan physical tables in importWorkspaceDataToDb:', cleanErr);
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

  // 4. Physical Tables Auto-Discovery (e.g. table_mti5tvnp, table_mti8bx9v, table_roadmap, table_tasks, table_mu3dp609...)
  // In SQLite, user tables may exist as individual physical relational tables!
  try {
    const physRes = dbInstance.exec(`
      SELECT name FROM sqlite_master 
      WHERE type='table' 
        AND (name LIKE 'table\\_%' ESCAPE '\\' OR name LIKE 'tbl\\_%' ESCAPE '\\') 
        AND name NOT IN ('table_columns', 'table_rows', 'tables', 'workspace_meta', 'tree_items', 'calendar_events', 'document_chunks', 'row_images');
    `);
    if (physRes.length > 0 && physRes[0].values) {
      for (const [rawName] of physRes[0].values) {
        const tableName = String(rawName);
        // Find existing table in metadata that matches this physical table
        const matchingKey = Object.keys(tables).find((k) => {
          if (k === tableName) return true;
          if (k === tableName.replace(/^table_/, 'table-')) return true;
          if (k === tableName.replace(/^table_/, '')) return true;
          if (k.replace(/_/g, '-') === tableName.replace(/_/g, '-')) return true;
          return false;
        });

        const tableId = matchingKey || tableName;

        // If this table already exists in metadata tables and has rows, don't overwrite or duplicate!
        if (tables[tableId] && tables[tableId].rows && tables[tableId].rows.length > 0) {
          continue;
        }

        // Get column definitions via PRAGMA
        const colInfoRes = dbInstance.exec(`PRAGMA table_info("${tableName}");`);
        if (!colInfoRes.length || !colInfoRes[0].values) continue;

        const columns: TableColumn[] = [];
        const rawColNames: string[] = [];

        colInfoRes[0].values.forEach((colRow, idx) => {
          const colName = String(colRow[1]);
          const colType = String(colRow[2] || 'TEXT').toUpperCase();
          rawColNames.push(colName);

          // Skip system row metadata columns from user column list
          if (colName === 'id' || colName === 'created_at' || colName === 'updated_at') {
            return;
          }

          // Determine column display name
          let displayName = colName.replace(/^col_/, '').replace(/^col-/, '');
          const knownLabels: Record<string, string> = {
            feature: '기능/과제',
            status: '상태',
            priority: '우선순위',
            owner: '담당자',
            details: '상세 설명',
            duedate: '마감일',
            due: '마감일',
            task: '할 일',
            checked: '완료 여부',
            tag: '태그',
            est: '예상 시간',
            assignee: '담당자',
            name: '이름',
            note: '메모',
            desc: '설명',
            dbtype: 'DB 종류',
            sql: 'SQL 쿼리',
            user: '사용자',
            rating: '평점',
            comment: '코멘트',
            action: '조치 사항',
            thumbnail: '이미지/썸네일',
            updated_at: '수정일',
          };

          if (knownLabels[displayName]) {
            displayName = knownLabels[displayName];
          }

          // Determine column data type
          let type: any = 'text';
          if (colType === 'NUMERIC' || colType === 'INTEGER' || colType === 'REAL') {
            type = 'number';
          } else if (colName.includes('date') || colName.includes('due')) {
            type = 'date';
          } else if (colName.includes('status') || colName.includes('priority')) {
            type = 'select';
          } else if (colName.includes('tag')) {
            type = 'multiselect';
          } else if (colName.includes('checked')) {
            type = 'checkbox';
          } else if (colType === 'BLOB' || colName.includes('thumbnail') || colName.includes('image')) {
            type = 'image';
          }

          columns.push({
            id: colName,
            name: displayName,
            type,
            width: colName.includes('details') || colName.includes('note') || colName.includes('sql') ? 240 : 160,
            isPrimaryKey: false,
            autoUpdateDate: colName.includes('updated_at'),
          });
        });

        // Query all rows from physical table
        const rowsRes = dbInstance.exec(`SELECT * FROM "${tableName}" ORDER BY rowid ASC;`);
        const rows: TableRow[] = [];

        if (rowsRes.length > 0 && rowsRes[0].values) {
          const colList = rowsRes[0].columns;
          rowsRes[0].values.forEach((rowVal, rIdx) => {
            let rId = `r-${rIdx + 1}`;
            let rCreated = Date.now();
            let rUpdated = Date.now();
            const rData: Record<string, any> = {};
            let richContent = '';

            colList.forEach((cName, cIdx) => {
              const val = rowVal[cIdx];
              if (cName === 'id' && val) {
                rId = String(val);
              } else if (cName === 'created_at' && val) {
                rCreated = Number(val) || Date.now();
              } else if (cName === 'updated_at' && val) {
                rUpdated = Number(val) || Date.now();
              } else if (val instanceof Uint8Array) {
                // BLOB image to base64 data URL
                const b64 = Buffer.from(val).toString('base64');
                rData[cName] = `data:image/png;base64,${b64}`;
              } else if (val !== null && val !== undefined) {
                rData[cName] = val;
                // Also support hyphenated key if col_xxx
                if (cName.startsWith('col_')) {
                  rData[cName.replace('col_', 'col-')] = val;
                }
                if (cName.includes('details') || cName.includes('note') || cName.includes('desc')) {
                  richContent = String(val);
                }
              }
            });

            rows.push({
              id: rId,
              data: rData,
              richContent: richContent || undefined,
              stickers: [],
              createdAt: rCreated,
              updatedAt: rUpdated,
            });
          });
        }

        // Determine table title
        let tableTitle = tableName.replace(/^table_/, '');
        const titleMap: Record<string, string> = {
          roadmap: '🚀 제품 로드맵',
          tasks: '✅ 프로젝트 작업 관리',
          sql_dict: '📖 SQL 명령어 사전',
          feedback: '💬 사용자 피드백',
        };

        if (titleMap[tableTitle]) {
          tableTitle = titleMap[tableTitle];
        } else {
          tableTitle = `📊 ${tableTitle}`;
        }

        // Check if tree item or existing table has a custom title:
        const existingTreeItem = tree.find(
          (t) => t.id === tableId || t.id.replace(/_/g, '-') === tableId.replace(/_/g, '-')
        );
        if (existingTreeItem?.title) {
          tableTitle = existingTreeItem.title;
        } else if (tables[tableId]?.title) {
          tableTitle = tables[tableId].title;
        }

        if (tables[tableId]) {
          if (!tables[tableId].columns || tables[tableId].columns.length === 0) {
            tables[tableId].columns = columns;
          }
          tables[tableId].rows = rows;
        } else {
          tables[tableId] = {
            id: tableId,
            title: tableTitle,
            defaultView: 'grid',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            columns,
            rows,
          };
        }

        // Also ensure it is present in the tree
        if (!tree.find((t) => t.id === tableId || t.id.replace(/_/g, '-') === tableId.replace(/_/g, '-'))) {
          tree.push({
            id: tableId,
            parentId: null,
            title: tableTitle,
            type: 'table',
            isExpanded: false,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          });
        }
      }
    }
  } catch (err) {
    console.error('[SQLite] Error auto-discovering physical tables:', err);
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
          `INSERT OR REPLACE INTO table_columns (id, table_id, name, type, width, is_primary_key, auto_update_date, options_json, format, sort_order)
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
          `INSERT OR REPLACE INTO table_rows (id, table_id, data_json, rich_content, stickers_json, created_at, updated_at)
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

    const now = Date.now();
    dbInstance.run("INSERT OR REPLACE INTO workspace_meta (key, value) VALUES ('exportedAt', ?);", [String(now)]);
    dbInstance.run('COMMIT;');
  } catch (err) {
    dbInstance.run('ROLLBACK;');
    throw err;
  }

  touchServerUpdate();
  persistDatabase(false);
  syncDbToUserDataJson(false);
}

/**
 * Save Tree items into SQLite and sync to user_data.json
 */
export function saveTree(tree: TreeItem[]): void {
  if (!dbInstance) throw new Error('Database not initialized');
  const now = Date.now();
  touchServerUpdate();
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

      // If item is a table, keep table title in sync with tree item title (support both hyphen and underscore)
      if (item.type === 'table') {
        const altId = item.id.includes('-') ? item.id.replace(/-/g, '_') : item.id.replace(/_/g, '-');
        dbInstance!.run(
          `UPDATE tables SET title = ?, updated_at = ? WHERE id = ? OR id = ?;`,
          [toSqliteParam(item.title), toSqliteParam(item.updatedAt || now), toSqliteParam(item.id), toSqliteParam(altId)]
        );
      }
    });

    dbInstance.run("INSERT OR REPLACE INTO workspace_meta (key, value) VALUES ('exportedAt', ?);", [String(now)]);
    dbInstance.run('COMMIT;');
  } catch (err) {
    dbInstance.run('ROLLBACK;');
    throw err;
  }

  persistDatabase(false);
  syncDbToUserDataJson(false);
}

/**
 * Delete a TableDocument from SQLite and drop any physical table
 */
export function deleteTable(tableId: string): void {
  if (!dbInstance) throw new Error('Database not initialized');
  const now = Date.now();
  touchServerUpdate();
  dbInstance.run('BEGIN TRANSACTION;');
  try {
    const ids = Array.from(
      new Set([
        tableId,
        tableId.replace(/-/g, '_'),
        tableId.replace(/_/g, '-'),
        tableId.replace(/^table[-_]/, ''),
        `table_${tableId.replace(/^table[-_]/, '')}`,
        `table-${tableId.replace(/^table[-_]/, '')}`,
      ])
    );

    for (const tid of ids) {
      dbInstance.run("DELETE FROM table_rows WHERE table_id = ?;", [toSqliteParam(tid)]);
      dbInstance.run("DELETE FROM table_columns WHERE table_id = ?;", [toSqliteParam(tid)]);
      dbInstance.run("DELETE FROM calendar_events WHERE table_id = ?;", [toSqliteParam(tid)]);
      dbInstance.run("DELETE FROM row_images WHERE table_id = ?;", [toSqliteParam(tid)]);
      dbInstance.run("DELETE FROM tables WHERE id = ?;", [toSqliteParam(tid)]);
      dbInstance.run("DELETE FROM tree_items WHERE id = ?;", [toSqliteParam(tid)]);
    }

    // Also drop physical table if it exists in SQLite
    const possibleTableNames = Array.from(
      new Set([
        tableId,
        tableId.replace(/-/g, '_'),
        tableId.startsWith('table_') ? tableId : `table_${tableId}`,
        tableId.startsWith('table-') ? tableId.replace(/^table-/, 'table_') : `table_${tableId}`,
      ])
    );

    const systemTables = [
      'tables',
      'table_columns',
      'table_rows',
      'workspace_meta',
      'tree_items',
      'calendar_events',
      'document_chunks',
      'row_images',
    ];
    for (const ptName of possibleTableNames) {
      if (!systemTables.includes(ptName)) {
        try {
          dbInstance.run(`DROP TABLE IF EXISTS "${ptName}";`);
        } catch (dropErr) {
          console.warn(`[SQLite] Failed dropping physical table ${ptName}:`, dropErr);
        }
      }
    }

    dbInstance.run("INSERT OR REPLACE INTO workspace_meta (key, value) VALUES ('exportedAt', ?);", [String(now)]);
    dbInstance.run('COMMIT;');
  } catch (err) {
    dbInstance.run('ROLLBACK;');
    throw err;
  }

  persistDatabase(false);
  syncDbToUserDataJson(false);
}

/**
 * Fast direct rename of a table and its associated tree item
 */
export function renameTable(tableId: string, newTitle: string): void {
  if (!dbInstance) throw new Error('Database not initialized');
  const now = Date.now();
  touchServerUpdate();
  dbInstance.run('BEGIN TRANSACTION;');
  try {
    const ids = Array.from(
      new Set([
        tableId,
        tableId.replace(/-/g, '_'),
        tableId.replace(/_/g, '-'),
        tableId.replace(/^table[-_]/, ''),
        `table_${tableId.replace(/^table[-_]/, '')}`,
        `table-${tableId.replace(/^table[-_]/, '')}`,
      ])
    );

    for (const tid of ids) {
      dbInstance.run(
        "UPDATE tables SET title = ?, updated_at = ? WHERE id = ?;",
        [toSqliteParam(newTitle), now, toSqliteParam(tid)]
      );
      dbInstance.run(
        "UPDATE tree_items SET title = ?, updated_at = ? WHERE id = ?;",
        [toSqliteParam(newTitle), now, toSqliteParam(tid)]
      );
    }

    // Crucial: Update workspace_meta.exportedAt so remote clients detect changes immediately
    dbInstance.run("INSERT OR REPLACE INTO workspace_meta (key, value) VALUES ('exportedAt', ?);", [String(now)]);
    dbInstance.run('COMMIT;');
  } catch (err) {
    dbInstance.run('ROLLBACK;');
    throw err;
  }
  persistDatabase(false);
  syncDbToUserDataJson(false);
}

/**
 * Clean database consistency: Drop orphan tables, unused physical tables, and sync tree
 */
export function cleanDatabaseConsistency(keepTableIds?: string[]): { dropped: string[]; kept: string[] } {
  if (!dbInstance) throw new Error('Database not initialized');
  const now = Date.now();
  touchServerUpdate();
  dbInstance.run('BEGIN TRANSACTION;');
  const dropped: string[] = [];
  const kept: string[] = [];

  try {
    // 1. Get valid table IDs from tree_items
    const treeRes = dbInstance.exec("SELECT id FROM tree_items WHERE type = 'table';");
    const validTreeTableIds = new Set<string>();
    if (treeRes.length > 0 && treeRes[0].values) {
      treeRes[0].values.forEach(([id]) => validTreeTableIds.add(String(id)));
    }

    if (Array.isArray(keepTableIds)) {
      keepTableIds.forEach((id) => validTreeTableIds.add(id));
    }

    // 2. Remove orphan tables from `tables` that are not present in tree (or all if tree is empty)
    const tablesRes = dbInstance.exec("SELECT id FROM tables;");
    if (tablesRes.length > 0 && tablesRes[0].values) {
      for (const [rawId] of tablesRes[0].values) {
        const tId = String(rawId);
        const matchesValid = Array.from(validTreeTableIds).some(
          (vid) => vid === tId || vid.replace(/_/g, '-') === tId.replace(/_/g, '-')
        );

        // If table doesn't match any valid tree ID, drop it (even if validTreeTableIds is empty!)
        if (!matchesValid) {
          dbInstance.run("DELETE FROM table_rows WHERE table_id = ?;", [tId]);
          dbInstance.run("DELETE FROM table_columns WHERE table_id = ?;", [tId]);
          dbInstance.run("DELETE FROM calendar_events WHERE table_id = ?;", [tId]);
          dbInstance.run("DELETE FROM row_images WHERE table_id = ?;", [tId]);
          dbInstance.run("DELETE FROM tables WHERE id = ?;", [tId]);
          dropped.push(tId);
        } else {
          kept.push(tId);
        }
      }
    }

    // 3. Drop any physical SQLite tables that are not in validTreeTableIds
    const physRes = dbInstance.exec(`
      SELECT name FROM sqlite_master 
      WHERE type='table' 
        AND (name LIKE 'table\\_%' ESCAPE '\\' OR name LIKE 'tbl\\_%' ESCAPE '\\') 
        AND name NOT IN ('table_columns', 'table_rows', 'tables', 'workspace_meta', 'tree_items', 'calendar_events', 'document_chunks', 'row_images');
    `);
    if (physRes.length > 0 && physRes[0].values) {
      for (const [rawName] of physRes[0].values) {
        const ptName = String(rawName);
        const matchesValid = Array.from(validTreeTableIds).some(
          (vid) =>
            vid === ptName ||
            vid.replace(/-/g, '_') === ptName ||
            `table_${vid.replace(/^table[-_]/, '')}` === ptName
        );

        if (!matchesValid) {
          console.log(`[SQLite Clean] Dropping physical table: ${ptName}`);
          dbInstance.run(`DROP TABLE IF EXISTS "${ptName}";`);
          dropped.push(ptName);
        }
      }
    }

    // Update workspace_meta.exportedAt
    dbInstance.run("INSERT OR REPLACE INTO workspace_meta (key, value) VALUES ('exportedAt', ?);", [String(now)]);
    dbInstance.run('COMMIT;');
  } catch (err) {
    dbInstance.run('ROLLBACK;');
    throw err;
  }

  persistDatabase(false);
  syncDbToUserDataJson(false);
  return { dropped, kept };
}

export function getTableCount(): number {
  if (!dbInstance) return 0;
  try {
    const res = dbInstance.exec("SELECT count(*) FROM tables;");
    return Number(res[0]?.values[0]?.[0] || 0);
  } catch {
    return 0;
  }
}

export function getTreeCount(): number {
  if (!dbInstance) return 0;
  try {
    const res = dbInstance.exec("SELECT count(*) FROM tree_items;");
    return Number(res[0]?.values[0]?.[0] || 0);
  } catch {
    return 0;
  }
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

