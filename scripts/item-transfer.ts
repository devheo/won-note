#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import initSqlJs from 'sql.js';
import { packItem, unpackItem } from '../src/utils/itemExchange';
import type { WorkspaceData } from '../src/types';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    server: { type: 'string' },
    workspace: { type: 'string' },
    db: { type: 'string' },
    id: { type: 'string' },
    out: { type: 'string' },
    parent: { type: 'string' },
    force: { type: 'boolean' },
    help: { type: 'boolean' },
  },
});
const [command, input] = positionals;
if (values.help || !command) {
  console.log(`WonNote single-item exchange

npm run item:transfer -- list --server http://localhost:3000
npm run item:transfer -- export --server http://localhost:3000 --id ITEM_ID --out share.wonnote
npm run item:transfer -- list --workspace user_data.json
npm run item:transfer -- export --workspace user_data.json --db wonbee.sqlite --id ITEM_ID --out share.wonnote
npm run item:transfer -- inspect share.wonnote
npm run item:transfer -- import share.wonnote --server http://localhost:3000 [--parent FOLDER_ID]

Export reads one item only. Import always creates a new received copy with new IDs.
Existing files are protected; use --force to replace the export output file.
For authenticated reverse proxies, set WONNOTE_TOKEN in the environment.
The recipient server must include the item-exchange API. No direct SQLite write is performed by this CLI.`);
  process.exit(0);
}
function apiBase() {
  const url = new URL(values.server || 'http://localhost:3000');
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('서버 주소는 HTTP 또는 HTTPS여야 합니다.');
  return url.href.replace(/\/+$/, '').replace(/\/api$/, '') + '/api/exchange/items';
}
async function request(url: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (process.env.WONNOTE_TOKEN) headers.set('Authorization', `Bearer ${process.env.WONNOTE_TOKEN}`);
  const response = await fetch(url, { ...init, headers, signal: AbortSignal.timeout(120000) });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || `서버 오류 HTTP ${response.status}`);
  }
  return response;
}
async function main() {
  if (command === 'inspect') {
    if (!input) throw new Error('확인할 .wonnote 파일을 지정해주세요.');
    const shared = await unpackItem(await fs.readFile(input));
    console.log(
      JSON.stringify(
        {
          kind: shared.kind,
          title: shared.item.title,
          sourceId: shared.item.id,
          assetCount: shared.assets.length,
          rowCount: shared.kind === 'table' ? (shared.item as any).rows.length : undefined,
          calendarEvents: shared.events.length,
        },
        null,
        2,
      ),
    );
    return;
  }
  if (command === 'import') {
    if (!input) throw new Error('가져올 .wonnote 파일을 지정해주세요.');
    const bytes = await fs.readFile(input);
    await unpackItem(bytes);
    const url = apiBase() + (values.parent ? `?parent=${encodeURIComponent(values.parent)}` : '');
    console.log(
      JSON.stringify(
        await (
          await request(url, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: bytes })
        ).json(),
        null,
        2,
      ),
    );
    return;
  }
  if (!['list', 'export'].includes(command)) throw new Error('list, export, inspect, import 중 하나를 지정해주세요.');
  let bytes: Uint8Array;
  if (values.workspace) {
    const workspace: WorkspaceData = JSON.parse(await fs.readFile(values.workspace, 'utf8'));
    if (command === 'list') {
      console.log(
        JSON.stringify(
          workspace.tree
            .filter((item) => item.type !== 'folder')
            .map((item) => ({ id: item.id, title: item.title, kind: item.type })),
          null,
          2,
        ),
      );
      return;
    }
    if (!values.id) throw new Error('--id를 지정해주세요.');
    const tree = workspace.tree.find((item) => item.id === values.id);
    const item = workspace.documents?.[values.id] || workspace.tables[values.id];
    if (!tree || !item || tree.type === 'folder') throw new Error('선택한 노트 또는 테이블이 없습니다.');
    const SQL = values.db ? await initSqlJs() : undefined;
    const db = values.db && SQL ? new SQL.Database(await fs.readFile(values.db)) : undefined;
    try {
      let events: any[] = [],
        layouts = {};
      if (db && tree.type === 'table') {
        const result = db.exec('SELECT * FROM calendar_events WHERE table_id=?', [item.id]);
        if (result[0])
          events = result[0].values.map((values) => {
            const row = Object.fromEntries(result[0].columns.map((name, index) => [name, values[index]]));
            return {
              id: String(row.id),
              tableRowId: row.table_row_id ? String(row.table_row_id) : undefined,
              title: String(row.title),
              startDate: String(row.start_date),
              endDate: String(row.end_date),
              startTime: row.start_time || undefined,
              endTime: row.end_time || undefined,
              isAllDay: Boolean(row.is_all_day),
              category: row.category || 'work',
              color: row.color || undefined,
              location: row.location || undefined,
              description: row.description || undefined,
              priority: row.priority || undefined,
              completed: Boolean(row.completed),
              reminder: row.reminder_json ? JSON.parse(String(row.reminder_json)) : undefined,
              createdAt: Number(row.created_at),
              updatedAt: Number(row.updated_at),
            };
          });
        const meta = db.exec("SELECT value FROM workspace_meta WHERE key='exchange_layouts'");
        if (meta[0]?.values[0]?.[0]) layouts = JSON.parse(String(meta[0].values[0][0]))[item.id] || {};
      }
      bytes = await packItem({ kind: tree.type, item, tree, events, layouts }, async (ref) => {
        if (ref.startsWith('data:')) {
          const match = ref.match(/^data:([^;]+);base64,(.+)$/)!;
          return { mime: match[1], bytes: Buffer.from(match[2], 'base64') };
        }
        if (!db) throw new Error('분리된 이미지를 포함하려면 --db wonbee.sqlite를 지정하거나 앱에서 내보내세요.');
        const rows = db.exec('SELECT mime_type, image_data FROM row_images WHERE id=?', [ref.split('/').pop()!]);
        if (!rows[0]?.values.length) throw new Error('첨부 이미지가 DB에 없습니다. 앱에서 내보내기를 사용해주세요.');
        return { mime: String(rows[0].values[0][0]), bytes: rows[0].values[0][1] as Uint8Array };
      });
    } finally {
      db?.close();
    }
  } else {
    if (command === 'list') {
      console.log(JSON.stringify(await (await request(apiBase())).json(), null, 2));
      return;
    }
    if (!values.id) throw new Error('--id를 지정해주세요.');
    bytes = new Uint8Array(await (await request(`${apiBase()}/${encodeURIComponent(values.id)}`)).arrayBuffer());
  }
  if (!values.out) throw new Error('--out 파일 경로를 지정해주세요.');
  await fs.mkdir(path.dirname(path.resolve(values.out)), { recursive: true });
  await fs.writeFile(values.out, bytes, { flag: values.force ? 'w' : 'wx' });
  console.log(`내보냈습니다: ${path.resolve(values.out)} (${bytes.length} bytes)`);
}
main().catch((error) => {
  console.error((error as Error).message);
  process.exitCode = 1;
});
