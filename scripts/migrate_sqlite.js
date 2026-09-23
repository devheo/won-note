#!/usr/bin/env node
/**
 * WonBee SQLite Migration Script (Node.js)
 * ========================================
 * Exports JSON data from WonBee's "데이터 파일 관리 & 포터블 병합"
 * and migrates/upserts all records into SQLite database.
 * 
 * Requirements: Node.js v22+ (built-in node:sqlite) or compatible driver.
 * Usage:
 *   node scripts/migrate_sqlite.js -i <path_to_export.json> -d <path_to_db.sqlite>
 */

import fs from 'fs';
import path from 'path';
import { DatabaseSync } from 'node:sqlite';

const DATA_URI_REGEX = /data:image\/([a-zA-Z0-9.+_-]+);base64,([A-Za-z0-9+/=\r\n]+)/i;
const IMG_TAG_REGEX = /<img[^>]+src=["'](data:image\/([a-zA-Z0-9.+_-]+);base64,([^"']+))["'][^>]*>/i;

function toSqliteParam(v) {
  if (v === undefined || v === null) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (Buffer.isBuffer(v) || v instanceof Uint8Array) return v;
  if (typeof v === 'object') return JSON.stringify(v);
  return v;
}

function sanitizeName(name) {
  let s = String(name || '').trim().replace(/[^a-zA-Z0-9_]/g, '_');
  if (!s || /^[0-9]/.test(s)) {
    s = 'col_' + s;
  }
  return s;
}

function extractAndDecodeImage(val) {
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
    } catch (err) {
      console.warn('[Warning] Failed to decode <img> base64:', err.message);
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
    } catch (err) {
      console.warn('[Warning] Failed to decode data URI:', err.message);
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
    } catch (err) {
      console.warn('[Warning] Failed to decode raw base64 header:', err.message);
      return null;
    }
  }

  return null;
}

function initSchema(db) {
  db.exec(`
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
}

export function migrateJsonToSqlite(jsonFilePath, dbFilePath, options = {}) {
  const { batchSize = 500, createRelational = true } = options;

  if (!fs.existsSync(jsonFilePath)) {
    throw new Error(`Export JSON file not found: ${jsonFilePath}`);
  }

  console.log(`[*] Reading JSON: ${jsonFilePath}`);
  const raw = fs.readFileSync(jsonFilePath, 'utf-8');
  const data = JSON.parse(raw);

  console.log(`[*] Connecting SQLite database: ${dbFilePath}`);
  const db = new DatabaseSync(dbFilePath);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA synchronous = NORMAL;");

  initSchema(db);

  const stats = {
    meta: 0,
    tree_items: 0,
    tables: 0,
    columns: 0,
    rows: 0,
    images: 0,
    relational_rows: 0,
  };

  db.exec("BEGIN TRANSACTION;");
  try {
    // 1. Meta Upsert
    const upsertMeta = db.prepare(`
      INSERT INTO workspace_meta (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value;
    `);

    const version = String(data.version || '1.0.0');
    const exportedAt = String(data.exportedAt || Date.now());
    const author = String(data.author || '');

    upsertMeta.run('version', version);
    upsertMeta.run('exportedAt', exportedAt);
    upsertMeta.run('author', author);
    stats.meta += 3;

    if (data.settings) {
      upsertMeta.run('settings', JSON.stringify(data.settings));
      stats.meta += 1;
    }

    // 2. Tree Upsert
    if (Array.isArray(data.tree)) {
      const upsertTree = db.prepare(`
        INSERT INTO tree_items (id, parent_id, title, type, icon, color, is_expanded, created_at, updated_at, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          parent_id = excluded.parent_id,
          title = excluded.title,
          type = excluded.type,
          icon = excluded.icon,
          color = excluded.color,
          is_expanded = excluded.is_expanded,
          updated_at = excluded.updated_at,
          sort_order = excluded.sort_order;
      `);

      data.tree.forEach((item, idx) => {
        upsertTree.run(
          item.id,
          item.parentId || null,
          item.title || 'Untitled',
          item.type || 'folder',
          item.icon || null,
          item.color || null,
          item.isExpanded ? 1 : 0,
          item.createdAt || Date.now(),
          item.updatedAt || Date.now(),
          idx
        );
        stats.tree_items++;
      });
    }

    // 3. Tables & Rows & Images
    if (data.tables && typeof data.tables === 'object') {
      const upsertTable = db.prepare(`
        INSERT INTO tables (id, title, description, default_view, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          title = excluded.title,
          description = excluded.description,
          default_view = excluded.default_view,
          updated_at = excluded.updated_at;
      `);

      const upsertColumn = db.prepare(`
        INSERT INTO table_columns (id, table_id, name, type, width, is_primary_key, auto_update_date, options_json, format, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id, table_id) DO UPDATE SET
          name = excluded.name,
          type = excluded.type,
          width = excluded.width,
          is_primary_key = excluded.is_primary_key,
          auto_update_date = excluded.auto_update_date,
          options_json = excluded.options_json,
          format = excluded.format,
          sort_order = excluded.sort_order;
      `);

      const upsertRow = db.prepare(`
        INSERT INTO table_rows (id, table_id, data_json, rich_content, stickers_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          table_id = excluded.table_id,
          data_json = excluded.data_json,
          rich_content = excluded.rich_content,
          stickers_json = excluded.stickers_json,
          updated_at = excluded.updated_at;
      `);

      const upsertImage = db.prepare(`
        INSERT INTO row_images (id, table_id, row_id, column_key, mime_type, image_data, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          mime_type = excluded.mime_type,
          image_data = excluded.image_data,
          updated_at = excluded.updated_at;
      `);

      for (const [tableId, tbl] of Object.entries(data.tables)) {
        const tId = tbl.id || tableId;
        upsertTable.run(
          tId,
          tbl.title || 'Untitled Table',
          tbl.description || null,
          tbl.defaultView || 'grid',
          tbl.createdAt || Date.now(),
          tbl.updatedAt || Date.now()
        );
        stats.tables++;

        const columns = Array.isArray(tbl.columns) ? tbl.columns : [];
        columns.forEach((col, cIdx) => {
          upsertColumn.run(
            col.id,
            tId,
            col.name || col.id,
            col.type || 'text',
            col.width || 160,
            col.isPrimaryKey ? 1 : 0,
            col.autoUpdateDate ? 1 : 0,
            col.options ? JSON.stringify(col.options) : null,
            col.format || null,
            cIdx
          );
          stats.columns++;
        });

        const rows = Array.isArray(tbl.rows) ? tbl.rows : [];
        rows.forEach((row) => {
          if (!row || !row.id) return;
          const rawData = row.data && typeof row.data === 'object' ? row.data : {};
          const cleanedData = { ...rawData };
          const rCreated = row.createdAt || Date.now();
          const rUpdated = row.updatedAt || Date.now();

          // Check for images in row.data
          for (const [colKey, val] of Object.entries(rawData)) {
            const ext = extractAndDecodeImage(val);
            if (ext) {
              const imgId = `img_${tId}_${row.id}_${colKey}`;
              upsertImage.run(imgId, tId, row.id, colKey, ext.mime, ext.buffer, rCreated, rUpdated);
              stats.images++;
            }
          }

          // Check for images in richContent
          if (row.richContent && typeof row.richContent === 'string' && row.richContent.includes('<img')) {
            const matches = row.richContent.matchAll(/<img[^>]+src=["'](data:image\/([a-zA-Z0-9.+_-]+);base64,([^"']+))["'][^>]*>/gi);
            let richIdx = 0;
            for (const m of matches) {
              const mime = `image/${m[2]}`;
              try {
                const buffer = Buffer.from(m[3].replace(/\s+/g, ''), 'base64');
                const imgId = `img_${tId}_${row.id}_rich_${richIdx++}`;
                upsertImage.run(imgId, tId, row.id, 'richContent', mime, buffer, rCreated, rUpdated);
                stats.images++;
              } catch {}
            }
          }

          upsertRow.run(
            row.id,
            tId,
            JSON.stringify(cleanedData),
            row.richContent || null,
            row.stickers ? JSON.stringify(row.stickers) : null,
            rCreated,
            rUpdated
          );
          stats.rows++;
        });

        // Optional dynamic relational table
        if (createRelational && columns.length > 0) {
          const dynTblName = sanitizeName(tId);
          const colDefs = ['"id" TEXT PRIMARY KEY'];
          const colKeys = [];

          columns.forEach((col) => {
            const safe = sanitizeName(col.id);
            const isBlob = col.type === 'image' || col.type === 'photo';
            const sqlType = col.type === 'number' ? 'NUMERIC' : (isBlob ? 'BLOB' : 'TEXT');
            colDefs.push(`"${safe}" ${sqlType}`);
            colKeys.push({ id: col.id, safe, isBlob, type: col.type });
          });
          colDefs.push('"created_at" INTEGER NOT NULL', '"updated_at" INTEGER NOT NULL');

          db.exec(`CREATE TABLE IF NOT EXISTS "${dynTblName}" (${colDefs.join(', ')});`);

          // Schema evolution check
          const existingPragma = db.prepare(`PRAGMA table_info("${dynTblName}");`).all();
          const existingCols = new Set(existingPragma.map(p => p.name));
          colKeys.forEach((k) => {
            if (!existingCols.has(k.safe)) {
              const sqlType = k.type === 'number' ? 'NUMERIC' : (k.isBlob ? 'BLOB' : 'TEXT');
              db.exec(`ALTER TABLE "${dynTblName}" ADD COLUMN "${k.safe}" ${sqlType};`);
              existingCols.add(k.safe);
            }
          });

          const dynCols = ['id', ...colKeys.map(k => `"${k.safe}"`), 'created_at', 'updated_at'];
          const placeholders = dynCols.map(() => '?').join(', ');
          const updateSets = [...colKeys.map(k => `"${k.safe}" = excluded."${k.safe}"`), 'updated_at = excluded.updated_at'].join(', ');

          const upsertDyn = db.prepare(`
            INSERT INTO "${dynTblName}" (${dynCols.join(', ')})
            VALUES (${placeholders})
            ON CONFLICT(id) DO UPDATE SET ${updateSets};
          `);

          rows.forEach((row) => {
            if (!row || !row.id) return;
            const rData = row.data || {};
            const vals = [row.id];

            colKeys.forEach((k) => {
              const val = rData[k.id];
              if (k.isBlob || (typeof val === 'string' && (val.includes('base64,') || val.includes('<img')))) {
                const ext = extractAndDecodeImage(val);
                vals.push(ext ? ext.buffer : (val !== undefined ? val : null));
              } else {
                vals.push(val !== undefined ? val : null);
              }
            });
            vals.push(row.createdAt || Date.now(), row.updatedAt || Date.now());

            const safeVals = vals.map(toSqliteParam);
            upsertDyn.run(...safeVals);
            stats.relational_rows++;
          });
        }
      }
    }

    db.exec("COMMIT;");
    console.log("[✓] Node.js SQLite Migration Completed Successfully!");

    // Also sync user_data.json so server and local modes are completely aligned
    try {
      const userDataPath = path.resolve(path.dirname(dbPath), 'user_data.json');
      fs.writeFileSync(userDataPath, JSON.stringify(data, null, 2), 'utf-8');
      console.log(`[✓] Synced workspace data to: ${userDataPath}`);
    } catch (uErr) {
      // Non-critical
    }
  } catch (err) {
    db.exec("ROLLBACK;");
    console.error("[!] Migration Failed with Error:", err);
    throw err;
  }

  return stats;
}

// CLI Execution
if (process.argv[1] && process.argv[1].endsWith('migrate_sqlite.js')) {
  const args = process.argv.slice(2);
  let inputPath = 'public/wonbee_data.json';
  let dbPath = 'wonbee.sqlite';

  for (let i = 0; i < args.length; i++) {
    if ((args[i] === '-i' || args[i] === '--input') && args[i + 1]) {
      inputPath = args[++i];
    } else if ((args[i] === '-d' || args[i] === '--db') && args[i + 1]) {
      dbPath = args[++i];
    }
  }

  console.log("=================================================================");
  console.log("  WonBee SQLite Migration Script (Node.js)");
  console.log("=================================================================");
  const start = Date.now();
  try {
    const stats = migrateJsonToSqlite(inputPath, dbPath);
    const elapsed = ((Date.now() - start) / 1000).toFixed(3);
    console.log("-----------------------------------------------------------------");
    console.log(`  • Workspace Meta Records : ${stats.meta}`);
    console.log(`  • Tree Items Upserted    : ${stats.tree_items}`);
    console.log(`  • Tables Upserted        : ${stats.tables}`);
    console.log(`  • Columns Upserted       : ${stats.columns}`);
    console.log(`  • Rows Upserted          : ${stats.rows}`);
    console.log(`  • Binary Images Saved    : ${stats.images} (to BLOB)`);
    console.log(`  • Relational Rows        : ${stats.relational_rows}`);
    console.log(`  • Time Elapsed           : ${elapsed}s`);
    console.log("=================================================================");
  } catch (err) {
    console.error("Migration Aborted:", err.message);
    process.exit(1);
  }
}
