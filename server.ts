import 'dotenv/config';
import express from 'express';
import path from 'path';
import os from 'os';
import { convertLegacyPpt } from './server/pptConversion';
import { itemExchangeRoutes } from './server/itemExchangeRoutes';
import { handleSafeProxy } from './server/safeProxy';
import { SERVER_CONFIG } from './server/constants';
import { API_PATHS } from './src/constants/api';
import { addUser, adminHistory, adminUsers, authEnabled, authMe, bootstrapMaster, logout, oidcLogin, passwordLogin, requireAuth, requireMaster, updateUser } from './server/auth';
import { createServer as createViteServer } from 'vite';
import { createServer as createHttpServer } from 'node:http';
import { attachChatSocket } from './server/chatSocket';
import { createChatConversation, getChatAttachment, initChatStorage, listChatConversations, listChatMessages, listChatUsers, saveChatAttachment } from './server/chat';
import {
  initDatabase,
  getWorkspaceDataForUser,
  saveWorkspaceDataForUser,
  saveTreeForUser,
  saveDocument,
  deleteDocument,
  getTableForUser,
  saveTableForUser,
  canAccessTable,
  canWriteTable,
  canManageTable,
  getNoteTableId,
  listUserGroups,
  createUserGroup,
  replaceUserGroupMembers,
  deleteUserGroup,
  getTablePermissions,
  setTablePermissions,
  deleteTable,
  renameTable,
  cleanDatabaseConsistency,
  getLastUpdatedTimestamp,
  getTableCount,
  getTreeCount,
  getCalendarEventsForUser,
  getCalendarEventTableId,
  saveCalendarEvent,
  deleteCalendarEvent,
  insertDocumentChunk,
  searchDocumentChunks,
  getRowImage,
  getRowImageForUser,
  saveImageAsset,
  reloadDatabaseFromDisk,
  getWorkspaceMeta,
  getNotesCursor,
  getNotesSync,
  pushSyncNotes,
  saveDocumentHistorySnapshot,
  listDocumentHistory,
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
  initChatStorage();
  if (process.env.AUTH_REQUIRED === 'true' && !authEnabled()) throw new Error('AUTH_REQUIRED=true 설정 시 마스터 계정(AUTH_MASTER_EMAIL, AUTH_MASTER_PASSWORD) 또는 OIDC 설정이 필요합니다.');
  bootstrapMaster();

  const app = express();
  const PORT = SERVER_CONFIG.port;
  let chatIo: ReturnType<typeof attachChatSocket> | null = null;

  app.use('/api/proxy', express.json({ limit: '1mb' }), express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(express.json({ limit: SERVER_CONFIG.jsonBodyLimit }));
  app.use(express.urlencoded({ extended: true, limit: SERVER_CONFIG.jsonBodyLimit }));

  // CORS Middleware for Multi-PC / Cross-Origin Client Connections
  app.use((req, res, next) => {
    const origin = req.get('origin');
    const allowedOrigins = (process.env.AUTH_ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean);
    if (authEnabled() && origin && allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Vary', 'Origin');
    } else if (!authEnabled() && origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Vary', 'Origin');
    } else if (!origin) {
      res.setHeader('Access-Control-Allow-Origin', '*');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  // Prevent browser caching on all API responses for instant multi-PC sync (excluding SSE stream)
  app.use('/api', (req, res, next) => {
    if (req.path === '/sync/events') {
      next();
      return;
    }
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
  });

  app.post(API_PATHS.auth.login, oidcLogin);
  app.post(API_PATHS.auth.passwordLogin, passwordLogin);
  app.post(API_PATHS.auth.logout, logout);
  app.get(API_PATHS.auth.me, (req, res) => {
    if (!authEnabled()) { res.json({ enabled: false, user: null }); return; }
    requireAuth(req, res, () => authMe(req, res));
  });
  app.use('/api', requireAuth);
  app.get(API_PATHS.admin.users, requireMaster, adminUsers);
  app.post(API_PATHS.admin.users, requireMaster, addUser);
  app.patch(API_PATHS.admin.userByIdPattern, requireMaster, updateUser);
  app.get(API_PATHS.admin.loginHistory, requireMaster, adminHistory);

  app.get(API_PATHS.groups, (req, res) => {
    if (!req.authUser) { res.status(401).json({ error: '그룹 기능은 서버 로그인 후 사용할 수 있습니다.' }); return; }
    res.json(listUserGroups(req.authUser.id, req.authUser.role));
  });
  app.post(API_PATHS.groups, (req, res) => {
    try {
      if (!req.authUser) { res.status(401).json({ error: '그룹 기능은 서버 로그인 후 사용할 수 있습니다.' }); return; }
      const group = createUserGroup(req.authUser.id, String(req.body?.name || ''));
      broadcastWorkspaceUpdate({ type: 'groups_updated', lastUpdated: getLastUpdatedTimestamp() });
      res.status(201).json(group);
    } catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : '그룹 생성 실패' }); }
  });
  app.put(API_PATHS.groupMembersPattern, (req, res) => {
    try {
      if (!req.authUser) { res.status(401).json({ error: '로그인이 필요합니다.' }); return; }
      const members = Array.isArray(req.body?.memberIds) ? req.body.memberIds.map(String) : [];
      const group = replaceUserGroupMembers(req.params.id, req.authUser.id, members, req.authUser.role);
      broadcastWorkspaceUpdate({ type: 'groups_updated', lastUpdated: getLastUpdatedTimestamp() });
      res.json(group);
    } catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : '그룹 구성원 변경 실패' }); }
  });
  app.delete(API_PATHS.groupByIdPattern, (req, res) => {
    try {
      if (!req.authUser) { res.status(401).json({ error: '로그인이 필요합니다.' }); return; }
      deleteUserGroup(req.params.id, req.authUser.id, req.authUser.role);
      broadcastWorkspaceUpdate({ type: 'groups_updated', lastUpdated: getLastUpdatedTimestamp() });
      res.json({ success: true });
    } catch (error) { res.status(403).json({ error: error instanceof Error ? error.message : '그룹 삭제 실패' }); }
  });

  app.get(API_PATHS.chat.users, (req, res) => {
    if (!req.authUser) { res.status(401).json({ error: '채팅은 로그인 후 이용할 수 있습니다.' }); return; }
    res.json(listChatUsers().filter(user => user.id !== req.authUser!.id));
  });
  app.get('/api/chat/documents', (req, res) => {
    if (!req.authUser) { res.status(401).json({ error: '채팅은 로그인 후 이용할 수 있습니다.' }); return; }
    const workspace = getWorkspaceDataForUser(req.authUser.id, req.authUser.role);
    res.json(Object.values(workspace.documents || {}).map(document => ({ id: document.id, title: document.title })));
  });
  app.get(API_PATHS.chat.conversations, (req, res) => {
    if (!req.authUser) { res.status(401).json({ error: '채팅은 로그인 후 이용할 수 있습니다.' }); return; }
    res.json(listChatConversations(req.authUser.id));
  });
  app.post(API_PATHS.chat.conversations, (req, res) => {
    try {
      if (!req.authUser) { res.status(401).json({ error: '채팅은 로그인 후 이용할 수 있습니다.' }); return; }
      const type = req.body?.type === 'group' ? 'group' : 'direct';
      const memberIds = Array.isArray(req.body?.memberIds) ? req.body.memberIds.map(String) : [];
      const conversation = createChatConversation(req.authUser.id, type, String(req.body?.title || ''), memberIds);
      conversation.members.forEach(member => chatIo?.to(`user:${member.id}`).emit('chat:conversation-created', conversation));
      res.status(201).json(conversation);
    } catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : '대화방을 만들지 못했습니다.' }); }
  });
  app.get(API_PATHS.chat.messagesPattern, (req, res) => {
    try {
      if (!req.authUser) { res.status(401).json({ error: '로그인이 필요합니다.' }); return; }
      const limit = Number(req.query.limit || 100);
      res.json(listChatMessages(req.params.id, req.authUser.id, limit));
    } catch (error) { res.status(403).json({ error: error instanceof Error ? error.message : '메시지를 불러오지 못했습니다.' }); }
  });
  app.post(API_PATHS.chat.attachments, express.raw({ type: 'application/octet-stream', limit: '20mb' }), (req, res) => {
    try {
      if (!req.authUser) { res.status(401).json({ error: '로그인이 필요합니다.' }); return; }
      const conversationId = String(req.query.conversationId || '');
      const filename = String(req.query.filename || 'attachment');
      const mimeType = String(req.query.mimeType || 'application/octet-stream');
      if (!Buffer.isBuffer(req.body)) { res.status(400).json({ error: '첨부 파일 데이터가 비어 있습니다.' }); return; }
      res.status(201).json(saveChatAttachment(conversationId, req.authUser.id, filename, mimeType, req.body));
    } catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : '첨부 파일을 저장하지 못했습니다.' }); }
  });
  app.get(API_PATHS.chat.attachmentPattern, (req, res) => {
    if (!req.authUser) { res.status(401).json({ error: '로그인이 필요합니다.' }); return; }
    const attachment = getChatAttachment(req.params.id, req.authUser.id);
    if (!attachment) { res.status(404).json({ error: '파일을 찾을 수 없습니다.' }); return; }
    res.setHeader('Content-Type', attachment.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(attachment.filename)}`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(Buffer.from(attachment.content));
  });

  // API Routes
  app.get('/favicon.ico', (req, res) => res.status(204).end());

  app.get(API_PATHS.health, (req, res) => {
    res.json({ status: 'ok', database: 'sqlite3', timestamp: Date.now() });
  });

  app.post(API_PATHS.convertPpt, express.raw({ type: 'application/octet-stream', limit: '50mb' }), async (req, res) => {
    // Conversion launches local Office automation; permit only requests from this app.
    const origin = req.get('origin');
    if (origin && origin !== `http://${req.get('host')}` && origin !== `https://${req.get('host')}` && origin !== 'tauri://localhost' && origin !== 'http://tauri.localhost') {
      res.status(403).json({ error: '앱에서 선택한 파일만 변환할 수 있습니다.' }); return;
    }
    try {
      const converted = await convertLegacyPpt(req.body);
      res.type('application/vnd.openxmlformats-officedocument.presentationml.presentation').send(converted);
    } catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : 'PPT 변환 실패' }); }
  });

  // --- Real-time SSE (Server-Sent Events) Stream for Multi-User & Instant Sync ---
  const sseClients = new Map<express.Response, { userId?: string; role?: string }>();

  function broadcastWorkspaceUpdate(payload: { type: string; lastUpdated: number; tableId?: string }) {
    const message = `data: ${JSON.stringify(payload)}\n\n`;
    for (const [client, viewer] of sseClients) {
      if (payload.tableId && !canAccessTable(payload.tableId, viewer.userId, viewer.role)) continue;
      try {
        client.write(message);
      } catch {
        sseClients.delete(client);
      }
    }
  }

  app.use(API_PATHS.exchangeItems, itemExchangeRoutes(id => broadcastWorkspaceUpdate({ type: 'item_imported', lastUpdated: getLastUpdatedTimestamp(), tableId: id })));

  app.get(API_PATHS.syncEvents, (req, res) => {
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    if (typeof res.flushHeaders === 'function') {
      res.flushHeaders();
    }

    const lastUpdated = getLastUpdatedTimestamp();
    res.write(`data: ${JSON.stringify({ type: 'connected', lastUpdated })}\n\n`);

    sseClients.set(res, { userId: req.authUser?.id, role: req.authUser?.role });

    // Heartbeat every 15 seconds to keep connection alive
    const heartbeat = setInterval(() => {
      try {
        res.write(': heartbeat\n\n');
      } catch {
        clearInterval(heartbeat);
        sseClients.delete(res);
      }
    }, 15000);

    req.on('close', () => {
      clearInterval(heartbeat);
      sseClients.delete(res);
      try {
        res.end();
      } catch (_) {}
    });
  });

  // --- Multi-PC Version & Change Tracking Endpoint with HTTP ETag / 304 Not Modified Support ---
  app.get(API_PATHS.workspaceVersion, (req, res) => {
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
  app.get(API_PATHS.workspaceMeta, (req, res) => {
    try {
      const meta = getWorkspaceMeta(req.authUser?.id, req.authUser?.role);
      res.json(meta);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- 1.3. O(1) Cursor-based Pagination API for notes ---
  app.get(API_PATHS.notes, (req, res) => {
    try {
      const cursor = req.query.cursor as string | undefined;
      const limit = Math.min(Math.max(parseInt((req.query.limit as string) || '50', 10), 1), 200);
      const tableId = req.query.tableId as string | undefined;
      if (tableId && !canAccessTable(tableId, req.authUser?.id, req.authUser?.role)) { res.status(404).json({ error: 'Note not found' }); return; }
      const result = getNotesCursor(cursor, limit, tableId, req.authUser?.id, req.authUser?.role);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- 1.4. Delta (Changed) Synchronization API for notes ---
  app.get(API_PATHS.notesSync, (req, res) => {
    try {
      const since = parseInt((req.query.since as string) || '0', 10);
      const limit = Math.min(Math.max(parseInt((req.query.limit as string) || '1000', 10), 1), 5000);
      const cursor = req.query.cursor as string | undefined;
      const result = getNotesSync(since, limit, req.authUser?.id, req.authUser?.role, cursor);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- 1.5. Push Synchronization API: UPSERT dirty notes from local IndexedDB into SQLite ---
  app.post(API_PATHS.notesPushSync, (req, res) => {
    try {
      const notes = Array.isArray(req.body) ? req.body : (req.body?.notes || req.body?.data || []);
      const allowedNotes = (Array.isArray(notes) ? notes : []).filter((note: any) => {
        const incomingTableId = note?.table_id ? String(note.table_id) : null;
        const existingTableId = note?.id ? getNoteTableId(String(note.id)) : null;
        return (!incomingTableId || canWriteTable(incomingTableId, req.authUser?.id, req.authUser?.role)) &&
          (!existingTableId || canWriteTable(existingTableId, req.authUser?.id, req.authUser?.role));
      });
      const result = pushSyncNotes(allowedNotes);
      broadcastWorkspaceUpdate({ type: 'push_synced', lastUpdated: result.last_updated_at });
      res.json(result);
    } catch (err: any) {
      console.error('[API] /api/notes/push-sync error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // --- Clean Database Consistency (Drop orphan & unused physical tables) ---
  app.post(API_PATHS.workspaceClean, (req, res) => {
    try {
      if (authEnabled() && req.authUser?.role !== 'master') { res.status(403).json({ error: '관리자 권한이 필요합니다.' }); return; }
      const keep = req.body?.keepTableIds;
      const result = cleanDatabaseConsistency(keep);
      broadcastWorkspaceUpdate({ type: 'workspace_cleaned', lastUpdated: getLastUpdatedTimestamp() });
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- Workspace Endpoints ---
  app.get(API_PATHS.workspace, (req, res) => {
    try {
      const data = getWorkspaceDataForUser(req.authUser?.id, req.authUser?.role);
      res.json(data);
    } catch (err: any) {
      console.error('[API] Failed to get workspace:', err);
      res.status(500).json({ error: err.message });
    }
  });

  app.put(API_PATHS.workspace, (req, res) => {
    try {
      saveWorkspaceDataForUser(req.body, req.authUser?.id, req.authUser?.role);
      broadcastWorkspaceUpdate({ type: 'workspace_updated', lastUpdated: getLastUpdatedTimestamp() });
      res.json({ success: true, message: 'Workspace saved to SQLite DB' });
    } catch (err: any) {
      console.error('[API] Failed to save workspace:', err);
      res.status(500).json({ error: err.message });
    }
  });

  app.put(API_PATHS.documentByIdPattern, (req, res) => {
    try {
      const document = { ...req.body, id: req.params.id };
      saveDocument(document);
      broadcastWorkspaceUpdate({ type: 'document_updated', lastUpdated: getLastUpdatedTimestamp() });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete(API_PATHS.documentByIdPattern, (req, res) => {
    try {
      deleteDocument(req.params.id);
      broadcastWorkspaceUpdate({ type: 'document_deleted', lastUpdated: getLastUpdatedTimestamp() });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get(API_PATHS.history, (req, res) => {
    try {
      if (authEnabled() && !req.authUser) { res.status(401).json({ error: '로그인이 필요합니다.' }); return; }
      const itemKey = String(req.query.itemKey || '');
      const tableId = String(req.query.tableId || '');
      if (!itemKey) { res.status(400).json({ error: '이력 대상이 필요합니다.' }); return; }
      const keyTableId = itemKey.startsWith('table:') ? itemKey.split(':')[1] : '';
      if (keyTableId && (!tableId || tableId !== keyTableId)) { res.status(400).json({ error: '테이블 이력 대상이 올바르지 않습니다.' }); return; }
      if (tableId && !itemKey.startsWith(`table:${tableId}:`)) { res.status(400).json({ error: '테이블 이력 대상이 올바르지 않습니다.' }); return; }
      if (tableId && !canAccessTable(tableId, req.authUser?.id, req.authUser?.role)) { res.status(404).json({ error: '이력을 찾을 수 없습니다.' }); return; }
      res.json({ entries: listDocumentHistory(itemKey, String(req.query.q || ''), Number(req.query.limit) || 100) });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post(API_PATHS.history, (req, res) => {
    try {
      if (authEnabled() && !req.authUser) { res.status(401).json({ error: '로그인이 필요합니다.' }); return; }
      const itemKey = String(req.body?.itemKey || '');
      const tableId = req.body?.tableId ? String(req.body.tableId) : undefined;
      const title = String(req.body?.title || '문서');
      const content = typeof req.body?.content === 'string' ? req.body.content : '';
      if (!itemKey || !content) { res.status(400).json({ error: '이력 대상과 내용이 필요합니다.' }); return; }
      if (content.length > 15 * 1024 * 1024) { res.status(413).json({ error: '이력 한 버전은 15MB 이하여야 합니다.' }); return; }
      const keyTableId = itemKey.startsWith('table:') ? itemKey.split(':')[1] : '';
      if (keyTableId && keyTableId !== tableId) { res.status(400).json({ error: '테이블 이력 대상이 올바르지 않습니다.' }); return; }
      if (tableId && !itemKey.startsWith(`table:${tableId}:`)) { res.status(400).json({ error: '테이블 이력 대상이 올바르지 않습니다.' }); return; }
      if (tableId && !canWriteTable(tableId, req.authUser?.id, req.authUser?.role)) { res.status(403).json({ error: '테이블 쓰기 권한이 없습니다.' }); return; }
      const entry = saveDocumentHistorySnapshot({ itemKey, tableId, title, content, author: req.authUser?.display_name || req.authUser?.email || '사용자' });
      res.status(201).json(entry);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post(API_PATHS.databaseReload, (req, res) => {
    try {
      if (authEnabled() && req.authUser?.role !== 'master') { res.status(403).json({ error: '관리자 권한이 필요합니다.' }); return; }
      const ws = reloadDatabaseFromDisk();
      broadcastWorkspaceUpdate({ type: 'database_reloaded', lastUpdated: getLastUpdatedTimestamp() });
      res.json({ success: true, message: 'Database reloaded successfully', tablesCount: Object.keys(ws.tables).length });
    } catch (err: any) {
      console.error('[API] Failed to reload database:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // --- Workspace Tree Endpoint ---
  app.put(API_PATHS.tree, (req, res) => {
    try {
      const tree = req.body;
      if (!Array.isArray(tree)) {
        res.status(400).json({ error: 'tree must be an array' });
        return;
      }
      saveTreeForUser(tree, req.authUser?.id, req.authUser?.role);
      broadcastWorkspaceUpdate({ type: 'tree_updated', lastUpdated: getLastUpdatedTimestamp() });
      res.json({ success: true, count: tree.length });
    } catch (err: any) {
      console.error('[API] Failed to save tree:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // --- CORS Proxy Endpoint (public-address pinned, no credential forwarding) ---
  app.all(API_PATHS.proxy, handleSafeProxy);

  // --- Tables Endpoints ---
  app.get(API_PATHS.tablePermissionsPattern, (req, res) => {
    try {
      res.json({ ...getTablePermissions(req.params.id, req.authUser?.id, req.authUser?.role), groupOptions: listUserGroups(req.authUser!.id, req.authUser?.role) });
    } catch (error) { res.status(403).json({ error: error instanceof Error ? error.message : '권한 설정 조회 실패' }); }
  });
  app.put(API_PATHS.tablePermissionsPattern, (req, res) => {
    try {
      if (!req.authUser) { res.status(401).json({ error: '로그인이 필요합니다.' }); return; }
      setTablePermissions(req.params.id, req.authUser.id, req.authUser.role, String(req.body?.visibility || ''), Array.isArray(req.body?.groups) ? req.body.groups : []);
      broadcastWorkspaceUpdate({ type: 'table_permissions_updated', lastUpdated: getLastUpdatedTimestamp(), tableId: req.params.id });
      res.json({ success: true });
    } catch (error) { res.status(403).json({ error: error instanceof Error ? error.message : '권한 설정 저장 실패' }); }
  });
  app.get(API_PATHS.tableByIdPattern, (req, res) => {
    try {
      const table = getTableForUser(req.params.id, req.authUser?.id, req.authUser?.role);
      if (!table) {
        res.status(404).json({ error: 'Table not found' });
        return;
      }
      res.json(table);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put(API_PATHS.tableByIdPattern, (req, res) => {
    try {
      saveTableForUser({ ...req.body, id: req.params.id }, req.authUser?.id, req.authUser?.role);
      broadcastWorkspaceUpdate({ type: 'table_updated', lastUpdated: getLastUpdatedTimestamp(), tableId: req.params.id });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put(API_PATHS.tableRenamePattern, (req, res) => {
    try {
      if (!canWriteTable(req.params.id, req.authUser?.id, req.authUser?.role)) { res.status(403).json({ error: '보드 쓰기 권한이 없습니다.' }); return; }
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

  app.delete(API_PATHS.tableByIdPattern, (req, res) => {
    try {
      if (!canManageTable(req.params.id, req.authUser?.id, req.authUser?.role)) { res.status(403).json({ error: '보드 소유자만 삭제할 수 있습니다.' }); return; }
      deleteTable(req.params.id);
      broadcastWorkspaceUpdate({ type: 'table_deleted', lastUpdated: getLastUpdatedTimestamp(), tableId: req.params.id });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- Binary Image BLOB Endpoint ---
  app.post(API_PATHS.assets, express.raw({ type: ['application/octet-stream', 'image/*'], limit: SERVER_CONFIG.jsonBodyLimit }), (req, res) => {
    try {
      const filename = String(req.query.filename || req.body?.filename || '');
      const requestedAssetId = String(req.query.assetId || req.body?.assetId || '');
      const imageId = (requestedAssetId || filename.replace(/\.[^.]+$/, '')).replace(/[^a-zA-Z0-9_-]/g, '');
      const dataUrl = typeof req.body?.blobBase64 === 'string' ? req.body.blobBase64 : '';
      const match = dataUrl.match(/^data:([^;,]+);base64,([\s\S]+)$/);
      const isBinaryBody = Buffer.isBuffer(req.body) && req.body.length > 0;
      if (!imageId || (!isBinaryBody && !match)) {
        res.status(400).json({ error: 'A valid asset ID and image data are required.' });
        return;
      }
      const mimeType = isBinaryBody
        ? String(req.get('content-type') || 'application/octet-stream').split(';')[0]
        : match![1] || String(req.body?.mimeType || 'application/octet-stream');
      const bytes = isBinaryBody ? req.body as Buffer : Buffer.from(match![2], 'base64');
      if (authEnabled() && getRowImage(imageId) && !getRowImageForUser(imageId, req.authUser?.id, req.authUser?.role)) { res.status(403).json({ error: '다른 사용자의 이미지 에셋입니다.' }); return; }
      saveImageAsset(imageId, mimeType, bytes, req.authUser?.id);
      broadcastWorkspaceUpdate({ type: 'asset_saved', lastUpdated: getLastUpdatedTimestamp() });
      res.json({ url: `asset://${imageId}` });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get(`${API_PATHS.assets}/:id`, (req, res) => {
    try {
      const img = authEnabled()
        ? getRowImageForUser(req.params.id, req.authUser?.id, req.authUser?.role)
        : getRowImage(req.params.id);
      if (!img) {
        res.status(404).json({ error: 'Image asset not found' });
        return;
      }
      res.setHeader('Content-Type', img.mimeType || 'application/octet-stream');
      res.setHeader('Cache-Control', 'private, no-store');
      res.send(Buffer.from(img.data));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get(`${API_PATHS.images}/:id`, (req, res) => {
    try {
      const img = authEnabled()
        ? getRowImageForUser(req.params.id, req.authUser?.id, req.authUser?.role)
        : getRowImage(req.params.id);
      if (!img) {
        res.status(404).json({ error: 'Image not found' });
        return;
      }
      res.setHeader('Content-Type', img.mimeType || 'image/png');
      res.setHeader('Cache-Control', 'private, no-store');
      res.send(Buffer.from(img.data));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- Calendar Events Endpoints ---
  app.get(API_PATHS.events, (req, res) => {
    try {
      const tableId = req.query.tableId as string | undefined;
      if (tableId && !canAccessTable(tableId, req.authUser?.id, req.authUser?.role)) { res.status(404).json({ error: 'Calendar not found' }); return; }
      const events = getCalendarEventsForUser(tableId, req.authUser?.id, req.authUser?.role);
      res.json(events);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post(API_PATHS.events, (req, res) => {
    try {
      const { event, tableId } = req.body;
      if (!event || !tableId) {
        res.status(400).json({ error: 'event and tableId are required' });
        return;
      }
      if (!canWriteTable(String(tableId), req.authUser?.id, req.authUser?.role)) { res.status(403).json({ error: '캘린더 쓰기 권한이 없습니다.' }); return; }
      saveCalendarEvent(event, tableId);
      broadcastWorkspaceUpdate({ type: 'events_updated', lastUpdated: getLastUpdatedTimestamp() });
      res.json({ success: true, event });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete(`${API_PATHS.events}/:id`, (req, res) => {
    try {
      const eventId = req.params.id;
      const tableId = getCalendarEventTableId(eventId);
      if (!tableId || !canWriteTable(tableId, req.authUser?.id, req.authUser?.role)) { res.status(403).json({ error: '캘린더 쓰기 권한이 없습니다.' }); return; }
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
  app.get(API_PATHS.ollama.status, async (req, res) => {
    const hostQuery = req.query.host as string | undefined;
    const status = await checkOllamaStatus(hostQuery);
    res.json(status);
  });

  app.post(API_PATHS.ollama.config, async (req, res) => {
    const { host, model } = req.body || {};
    const updated = setOllamaConfig(host, model);
    const status = await checkOllamaStatus(updated.host);
    res.json({ config: updated, status });
  });

  app.get(API_PATHS.ollama.config, (req, res) => {
    res.json(getOllamaConfig());
  });

  app.post(API_PATHS.ollama.generate, async (req, res) => {
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

  // --- Network Info Endpoint ---
  function getLocalNetworkIps(): string[] {
    const interfaces = os.networkInterfaces();
    const ips: string[] = [];
    for (const name of Object.keys(interfaces)) {
      const netInterface = interfaces[name];
      if (netInterface) {
        for (const net of netInterface) {
          if (net.family === 'IPv4' && !net.internal) {
            ips.push(net.address);
          }
        }
      }
    }
    return ips;
  }

  app.get(API_PATHS.networkInfo, (req, res) => {
    try {
      const ips = getLocalNetworkIps();
      res.json({ ips, port: PORT });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- RAG & Research Agent Endpoints ---
  app.post(API_PATHS.rag.index, (req, res) => {
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

  app.post(API_PATHS.rag.search, (req, res) => {
    try {
      const { query, limit } = req.body;
      const results = searchDocumentChunks(query || '', limit || 5);
      res.json({ results });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- Action Agent Tool Execution Endpoint ---
  app.post(API_PATHS.actionExecute, async (req, res) => {
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
      configLoader: 'runner',
      server: {
        middlewareMode: true,
        host: '0.0.0.0',
        allowedHosts: true,
      },
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

  const httpServer = createHttpServer(app);
  chatIo = attachChatSocket(httpServer);
  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`[WonBee Backend] Server running on http://localhost:${PORT}`);
  });
}

startServer();
