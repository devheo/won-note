import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import {
  initDatabase,
  getWorkspaceData,
  saveWorkspaceData,
  saveTree,
  getTable,
  saveTable,
  deleteTable,
  renameTable,
  cleanDatabaseConsistency,
  getLastUpdatedTimestamp,
  getTableCount,
  getTreeCount,
  getCalendarEvents,
  saveCalendarEvent,
  deleteCalendarEvent,
  insertDocumentChunk,
  searchDocumentChunks,
  getRowImage,
  reloadDatabaseFromDisk,
  getWorkspaceMeta,
  getNotesCursor,
  getNotesSync,
} from './server/db';
import {
  checkOllamaStatus,
  generateOllamaResponse,
  executeTool,
  getOllamaConfig,
  setOllamaConfig,
} from './server/ollama';

async function startServer() {
  // 1. Initialize SQLite WebAssembly Database & Auto-Migration
  await initDatabase();

  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // Prevent browser caching on all API responses for instant multi-PC sync
  app.use('/api', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
  });

  // API Routes
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', database: 'sqlite3', timestamp: Date.now() });
  });

  // --- Real-time SSE (Server-Sent Events) Stream for Multi-User & Instant Sync ---
  const sseClients = new Set<express.Response>();

  function broadcastWorkspaceUpdate(payload: { type: string; lastUpdated: number; tableId?: string }) {
    const message = `data: ${JSON.stringify(payload)}\n\n`;
    for (const client of sseClients) {
      try {
        client.write(message);
      } catch {
        sseClients.delete(client);
      }
    }
  }

  app.get('/api/sync/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const lastUpdated = getLastUpdatedTimestamp();
    res.write(`data: ${JSON.stringify({ type: 'connected', lastUpdated })}\n\n`);

    sseClients.add(res);

    // Heartbeat every 20 seconds to prevent TCP timeouts
    const heartbeat = setInterval(() => {
      try {
        res.write(': heartbeat\n\n');
      } catch {
        clearInterval(heartbeat);
        sseClients.delete(res);
      }
    }, 20000);

    req.on('close', () => {
      clearInterval(heartbeat);
      sseClients.delete(res);
    });
  });

  // --- Multi-PC Version & Change Tracking Endpoint with HTTP ETag / 304 Not Modified Support ---
  app.get('/api/workspace/version', (req, res) => {
    try {
      const lastUpdated = getLastUpdatedTimestamp();
      const tableCount = getTableCount();
      const treeCount = getTreeCount();
      const etag = `W/"${lastUpdated}-${tableCount}-${treeCount}"`;

      // 1.5. If client provided matching ETag, return 304 Not Modified immediately (0 bytes payload)
      if (req.headers['if-none-match'] === etag) {
        res.status(304).end();
        return;
      }

      res.setHeader('ETag', etag);
      res.json({
        lastUpdated,
        tableCount,
        treeCount,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- 1.2. Workspace Metadata API (Replaces 100MB+ full payload dumps) ---
  app.get('/api/workspace/meta', (req, res) => {
    try {
      const meta = getWorkspaceMeta();
      res.json(meta);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- 1.3. O(1) Cursor-based Pagination API for notes ---
  app.get('/api/notes', (req, res) => {
    try {
      const cursor = req.query.cursor as string | undefined;
      const limit = Math.min(Math.max(parseInt((req.query.limit as string) || '50', 10), 1), 200);
      const tableId = req.query.tableId as string | undefined;
      const result = getNotesCursor(cursor, limit, tableId);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- 1.4. Delta (Changed) Synchronization API for notes ---
  app.get('/api/notes/sync', (req, res) => {
    try {
      const since = parseInt((req.query.since as string) || '0', 10);
      const limit = Math.min(Math.max(parseInt((req.query.limit as string) || '1000', 10), 1), 5000);
      const result = getNotesSync(since, limit);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- Clean Database Consistency (Drop orphan & unused physical tables) ---
  app.post('/api/workspace/clean', (req, res) => {
    try {
      const keep = req.body?.keepTableIds;
      const result = cleanDatabaseConsistency(keep);
      broadcastWorkspaceUpdate({ type: 'workspace_cleaned', lastUpdated: getLastUpdatedTimestamp() });
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- Workspace Endpoints ---
  app.get('/api/workspace', (req, res) => {
    try {
      const data = getWorkspaceData();
      res.json(data);
    } catch (err: any) {
      console.error('[API] Failed to get workspace:', err);
      res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/workspace', (req, res) => {
    try {
      saveWorkspaceData(req.body);
      broadcastWorkspaceUpdate({ type: 'workspace_updated', lastUpdated: getLastUpdatedTimestamp() });
      res.json({ success: true, message: 'Workspace saved to SQLite DB' });
    } catch (err: any) {
      console.error('[API] Failed to save workspace:', err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/database/reload', (req, res) => {
    try {
      const ws = reloadDatabaseFromDisk();
      broadcastWorkspaceUpdate({ type: 'database_reloaded', lastUpdated: getLastUpdatedTimestamp() });
      res.json({ success: true, message: 'Database reloaded successfully', tablesCount: Object.keys(ws.tables).length });
    } catch (err: any) {
      console.error('[API] Failed to reload database:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // --- Workspace Tree Endpoint ---
  app.put('/api/tree', (req, res) => {
    try {
      const tree = req.body;
      if (!Array.isArray(tree)) {
        res.status(400).json({ error: 'tree must be an array' });
        return;
      }
      saveTree(tree);
      broadcastWorkspaceUpdate({ type: 'tree_updated', lastUpdated: getLastUpdatedTimestamp() });
      res.json({ success: true, count: tree.length });
    } catch (err: any) {
      console.error('[API] Failed to save tree:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // --- Tables Endpoints ---
  app.get('/api/tables/:id', (req, res) => {
    try {
      const table = getTable(req.params.id);
      if (!table) {
        res.status(404).json({ error: 'Table not found' });
        return;
      }
      res.json(table);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/tables/:id', (req, res) => {
    try {
      saveTable(req.body);
      broadcastWorkspaceUpdate({ type: 'table_updated', lastUpdated: getLastUpdatedTimestamp(), tableId: req.params.id });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/tables/:id/rename', (req, res) => {
    try {
      const { title } = req.body;
      if (!title || typeof title !== 'string') {
        res.status(400).json({ error: 'title is required' });
        return;
      }
      renameTable(req.params.id, title.trim());
      broadcastWorkspaceUpdate({ type: 'table_renamed', lastUpdated: getLastUpdatedTimestamp(), tableId: req.params.id });
      res.json({ success: true, title: title.trim() });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/tables/:id', (req, res) => {
    try {
      deleteTable(req.params.id);
      broadcastWorkspaceUpdate({ type: 'table_deleted', lastUpdated: getLastUpdatedTimestamp(), tableId: req.params.id });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- Binary Image BLOB Endpoint ---
  app.get('/api/images/:id', (req, res) => {
    try {
      const img = getRowImage(req.params.id);
      if (!img) {
        res.status(404).json({ error: 'Image not found' });
        return;
      }
      res.setHeader('Content-Type', img.mimeType || 'image/png');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.send(Buffer.from(img.data));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- Calendar Events Endpoints ---
  app.get('/api/events', (req, res) => {
    try {
      const tableId = req.query.tableId as string | undefined;
      const events = getCalendarEvents(tableId);
      res.json(events);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/events', (req, res) => {
    try {
      const { event, tableId } = req.body;
      if (!event || !tableId) {
        res.status(400).json({ error: 'event and tableId are required' });
        return;
      }
      saveCalendarEvent(event, tableId);
      broadcastWorkspaceUpdate({ type: 'events_updated', lastUpdated: getLastUpdatedTimestamp() });
      res.json({ success: true, event });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/events/:id', (req, res) => {
    try {
      const eventId = req.params.id;
      console.log(`[API] Deleting calendar event with ID: ${eventId}`);
      deleteCalendarEvent(eventId);
      broadcastWorkspaceUpdate({ type: 'events_updated', lastUpdated: getLastUpdatedTimestamp() });
      res.json({ success: true, deletedId: eventId });
    } catch (err: any) {
      console.error('[API] Delete event error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // --- Ollama & AI Endpoints ---
  app.get('/api/ollama/status', async (req, res) => {
    const hostQuery = req.query.host as string | undefined;
    const status = await checkOllamaStatus(hostQuery);
    res.json(status);
  });

  app.post('/api/ollama/config', async (req, res) => {
    const { host, model } = req.body || {};
    const updated = setOllamaConfig(host, model);
    const status = await checkOllamaStatus(updated.host);
    res.json({ config: updated, status });
  });

  app.get('/api/ollama/config', (req, res) => {
    res.json(getOllamaConfig());
  });

  app.post('/api/ollama/generate', async (req, res) => {
    try {
      const { prompt, systemPrompt, model, format, temperature } = req.body;
      const response = await generateOllamaResponse({
        prompt,
        systemPrompt,
        model,
        format,
        temperature,
      });
      res.json({ response });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- RAG & Research Agent Endpoints ---
  app.post('/api/rag/index', (req, res) => {
    try {
      const { chunks } = req.body; // Array of { id, docId, title, content }
      if (!Array.isArray(chunks)) {
        res.status(400).json({ error: 'chunks must be an array' });
        return;
      }
      chunks.forEach((c) => insertDocumentChunk(c));
      res.json({ success: true, indexedCount: chunks.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/rag/search', (req, res) => {
    try {
      const { query, limit } = req.body;
      const results = searchDocumentChunks(query || '', limit || 5);
      res.json({ results });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- Action Agent Tool Execution Endpoint ---
  app.post('/api/action/execute', async (req, res) => {
    try {
      const { tool, arguments: args } = req.body;
      const result = await executeTool(tool, args);
      res.json({ success: true, result });
    } catch (err: any) {
      console.error('[Action Agent] Execution failed:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[WonBee Backend] Server running on http://localhost:${PORT}`);
  });
}

startServer();
