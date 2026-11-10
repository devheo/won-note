import initSqlJs, { Database, SqlJsStatic } from 'sql.js';
import fs from 'fs';
import { WorkspaceData, TableDocument, TableRow, TableColumn, TreeItem, CalendarEvent, WonNoteDocument } from '../src/types';
import { ensureWorkspaceTree } from '../src/utils/workspaceTreeUtils';
import type { materializeItem } from '../src/utils/itemExchange';
import { DATABASE_IMAGE_PATTERNS, DATABASE_PATHS } from './dbConstants';

const { sqlite: DB_FILE_PATH, userData: USER_DATA_PATH, defaultData: DEFAULT_DATA_PATH } = DATABASE_PATHS;

let SQL: SqlJsStatic | null = null;
let dbInstance: Database | null = null;
let persistTimer: NodeJS.Timeout | null = null;
let syncJsonTimer: NodeJS.Timeout | null = null;
let lastServerUpdate: number = Date.now();
let documentHistoryFtsAvailable = false;

export function getLastUpdatedTimestamp(): number {
  return lastServerUpdate;
}

export function touchServerUpdate(): void {
  lastServerUpdate = Date.now();
}

/** Authentication storage is kept in the same SQLite database as the workspace. */
export function authQuery<T = Record<string, unknown>>(sql: string, params: unknown[] = []): T[] {
  if (!dbInstance) throw new Error('Database is not initialized');
  const stmt = dbInstance.prepare(sql);
  try {
    stmt.bind(params.map(toSqliteParam));
    const rows: T[] = [];
    while (stmt.step()) rows.push(stmt.getAsObject() as T);
    return rows;
  } finally { stmt.free(); }
}

export function authRun(sql: string, params: unknown[] = []): void {
  if (!dbInstance) throw new Error('Database is not initialized');
  dbInstance.run(sql, params.map(toSqliteParam));
  persistDatabase();
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
  const imgMatch = str.match(DATABASE_IMAGE_PATTERNS.imageTag);
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
  const uriMatch = str.match(DATABASE_IMAGE_PATTERNS.dataUri);
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
      updated_at INTEGER NOT NULL,
      visibility TEXT NOT NULL DEFAULT 'shared',
      owner_id TEXT
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
      updated_at INTEGER NOT NULL,
      owner_id TEXT
    );

    CREATE TABLE IF NOT EXISTS table_assets (
      asset_id TEXT NOT NULL,
      table_id TEXT NOT NULL,
      PRIMARY KEY (asset_id, table_id)
    );

    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      table_id TEXT,
      title TEXT,
      content TEXT,
      data_json TEXT,
      rich_content TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS document_history (
      id TEXT PRIMARY KEY, item_key TEXT NOT NULL, table_id TEXT, title TEXT NOT NULL,
      content TEXT NOT NULL, created_at INTEGER NOT NULL, author TEXT
    );

    CREATE TABLE IF NOT EXISTS auth_users (
      id TEXT PRIMARY KEY, issuer TEXT NOT NULL, subject TEXT NOT NULL UNIQUE,
      email TEXT, display_name TEXT, role TEXT NOT NULL DEFAULT 'user',
      status TEXT NOT NULL DEFAULT 'active', created_at INTEGER NOT NULL,
      last_login_at INTEGER, password_salt TEXT, password_hash TEXT
    );
    CREATE TABLE IF NOT EXISTS auth_sessions (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL, revoked_at INTEGER,
      FOREIGN KEY(user_id) REFERENCES auth_users(id)
    );
    CREATE TABLE IF NOT EXISTS auth_login_history (
      id TEXT PRIMARY KEY, user_id TEXT, email TEXT, success INTEGER NOT NULL,
      reason TEXT, created_at INTEGER NOT NULL, ip TEXT, user_agent TEXT
    );
    CREATE TABLE IF NOT EXISTS user_groups (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, owner_id TEXT NOT NULL, created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS group_memberships (
      group_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'member',
      PRIMARY KEY (group_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS board_group_permissions (
      table_id TEXT NOT NULL, group_id TEXT NOT NULL, permission TEXT NOT NULL DEFAULT 'read',
      PRIMARY KEY (table_id, group_id)
    );

    -- 1.1 SQL Compound Indexes for Full Table Scan Prevention & O(1) Cursor Queries
    CREATE INDEX IF NOT EXISTS idx_notes_updated_at_id ON notes(updated_at DESC, id DESC);
    CREATE INDEX IF NOT EXISTS idx_notes_table_id ON notes(table_id);
    CREATE INDEX IF NOT EXISTS idx_table_rows_updated_at_id ON table_rows(updated_at DESC, id DESC);
    CREATE INDEX IF NOT EXISTS idx_table_rows_table_id_updated_at ON table_rows(table_id, updated_at DESC, id DESC);
    CREATE INDEX IF NOT EXISTS idx_tables_updated_at_id ON tables(updated_at DESC, id DESC);
    CREATE INDEX IF NOT EXISTS idx_tree_items_parent_id ON tree_items(parent_id);
    CREATE INDEX IF NOT EXISTS idx_document_history_item_time ON document_history(item_key, created_at DESC);
  `);

  try {
    dbInstance.run("CREATE VIRTUAL TABLE IF NOT EXISTS document_history_fts USING fts5(history_id UNINDEXED, title, content, tokenize='unicode61');");
    documentHistoryFtsAvailable = true;
  } catch {
    documentHistoryFtsAvailable = false;
    console.log('[SQLite] FTS5 unavailable (using standard SQL LIKE search)');
  }

  // Add password fields to databases created before password login was introduced.
  const tableColumns = new Set(dbInstance.exec('PRAGMA table_info(tables)')[0]?.values.map(row => String(row[1])) || []);
  if (!tableColumns.has('visibility')) dbInstance.run("ALTER TABLE tables ADD COLUMN visibility TEXT NOT NULL DEFAULT 'shared'");
  if (!tableColumns.has('owner_id')) dbInstance.run('ALTER TABLE tables ADD COLUMN owner_id TEXT');
  const imageColumns = new Set(dbInstance.exec('PRAGMA table_info(row_images)')[0]?.values.map(row => String(row[1])) || []);
  if (!imageColumns.has('owner_id')) dbInstance.run('ALTER TABLE row_images ADD COLUMN owner_id TEXT');
  const storedRows = dbInstance.exec('SELECT table_id, data_json, rich_content FROM table_rows');
  for (const [tableIdValue, dataJsonValue, richContentValue] of (storedRows[0]?.values || [])) {
    const tableId = String(tableIdValue);
    const values: unknown[] = [richContentValue];
    if (typeof dataJsonValue === 'string') {
      try { values.push(...Object.values(JSON.parse(dataJsonValue))); } catch {}
    }
    for (const value of values) {
      if (typeof value !== 'string') continue;
      for (const match of value.matchAll(/asset:\/\/([a-zA-Z0-9_-]+)/g)) {
        dbInstance.run('INSERT OR IGNORE INTO table_assets(asset_id, table_id) VALUES (?, ?)', [match[1], toSqliteParam(tableId)]);
      }
    }
  }
  const authColumns = new Set(dbInstance.exec('PRAGMA table_info(auth_users)')[0]?.values.map(row => String(row[1])) || []);
  if (!authColumns.has('password_salt')) dbInstance.run('ALTER TABLE auth_users ADD COLUMN password_salt TEXT');
  if (!authColumns.has('password_hash')) dbInstance.run('ALTER TABLE auth_users ADD COLUMN password_hash TEXT');

  // Auto-migrate schema if existing table_rows table lacked composite primary key
  ensureTableRowsCompositePrimaryKey(dbInstance);

  // Sync table_rows to notes table if notes table is empty
  try {
    const notesCountRes = dbInstance.exec("SELECT count(*) FROM notes;");
    const notesCount = Number(notesCountRes[0]?.values[0]?.[0] || 0);
    if (notesCount === 0) {
      dbInstance.run(`
        INSERT OR IGNORE INTO notes (id, table_id, title, content, data_json, rich_content, created_at, updated_at)
        SELECT id, table_id, id, rich_content, data_json, rich_content, created_at, updated_at FROM table_rows;
      `);
      console.log('[SQLite] Synced table_rows to notes table.');
    }
  } catch (syncNotesErr) {
    console.warn('[SQLite] Notice during notes sync:', syncNotesErr);
  }

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
    persistDatabase(true);
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
    if (rawData.documents !== undefined) {
      db.run("INSERT OR REPLACE INTO workspace_meta (key, value) VALUES ('documents', ?);", [toSqliteParam(JSON.stringify(data.documents || {}))]);
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

    // 3. Tables, Columns, Rows, Notes
    db.run('DELETE FROM tables;');
    db.run('DELETE FROM table_assets;');
    db.run('DELETE FROM table_columns;');
    db.run('DELETE FROM table_rows;');
    db.run('DELETE FROM notes;');

    if (data.tables && typeof data.tables === 'object') {
      Object.values(data.tables).forEach((tbl) => {
        if (!tbl || !tbl.id) return;
        const tId = tbl.id;
        const tTitle = tbl.title || '새 데이터 테이블';
        const tCreated = tbl.createdAt || Date.now();
        const tUpdated = tbl.updatedAt || Date.now();

        for (const row of (Array.isArray(tbl.rows) ? tbl.rows : [])) {
          const values = [...Object.values(row?.data || {}), row?.richContent || ''];
          for (const value of values) {
            if (typeof value !== 'string') continue;
            for (const match of value.matchAll(/asset:\/\/([a-zA-Z0-9_-]+)/g)) {
              db.run('INSERT OR IGNORE INTO table_assets(asset_id, table_id) VALUES (?, ?)', [match[1], toSqliteParam(tId)]);
            }
          }
        }

        db.run(
          `INSERT OR REPLACE INTO tables (id, title, description, default_view, created_at, updated_at, visibility, owner_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
          [
            toSqliteParam(tId),
            toSqliteParam(tTitle),
            toSqliteParam(tbl.description),
            toSqliteParam(tbl.defaultView || 'grid'),
            toSqliteParam(tCreated),
            toSqliteParam(tUpdated),
            tbl.visibility === 'private' || tbl.visibility === 'group' ? tbl.visibility : 'shared',
            toSqliteParam(tbl.ownerId),
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

            // Sync to notes table
            const rowTitle = rData.name || rData.title || Object.values(rData)[0] || row.id;
            db.run(
              `INSERT OR REPLACE INTO notes (id, table_id, title, content, data_json, rich_content, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
              [
                toSqliteParam(row.id),
                toSqliteParam(tId),
                toSqliteParam(String(rowTitle)),
                toSqliteParam(row.richContent || JSON.stringify(rData)),
                JSON.stringify(rData),
                toSqliteParam(row.richContent),
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
  let documents: Record<string, WonNoteDocument> = {};

  if (metaRes.length > 0) {
    for (const [k, v] of metaRes[0].values) {
      if (k === 'version') version = String(v);
      if (k === 'exportedAt') exportedAt = Number(v) || Date.now();
      if (k === 'settings' && typeof v === 'string') {
        try { settings = JSON.parse(v); } catch {}
      }
      if (k === 'documents' && typeof v === 'string') {
        try { documents = JSON.parse(v) || {}; } catch {}
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
  const tablesRes = dbInstance.exec("SELECT id, title, description, default_view, created_at, updated_at, visibility, owner_id FROM tables");
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
        visibility: val[6] === 'private' || val[6] === 'group' ? val[6] : 'shared',
        ownerId: val[7] ? String(val[7]) : undefined,
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
    documents,
  });
}

/**
 * Save complete workspace data into SQLite and sync to user_data.json
 */
export function saveWorkspaceData(data: WorkspaceData): void {
  if (!dbInstance) throw new Error('Database not initialized');
  const complete = ensureWorkspaceTree({
    ...data,
    // Older clients do not send the documents field; keep notes created by newer clients.
    documents: data.documents ?? getStoredDocuments(),
  });
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

export function canAccessTable(tableId: string, userId?: string, role?: string): boolean {
  const res = dbInstance?.exec('SELECT visibility, owner_id FROM tables WHERE id = ?', [toSqliteParam(tableId)]);
  if (!res?.[0]?.values?.length) return false;
  const [visibility, ownerId] = res[0].values[0];
  if (role === 'master' || visibility === 'shared' || (!!userId && ownerId === userId)) return true;
  if (!userId || visibility !== 'group') return false;
  const result = dbInstance?.exec(`SELECT 1 FROM board_group_permissions p
    JOIN group_memberships m ON m.group_id = p.group_id
    WHERE p.table_id = ? AND m.user_id = ? LIMIT 1`, [toSqliteParam(tableId), toSqliteParam(userId)]);
  return Boolean(result?.[0]?.values?.length);
}

export function canWriteTable(tableId: string, userId?: string, role?: string): boolean {
  if (role === 'master') return canAccessTable(tableId, userId, role);
  const res = dbInstance?.exec('SELECT visibility, owner_id FROM tables WHERE id = ?', [toSqliteParam(tableId)]);
  if (!res?.[0]?.values?.length) return false;
  const [visibility, ownerId] = res[0].values[0];
  if (visibility === 'shared') return true;
  if (!userId) return false;
  if (ownerId === userId) return true;
  if (visibility !== 'group') return false;
  const result = dbInstance?.exec(`SELECT 1 FROM board_group_permissions p
    JOIN group_memberships m ON m.group_id = p.group_id
    WHERE p.table_id = ? AND m.user_id = ? AND p.permission = 'write' LIMIT 1`, [toSqliteParam(tableId), toSqliteParam(userId)]);
  return Boolean(result?.[0]?.values?.length);
}

export function canManageTable(tableId: string, userId?: string, role?: string): boolean {
  if (role === 'master') return canAccessTable(tableId, userId, role);
  const res = dbInstance?.exec('SELECT visibility, owner_id FROM tables WHERE id = ?', [toSqliteParam(tableId)]);
  if (!res?.[0]?.values?.length) return false;
  const [visibility, ownerId] = res[0].values[0];
  return (!!userId && ownerId === userId) || (visibility === 'shared' && !ownerId && !!userId);
}

export function listUserGroups(userId: string, role?: string) {
  if (!dbInstance) throw new Error('Database not initialized');
  const groups = role === 'master'
    ? authQuery<any>(`SELECT g.id,g.name,g.owner_id,g.created_at,COALESCE(m.role,'admin') AS member_role
      FROM user_groups g LEFT JOIN group_memberships m ON m.group_id=g.id AND m.user_id=? ORDER BY g.created_at DESC`, [userId])
    : authQuery<any>(`SELECT g.id, g.name, g.owner_id, g.created_at, m.role AS member_role
    FROM user_groups g JOIN group_memberships m ON m.group_id = g.id
    WHERE m.user_id = ? ORDER BY g.created_at DESC`, [userId]);
  const users = authQuery<any>(`SELECT id, email, display_name FROM auth_users WHERE status = 'active' ORDER BY display_name, email`);
  return groups.map(group => ({
    ...group,
    members: authQuery<any>(`SELECT u.id, u.email, u.display_name, m.role FROM group_memberships m
      JOIN auth_users u ON u.id = m.user_id WHERE m.group_id = ? ORDER BY m.role DESC, u.display_name, u.email`, [group.id]),
    users,
  }));
}

export function createUserGroup(userId: string, rawName: string) {
  const name = rawName.trim();
  if (!name || name.length > 80) throw new Error('그룹 이름은 1~80자로 입력해 주세요.');
  const id = `grp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const now = Date.now();
  authRun('INSERT INTO user_groups(id,name,owner_id,created_at) VALUES(?,?,?,?)', [id, name, userId, now]);
  authRun('INSERT INTO group_memberships(group_id,user_id,role) VALUES(?,?,?)', [id, userId, 'owner']);
  return listUserGroups(userId).find(group => group.id === id);
}

export function replaceUserGroupMembers(groupId: string, userId: string, memberIds: string[], role?: string) {
  if (!dbInstance) throw new Error('Database not initialized');
  const group = authQuery<any>('SELECT id,owner_id FROM user_groups WHERE id = ?', [groupId])[0];
  if (!group) throw new Error('그룹을 찾을 수 없습니다.');
  if (group.owner_id !== userId && role !== 'master') throw new Error('그룹 소유자 또는 마스터만 구성원을 변경할 수 있습니다.');
  const uniqueIds = [...new Set([group.owner_id, ...(role === 'master' ? [] : [userId]), ...memberIds])];
  for (const id of uniqueIds) {
    if (!authQuery('SELECT id FROM auth_users WHERE id = ? AND status = \'active\'', [id]).length) throw new Error('활성 계정만 그룹에 추가할 수 있습니다.');
  }
  dbInstance.run('BEGIN TRANSACTION;');
  try {
    dbInstance.run('DELETE FROM group_memberships WHERE group_id = ?', [toSqliteParam(groupId)]);
    uniqueIds.forEach(id => dbInstance!.run('INSERT INTO group_memberships(group_id,user_id,role) VALUES(?,?,?)', [toSqliteParam(groupId), toSqliteParam(id), id === userId ? 'owner' : 'member']));
    dbInstance.run('COMMIT;');
    persistDatabase();
  } catch (error) { dbInstance.run('ROLLBACK;'); throw error; }
  return listUserGroups(userId).find(item => item.id === groupId);
}

export function deleteUserGroup(groupId: string, userId: string, role?: string) {
  const group = authQuery<any>('SELECT owner_id FROM user_groups WHERE id = ?', [groupId])[0];
  if (!group) throw new Error('그룹을 찾을 수 없습니다.');
  if (group.owner_id !== userId && role !== 'master') throw new Error('그룹 소유자 또는 마스터만 삭제할 수 있습니다.');
  authRun('DELETE FROM board_group_permissions WHERE group_id = ?', [groupId]);
  authRun('DELETE FROM group_memberships WHERE group_id = ?', [groupId]);
  authRun('DELETE FROM user_groups WHERE id = ?', [groupId]);
}

export function getTablePermissions(tableId: string, userId?: string, role?: string) {
  const table = authQuery<any>('SELECT visibility,owner_id FROM tables WHERE id = ?', [tableId])[0];
  if (!table) throw new Error('보드를 찾을 수 없습니다.');
  if (!canManageTable(tableId, userId, role)) throw new Error('보드 소유자만 접근 권한을 관리할 수 있습니다.');
  return {
    visibility: table.visibility,
    groups: authQuery<any>(`SELECT g.id,g.name,p.permission FROM board_group_permissions p
      JOIN user_groups g ON g.id=p.group_id WHERE p.table_id=? ORDER BY g.name`, [tableId]),
  };
}

export function setTablePermissions(tableId: string, userId: string | undefined, role: string | undefined, visibility: string, groups: Array<{ groupId: string; permission: string }>) {
  if (!dbInstance) throw new Error('Database not initialized');
  if (!['shared', 'private', 'group'].includes(visibility)) throw new Error('공개 범위가 올바르지 않습니다.');
  const existing = authQuery<any>('SELECT owner_id FROM tables WHERE id=?', [tableId])[0];
  if (!existing) throw new Error('보드를 찾을 수 없습니다.');
  if (!canManageTable(tableId, userId, role)) throw new Error('보드 소유자만 공개 범위를 변경할 수 있습니다.');
  if (!userId && role !== 'master' && visibility !== 'shared') throw new Error('개인·그룹 보드는 로그인 후 설정할 수 있습니다.');
  const unique = new Map<string, string>();
  for (const entry of groups || []) {
    if (!entry?.groupId || !['read', 'write'].includes(entry.permission)) throw new Error('그룹 권한 설정이 올바르지 않습니다.');
    const member = authQuery('SELECT 1 FROM group_memberships WHERE group_id=? AND user_id=?', [entry.groupId, userId || '']);
    if (role !== 'master' && !member.length) throw new Error('참여하지 않은 그룹에는 보드 권한을 줄 수 없습니다.');
    unique.set(entry.groupId, entry.permission);
  }
  if (visibility === 'group' && unique.size === 0) throw new Error('그룹 전용 보드에는 하나 이상의 그룹을 지정해야 합니다.');
  const now = Date.now();
  dbInstance.run('BEGIN TRANSACTION;');
  try {
    const ownerId = existing.owner_id || userId || null;
    dbInstance.run('UPDATE tables SET visibility=?, owner_id=?, updated_at=? WHERE id=?', [visibility, ownerId, now, toSqliteParam(tableId)]);
    dbInstance.run('DELETE FROM board_group_permissions WHERE table_id=?', [toSqliteParam(tableId)]);
    if (visibility === 'group') unique.forEach((permission, groupId) => dbInstance!.run('INSERT INTO board_group_permissions(table_id,group_id,permission) VALUES(?,?,?)', [toSqliteParam(tableId), toSqliteParam(groupId), permission]));
    dbInstance.run('COMMIT;');
    persistDatabase();
  } catch (error) { dbInstance.run('ROLLBACK;'); throw error; }
}

export function getNoteTableId(noteId: string): string | null {
  const result = dbInstance?.exec('SELECT table_id FROM notes WHERE id = ?', [toSqliteParam(noteId)]);
  const tableId = result?.[0]?.values?.[0]?.[0];
  return tableId ? String(tableId) : null;
}

export function getTableForUser(tableId: string, userId?: string, role?: string): TableDocument | null {
  if (!canAccessTable(tableId, userId, role)) return null;
  const table = getTable(tableId);
  return table ? { ...table, accessLevel: tableAccessLevel(table, userId, role) } : null;
}

function tableAccessLevel(table: TableDocument, userId?: string, role?: string): 'owner' | 'write' | 'read' {
  return role === 'master' || (!!userId && table.ownerId === userId) ? 'owner' : canWriteTable(table.id, userId, role) ? 'write' : 'read';
}

export function saveTableForUser(table: TableDocument, userId?: string, role?: string): void {
  const existingResult = dbInstance?.exec('SELECT visibility, owner_id FROM tables WHERE id = ?', [toSqliteParam(table.id)]);
  const existing = existingResult?.[0]?.values?.[0];
  const existingVisibility = (existing?.[0] === 'private' || existing?.[0] === 'group' ? existing[0] : 'shared') as 'shared' | 'private' | 'group';
  const existingOwnerId = existing?.[1] ? String(existing[1]) : undefined;
  if (existing && !canWriteTable(table.id, userId, role)) {
    throw new Error('이 보드에는 쓰기 권한이 없습니다.');
  }
  if (existing && table.visibility !== existingVisibility && role !== 'master' && existingOwnerId && existingOwnerId !== userId) {
    throw new Error('보드 소유자만 공개 범위를 변경할 수 있습니다.');
  }
  if (existing && (table.visibility === 'group' || existingVisibility === 'group') && table.visibility !== existingVisibility) {
    throw new Error('그룹 접근 범위는 그룹 권한 설정 화면에서 변경해 주세요.');
  }
  if (existing && table.visibility === 'group' && existingVisibility !== 'group') throw new Error('그룹 접근 권한을 먼저 설정해 주세요.');
  delete table.accessLevel;
  const nextVisibility = table.visibility || 'shared';
  if (nextVisibility !== 'shared') {
    if (!userId && role !== 'master') throw new Error('개인·그룹 보드는 서버 로그인 후 설정할 수 있습니다.');
    table.ownerId = existingVisibility !== 'shared' ? existingOwnerId : userId;
  } else {
    table.ownerId = existing ? existingOwnerId : userId;
  }
  saveTable(table);
}

export function getWorkspaceDataForUser(userId?: string, role?: string): WorkspaceData {
  const workspace = getWorkspaceData();
  const visibleIds = new Set(Object.values(workspace.tables)
    .filter(table => canAccessTable(table.id, userId, role))
    .map(table => table.id));
  return {
    ...workspace,
    tables: Object.fromEntries(Object.entries(workspace.tables).filter(([id]) => visibleIds.has(id)).map(([id, table]) => [id, { ...table, accessLevel: tableAccessLevel(table, userId, role) }])),
    tree: workspace.tree.filter(item => item.type !== 'table' || visibleIds.has(item.id)),
  };
}

/** Merge a user's visible workspace while preserving other owners' private boards. */
export function saveWorkspaceDataForUser(data: WorkspaceData, userId?: string, role?: string): void {
  if (!dbInstance) throw new Error('Database not initialized');
  const current = getWorkspaceData();
  const incomingTables = { ...(data.tables || {}) };
  for (const table of Object.values(incomingTables)) {
    const existing = current.tables[table.id];
    delete table.accessLevel;
    if (existing && !canWriteTable(table.id, userId, role)) {
      const clean = (value: TableDocument) => ({
        ...value,
        is_dirty: undefined,
        rows: (value.rows || []).map(row => ({ ...row, is_dirty: undefined })),
      });
      if (JSON.stringify(clean(table)) !== JSON.stringify(clean(existing))) throw new Error('쓰기 권한이 없는 보드는 수정할 수 없습니다.');
      incomingTables[table.id] = existing;
      continue;
    }
    if (existing && table.visibility !== existing.visibility && role !== 'master' && existing.ownerId && existing.ownerId !== userId) {
      throw new Error('보드 소유자만 공개 범위를 변경할 수 있습니다.');
    }
    if (existing && table.visibility !== existing.visibility) throw new Error('보드 공개 범위는 그룹 권한 설정 화면에서 변경해 주세요.');
    if ((table.visibility || 'shared') !== 'shared') {
      if (!userId && role !== 'master') throw new Error('개인·그룹 보드는 서버 로그인 후 설정할 수 있습니다.');
      table.ownerId = existing?.visibility !== 'shared' ? existing?.ownerId : userId;
    } else {
      table.ownerId = existing ? (existing.ownerId || userId) : userId;
    }
  }

  const hiddenPrivate = Object.values(current.tables).filter(table =>
    !canAccessTable(table.id, userId, role) || ((table.visibility === 'private' || table.visibility === 'group') && table.ownerId !== userId && role !== 'master')
  );
  hiddenPrivate.forEach(table => { incomingTables[table.id] = table; });
  const protectedIds = new Set(Object.values(current.tables).filter(table =>
    !canWriteTable(table.id, userId, role) || ((table.visibility === 'private' || table.visibility === 'group') && table.ownerId !== userId && role !== 'master')
  ).map(table => table.id));
  const incomingTree = (Array.isArray(data.tree) ? data.tree : []).filter(item => !protectedIds.has(item.id));
  incomingTree.push(...current.tree.filter(item => protectedIds.has(item.id)));
  saveWorkspaceData({ ...data, tables: incomingTables, tree: incomingTree });
}

export function saveTreeForUser(tree: TreeItem[], userId?: string, role?: string): void {
  const current = getWorkspaceData();
  const protectedIds = new Set(Object.values(current.tables).filter(table =>
    !canWriteTable(table.id, userId, role) || ((table.visibility === 'private' || table.visibility === 'group') && table.ownerId !== userId && role !== 'master')
  ).map(table => table.id));
  const merged = tree.filter(item => !protectedIds.has(item.id));
  merged.push(...current.tree.filter(item => protectedIds.has(item.id)));
  saveTree(merged);
}

/**
 * Save single TableDocument into SQLite and keep tree synchronized
 */
export function saveTable(table: TableDocument, insideTransaction = false): void {
  if (!dbInstance) throw new Error('Database not initialized');

  if (!insideTransaction) dbInstance.run('BEGIN TRANSACTION;');
  try {
    dbInstance.run('DELETE FROM table_assets WHERE table_id = ?', [toSqliteParam(table.id)]);
    const tCreated = table.createdAt || Date.now();
    const tUpdated = table.updatedAt || Date.now();

    dbInstance.run(
      `INSERT OR REPLACE INTO tables (id, title, description, default_view, created_at, updated_at, visibility, owner_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        toSqliteParam(table.id),
        toSqliteParam(table.title || '새 데이터 테이블'),
        toSqliteParam(table.description),
        toSqliteParam(table.defaultView || 'grid'),
        toSqliteParam(tCreated),
        toSqliteParam(tUpdated),
        table.visibility === 'private' || table.visibility === 'group' ? table.visibility : 'shared',
        toSqliteParam(table.ownerId),
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
    dbInstance.run("DELETE FROM notes WHERE table_id = ?;", [toSqliteParam(table.id)]);
    if (Array.isArray(table.rows)) {
      table.rows.forEach((row) => {
        if (!row || !row.id) return;
        const rData = row.data && typeof row.data === 'object' ? { ...row.data } : {};
        const assetRefs = new Set<string>();
        for (const value of [...Object.values(rData), row.richContent || '']) {
          if (typeof value !== 'string') continue;
          for (const match of value.matchAll(/asset:\/\/([a-zA-Z0-9_-]+)/g)) assetRefs.add(match[1]);
        }
        for (const assetId of assetRefs) dbInstance!.run('INSERT OR IGNORE INTO table_assets(asset_id, table_id) VALUES (?, ?)', [assetId, toSqliteParam(table.id)]);
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

        // Sync to notes table
        const rowTitle = rData.name || rData.title || Object.values(rData)[0] || row.id;
        dbInstance!.run(
          `INSERT OR REPLACE INTO notes (id, table_id, title, content, data_json, rich_content, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
          [
            toSqliteParam(row.id),
            toSqliteParam(table.id),
            toSqliteParam(String(rowTitle)),
            toSqliteParam(row.richContent || JSON.stringify(rData)),
            JSON.stringify(rData),
            toSqliteParam(row.richContent),
            toSqliteParam(rCreated),
            toSqliteParam(rUpdated),
          ]
        );
      });
    }

    const now = Date.now();
    dbInstance.run("INSERT OR REPLACE INTO workspace_meta (key, value) VALUES ('exportedAt', ?);", [String(now)]);
    if (!insideTransaction) dbInstance.run('COMMIT;');
  } catch (err) {
    if (!insideTransaction) dbInstance.run('ROLLBACK;');
    throw err;
  }

  if (insideTransaction) return;
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

function getStoredDocuments(): Record<string, WonNoteDocument> {
  if (!dbInstance) return {};
  const result = dbInstance.exec("SELECT value FROM workspace_meta WHERE key = 'documents';");
  try {
    return result[0]?.values?.[0]?.[0] ? JSON.parse(String(result[0].values[0][0])) : {};
  } catch {
    return {};
  }
}

export interface DocumentHistoryEntry {
  id: string;
  itemKey: string;
  title: string;
  content: string;
  createdAt: number;
  author?: string;
}

function stripHtmlForHistorySearch(value: string): string {
  return value.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, ' ');
}

export function saveDocumentHistorySnapshot(input: Omit<DocumentHistoryEntry, 'id' | 'createdAt'> & { tableId?: string }, limit = 50): DocumentHistoryEntry {
  if (!dbInstance) throw new Error('Database not initialized');
  const previous = dbInstance.exec('SELECT id, content FROM document_history WHERE item_key = ? ORDER BY created_at DESC LIMIT 1', [input.itemKey]);
  if (previous[0]?.values[0]?.[1] === input.content) {
    const existing = dbInstance.exec('SELECT id, item_key, title, content, created_at, author FROM document_history WHERE id = ?', [previous[0].values[0][0]]);
    const row = existing[0]?.values[0];
    if (row) return { id: String(row[0]), itemKey: String(row[1]), title: String(row[2]), content: String(row[3]), createdAt: Number(row[4]), author: row[5] ? String(row[5]) : undefined };
  }
  const entry: DocumentHistoryEntry = { id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`, itemKey: input.itemKey, title: input.title, content: input.content, createdAt: Date.now(), author: input.author };
  dbInstance.run('INSERT INTO document_history(id, item_key, table_id, title, content, created_at, author) VALUES (?, ?, ?, ?, ?, ?, ?)', [entry.id, entry.itemKey, input.tableId || null, entry.title, entry.content, entry.createdAt, entry.author || null]);
  if (documentHistoryFtsAvailable) dbInstance.run('INSERT INTO document_history_fts(history_id, title, content) VALUES (?, ?, ?)', [entry.id, entry.title, stripHtmlForHistorySearch(entry.content)]);
  const overflow = dbInstance.exec('SELECT id FROM document_history WHERE item_key = ? ORDER BY created_at DESC LIMIT -1 OFFSET ?', [entry.itemKey, Math.max(1, limit)]);
  for (const [id] of overflow[0]?.values || []) {
    dbInstance.run('DELETE FROM document_history WHERE id = ?', [String(id)]);
    if (documentHistoryFtsAvailable) dbInstance.run('DELETE FROM document_history_fts WHERE history_id = ?', [String(id)]);
  }
  persistDatabase(false);
  return entry;
}

export function listDocumentHistory(itemKey: string, query = '', limit = 100): DocumentHistoryEntry[] {
  if (!dbInstance) throw new Error('Database not initialized');
  const safeLimit = Math.min(Math.max(limit, 1), 200);
  let rows: any[] = [];
  if (query.trim() && documentHistoryFtsAvailable) {
    const expression = query.trim().split(/\s+/).map(part => `"${part.replace(/"/g, '""')}"`).join(' AND ');
    try {
      const result = dbInstance.exec(`SELECT h.id, h.item_key, h.title, h.content, h.created_at, h.author FROM document_history h JOIN document_history_fts f ON f.history_id = h.id WHERE h.item_key = ? AND document_history_fts MATCH ? ORDER BY h.created_at DESC LIMIT ?`, [itemKey, expression, safeLimit]);
      rows = result[0]?.values || [];
    } catch { rows = []; }
  } else {
    const like = `%${query.trim()}%`;
    const result = query.trim()
      ? dbInstance.exec('SELECT id, item_key, title, content, created_at, author FROM document_history WHERE item_key = ? AND (title LIKE ? OR content LIKE ?) ORDER BY created_at DESC LIMIT ?', [itemKey, like, like, safeLimit])
      : dbInstance.exec('SELECT id, item_key, title, content, created_at, author FROM document_history WHERE item_key = ? ORDER BY created_at DESC LIMIT ?', [itemKey, safeLimit]);
    rows = result[0]?.values || [];
  }
  return rows.map(row => ({ id: String(row[0]), itemKey: String(row[1]), title: String(row[2]), content: String(row[3]), createdAt: Number(row[4]), author: row[5] ? String(row[5]) : undefined }));
}

export function saveDocument(document: WonNoteDocument): void {
  if (!dbInstance) throw new Error('Database not initialized');
  const documents = getStoredDocuments();
  documents[document.id] = document;
  const now = Date.now();
  dbInstance.run("INSERT OR REPLACE INTO workspace_meta (key, value) VALUES ('documents', ?);", [JSON.stringify(documents)]);
  dbInstance.run("INSERT OR REPLACE INTO workspace_meta (key, value) VALUES ('exportedAt', ?);", [String(now)]);
  touchServerUpdate();
  persistDatabase(false);
  syncDbToUserDataJson(false);
}

export function deleteDocument(documentId: string): void {
  if (!dbInstance) throw new Error('Database not initialized');
  const documents = getStoredDocuments();
  delete documents[documentId];
  const now = Date.now();
  dbInstance.run("INSERT OR REPLACE INTO workspace_meta (key, value) VALUES ('documents', ?);", [JSON.stringify(documents)]);
  dbInstance.run("INSERT OR REPLACE INTO workspace_meta (key, value) VALUES ('exportedAt', ?);", [String(now)]);
  touchServerUpdate();
  persistDatabase(false);
  syncDbToUserDataJson(false);
}

/**
 * Delete a TableDocument from SQLite and drop any physical table
 */
export function deleteTable(tableId: string): void {
  if (!dbInstance) throw new Error('Database not initialized');
  const now = Date.now();
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
      dbInstance.run("DELETE FROM notes WHERE table_id = ?;", [toSqliteParam(tid)]);
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
      'notes',
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

  touchServerUpdate();
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
          dbInstance.run("DELETE FROM notes WHERE table_id = ?;", [tId]);
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
        AND name NOT IN ('table_columns', 'table_rows', 'notes', 'tables', 'workspace_meta', 'tree_items', 'calendar_events', 'document_chunks', 'row_images');
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

export function getCalendarEventsForUser(tableId: string | undefined, userId?: string, role?: string): CalendarEvent[] {
  if (!dbInstance) throw new Error('Database not initialized');
  if (tableId) return canAccessTable(tableId, userId, role) ? getCalendarEvents(tableId) : [];
  const tableIds = dbInstance.exec('SELECT DISTINCT table_id FROM calendar_events')[0]?.values.map(row => String(row[0])) || [];
  return tableIds.filter(id => canAccessTable(id, userId, role)).flatMap(id => getCalendarEvents(id));
}

export function getCalendarEventTableId(eventId: string): string | null {
  const result = dbInstance?.exec('SELECT table_id FROM calendar_events WHERE id=?', [toSqliteParam(eventId)]);
  const tableId = result?.[0]?.values?.[0]?.[0];
  return tableId ? String(tableId) : null;
}

export function saveCalendarEvent(event: CalendarEvent, tableId: string, persist = true): void {
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
  if (persist) persistDatabase();
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

export function getRowImageForUser(imageId: string, userId?: string, role?: string): { id: string; mimeType: string; data: Uint8Array } | null {
  const res = dbInstance?.exec('SELECT table_id, owner_id FROM row_images WHERE id = ?', [toSqliteParam(imageId)]);
  if (!res?.[0]?.values?.length) return null;
  const [tableId, ownerId] = res[0].values[0];
  let accessible = false;
  if (tableId && tableId !== '__assets__') accessible = canAccessTable(String(tableId), userId, role);
  else if (role === 'master' || (!!userId && ownerId === userId)) accessible = true;
  if (!accessible && dbInstance) {
    const links = dbInstance.exec('SELECT table_id FROM table_assets WHERE asset_id = ?', [toSqliteParam(imageId)]);
    accessible = Boolean(links[0]?.values?.some(([linkedTableId]) => canAccessTable(String(linkedTableId), userId, role)));
  }
  return accessible ? getRowImage(imageId) : null;
}

/** Store an editor image in the same SQLite image store used by table row images. */
export function saveImageAsset(imageId: string, mimeType: string, data: Uint8Array, ownerId?: string): void {
  if (!dbInstance) throw new Error('Database not initialized');
  const now = Date.now();
  dbInstance.run(
    `INSERT OR REPLACE INTO row_images (id, table_id, row_id, column_key, mime_type, image_data, created_at, updated_at, owner_id)
     VALUES (?, '__assets__', ?, 'asset', ?, ?, ?, ?, ?);`,
    [imageId, imageId, mimeType || 'application/octet-stream', Buffer.from(data), now, now, ownerId || null]
  );
  persistDatabase(true);
}

export function getAdminRowImages(): Array<{
  id: string;
  table_id: string;
  row_id: string;
  column_key: string;
  mime_type: string;
  size: number;
  created_at: number;
  owner_id?: string;
}> {
  if (!dbInstance) return [];
  try {
    const tableInfo = dbInstance.exec('PRAGMA table_info(row_images)')[0]?.values || [];
    const colNames = new Set(tableInfo.map((r) => String(r[1])));

    if (!colNames.has('id')) return [];

    const hasOwnerId = colNames.has('owner_id');
    const hasCreatedAt = colNames.has('created_at');

    const sql = `SELECT id, table_id, row_id, column_key, mime_type, ${
      hasCreatedAt ? 'created_at' : '0'
    }, ${hasOwnerId ? 'owner_id' : 'NULL'} FROM row_images;`;

    const res = dbInstance.exec(sql);
    if (!res[0] || !res[0].values) return [];

    return res[0].values.map((r) => {
      const id = String(r[0] || '');
      const table_id = String(r[1] || '');
      const row_id = String(r[2] || '');
      const column_key = String(r[3] || '');
      const mime_type = String(r[4] || 'image/png');
      const created_at = Number(r[5]) || Date.now();
      const owner_id = r[6] ? String(r[6]) : undefined;

      let size = 0;
      try {
        const sizeRes = dbInstance!.exec(`SELECT length(image_data) FROM row_images WHERE id = '${id.replace(/'/g, "''")}';`);
        if (sizeRes[0]?.values[0]?.[0]) {
          size = Number(sizeRes[0].values[0][0]);
        }
      } catch (_) {}

      return {
        id,
        table_id,
        row_id,
        column_key,
        mime_type,
        size,
        created_at,
        owner_id,
      };
    });
  } catch (err) {
    console.error('[SQLite] getAdminRowImages error:', err);
    return [];
  }
}

export function deleteRowImage(id: string): boolean {
  if (!dbInstance) return false;
  try {
    dbInstance.run('DELETE FROM row_images WHERE id = ?;', [toSqliteParam(id)]);
    persistDatabase(true);
    return true;
  } catch (err) {
    console.warn('[SQLite] deleteRowImage failed:', err);
    return false;
  }
}

/** Insert one received copy. Other rows/tables are never replaced or deleted. */
export function importSharedItem(received: ReturnType<typeof materializeItem>): void {
  if (!dbInstance || !SQL) throw new Error('Database not initialized');
  if (received.item.id !== received.tree.id || dbInstance.exec('SELECT id FROM tree_items WHERE id=?', [received.item.id])[0]?.values.length || getStoredDocuments()[received.item.id]) {
    throw new Error('받은 사본의 ID가 기존 항목과 충돌합니다.');
  }
  if (received.tree.parentId) {
    const parent = dbInstance.exec("SELECT id FROM tree_items WHERE id = ? AND type = 'folder'", [received.tree.parentId]);
    if (!parent[0]?.values.length) throw new Error('가져올 대상 폴더가 존재하지 않습니다.');
  }
  const snapshot = dbInstance.export(), now = Date.now();
  const temporary = `${DB_FILE_PATH}.import-${crypto.randomUUID()}`;
  try {
    dbInstance.run('BEGIN TRANSACTION;');
    if (received.kind === 'table') saveTable({ ...(received.item as TableDocument), visibility: 'shared', ownerId: undefined }, true);
    else {
      const docs = getStoredDocuments(); docs[received.item.id] = received.item as WonNoteDocument;
      dbInstance.run("INSERT OR REPLACE INTO workspace_meta (key, value) VALUES ('documents', ?)", [JSON.stringify(docs)]);
    }
    const t = received.tree;
    dbInstance.run(`INSERT INTO tree_items (id, parent_id, title, type, icon, color, is_expanded, created_at, updated_at, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, 0)
      ON CONFLICT(id) DO UPDATE SET parent_id=excluded.parent_id, title=excluded.title, icon=excluded.icon, color=excluded.color`,
      [t.id, t.parentId, t.title, t.type, t.icon || null, t.color || null, now, now]);
    for (const asset of received.assets) dbInstance.run(`INSERT INTO row_images
      (id, table_id, row_id, column_key, mime_type, image_data, created_at, updated_at) VALUES (?, '__assets__', ?, 'asset', ?, ?, ?, ?)`,
      [asset.id, asset.id, asset.mime, asset.bytes, now, now]);
    for (const event of received.events) saveCalendarEvent(event, received.item.id, false);
    if (received.kind === 'table' && Object.keys(received.layouts).length) {
      const existing = dbInstance.exec("SELECT value FROM workspace_meta WHERE key='exchange_layouts'");
      const layouts = existing[0]?.values[0]?.[0] ? JSON.parse(String(existing[0].values[0][0])) : {};
      layouts[received.item.id] = received.layouts;
      dbInstance.run("INSERT OR REPLACE INTO workspace_meta (key, value) VALUES ('exchange_layouts', ?)", [JSON.stringify(layouts)]);
    }
    dbInstance.run("INSERT OR REPLACE INTO workspace_meta (key, value) VALUES ('exportedAt', ?)", [String(now)]);
    dbInstance.run('COMMIT;');
    fs.writeFileSync(temporary, dbInstance.export());
    fs.renameSync(temporary, DB_FILE_PATH);
  } catch (error) {
    // Restore the in-memory snapshot even if the filesystem write failed after commit.
    try { dbInstance.close(); } catch { /* restore below */ }
    dbInstance = new SQL.Database(snapshot);
    try { fs.unlinkSync(temporary); } catch { /* no temporary file */ }
    throw error;
  }
  touchServerUpdate(); syncDbToUserDataJson();
}

export function getSharedLayouts(tableId: string): Record<string, unknown> {
  if (!dbInstance) throw new Error('Database not initialized');
  const result = dbInstance.exec("SELECT value FROM workspace_meta WHERE key='exchange_layouts'");
  return result[0]?.values[0]?.[0] ? JSON.parse(String(result[0].values[0][0]))[tableId] || {} : {};
}

export function saveSharedLayouts(tableId: string, value: Record<string, unknown>): void {
  if (!dbInstance) throw new Error('Database not initialized');
  const result = dbInstance.exec("SELECT value FROM workspace_meta WHERE key='exchange_layouts'");
  const layouts = result[0]?.values[0]?.[0] ? JSON.parse(String(result[0].values[0][0])) : {};
  layouts[tableId] = value;
  dbInstance.run("INSERT OR REPLACE INTO workspace_meta (key, value) VALUES ('exchange_layouts', ?)", [JSON.stringify(layouts)]);
  persistDatabase();
}

/**
 * 1.2. Workspace Metadata API (Replaces 100MB+ full workspace dumps)
 * Lightweight structural metadata (<5KB) without heavy row/note bodies.
 */
export function getWorkspaceMeta(userId?: string, role?: string): {
  last_updated_at: number;
  total_count: number;
  tableCount: number;
  treeCount: number;
  version: string;
  settings: any;
  tree: TreeItem[];
  documents: Record<string, WonNoteDocument>;
  tables: Record<string, { id: string; title: string; description?: string; defaultView?: any; visibility?: 'shared' | 'private' | 'group'; ownerId?: string; accessLevel?: 'owner' | 'write' | 'read'; columns: any[]; createdAt: number; updatedAt: number }>;
} {
  if (!dbInstance) throw new Error('Database not initialized');
  let totalCount = 0;
  try {
    const res = dbInstance.exec("SELECT count(*) FROM table_rows;");
    totalCount = Number(res[0]?.values[0]?.[0] || 0);
  } catch {
    try {
      const res = dbInstance.exec("SELECT count(*) FROM notes;");
      totalCount = Number(res[0]?.values[0]?.[0] || 0);
    } catch {}
  }
  if (totalCount === 0) {
    try {
      const res = dbInstance.exec("SELECT count(*) FROM notes;");
      totalCount = Number(res[0]?.values[0]?.[0] || 0);
    } catch {}
  }

  // Meta
  const metaRes = dbInstance.exec("SELECT key, value FROM workspace_meta;");
  let version = '1.0.0';
  let settings = {};
  if (metaRes.length > 0) {
    for (const [k, v] of metaRes[0].values) {
      if (k === 'version') version = String(v);
      if (k === 'settings' && typeof v === 'string') {
        try { settings = JSON.parse(v); } catch {}
      }
    }
  }

  // Lightweight Tree Items
  const tree: TreeItem[] = [];
  const treeRes = dbInstance.exec("SELECT id, parent_id, title, type, icon, color, is_expanded, created_at, updated_at FROM tree_items ORDER BY sort_order ASC, created_at ASC;");
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

  // Lightweight Tables with Columns (WITHOUT rows)
  const tables: Record<string, { id: string; title: string; description?: string; defaultView?: any; visibility?: 'shared' | 'private' | 'group'; ownerId?: string; accessLevel?: 'owner' | 'write' | 'read'; columns: any[]; createdAt: number; updatedAt: number }> = {};
  const tablesRes = dbInstance.exec("SELECT id, title, description, default_view, created_at, updated_at, visibility, owner_id FROM tables;");
  if (tablesRes.length > 0) {
    for (const val of tablesRes[0].values) {
      const tableId = String(val[0]);
      tables[tableId] = {
        id: tableId,
        title: String(val[1]),
        description: val[2] ? String(val[2]) : undefined,
        defaultView: (val[3] as any) || 'grid',
        visibility: val[6] === 'private' || val[6] === 'group' ? val[6] : 'shared',
        ownerId: val[7] ? String(val[7]) : undefined,
        createdAt: Number(val[4]),
        updatedAt: Number(val[5]),
        columns: [],
      };
    }
  }

  const colsRes = dbInstance.exec("SELECT id, table_id, name, type, width, is_primary_key, auto_update_date, options_json, format FROM table_columns ORDER BY sort_order ASC;");
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
          type: (val[3] as any) || 'text',
          width: Number(val[4]) || 160,
          isPrimaryKey: Boolean(val[5]),
          autoUpdateDate: Boolean(val[6]),
          options,
          format: val[8] ? String(val[8]) : undefined,
        });
      }
    }
  }

  const visibleIds = new Set(Object.values(tables).filter(table =>
    canAccessTable(table.id, userId, role)
  ).map(table => table.id));
  const visibleTree = tree.filter(item => item.type !== 'table' || visibleIds.has(item.id));
  for (const tableId of visibleIds) tables[tableId].accessLevel = tableAccessLevel(tables[tableId] as TableDocument, userId, role);
  const visibleCountRes = dbInstance.exec(
    `SELECT count(*) FROM notes n LEFT JOIN tables t ON t.id = n.table_id
     WHERE n.table_id IS NULL OR t.id IS NULL OR t.visibility = 'shared' OR t.owner_id = ? OR ? = 'master'
       OR EXISTS (SELECT 1 FROM board_group_permissions p JOIN group_memberships m ON m.group_id=p.group_id WHERE p.table_id=t.id AND m.user_id=?)`,
    [userId || '', role || '', userId || '']
  );
  totalCount = Number(visibleCountRes[0]?.values[0]?.[0] || 0);
  return {
    last_updated_at: getLastUpdatedTimestamp(),
    total_count: totalCount,
    tableCount: visibleIds.size,
    treeCount: visibleTree.length,
    version,
    settings,
    tree: visibleTree,
    documents: getStoredDocuments(),
    tables: Object.fromEntries(Object.entries(tables).filter(([id]) => visibleIds.has(id))),
  };
}

/**
 * 1.3. O(1) Cursor-based Pagination API for notes
 * Prevents OFFSET degradation on 1000MB+ datasets.
 * Query:
 *   WHERE (updated_at < :last_updated_at) OR (updated_at = :last_updated_at AND id < :last_id)
 *   ORDER BY updated_at DESC, id DESC LIMIT :limit;
 */
export function getNotesCursor(
  cursor?: string,
  limit: number = 50,
  tableId?: string,
  userId?: string,
  role?: string
): {
  data: any[];
  pagination: {
    next_cursor: string | null;
    has_more: boolean;
  };
} {
  if (!dbInstance) throw new Error('Database not initialized');
  const safeLimit = Math.min(Math.max(limit, 1), 200);

  let query: string;
  let params: any[];

  if (cursor) {
    const parts = cursor.split('_');
    const lastUpdatedAt = parseInt(parts[0], 10) || 0;
    const lastId = parts.slice(1).join('_');

    if (tableId) {
      query = `
        SELECT id, table_id, title, content, data_json, rich_content, created_at, updated_at
        FROM notes
        WHERE table_id = ? AND ((updated_at < ?) OR (updated_at = ? AND id < ?))
        ORDER BY updated_at DESC, id DESC
        LIMIT ?;
      `;
      params = [toSqliteParam(tableId), lastUpdatedAt, lastUpdatedAt, toSqliteParam(lastId), safeLimit];
    } else {
      query = `
        SELECT notes.id, notes.table_id, notes.title, notes.content, notes.data_json, notes.rich_content, notes.created_at, notes.updated_at
        FROM notes
        WHERE ((notes.updated_at < ?) OR (notes.updated_at = ? AND notes.id < ?))
          AND (notes.table_id IS NULL OR NOT EXISTS (SELECT 1 FROM tables t WHERE t.id = notes.table_id AND t.visibility <> 'shared' AND t.owner_id <> ? AND ? <> 'master' AND NOT EXISTS (SELECT 1 FROM board_group_permissions p JOIN group_memberships m ON m.group_id=p.group_id WHERE p.table_id=t.id AND m.user_id=?)))
        ORDER BY notes.updated_at DESC, notes.id DESC
        LIMIT ?;
      `;
      params = [lastUpdatedAt, lastUpdatedAt, toSqliteParam(lastId), userId || '', role || '', userId || '', safeLimit];
    }
  } else {
    if (tableId) {
      query = `
        SELECT id, table_id, title, content, data_json, rich_content, created_at, updated_at
        FROM notes
        WHERE table_id = ?
        ORDER BY updated_at DESC, id DESC
        LIMIT ?;
      `;
      params = [toSqliteParam(tableId), safeLimit];
    } else {
      query = `
        SELECT notes.id, notes.table_id, notes.title, notes.content, notes.data_json, notes.rich_content, notes.created_at, notes.updated_at
        FROM notes
        WHERE (notes.table_id IS NULL OR NOT EXISTS (SELECT 1 FROM tables t WHERE t.id = notes.table_id AND t.visibility <> 'shared' AND t.owner_id <> ? AND ? <> 'master' AND NOT EXISTS (SELECT 1 FROM board_group_permissions p JOIN group_memberships m ON m.group_id=p.group_id WHERE p.table_id=t.id AND m.user_id=?)))
        ORDER BY updated_at DESC, id DESC
        LIMIT ?;
      `;
      params = [userId || '', role || '', userId || '', safeLimit];
    }
  }

  const res = dbInstance.exec(query, params);
  const rows: any[] = [];
  if (res.length > 0 && res[0].values) {
    const cols = res[0].columns;
    res[0].values.forEach((v) => {
      const rowObj: any = {};
      cols.forEach((c, idx) => {
        rowObj[c] = v[idx];
      });
      if (typeof rowObj.data_json === 'string') {
        try { rowObj.data = JSON.parse(rowObj.data_json); } catch {}
      }
      rows.push(rowObj);
    });
  }

  const visibleRows = rows.filter(row => !row.table_id || canAccessTable(String(row.table_id), userId, role));
  const hasMore = visibleRows.length === safeLimit;
  let nextCursor: string | null = null;
  if (hasMore && visibleRows.length > 0) {
    const last = visibleRows[visibleRows.length - 1];
    nextCursor = `${last.updated_at}_${last.id}`;
  }

  return {
    data: visibleRows,
    pagination: {
      next_cursor: nextCursor,
      has_more: hasMore,
    },
  };
}

/**
 * 1.4. Delta Sync API for notes
 * SELECT * FROM notes WHERE updated_at > :since ORDER BY updated_at ASC LIMIT :limit;
 */
export function getNotesSync(
  since: number = 0,
  limit: number = 1000,
  userId?: string,
  role?: string,
  cursor?: string
): {
  data: any[];
  since: number;
  latest_updated_at: number;
  count: number;
  has_more: boolean;
  next_cursor: string | null;
} {
  if (!dbInstance) throw new Error('Database not initialized');
  const safeLimit = Math.min(Math.max(limit, 1), 5000);
  let cursorUpdatedAt = since;
  let cursorId = '';
  if (cursor) {
    const separator = cursor.indexOf('_');
    const parsedTimestamp = Number(separator >= 0 ? cursor.slice(0, separator) : NaN);
    if (!Number.isFinite(parsedTimestamp) || separator < 0 || !cursor.slice(separator + 1)) {
      throw new Error('Invalid sync cursor');
    }
    cursorUpdatedAt = parsedTimestamp;
    cursorId = cursor.slice(separator + 1);
  }
  const query = `
    SELECT id, table_id, title, content, data_json, rich_content, created_at, updated_at
    FROM notes
    WHERE (updated_at > ? OR (updated_at = ? AND id > ?))
      AND (table_id IS NULL OR NOT EXISTS (SELECT 1 FROM tables t WHERE t.id = notes.table_id AND t.visibility <> 'shared' AND t.owner_id <> ? AND ? <> 'master' AND NOT EXISTS (SELECT 1 FROM board_group_permissions p JOIN group_memberships m ON m.group_id=p.group_id WHERE p.table_id=t.id AND m.user_id=?)))
    ORDER BY updated_at ASC, id ASC
    LIMIT ?;
  `;
  const res = dbInstance.exec(query, [cursorUpdatedAt, cursorUpdatedAt, cursorId, userId || '', role || '', userId || '', safeLimit + 1]);
  const rows: any[] = [];
  let latestUpdatedAt = since;

  if (res.length > 0 && res[0].values) {
    const cols = res[0].columns;
    res[0].values.forEach((v) => {
      const rowObj: any = {};
      cols.forEach((c, idx) => {
        rowObj[c] = v[idx];
      });
      if (typeof rowObj.data_json === 'string') {
        try { rowObj.data = JSON.parse(rowObj.data_json); } catch {}
      }
      rows.push(rowObj);
      if (typeof rowObj.updated_at === 'number' && rowObj.updated_at > latestUpdatedAt) {
        latestUpdatedAt = rowObj.updated_at;
      }
    });
  }

  const hasMore = rows.length > safeLimit;
  const page = hasMore ? rows.slice(0, safeLimit) : rows;
  const lastRow = page[page.length - 1];
  return {
    data: page,
    since,
    latest_updated_at: page.reduce((latest, row) => Math.max(latest, Number(row.updated_at) || since), since),
    count: page.length,
    has_more: hasMore,
    next_cursor: hasMore && lastRow ? `${lastRow.updated_at}_${lastRow.id}` : null,
  };
}

/**
 * 2. Push Sync API: UPSERT dirty notes from local IndexedDB into SQLite (wonbee.sqlite)
 * Handles offline / serverless modifications when switching to server mode or network reconnect.
 */
export function pushSyncNotes(notes: any[]): {
  success: boolean;
  upsertedCount: number;
  last_updated_at: number;
} {
  if (!dbInstance) throw new Error('Database not initialized');
  if (!Array.isArray(notes) || notes.length === 0) {
    return {
      success: true,
      upsertedCount: 0,
      last_updated_at: getLastUpdatedTimestamp(),
    };
  }

  const now = Date.now();
  dbInstance.run('BEGIN TRANSACTION;');
  try {
    let count = 0;
    for (const note of notes) {
      if (!note || !note.id) continue;
      const tableId = String(note.table_id || 'table-default');
      const tableTitle = String(note.table_title || note.table_id || 'table-default');
      const nCreated = Number(note.created_at) || now;
      const nUpdated = Number(note.updated_at) || now;
      const title = String(note.title || note.id);
      const richContent = note.rich_content || (note.content && !String(note.content).startsWith('{') ? String(note.content) : null);

      let dataJson = note.data_json;
      if (!dataJson && note.data) {
        dataJson = JSON.stringify(note.data);
      } else if (!dataJson) {
        dataJson = JSON.stringify({ name: title });
      }

      const assetValues: unknown[] = [richContent, typeof dataJson === 'string' ? dataJson : ''];
      for (const value of assetValues) {
        if (typeof value !== 'string') continue;
        for (const match of value.matchAll(/asset:\/\/([a-zA-Z0-9_-]+)/g)) {
          dbInstance.run('INSERT OR IGNORE INTO table_assets(asset_id, table_id) VALUES (?, ?)', [match[1], toSqliteParam(tableId)]);
        }
      }

      // 1. Ensure table exists in tables and tree_items
      dbInstance.run(
        `INSERT OR IGNORE INTO tables (id, title, description, default_view, created_at, updated_at)
         VALUES (?, ?, ?, 'grid', ?, ?);`,
        [toSqliteParam(tableId), toSqliteParam(tableTitle), toSqliteParam(''), toSqliteParam(nCreated), toSqliteParam(nUpdated)]
      );

      dbInstance.run(
        `INSERT OR IGNORE INTO tree_items (id, parent_id, title, type, is_expanded, created_at, updated_at, sort_order)
         VALUES (?, null, ?, 'table', 0, ?, ?, 0);`,
        [toSqliteParam(tableId), toSqliteParam(tableTitle), toSqliteParam(nCreated), toSqliteParam(nUpdated)]
      );

      if (note.table_title) {
        dbInstance.run(
          `UPDATE tables SET title = ? WHERE id = ? AND (title = id OR title IS NULL OR title = '');`,
          [toSqliteParam(note.table_title), toSqliteParam(tableId)]
        );
        dbInstance.run(
          `UPDATE tree_items SET title = ? WHERE id = ? AND (title = id OR title IS NULL OR title = '');`,
          [toSqliteParam(note.table_title), toSqliteParam(tableId)]
        );
      }

      // 2. UPSERT into notes table
      dbInstance.run(
        `INSERT OR REPLACE INTO notes (id, table_id, title, content, data_json, rich_content, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
        [
          toSqliteParam(note.id),
          toSqliteParam(tableId),
          toSqliteParam(title),
          toSqliteParam(note.content || richContent || dataJson),
          toSqliteParam(dataJson),
          toSqliteParam(richContent),
          toSqliteParam(nCreated),
          toSqliteParam(nUpdated),
        ]
      );

      // 3. UPSERT into table_rows table
      dbInstance.run(
        `INSERT OR REPLACE INTO table_rows (id, table_id, data_json, rich_content, stickers_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?);`,
        [
          toSqliteParam(note.id),
          toSqliteParam(tableId),
          toSqliteParam(dataJson),
          toSqliteParam(richContent),
          null,
          toSqliteParam(nCreated),
          toSqliteParam(nUpdated),
        ]
      );

      count++;
    }

    dbInstance.run("INSERT OR REPLACE INTO workspace_meta (key, value) VALUES ('exportedAt', ?);", [String(now)]);
    dbInstance.run('COMMIT;');

    touchServerUpdate();
    persistDatabase(false);
    syncDbToUserDataJson(false);

    return {
      success: true,
      upsertedCount: count,
      last_updated_at: getLastUpdatedTimestamp(),
    };
  } catch (err) {
    try { dbInstance.run('ROLLBACK;'); } catch {}
    console.error('[SQLite] pushSyncNotes failed:', err);
    throw err;
  }
}

