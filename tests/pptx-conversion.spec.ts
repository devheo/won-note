import { test, expect } from '@playwright/test';
import PptxGenJS from 'pptxgenjs';
import JSZip from 'jszip';

test.use({ launchOptions: { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' } });
test('PPTX content imports in presentation order and exports editable content', async ({ page }) => {
  const fixture = new PptxGenJS(); fixture.layout = 'LAYOUT_WIDE';
  const first = fixture.addSlide();
  first.addText('첫 번째 & 제목', { x: 1, y: 0.5, w: 8, h: 1 });
  first.addText('한글 본문 <script>alert(1)</script>', { x: 1, y: 2, w: 8, h: 1 });
  first.addTable([['이름', '값'], ['테스트', '42']], { x: 1, y: 3, w: 8 });
  first.addImage({ data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9u0AAAAASUVORK5CYII=', x: 10, y: 1, w: 1, h: 1 });
  first.addNotes('발표자만 보는 메모');
  fixture.addSlide().addText('두 번째 슬라이드', { x: 1, y: 1, w: 8, h: 1 });
  const zip = await JSZip.loadAsync(await fixture.write({ outputType: 'arraybuffer' }) as ArrayBuffer);
  // A real presentation may order slides differently from numbered ZIP filenames.
  const presentation = await zip.file('ppt/presentation.xml')!.async('string');
  zip.file('ppt/presentation.xml', presentation.replace(/(<p:sldId[^>]+\/>)(<p:sldId[^>]+\/>)/, '$2$1'));
  const bytes = Array.from(await zip.generateAsync({ type: 'uint8array' }));
  await page.goto('http://127.0.0.1:3000');
  const result = await page.evaluate(async (input) => {
    const { importPptx, createPptx } = await import('/src/utils/pptxConversion.ts');
    const imported = await importPptx(new Uint8Array(input).buffer);
    const doc = new DOMParser().parseFromString(imported.html, 'text/html');
    const output = await createPptx(imported.html, '왕복 테스트');
    const outputBytes = await output.pptx.write({ outputType: 'arraybuffer' });
    const roundtrip = await importPptx(outputBytes as ArrayBuffer);
    let invalidRejected = false;
    try { await importPptx(new Uint8Array([1, 2, 3]).buffer); } catch { invalidRejected = true; }
    const long = await createPptx('<h1>긴 노트</h1><p>' + '한글'.repeat(2500) + '마지막문장</p><hr><h1>제목만</h1>', '긴 노트');
    const longRoundtrip = await importPptx(await long.pptx.write({ outputType: 'arraybuffer' }) as ArrayBuffer);
    return { imported, roundtrip, firstText: doc.body.textContent, scripts: doc.querySelectorAll('script').length,
      cells: doc.querySelectorAll('td').length, images: doc.querySelectorAll('img').length,
      invalidRejected, longHtml: longRoundtrip.html, longSlides: longRoundtrip.slideCount };
  }, bytes);
  expect(result.imported.slideCount).toBe(2);
  expect(result.firstText!.indexOf('두 번째')).toBeLessThan(result.firstText!.indexOf('첫 번째'));
  expect(result.scripts).toBe(0); expect(result.cells).toBe(4); expect(result.images).toBe(1);
  expect(result.imported.html).toContain('발표자만 보는 메모');
  expect(result.roundtrip.html).toContain('테스트'); expect(result.roundtrip.html).toContain('42');
  expect(result.roundtrip.html).toContain('발표자만 보는 메모');
  expect(result.roundtrip.html).toContain('data:image/png;base64,');
  expect(result.invalidRejected).toBe(true);
  expect(result.longSlides).toBeGreaterThan(2);
  expect(result.longHtml).toContain('마지막문장'); expect(result.longHtml).toContain('제목만');
});


