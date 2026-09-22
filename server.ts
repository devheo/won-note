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
  getCalendarEvents,
  saveCalendarEvent,
  deleteCalendarEvent,
  insertDocumentChunk,
  searchDocumentChunks,
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

  // API Routes
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', database: 'sqlite3', timestamp: Date.now() });
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
      res.json({ success: true, message: 'Workspace saved to SQLite DB' });
    } catch (err: any) {
      console.error('[API] Failed to save workspace:', err);
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
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/tables/:id', (req, res) => {
    try {
      deleteTable(req.params.id);
      res.json({ success: true });
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
