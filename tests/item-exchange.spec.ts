import { test, expect } from '@playwright/test';
import JSZip from 'jszip';

test.use({ launchOptions: { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' } });
test('offline UI exports only one item with images and imports it as a separate copy', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto('http://127.0.0.1:3000');
  await page.evaluate(async () => {
    localStorage.setItem('wonbee_use_server', 'false');
    const React = (await import('/node_modules/.vite/deps/react.js')).default;
    const { createRoot } = (await import('/node_modules/.vite/deps/react-dom_client.js')).default;
    const { InfiniteTreeSidebar } = await import('/src/components/sidebar/InfiniteTreeSidebar.tsx');
    const { WonNoteDocumentEditor } = await import('/src/components/editor/WonNoteDocumentEditor.tsx');
    const { storeNoteImage } = await import('/src/utils/noteImageAssets.ts');
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 10;
    const blob = await new Promise<Blob>(resolve => canvas.toBlob(blob => resolve(blob!)));
    const asset = await storeNoteImage(blob, 'sample.png');
    const host = document.createElement('div'); host.id = 'exchange-test'; host.style.cssText = 'position:fixed;inset:0;z-index:9000;display:flex;background:white'; document.body.append(host);
    const noop = () => {};
    function Harness() {
      const [docs, setDocs] = React.useState({ a: { id: 'a', title: '전달 노트', content: `<p>선택한 본문</p><p><img src="${asset.url}"></p>`, createdAt: 1, updatedAt: 1 }, private: { id: 'private', title: '비공개 노트', content: '<p>포함하면 안 되는 본문</p>', createdAt: 1, updatedAt: 1 } });
      const [tables, setTables] = React.useState({ t: { id: 't', title: '전달 테이블', columns: [{ id: 'old-col', name: '열 이름', type: 'text', width: 180 }], rows: [{ id: 'old-row', data: { 'old-col': '전달할 행' }, richContent: '<p>행 상세</p>', createdAt: 1, updatedAt: 1 }], createdAt: 1, updatedAt: 1 } });
      const tree = [...Object.values(docs).map(doc => ({ id: doc.id, title: doc.title, type: 'document', parentId: null })), ...Object.values(tables).map(table => ({ id: table.id, title: table.title, type: 'table', parentId: null }))];
      const update = doc => setDocs(previous => ({ ...previous, [doc.id]: doc }));
      return React.createElement(React.Fragment, null,
        React.createElement(InfiniteTreeSidebar, { tree, documents: docs, tables, onUpdateDocument: update,
          onImportSharedItem: async received => { if (received.kind === 'document') update(received.item); else setTables(previous => ({ ...previous, [received.item.id]: received.item })); },
          activeTableId: null, activeDocId: 'a', onSelectTable: noop, onUpdateTree: noop, onAddTable: noop, onAddFolder: noop, onDeleteTreeItem: noop, onDuplicateTable: noop,
          theme: 'light', onSelectTheme: noop, onOpenSpeedSettings: noop, aiEnabled: false, onToggleAi: noop }),
        React.createElement('div', { style: { flex: 1 } }, React.createElement(WonNoteDocumentEditor, { document: docs.a, onUpdateDocument: update })),
        React.createElement('pre', { id: 'exchange-state', style: { display: 'none' } }, JSON.stringify({ docs, tables })));
    }
    createRoot(host).render(React.createElement(Harness));
  });
  const downloadBytes = async (itemId: string, title: string, note: boolean) => {
    await page.locator(`#exchange-test [data-tree-item-id="${itemId}"]`).click({ button: 'right' });
    const menu = page.getByRole('menu', { name: `${title} 컨텍스트 메뉴`, exact: true });
    if (note) await menu.getByRole('menuitem', { name: '내보내기', exact: true }).hover();
    const pending = page.waitForEvent('download');
    await menu.getByRole('menuitem', { name: note ? '교환 파일 (.wonnote)' : '교환 파일 내보내기 (.wonnote)', exact: true }).click();
    const download = await pending; const stream = await download.createReadStream(), chunks: Buffer[] = [];
    for await (const part of stream!) chunks.push(Buffer.from(part));
    return Buffer.concat(chunks);
  };
  const load = async (bytes: Buffer) => {
    await expect(page.locator('#exchange-test').getByRole('button', { name: '교환 파일 가져오기 (.wonnote)', exact: true })).toBeEnabled();
    const chooser = page.waitForEvent('filechooser');
    await page.locator('#exchange-test').getByRole('button', { name: '교환 파일 가져오기 (.wonnote)', exact: true }).click();
    await (await chooser).setFiles({ name: 'share.wonnote', mimeType: 'application/octet-stream', buffer: bytes });
    await expect(page.getByRole('dialog', { name: '교환 파일 가져오기' })).toBeVisible();
    await page.getByRole('button', { name: '새 사본으로 가져오기' }).click();
    await expect(page.getByRole('dialog', { name: '교환 파일 가져오기' })).toHaveCount(0);
  };
  const noteBytes = await downloadBytes('a', '전달 노트', true);
  const zip = await JSZip.loadAsync(noteBytes), manifest = await zip.file('item.json')!.async('string');
  expect(manifest).not.toContain('포함하면 안 되는 본문'); expect(JSON.parse(manifest).assets).toHaveLength(1);
  await load(noteBytes);
  let state = JSON.parse(await page.locator('#exchange-state').textContent() || '{}');
  expect(Object.keys(state.docs)).toHaveLength(3);
  const received = Object.values(state.docs).find((doc: any) => doc.title === '전달 노트 (받은 사본)') as any;
  expect(received.id).not.toBe('a'); expect(received.content).toContain('선택한 본문'); expect(received.content).not.toBe(state.docs.a.content);
  expect(state.docs.private.content).toContain('포함하면 안 되는 본문');
  const tableBytes = await downloadBytes('t', '전달 테이블', false);
  await load(tableBytes);
  state = JSON.parse(await page.locator('#exchange-state').textContent() || '{}');
  expect(Object.keys(state.tables)).toHaveLength(2);
  const table = Object.values(state.tables).find((table: any) => table.id !== 't') as any;
  expect(table.rows[0].id).not.toBe('old-row'); expect(table.columns[0].id).not.toBe('old-col');
  expect(table.rows[0].data[table.columns[0].id]).toBe('전달할 행'); expect(table.rows[0].richContent).toContain('행 상세');
});
