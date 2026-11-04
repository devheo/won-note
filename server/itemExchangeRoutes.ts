import express from 'express';
import { getWorkspaceData, getTable, getCalendarEvents, getRowImage, importSharedItem, getSharedLayouts, saveWorkspaceData, saveImageAsset, saveCalendarEvent, saveSharedLayouts } from './db';
import { packItem, unpackItem, materializeItem, unpackFolder } from '../src/utils/itemExchange';

export function itemExchangeRoutes(onImport: (id: string) => void) {
  const router = express.Router();
  router.get('/', (_req, res) => {
    const ws = getWorkspaceData();
    res.json(
      ws.tree
        .filter((item) => item.type === 'document' || item.type === 'table')
        .map((item) => ({ id: item.id, title: item.title, kind: item.type })),
    );
  });
  router.get('/:id', async (req, res) => {
    try {
      const ws = getWorkspaceData(),
        tree = ws.tree.find((item) => item.id === req.params.id);
      const item = ws.documents?.[req.params.id] || getTable(req.params.id);
      if (!tree || !item || tree.type === 'folder') {
        res.status(404).json({ error: '전달할 노트 또는 테이블이 없습니다.' });
        return;
      }
      const bytes = await packItem(
        {
          kind: tree.type,
          item,
          tree: { icon: tree.icon, color: tree.color },
          events: tree.type === 'table' ? getCalendarEvents(item.id) : [],
          layouts: tree.type === 'table' ? getSharedLayouts(item.id) : {},
        },
        async (ref) => {
          if (ref.startsWith('data:')) {
            const match = ref.match(/^data:([^;]+);base64,(.+)$/)!;
            return { mime: match[1], bytes: Buffer.from(match[2], 'base64') };
          }
          const asset = getRowImage(ref.split('/').pop()!);
          if (!asset) throw new Error('필요한 이미지가 서버 DB에 없습니다.');
          return { mime: asset.mimeType, bytes: asset.data };
        },
      );
      res.setHeader('Content-Disposition', `attachment; filename="${item.id}.wonnote"`);
      res.type('application/octet-stream').send(Buffer.from(bytes));
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });
  router.post('/', express.raw({ type: 'application/octet-stream', limit: '250mb' }), async (req, res) => {
    try {
      if (!Buffer.isBuffer(req.body)) throw new Error('교환 파일을 바이너리로 보내주세요.');
      const shared = await unpackItem(req.body);
      const parent = typeof req.query.parent === 'string' && req.query.parent ? req.query.parent : null;
      const received = materializeItem(shared, parent);
      importSharedItem(received);
      onImport(received.item.id);
      res
        .status(201)
        .json({
          id: received.item.id,
          title: received.item.title,
          kind: received.kind,
          assetCount: received.assets.length,
          rowCount: received.kind === 'table' ? (received.item as any).rows.length : undefined,
          layouts: received.layouts,
          events: received.events,
        });
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });
  router.post('/folders', express.raw({ type: 'application/octet-stream', limit: '250mb' }), async (req, res) => {
    try {
      if (!Buffer.isBuffer(req.body)) throw new Error('폴더 교환 파일을 바이너리로 보내주세요.');
      const folder = await unpackFolder(new Uint8Array(req.body));
      const current = getWorkspaceData();
      const existingIds = new Set(current.tree.map((item) => item.id));
      if (folder.tree.some((item) => existingIds.has(item.id))) throw new Error('가져올 폴더 항목 ID가 기존 항목과 충돌합니다. 다시 내보낸 파일을 사용해주세요.');
      if (folder.root.parentId && !current.tree.some((item) => item.id === folder.root.parentId && item.type === 'folder'))
        throw new Error('가져올 대상 폴더가 존재하지 않습니다.');
      for (const asset of folder.assets) saveImageAsset(asset.id, asset.mime, asset.bytes);
      saveWorkspaceData({
        ...current,
        tree: [...current.tree, ...folder.tree],
        documents: { ...(current.documents || {}), ...folder.documents },
        tables: { ...current.tables, ...folder.tables },
        exportedAt: Date.now(),
      });
      for (const [tableId, events] of Object.entries(folder.events)) for (const event of events) saveCalendarEvent(event, tableId, false);
      for (const [tableId, layouts] of Object.entries(folder.layouts)) saveSharedLayouts(tableId, layouts);
      onImport(folder.root.id);
      res.status(201).json({ id: folder.root.id, count: folder.tree.length, assets: folder.assets.length });
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });
  return router;
}
