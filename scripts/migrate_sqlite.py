#!/usr/bin/env python3
"""
WonBee SQLite Migration Script (Python 3)
=========================================
Exports JSON data from WonBee's "데이터 파일 관리 & 포터블 병합"
and migrates/upserts all records into SQLite database.

Features:
- Detects base64 images in fields (e.g. "image", or containing data:image/... or <img> tags).
- Strips 'base64,' headers and decodes cleanly to byte[] (binary BLOB).
- Performs Upsert (INSERT ... ON CONFLICT DO UPDATE) based on Primary Keys.
- Uses Parameterized Queries (PreparedStatement) and batch transactions for high performance.
- Full exception handling and rollback on failure.
"""

import sys
import os
import re
import json
import base64
import sqlite3
import argparse
import time
from typing import Tuple, Optional, Dict, Any, List

# Regex to match data:image/...;base64,...
DATA_URI_PATTERN = re.compile(r'data:image/([a-zA-Z0-9.+_-]+);base64,([A-Za-z0-9+/=\r\n]+)', re.IGNORECASE)
# Regex to match <img> tag with src="data:image..."
IMG_TAG_PATTERN = re.compile(r'<img[^>]+src=["\'](data:image/([a-zA-Z0-9.+_-]+);base64,([^"\']+))["\'][^>]*>', re.IGNORECASE)


def sanitize_column_name(name: str) -> str:
    """Sanitize column name for dynamic SQL tables."""
    sanitized = re.sub(r'[^a-zA-Z0-9_]', '_', name.strip())
    if not sanitized or sanitized[0].isdigit():
        sanitized = f"col_{sanitized}"
    return sanitized


def sanitize_table_name(name: str) -> str:
    """Sanitize table name for dynamic SQL tables."""
    sanitized = re.sub(r'[^a-zA-Z0-9_]', '_', name.strip())
    if not sanitized or sanitized[0].isdigit():
        sanitized = f"tbl_{sanitized}"
    return sanitized


def extract_and_decode_image(val: Any) -> Optional[Tuple[str, bytes]]:
    """
    Examines value for base64 image or <img> tag.
    Returns: (mime_type, binary_bytes) or None
    """
    if not isinstance(val, str) or len(val) < 10:
        return None

    str_val = val.strip()

    # Case 1: <img> tag containing base64
    img_match = IMG_TAG_PATTERN.search(str_val)
    if img_match:
        subtype = img_match.group(2)
        raw_b64 = img_match.group(3)
        mime_type = f"image/{subtype}"
        try:
            # Clean possible URL encoding and whitespace
            clean_b64 = re.sub(r'\s+', '', raw_b64)
            binary_data = base64.b64decode(clean_b64)
            return mime_type, binary_data
        except Exception as e:
            print(f"[Warning] Failed to decode <img> base64: {e}", file=sys.stderr)
            return None

    # Case 2: Direct data URI string (data:image/...;base64,...)
    uri_match = DATA_URI_PATTERN.search(str_val)
    if uri_match:
        subtype = uri_match.group(1)
        raw_b64 = uri_match.group(2)
        mime_type = f"image/{subtype}"
        try:
            clean_b64 = re.sub(r'\s+', '', raw_b64)
            binary_data = base64.b64decode(clean_b64)
            return mime_type, binary_data
        except Exception as e:
            print(f"[Warning] Failed to decode data URI base64: {e}", file=sys.stderr)
            return None

    # Case 3: Starts with or contains 'base64,'
    if 'base64,' in str_val:
        parts = str_val.split('base64,', 1)
        header = parts[0]
        raw_b64 = parts[1]
        mime_type = "image/png"
        if "data:image/" in header:
            mime_match = re.search(r'data:image/([a-zA-Z0-9.+_-]+)', header)
            if mime_match:
                mime_type = f"image/{mime_match.group(1)}"
        try:
            clean_b64 = re.sub(r'[\s"\'<>]+', '', raw_b64)
            binary_data = base64.b64decode(clean_b64)
            return mime_type, binary_data
        except Exception as e:
            print(f"[Warning] Failed to decode base64 header: {e}", file=sys.stderr)
            return None

    return None


def init_sqlite_schema(conn: sqlite3.Connection):
    """Ensure all required core tables and image BLOB table exist."""
    cur = conn.cursor()
    cur.executescript("""
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
    """)
    conn.commit()


def migrate_json_to_sqlite(
    json_path: str,
    db_path: str,
    batch_size: int = 500,
    create_relational_tables: bool = True,
    optimize_row_images: bool = False,
) -> Dict[str, int]:
    """
    Reads exported JSON and executes UPSERT into SQLite database with PreparedStatement.
    """
    if not os.path.exists(json_path):
        raise FileNotFoundError(f"Export JSON file not found: {json_path}")

    print(f"[*] Reading JSON data from: {json_path}")
    with open(json_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    print(f"[*] Connecting to SQLite database: {db_path}")
    conn = sqlite3.connect(db_path)
    # Enable WAL mode and memory cache for speed
    conn.execute("PRAGMA journal_mode = WAL;")
    conn.execute("PRAGMA synchronous = NORMAL;")
    conn.execute("PRAGMA foreign_keys = OFF;")

    init_sqlite_schema(conn)

    stats = {
        "meta": 0,
        "tree_items": 0,
        "tables": 0,
        "columns": 0,
        "rows": 0,
        "images_extracted": 0,
        "relational_rows": 0
    }

    try:
        conn.execute("BEGIN TRANSACTION;")
        cur = conn.cursor()

        # 1. Upsert Workspace Metadata
        print("[*] Upserting workspace metadata...")
        meta_items = [
            ("version", str(data.get("version", "1.0.0"))),
            ("exportedAt", str(data.get("exportedAt", int(time.time() * 1000)))),
            ("author", str(data.get("author", ""))),
        ]
        if "settings" in data:
            meta_items.append(("settings", json.dumps(data["settings"], ensure_ascii=False)))

        cur.executemany("""
            INSERT INTO workspace_meta (key, value)
            VALUES (?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value;
        """, meta_items)
        stats["meta"] += len(meta_items)

        # 2. Upsert Tree Items
        tree = data.get("tree", [])
        if isinstance(tree, list) and tree:
            print(f"[*] Upserting {len(tree)} tree items...")
            tree_params = []
            for idx, item in enumerate(tree):
                tree_params.append((
                    item.get("id"),
                    item.get("parentId"),
                    item.get("title", "Untitled"),
                    item.get("type", "folder"),
                    item.get("icon"),
                    item.get("color"),
                    1 if item.get("isExpanded") else 0,
                    int(item.get("createdAt") or time.time() * 1000),
                    int(item.get("updatedAt") or time.time() * 1000),
                    idx
                ))
            
            cur.executemany("""
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
            """, tree_params)
            stats["tree_items"] += len(tree_params)

        # 3. Upsert Tables, Columns, Rows, and Images
        tables_dict = data.get("tables", {})
        if isinstance(tables_dict, dict):
            print(f"[*] Processing {len(tables_dict)} tables...")
            
            for table_id, tbl in tables_dict.items():
                t_id = tbl.get("id", table_id)
                t_title = tbl.get("title", "Untitled Table")
                t_desc = tbl.get("description")
                t_view = tbl.get("defaultView", "grid")
                t_created = int(tbl.get("createdAt") or time.time() * 1000)
                t_updated = int(tbl.get("updatedAt") or time.time() * 1000)

                # Upsert table definition
                cur.execute("""
                    INSERT INTO tables (id, title, description, default_view, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET
                        title = excluded.title,
                        description = excluded.description,
                        default_view = excluded.default_view,
                        updated_at = excluded.updated_at;
                """, (t_id, t_title, t_desc, t_view, t_created, t_updated))
                stats["tables"] += 1

                # Upsert columns
                columns = tbl.get("columns", [])
                col_params = []
                col_type_map = {}
                col_pk = "id"

                for c_idx, col in enumerate(columns):
                    c_id = col.get("id")
                    c_name = col.get("name", c_id)
                    c_type = col.get("type", "text")
                    c_width = int(col.get("width") or 160)
                    is_pk = 1 if col.get("isPrimaryKey") else 0
                    if is_pk:
                        col_pk = c_id
                    auto_date = 1 if col.get("autoUpdateDate") else 0
                    opts_json = json.dumps(col.get("options"), ensure_ascii=False) if col.get("options") else None
                    fmt = col.get("format")

                    col_type_map[c_id] = c_type
                    col_params.append((
                        c_id, t_id, c_name, c_type, c_width, is_pk, auto_date, opts_json, fmt, c_idx
                    ))

                if col_params:
                    cur.executemany("""
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
                    """, col_params)
                    stats["columns"] += len(col_params)

                # Upsert rows & Extract images
                rows = tbl.get("rows", [])
                row_batch = []
                image_batch = []

                for row in rows:
                    r_id = row.get("id")
                    if not r_id:
                        continue
                    
                    raw_data = row.get("data", {})
                    if not isinstance(raw_data, dict):
                        raw_data = {}

                    rich_content = row.get("richContent")
                    stickers_json = json.dumps(row.get("stickers"), ensure_ascii=False) if row.get("stickers") else None
                    r_created = int(row.get("createdAt") or time.time() * 1000)
                    r_updated = int(row.get("updatedAt") or time.time() * 1000)

                    # Check all row fields for image data
                    cleaned_data = dict(raw_data)
                    for k, val in raw_data.items():
                        extracted = extract_and_decode_image(val)
                        if extracted:
                            mime_type, binary_bytes = extracted
                            img_pk = f"img_{t_id}_{r_id}_{k}"
                            image_batch.append((
                                img_pk, t_id, r_id, k, mime_type, binary_bytes, r_created, r_updated
                            ))
                            stats["images_extracted"] += 1
                            if optimize_row_images:
                                # Replace huge base64 with image reference
                                cleaned_data[k] = f"/api/images/{img_pk}"

                    # Also check richContent for <img> tags
                    if rich_content and isinstance(rich_content, str) and ("<img" in rich_content or "base64," in rich_content):
                        for m in IMG_TAG_PATTERN.finditer(rich_content):
                            subtype = m.group(2)
                            raw_b64 = m.group(3)
                            try:
                                binary_bytes = base64.b64decode(re.sub(r'\s+', '', raw_b64))
                                img_pk = f"img_{t_id}_{r_id}_rich_{stats['images_extracted']}"
                                image_batch.append((
                                    img_pk, t_id, r_id, "richContent", f"image/{subtype}", binary_bytes, r_created, r_updated
                                ))
                                stats["images_extracted"] += 1
                            except Exception as e:
                                print(f"[Warning] Could not decode richContent image in row {r_id}: {e}", file=sys.stderr)

                    row_batch.append((
                        r_id,
                        t_id,
                        json.dumps(cleaned_data, ensure_ascii=False),
                        rich_content,
                        stickers_json,
                        r_created,
                        r_updated
                    ))

                    # Execute in chunks for high performance
                    if len(row_batch) >= batch_size:
                        cur.executemany("""
                            INSERT INTO table_rows (id, table_id, data_json, rich_content, stickers_json, created_at, updated_at)
                            VALUES (?, ?, ?, ?, ?, ?, ?)
                            ON CONFLICT(id) DO UPDATE SET
                                table_id = excluded.table_id,
                                data_json = excluded.data_json,
                                rich_content = excluded.rich_content,
                                stickers_json = excluded.stickers_json,
                                updated_at = excluded.updated_at;
                        """, row_batch)
                        stats["rows"] += len(row_batch)
                        row_batch = []

                    if len(image_batch) >= batch_size:
                        cur.executemany("""
                            INSERT INTO row_images (id, table_id, row_id, column_key, mime_type, image_data, created_at, updated_at)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                            ON CONFLICT(id) DO UPDATE SET
                                mime_type = excluded.mime_type,
                                image_data = excluded.image_data,
                                updated_at = excluded.updated_at;
                        """, image_batch)
                        image_batch = []

                if row_batch:
                    cur.executemany("""
                        INSERT INTO table_rows (id, table_id, data_json, rich_content, stickers_json, created_at, updated_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT(id) DO UPDATE SET
                            table_id = excluded.table_id,
                            data_json = excluded.data_json,
                            rich_content = excluded.rich_content,
                            stickers_json = excluded.stickers_json,
                            updated_at = excluded.updated_at;
                    """, row_batch)
                    stats["rows"] += len(row_batch)

                if image_batch:
                    cur.executemany("""
                        INSERT INTO row_images (id, table_id, row_id, column_key, mime_type, image_data, created_at, updated_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT(id) DO UPDATE SET
                            mime_type = excluded.mime_type,
                            image_data = excluded.image_data,
                            updated_at = excluded.updated_at;
                    """, image_batch)

                # Optional: Also create dynamic relational table for raw SQL queries
                if create_relational_tables and columns:
                    dyn_table_name = sanitize_table_name(t_id)
                    col_defs = ["id TEXT PRIMARY KEY"]
                    col_keys = []

                    for col in columns:
                        c_id = col.get("id")
                        c_safe = sanitize_column_name(c_id)
                        c_type = col.get("type", "text")
                        sql_type = "TEXT"
                        if c_type == "number":
                            sql_type = "NUMERIC"
                        elif c_type in ("image", "photo"):
                            sql_type = "BLOB"
                        col_defs.append(f'"{c_safe}" {sql_type}')
                        col_keys.append((c_id, c_safe, c_type))

                    col_defs.append("created_at INTEGER NOT NULL")
                    col_defs.append("updated_at INTEGER NOT NULL")

                    create_sql = f'CREATE TABLE IF NOT EXISTS "{dyn_table_name}" ({", ".join(col_defs)});'
                    cur.execute(create_sql)

                    # Inspect existing columns in dynamic table to handle newly added columns
                    cur.execute(f'PRAGMA table_info("{dyn_table_name}");')
                    existing_dyn_cols = {row[1] for row in cur.fetchall()}
                    for col_id, c_safe, c_type in col_keys:
                        if c_safe not in existing_dyn_cols:
                            sql_type = "TEXT"
                            if c_type == "number":
                                sql_type = "NUMERIC"
                            elif c_type in ("image", "photo"):
                                sql_type = "BLOB"
                            cur.execute(f'ALTER TABLE "{dyn_table_name}" ADD COLUMN "{c_safe}" {sql_type};')
                            existing_dyn_cols.add(c_safe)

                    # Dynamic Upsert
                    insert_cols = ['id'] + [f'"{k[1]}"' for k in col_keys] + ['created_at', 'updated_at']
                    placeholders = ['?'] * len(insert_cols)
                    update_assignments = [f'"{k[1]}" = excluded."{k[1]}"' for k in col_keys] + ['updated_at = excluded.updated_at']

                    upsert_sql = f"""
                        INSERT INTO "{dyn_table_name}" ({", ".join(insert_cols)})
                        VALUES ({", ".join(placeholders)})
                        ON CONFLICT(id) DO UPDATE SET
                            {", ".join(update_assignments)};
                    """

                    dyn_params = []
                    for row in rows:
                        r_id = row.get("id")
                        if not r_id:
                            continue
                        r_data = row.get("data", {})
                        r_created = int(row.get("createdAt") or time.time() * 1000)
                        r_updated = int(row.get("updatedAt") or time.time() * 1000)

                        row_vals = [r_id]
                        for c_id, c_safe, c_type in col_keys:
                            val = r_data.get(c_id)
                            if c_type in ("image", "photo") or (isinstance(val, str) and ("base64," in val or "<img" in val)):
                                ext = extract_and_decode_image(val)
                                if ext:
                                    row_vals.append(ext[1])  # BLOB
                                else:
                                    row_vals.append(val)
                            else:
                                row_vals.append(val)
                        row_vals.extend([r_created, r_updated])
                        dyn_params.append(tuple(row_vals))

                    if dyn_params:
                        cur.executemany(upsert_sql, dyn_params)
                        stats["relational_rows"] += len(dyn_params)

        conn.commit()
        print("[✓] Migration Transaction Committed Successfully!")

    except Exception as e:
        conn.rollback()
        print(f"[!] Migration Error: {e}", file=sys.stderr)
        raise
    finally:
        conn.close()

    return stats


def main():
    parser = argparse.ArgumentParser(description="WonBee SQLite JSON Importer & Upsert Tool")
    parser.add_argument("-i", "--input", default="public/wonbee_data.json", help="Path to export JSON file")
    parser.add_argument("-d", "--db", default="wonbee.sqlite", help="Path to SQLite database file")
    parser.add_argument("-b", "--batch-size", type=int, default=500, help="Batch size for prepared statements")
    parser.add_argument("--no-relational", action="store_true", help="Disable creating dedicated relational tables")
    parser.add_argument("--optimize-images", action="store_true", help="Replace inline base64 with /api/images/:id URLs")

    args = parser.parse_args()

    print("=" * 65)
    print("  WonBee SQLite Database Migration & Base64 Decoder Tool")
    print("=" * 65)

    start_time = time.time()
    try:
        stats = migrate_json_to_sqlite(
            json_path=args.input,
            db_path=args.db,
            batch_size=args.batch_size,
            create_relational_tables=not args.no_relational,
            optimize_row_images=args.optimize_images
        )
        elapsed = time.time() - start_time
        print("-" * 65)
        print("Migration Summary:")
        print(f"  • Workspace Meta Records : {stats['meta']}")
        print(f"  • Tree Items Upserted    : {stats['tree_items']}")
        print(f"  • Tables Upserted        : {stats['tables']}")
        print(f"  • Columns Upserted       : {stats['columns']}")
        print(f"  • Rows Upserted          : {stats['rows']}")
        print(f"  • Binary Images Saved    : {stats['images_extracted']} (to BLOB)")
        print(f"  • Relational Rows        : {stats['relational_rows']}")
        print(f"  • Total Time Elapsed     : {elapsed:.3f}s")
        print("=" * 65)
    except Exception as e:
        print(f"Fatal error during migration: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
