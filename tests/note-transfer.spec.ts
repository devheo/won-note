import { test, expect } from '@playwright/test';
import PptxGenJS from 'pptxgenjs';
import JSZip from 'jszip';
import { jsPDF } from 'jspdf';

test.use({ launchOptions: { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' } });
test('workspace context menu targets inactive notes and imports/exports PPTX and PDF', async ({ page }) => {
  test.setTimeout(120000);
  const pptx = new PptxGenJS(); pptx.addSlide().addText('가져온 슬라이드', { x: 1, y: 1, w: 8, h: 1 });
  const pptxBytes = await pptx.write({ outputType: 'nodebuffer' }) as Buffer;
  const pdf = new jsPDF(); pdf.text('PDF page one <safe>', 20, 30); pdf.addPage(); pdf.text('PDF page two', 20, 30);
  await page.goto('http://127.0.0.1:3000');
  await page.evaluate(async () => {
    localStorage.setItem('wonbee_use_server', 'false');
    const React = (await import('/node_modules/.vite/deps/react.js')).default;
    const { createRoot } = (await import('/node_modules/.vite/deps/react-dom_client.js')).default;
    const { InfiniteTreeSidebar } = await import('/src/components/sidebar/InfiniteTreeSidebar.tsx');
    const { WonNoteDocumentEditor } = await import('/src/components/editor/WonNoteDocumentEditor.tsx');
    const host = document.createElement('div'); host.id = 'transfer-test'; host.style.cssText = 'position:fixed;inset:0;z-index:9000;background:white;display:flex'; document.body.append(host);
    const noop = () => {};
    function Harness() {
      const [docs, setDocs] = React.useState({
        a: { id: 'a', title: '활성 노트', content: '<p>기존 활성 내용</p>', createdAt: 1, updatedAt: 1 },
        b: { id: 'b', title: '대상 노트', content: '<p>기존 대상 내용</p>', createdAt: 1, updatedAt: 1 },
      });
      const update = doc => setDocs(prev => ({ ...prev, [doc.id]: doc }));
      return React.createElement(React.Fragment, null,
        React.createElement(InfiniteTreeSidebar, {
          tree: Object.values(docs).map(doc => ({ id: doc.id, title: doc.title, type: 'document', parentId: null })), documents: docs, onUpdateDocument: update,
          activeTableId: null, activeDocId: 'a', onSelectTable: noop, onUpdateTree: noop, onAddTable: noop, onAddFolder: noop, onDeleteTreeItem: noop, onDuplicateTable: noop,
          theme: 'light', onSelectTheme: noop, onOpenSpeedSettings: noop, aiEnabled: false, onToggleAi: noop,
        }),
        React.createElement('div', { style: { flex: 1 } }, React.createElement(WonNoteDocumentEditor, { document: docs.a, onUpdateDocument: update })),
        React.createElement('pre', { id: 'target-content', style: { display: 'none' } }, docs.b.content));
    }
    createRoot(host).render(React.createElement(Harness));
  });
  const target = page.locator('#transfer-test [data-tree-item-id="b"]');
  await expect(page.getByRole('button', { name: 'PPTX 가져오기', exact: true })).toHaveCount(0);
  const choose = async (direction: string, format: string) => {
    await target.click({ button: 'right' });
    const menu = page.getByRole('menu', { name: '대상 노트 컨텍스트 메뉴', exact: true });
    await menu.getByRole('menuitem', { name: direction, exact: true }).hover();
    const action = menu.getByRole('menu', { name: `${direction} 형식` }).getByRole('menuitem', { name: format, exact: true });
    await action.click();
  };
  const selected = page.waitForEvent('filechooser'); await choose('가져오기', 'PPTX');
  await (await selected).setFiles({ name: 'sample.pptx', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', buffer: pptxBytes });
  await expect(page.getByRole('status').filter({ hasText: '끝에 1개 슬라이드' })).toBeVisible();
  await expect(page.locator('#target-content')).toContainText('기존 대상 내용');
  await expect(page.locator('#target-content')).toContainText('가져온 슬라이드');
  await expect(page.locator('#transfer-test .tiptap')).not.toContainText('가져온 슬라이드');
  let download = page.waitForEvent('download'); await choose('내보내기', 'PPTX');
  const pptxDownload = await download; expect(pptxDownload.suggestedFilename()).toBe('대상 노트.pptx');
  const stream = await pptxDownload.createReadStream(); const chunks: Buffer[] = []; for await (const part of stream!) chunks.push(Buffer.from(part));
  const zip = await JSZip.loadAsync(Buffer.concat(chunks));
  expect((await Promise.all(Object.keys(zip.files).filter(p => /^ppt\/slides\/slide\d+\.xml$/.test(p)).map(p => zip.file(p)!.async('string')))).join('')).toContain('기존 대상 내용');
  const pdfChooser = page.waitForEvent('filechooser'); await choose('가져오기', 'PDF');
  await (await pdfChooser).setFiles({ name: 'sample.pdf', mimeType: 'application/pdf', buffer: Buffer.from(pdf.output('arraybuffer')) });
  await expect(page.getByRole('dialog', { name: 'PDF 가져오기' })).toBeVisible();
  await page.getByRole('dialog', { name: 'PDF 가져오기' }).getByLabel('가져올 페이지').fill('3');
  await page.getByRole('button', { name: '가져오기 시작', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('1~2');
  await expect(page.locator('#target-content')).not.toContainText('PDF page one');
  await page.getByRole('dialog', { name: 'PDF 가져오기' }).getByLabel('가져올 페이지').fill('1-2');
  await page.getByRole('button', { name: '가져오기 시작', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '끝에 2페이지' })).toBeVisible({ timeout: 45000 });
  await expect(page.locator('#target-content')).toContainText('PDF page one &lt;safe&gt;');
  await expect(page.locator('#target-content')).toContainText('PDF page two');
  await expect(page.locator('#target-content')).toContainText('asset://asset-');
  await expect(page.locator('#target-content')).not.toContainText('data:image/jpeg;base64,');
  download = page.waitForEvent('download'); await choose('내보내기', 'PDF');
  const pdfDownload = await download; expect(pdfDownload.suggestedFilename()).toBe('대상 노트.pdf');
  await pdfDownload.saveAs('test-results/note-export.pdf');
  await expect(page.getByRole('status').filter({ hasText: '내보내기를 완료' })).toBeVisible();
  await target.click({ button: 'right' }); await page.keyboard.press('Escape');
  await expect(page.getByRole('menu', { name: '대상 노트 컨텍스트 메뉴' })).toHaveCount(0);
  // Export reads live editor content even before its autosave debounce fires.
  await page.locator('#transfer-test .tiptap').fill('방금 입력한 활성 내용');
  await page.locator('#transfer-test [data-tree-item-id="a"]').click({ button: 'right' });
  const activeMenu = page.getByRole('menu', { name: '활성 노트 컨텍스트 메뉴', exact: true });
  await activeMenu.getByRole('menuitem', { name: '내보내기', exact: true }).hover();
  const activeDownload = page.waitForEvent('download');
  await activeMenu.getByRole('menu', { name: '내보내기 형식' }).getByRole('menuitem', { name: 'PPTX', exact: true }).click();
  const activeStream = await (await activeDownload).createReadStream();
  const activeChunks: Buffer[] = []; for await (const chunk of activeStream!) activeChunks.push(Buffer.from(chunk));
  const activeZip = await JSZip.loadAsync(Buffer.concat(activeChunks));
  expect(await activeZip.file('ppt/slides/slide1.xml')!.async('string')).toContain('방금 입력한 활성 내용');
});

test('PDF import handles image-only PDF, invalid files, and export paginates Korean', async ({ page }) => {
  test.setTimeout(90000);
  await page.goto('http://127.0.0.1:3000');
  const imagePdf = new jsPDF();
  imagePdf.addImage({ imageData: { data: new Uint8ClampedArray([100, 150, 200, 255]), width: 1, height: 1 }, format: 'RGBA', x: 10, y: 10, w: 20, h: 20 });
  const result = await page.evaluate(async (imageBytes) => {
    localStorage.setItem('wonbee_use_server', 'false');
    const { createPdf, importPdf } = await import('/src/utils/pdfConversion.ts');
    const { noteImageDataUrl } = await import('/src/utils/noteImageAssets.ts');
    const pdf = await createPdf('<h1>한글 제목</h1><p>' + '긴 본문 테스트 '.repeat(800) + '마지막 문장</p><table><tr><th>이름</th><th>값</th></tr><tr><td>한글</td><td>42</td></tr></table>', 'PDF 검증');
    const imported = await importPdf(pdf.output('arraybuffer'));
    const imageOnly = await importPdf(new Uint8Array(imageBytes).buffer);
    let rejected = false; try { await importPdf(new Uint8Array([1, 2, 3]).buffer); } catch { rejected = true; }
    const img = new Image(); img.src = (await noteImageDataUrl(new DOMParser().parseFromString(imported.html, 'text/html').querySelector('img')!.getAttribute('src')!))!; await img.decode();
    img.id = 'pdf-preview'; img.style.cssText = 'position:fixed;inset:0;z-index:20000;width:650px;height:auto;background:white'; document.body.append(img);
    return { pages: imported.pageCount, imageOnly: imageOnly.warnings.length > 0, rejected };
  }, Array.from(new Uint8Array(imagePdf.output('arraybuffer'))));
  expect(result.pages).toBeGreaterThan(2); expect(result.imageOnly).toBe(true); expect(result.rejected).toBe(true);
  await page.locator('#pdf-preview').screenshot({ path: 'test-results/pdf-preview.png' });
});
