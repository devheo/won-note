import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import express from 'express';
import JSZip from 'jszip';
import initSqlJs from 'sql.js';
import { packItem, unpackItem, materializeItem } from '../src/utils/itemExchange';

test('individual exchange preserves existing DB data, includes images and creates fresh IDs', async () => {
  const root = process.cwd();
  await fs.mkdir(path.join(root, '.local'), { recursive: true });
  const temporary = await fs.mkdtemp(path.join(root, '.local/item-exchange-test-'));
  process.chdir(temporary);
  const db = await import('../server/db');
  const { itemExchangeRoutes } = await import('../server/itemExchangeRoutes');
  await db.initDatabase();
  const original = { id: 'original-note', title: '기존 노트', content: '<p>보존할 기존 내용</p>', createdAt: 1, updatedAt: 1 };
  const baseline = { version: '1', tree: [{ id: original.id, parentId: null, title: original.title, type: 'document' as const, createdAt: 1, updatedAt: 1 }], tables: {}, documents: { [original.id]: original } };
  db.saveWorkspaceData(baseline);
  const app = express(); app.use('/api/exchange/items', itemExchangeRoutes(() => {}));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address() as { port: number }, base = `http://127.0.0.1:${address.port}`;
  const image = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const source = { id: 'sender-doc', title: '보낼 노트', content: '<p>전달할 내용</p><script>alert(1)</script><p><img src="asset://old-image" onerror="alert(1)"></p>', createdAt: 1, updatedAt: 1 };
  const bytes = await packItem({ kind: 'document', item: source, tree: {}, events: [], layouts: {} }, async () => ({ mime: 'image/png', bytes: image }));
  const shared = await unpackItem(bytes);
  assert.equal(shared.assets.length, 1);
  assert.equal(shared.item.id, 'sender-doc');
  const importFile = async (data: Uint8Array, suffix = '') => fetch(`${base}/api/exchange/items${suffix}`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: Buffer.from(data) });
  try {
    const first = await importFile(bytes); assert.equal(first.status, 201); const received = await first.json();
    const second = await importFile(bytes); assert.equal(second.status, 201); const again = await second.json();
    assert.notEqual(received.id, again.id); assert.notEqual(received.id, source.id);
    const workspace = db.getWorkspaceData();
    assert.deepEqual(workspace.documents![original.id], original);
    assert.equal(Object.keys(workspace.documents!).length, 3);
    const content = workspace.documents![received.id].content;
    assert.ok(content.includes('전달할 내용')); assert.ok(!content.includes('<script')); assert.ok(!content.includes('onerror'));
    const newImageId = content.match(/asset:\/\/([^"']+)/)![1];
    assert.notEqual(newImageId, 'old-image'); assert.deepEqual(db.getRowImage(newImageId)!.data, image);
    const back = await fetch(`${base}/api/exchange/items/${received.id}`);
    const roundtrip = await unpackItem(new Uint8Array(await back.arrayBuffer()));
    assert.deepEqual(roundtrip.assets[0].bytes, image);
    const beforeInvalid = JSON.stringify(db.getWorkspaceData());
    assert.equal((await importFile(bytes, '?parent=missing-folder')).status, 400);
    assert.equal(JSON.stringify(db.getWorkspaceData()), beforeInvalid);
    const broken = await JSZip.loadAsync(bytes); broken.remove('assets/image-1');
    assert.equal((await importFile(await broken.generateAsync({ type: 'uint8array' }))).status, 400);
    assert.equal(JSON.stringify(db.getWorkspaceData()), beforeInvalid);

    const table = { id: 'sender-table', title: '보낼 테이블', columns: [{ id: 'old-col', name: '내용', type: 'text' as const, width: 180 }], rows: [{ id: 'old-row', data: { 'old-col': '행 내용' }, richContent: '<p>상세 내용</p>', createdAt: 1, updatedAt: 1 }], createdAt: 1, updatedAt: 1 };
    const event = { id: 'old-event', tableRowId: 'old-row', title: '확인 일정', startDate: '2026-11-04', endDate: '2026-11-04', isAllDay: true, category: 'work' as const, createdAt: 1, updatedAt: 1 };
    const tableBytes = await packItem({ kind: 'table', item: table, tree: {}, events: [event], layouts: {} }, async () => { throw new Error('no images'); });
    const response = await importFile(tableBytes); assert.equal(response.status, 201); const importedTable = await response.json();
    const storedTable = db.getTable(importedTable.id)!;
    assert.equal(storedTable.rows.length, 1); assert.notEqual(storedTable.rows[0].id, 'old-row'); assert.notEqual(storedTable.columns[0].id, 'old-col');
    assert.equal(storedTable.rows[0].data[storedTable.columns[0].id], '행 내용');
    assert.equal(db.getCalendarEvents(importedTable.id)[0].tableRowId, storedTable.rows[0].id);
    assert.deepEqual(db.getWorkspaceData().documents![original.id], original);
    const SQL = await initSqlJs(); const reopened = new SQL.Database(await fs.readFile(path.join(temporary, 'wonbee.sqlite')));
    assert.ok(reopened.exec('SELECT id FROM tables WHERE id=?', [importedTable.id])[0].values.length); reopened.close();

    const execute = promisify(execFile), script = path.join(root, 'scripts/item-transfer.ts');
    await fs.writeFile('offline.json', JSON.stringify(baseline));
    await execute(process.execPath, ['--import', 'tsx', script, 'export', '--workspace', 'offline.json', '--id', original.id, '--out', 'offline.wonnote']);
    const inspected = await execute(process.execPath, ['--import', 'tsx', script, 'inspect', 'offline.wonnote']);
    assert.equal(JSON.parse(inspected.stdout).title, original.title);
    const cliImport = await execute(process.execPath, ['--import', 'tsx', script, 'import', 'offline.wonnote', '--server', base]);
    assert.equal(JSON.parse(cliImport.stdout).kind, 'document');
    assert.deepEqual(db.getWorkspaceData().documents![original.id], original);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve())); process.chdir(root);
  }
});
