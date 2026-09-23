/**
 * WonBee SQLite Migration Tool (Java 11+)
 * =======================================
 * Requirements:
 *   - SQLite JDBC Driver (org.xerial:sqlite-jdbc)
 *   - JSON library (e.g. org.json or Jackson / Gson)
 * 
 * Usage:
 *   javac -cp "sqlite-jdbc.jar:json.jar" MigrateSqlite.java
 *   java -cp ".:sqlite-jdbc.jar:json.jar" MigrateSqlite wonbee_data.json wonbee.sqlite
 */

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.sql.*;
import java.util.Base64;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.json.JSONArray;
import org.json.JSONObject;

public class MigrateSqlite {

    private static final Pattern DATA_URI_PATTERN = Pattern.compile(
        "data:image/([a-zA-Z0-9.+_-]+);base64,([A-Za-z0-9+/=\\r\\n]+)",
        Pattern.CASE_INSENSITIVE
    );

    private static final Pattern IMG_TAG_PATTERN = Pattern.compile(
        "<img[^>]+src=[\"'](data:image/([a-zA-Z0-9.+_-]+);base64,([^\"']+))[\"'][^>]*>",
        Pattern.CASE_INSENSITIVE
    );

    public static class DecodedImage {
        public final String mimeType;
        public final byte[] data;

        public DecodedImage(String mimeType, byte[] data) {
            this.mimeType = mimeType;
            this.data = data;
        }
    }

    /**
     * Extracts base64 header from <img> tag or data URI and decodes into byte[]
     */
    public static DecodedImage extractAndDecodeImage(Object value) {
        if (!(value instanceof String)) return null;
        String str = ((String) value).trim();
        if (str.length() < 10) return null;

        // 1. Check for <img> tag
        Matcher imgMatcher = IMG_TAG_PATTERN.matcher(str);
        if (imgMatcher.find()) {
            String mime = "image/" + imgMatcher.group(2);
            String rawB64 = imgMatcher.group(3).replaceAll("\\s+", "");
            try {
                byte[] bytes = Base64.getDecoder().decode(rawB64);
                return new DecodedImage(mime, bytes);
            } catch (Exception e) {
                System.err.println("[Warning] Failed to decode <img> base64: " + e.getMessage());
                return null;
            }
        }

        // 2. Check for data URI pattern
        Matcher uriMatcher = DATA_URI_PATTERN.matcher(str);
        if (uriMatcher.find()) {
            String mime = "image/" + uriMatcher.group(1);
            String rawB64 = uriMatcher.group(2).replaceAll("\\s+", "");
            try {
                byte[] bytes = Base64.getDecoder().decode(rawB64);
                return new DecodedImage(mime, bytes);
            } catch (Exception e) {
                System.err.println("[Warning] Failed to decode URI base64: " + e.getMessage());
                return null;
            }
        }

        // 3. Fallback check for 'base64,'
        if (str.contains("base64,")) {
            String[] parts = str.split("base64,", 2);
            String header = parts[0];
            String rawB64 = parts[1].replaceAll("[\\s\"'<>]+", "");
            String mime = "image/png";
            if (header.contains("data:image/")) {
                int start = header.indexOf("data:image/") + 11;
                int end = header.indexOf(";", start);
                if (end > start) mime = "image/" + header.substring(start, end);
            }
            try {
                byte[] bytes = Base64.getDecoder().decode(rawB64);
                return new DecodedImage(mime, bytes);
            } catch (Exception e) {
                System.err.println("[Warning] Failed to decode raw base64: " + e.getMessage());
                return null;
            }
        }

        return null;
    }

    private static void initSchema(Connection conn) throws SQLException {
        try (Statement stmt = conn.createStatement()) {
            stmt.executeUpdate(
                "CREATE TABLE IF NOT EXISTS workspace_meta (key TEXT PRIMARY KEY, value TEXT);"
            );
            stmt.executeUpdate(
                "CREATE TABLE IF NOT EXISTS tree_items (" +
                "id TEXT PRIMARY KEY, parent_id TEXT, title TEXT NOT NULL, type TEXT NOT NULL, " +
                "icon TEXT, color TEXT, is_expanded INTEGER DEFAULT 0, created_at INTEGER NOT NULL, " +
                "updated_at INTEGER NOT NULL, sort_order INTEGER DEFAULT 0);"
            );
            stmt.executeUpdate(
                "CREATE TABLE IF NOT EXISTS tables (" +
                "id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT, " +
                "default_view TEXT DEFAULT 'grid', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);"
            );
            stmt.executeUpdate(
                "CREATE TABLE IF NOT EXISTS table_columns (" +
                "id TEXT NOT NULL, table_id TEXT NOT NULL, name TEXT NOT NULL, type TEXT NOT NULL, " +
                "width INTEGER DEFAULT 160, is_primary_key INTEGER DEFAULT 0, auto_update_date INTEGER DEFAULT 0, " +
                "options_json TEXT, format TEXT, sort_order INTEGER DEFAULT 0, PRIMARY KEY (id, table_id));"
            );
            stmt.executeUpdate(
                "CREATE TABLE IF NOT EXISTS table_rows (" +
                "id TEXT PRIMARY KEY, table_id TEXT NOT NULL, data_json TEXT NOT NULL, " +
                "rich_content TEXT, stickers_json TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);"
            );
            stmt.executeUpdate(
                "CREATE TABLE IF NOT EXISTS row_images (" +
                "id TEXT PRIMARY KEY, table_id TEXT NOT NULL, row_id TEXT NOT NULL, column_key TEXT NOT NULL, " +
                "mime_type TEXT, image_data BLOB NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);"
            );
        }
    }

    public static void main(String[] args) {
        String jsonPath = args.length > 0 ? args[0] : "public/wonbee_data.json";
        String dbPath = args.length > 1 ? args[1] : "wonbee.sqlite";

        System.out.println("=================================================");
        System.out.println("  WonBee SQLite Migration (Java PreparedStatement)");
        System.out.println("=================================================");
        System.out.println("[*] JSON Source: " + jsonPath);
        System.out.println("[*] Target SQLite: " + dbPath);

        long startTime = System.currentTimeMillis();

        try {
            String content = new String(Files.readAllBytes(Paths.get(jsonPath)), StandardCharsets.UTF_8);
            JSONObject json = new JSONObject(content);

            String url = "jdbc:sqlite:" + dbPath;
            try (Connection conn = DriverManager.getConnection(url)) {
                conn.setAutoCommit(false);

                try (Statement stmt = conn.createStatement()) {
                    stmt.execute("PRAGMA journal_mode = WAL;");
                    stmt.execute("PRAGMA synchronous = NORMAL;");
                }

                initSchema(conn);

                // 1. Prepared Statement for Meta
                String metaSql = "INSERT INTO workspace_meta (key, value) VALUES (?, ?) " +
                                 "ON CONFLICT(key) DO UPDATE SET value = excluded.value;";
                try (PreparedStatement pstmt = conn.prepareStatement(metaSql)) {
                    pstmt.setString(1, "version");
                    pstmt.setString(2, json.optString("version", "1.0.0"));
                    pstmt.executeUpdate();

                    pstmt.setString(1, "exportedAt");
                    pstmt.setString(2, String.valueOf(json.optLong("exportedAt", System.currentTimeMillis())));
                    pstmt.executeUpdate();

                    pstmt.setString(1, "author");
                    pstmt.setString(2, json.optString("author", ""));
                    pstmt.executeUpdate();

                    if (json.has("settings")) {
                        pstmt.setString(1, "settings");
                        pstmt.setString(2, json.getJSONObject("settings").toString());
                        pstmt.executeUpdate();
                    }
                }

                // 2. Prepared Statement for Tree Items
                JSONArray tree = json.optJSONArray("tree");
                if (tree != null) {
                    String treeSql = "INSERT INTO tree_items (id, parent_id, title, type, icon, color, is_expanded, created_at, updated_at, sort_order) " +
                                     "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) " +
                                     "ON CONFLICT(id) DO UPDATE SET parent_id=excluded.parent_id, title=excluded.title, type=excluded.type, " +
                                     "icon=excluded.icon, color=excluded.color, is_expanded=excluded.is_expanded, updated_at=excluded.updated_at, sort_order=excluded.sort_order;";
                    try (PreparedStatement pstmt = conn.prepareStatement(treeSql)) {
                        for (int i = 0; i < tree.length(); i++) {
                            JSONObject item = tree.getJSONObject(i);
                            pstmt.setString(1, item.getString("id"));
                            pstmt.setString(2, item.isNull("parentId") ? null : item.optString("parentId"));
                            pstmt.setString(3, item.optString("title", "Untitled"));
                            pstmt.setString(4, item.optString("type", "folder"));
                            pstmt.setString(5, item.optString("icon", null));
                            pstmt.setString(6, item.optString("color", null));
                            pstmt.setInt(7, item.optBoolean("isExpanded", false) ? 1 : 0);
                            pstmt.setLong(8, item.optLong("createdAt", System.currentTimeMillis()));
                            pstmt.setLong(9, item.optLong("updatedAt", System.currentTimeMillis()));
                            pstmt.setInt(10, i);
                            pstmt.addBatch();
                        }
                        pstmt.executeBatch();
                    }
                }

                // 3. Prepared Statements for Tables, Columns, Rows, and Images
                JSONObject tables = json.optJSONObject("tables");
                if (tables != null) {
                    String tblSql = "INSERT INTO tables (id, title, description, default_view, created_at, updated_at) " +
                                   "VALUES (?, ?, ?, ?, ?, ?) " +
                                   "ON CONFLICT(id) DO UPDATE SET title=excluded.title, description=excluded.description, " +
                                   "default_view=excluded.default_view, updated_at=excluded.updated_at;";

                    String colSql = "INSERT INTO table_columns (id, table_id, name, type, width, is_primary_key, auto_update_date, options_json, format, sort_order) " +
                                   "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) " +
                                   "ON CONFLICT(id, table_id) DO UPDATE SET name=excluded.name, type=excluded.type, width=excluded.width, " +
                                   "is_primary_key=excluded.is_primary_key, auto_update_date=excluded.auto_update_date, " +
                                   "options_json=excluded.options_json, format=excluded.format, sort_order=excluded.sort_order;";

                    String rowSql = "INSERT INTO table_rows (id, table_id, data_json, rich_content, stickers_json, created_at, updated_at) " +
                                   "VALUES (?, ?, ?, ?, ?, ?, ?) " +
                                   "ON CONFLICT(id) DO UPDATE SET table_id=excluded.table_id, data_json=excluded.data_json, " +
                                   "rich_content=excluded.rich_content, stickers_json=excluded.stickers_json, updated_at=excluded.updated_at;";

                    String imgSql = "INSERT INTO row_images (id, table_id, row_id, column_key, mime_type, image_data, created_at, updated_at) " +
                                   "VALUES (?, ?, ?, ?, ?, ?, ?, ?) " +
                                   "ON CONFLICT(id) DO UPDATE SET mime_type=excluded.mime_type, image_data=excluded.image_data, updated_at=excluded.updated_at;";

                    try (PreparedStatement pstmtTable = conn.prepareStatement(tblSql);
                         PreparedStatement pstmtCol = conn.prepareStatement(colSql);
                         PreparedStatement pstmtRow = conn.prepareStatement(rowSql);
                         PreparedStatement pstmtImg = conn.prepareStatement(imgSql)) {

                        int imgCounter = 0;

                        for (String key : tables.keySet()) {
                            JSONObject tbl = tables.getJSONObject(key);
                            String tId = tbl.optString("id", key);

                            pstmtTable.setString(1, tId);
                            pstmtTable.setString(2, tbl.optString("title", "Untitled Table"));
                            pstmtTable.setString(3, tbl.optString("description", null));
                            pstmtTable.setString(4, tbl.optString("defaultView", "grid"));
                            pstmtTable.setLong(5, tbl.optLong("createdAt", System.currentTimeMillis()));
                            pstmtTable.setLong(6, tbl.optLong("updatedAt", System.currentTimeMillis()));
                            pstmtTable.addBatch();

                            JSONArray columns = tbl.optJSONArray("columns");
                            if (columns != null) {
                                for (int c = 0; c < columns.length(); c++) {
                                    JSONObject col = columns.getJSONObject(c);
                                    pstmtCol.setString(1, col.getString("id"));
                                    pstmtCol.setString(2, tId);
                                    pstmtCol.setString(3, col.optString("name", col.getString("id")));
                                    pstmtCol.setString(4, col.optString("type", "text"));
                                    pstmtCol.setInt(5, col.optInt("width", 160));
                                    pstmtCol.setInt(6, col.optBoolean("isPrimaryKey", false) ? 1 : 0);
                                    pstmtCol.setInt(7, col.optBoolean("autoUpdateDate", false) ? 1 : 0);
                                    pstmtCol.setString(8, col.has("options") ? col.getJSONArray("options").toString() : null);
                                    pstmtCol.setString(9, col.optString("format", null));
                                    pstmtCol.setInt(10, c);
                                    pstmtCol.addBatch();
                                }
                            }

                            JSONArray rows = tbl.optJSONArray("rows");
                            if (rows != null) {
                                for (int r = 0; r < rows.length(); r++) {
                                    JSONObject row = rows.getJSONObject(r);
                                    String rId = row.getString("id");
                                    JSONObject rData = row.optJSONObject("data");
                                    if (rData == null) rData = new JSONObject();

                                    long rCreated = row.optLong("createdAt", System.currentTimeMillis());
                                    long rUpdated = row.optLong("updatedAt", System.currentTimeMillis());

                                    // Check fields for base64 images
                                    for (String fieldKey : rData.keySet()) {
                                        Object fVal = rData.get(fieldKey);
                                        DecodedImage decoded = extractAndDecodeImage(fVal);
                                        if (decoded != null) {
                                            String imgId = "img_" + tId + "_" + rId + "_" + fieldKey;
                                            pstmtImg.setString(1, imgId);
                                            pstmtImg.setString(2, tId);
                                            pstmtImg.setString(3, rId);
                                            pstmtImg.setString(4, fieldKey);
                                            pstmtImg.setString(5, decoded.mimeType);
                                            pstmtImg.setBytes(6, decoded.data); // Binary BLOB
                                            pstmtImg.setLong(7, rCreated);
                                            pstmtImg.setLong(8, rUpdated);
                                            pstmtImg.addBatch();
                                            imgCounter++;
                                        }
                                    }

                                    pstmtRow.setString(1, rId);
                                    pstmtRow.setString(2, tId);
                                    pstmtRow.setString(3, rData.toString());
                                    pstmtRow.setString(4, row.optString("richContent", null));
                                    pstmtRow.setString(5, row.has("stickers") ? row.getJSONArray("stickers").toString() : null);
                                    pstmtRow.setLong(6, rCreated);
                                    pstmtRow.setLong(7, rUpdated);
                                    pstmtRow.addBatch();
                                }
                            }
                        }

                        pstmtTable.executeBatch();
                        pstmtCol.executeBatch();
                        pstmtRow.executeBatch();
                        pstmtImg.executeBatch();
                        System.out.println("[*] Processed " + imgCounter + " binary image BLOBs.");
                    }
                }

                conn.commit();
                long elapsed = System.currentTimeMillis() - startTime;
                System.out.println("[✓] Java SQLite Migration successfully completed in " + elapsed + "ms!");
            }
        } catch (Exception e) {
            System.err.println("[!] Fatal Migration Exception: " + e.getMessage());
            e.printStackTrace();
            System.exit(1);
        }
    }
}
