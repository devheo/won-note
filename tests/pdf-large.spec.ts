import { test, expect } from '@playwright/test';
import { jsPDF } from 'jspdf';

test.use({ launchOptions: { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' } });
test('server saves image assets before publishing note references', async ({ page }) => {
  const requests: string[] = [];
  await page.route('**/transfer-test-api/**', async route => {
    requests.push(new URL(route.request().url()).pathname);
    await route.fulfill({ json: route.request().url().endsWith('/assets') ? { url: 'asset://test' } : { success: true } });
  });
  await page.goto('http://127.0.0.1:3000');
  await page.evaluate(async () => {
    const { storeNoteImage } = await import('/src/utils/noteImageAssets.ts');
    const { ServerApiWorkspaceRepository } = await import('/src/services/storage/repository.ts');
    const asset = await storeNoteImage(new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }), 'test.png');
    const repository = new ServerApiWorkspaceRepository('http://127.0.0.1:3000/transfer-test-api');
    await repository.saveWorkspace({ version: '1', tree: [{ id: 'test', type: 'document', title: 'test', parentId: null }], tables: {},
      documents: { test: { id: 'test', title: 'test', content: `<p><img src="${asset.url}"></p>`, createdAt: 1, updatedAt: 1 } } });
  });
  expect(requests).toEqual(['/transfer-test-api/assets', '/transfer-test-api/workspace']);
});
test('imports more than 50 pages, selects ranges, persists image assets and cleans up cancellation', async ({ page }) => {
  test.setTimeout(120000);
  const fixture = new jsPDF();
  for (let n = 1; n <= 75; n++) { if (n > 1) fixture.addPage(); fixture.text(`Large PDF page ${n}`, 20, 30); }
  await page.goto('http://127.0.0.1:3000');
  const result = await page.evaluate(async (bytes) => {
    localStorage.setItem('wonbee_use_server', 'false');
    const { importPdf, parsePdfPages } = await import('/src/utils/pdfConversion.ts');
    const { wonbeeDexieDB } = await import('/src/services/storage/dexieDb.ts');
    const { createPptx } = await import('/src/utils/pptxConversion.ts');
    const { createPdf } = await import('/src/utils/pdfConversion.ts');
    const data = () => new Uint8Array(bytes).buffer;
    let progress = 0;
    const full = await importPdf(data(), { mode: 'text', onProgress: p => { progress = p.completed; } });
    const range = await importPdf(data(), { pages: '59-64, 1, 60', mode: 'text' });
    let invalid = false; try { parsePdfPages('1-76', 75); } catch { invalid = true; }
    const before = await wonbeeDexieDB.assets.count();
    const controller = new AbortController();
    let cancelled = false;
    try { await importPdf(data(), { signal: controller.signal, onProgress: p => { if (p.completed === 3) controller.abort(); } }); }
    catch (error) { cancelled = error.name === 'AbortError'; }
    const after = await wonbeeDexieDB.assets.count();
    const images = await importPdf(data(), { pages: '74-75', mode: 'images' });
    const assets = await Promise.all(images.assetIds.map(id => wonbeeDexieDB.getAsset(id)));
    // Both exports must still include images stored outside the note HTML.
    const pptx = await createPptx(images.html, 'Asset export');
    const output = await pptx.pptx.write({ outputType: 'arraybuffer' });
    const pdf = await createPdf(images.html, 'Asset PDF export');
    return { total: full.pageCount, progress, last: full.html.includes('Large PDF page 75'), noImages: !full.html.includes('<img'),
      rangePages: range.pageCount, rangeHtml: range.html, invalid, cancelled, before, after,
      assetIds: images.assetIds, separate: !images.html.includes('base64,'), stored: assets.every(asset => asset?.blob.size > 0),
      pptxBytes: output.byteLength, pdfBytes: pdf.output('arraybuffer').byteLength };
  }, Array.from(new Uint8Array(fixture.output('arraybuffer'))));
  expect(result.total).toBe(75); expect(result.progress).toBe(75); expect(result.last).toBe(true); expect(result.noImages).toBe(true);
  expect(result.rangePages).toBe(7); expect(result.rangeHtml).toContain('PDF 64페이지'); expect(result.rangeHtml).not.toContain('PDF 65페이지');
  expect(result.invalid).toBe(true); expect(result.cancelled).toBe(true); expect(result.after).toBe(result.before);
  expect(result.separate).toBe(true); expect(result.stored).toBe(true); expect(result.pptxBytes).toBeGreaterThan(10000); expect(result.pdfBytes).toBeGreaterThan(10000);
  await page.reload();
  expect(await page.evaluate(async ids => {
    const { wonbeeDexieDB } = await import('/src/services/storage/dexieDb.ts');
    return (await Promise.all(ids.map(id => wonbeeDexieDB.getAsset(id)))).every(asset => asset?.blob.size > 0);
  }, result.assetIds)).toBe(true);
});
