import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import workerSource from 'pdfjs-dist/build/pdf.worker.min.mjs?raw';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas-pro';
import { resolveApiUrl } from '../services/httpBridge';
import { storeNoteImage, discardNoteImages, noteImageDataUrl } from './noteImageAssets';

let workerUrl: string | undefined;
const escape = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

import { FILE_LIMITS } from '../constants/limits';

export const MAX_PDF_BYTES = FILE_LIMITS.pdfBytes;
export type PdfImportMode = 'text-images' | 'text' | 'images';
export interface PdfImportProgress {
  completed: number;
  total: number;
  page: number;
}
export interface PdfImportOptions {
  pages?: string;
  mode?: PdfImportMode;
  signal?: AbortSignal;
  onProgress?: (progress: PdfImportProgress) => void;
}
function checkAbort(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('가져오기를 취소했습니다.', 'AbortError');
}
export function parsePdfPages(input: string, count: number): number[] {
  if (!input.trim()) return Array.from({ length: count }, (_, i) => i + 1);
  const result = new Set<number>();
  for (const part of input.split(',')) {
    const match = part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!match) throw new Error('페이지는 1-10, 15, 20-30 형식으로 입력해주세요.');
    const from = Number(match[1]),
      to = Number(match[2] || match[1]);
    if (from < 1 || to < from || to > count)
      throw new Error(`페이지 범위는 1~${count} 사이의 오름차순으로 입력해주세요.`);
    for (let n = from; n <= to; n++) result.add(n);
  }
  return Array.from(result).sort((a, b) => a - b);
}
export async function openPdfImport(data: ArrayBuffer, signal?: AbortSignal) {
  if (data.byteLength > MAX_PDF_BYTES) throw new Error('250MB 이하의 PDF를 선택해주세요.');
  checkAbort(signal);
  workerUrl ||= URL.createObjectURL(new Blob([workerSource], { type: 'text/javascript' }));
  GlobalWorkerOptions.workerSrc = workerUrl;
  const task = getDocument({
    data,
    useSystemFonts: true,
    cMapUrl: resolveApiUrl('/pdfjs/cmaps/'),
    cMapPacked: true,
    standardFontDataUrl: resolveApiUrl('/pdfjs/standard_fonts/'),
    wasmUrl: resolveApiUrl('/pdfjs/wasm/'),
    iccUrl: resolveApiUrl('/pdfjs/iccs/'),
  });
  const abortLoading = () => {
    void task.destroy();
  };
  signal?.addEventListener('abort', abortLoading, { once: true });
  try {
    const pdf = await task.promise;
    checkAbort(signal);
    signal?.removeEventListener('abort', abortLoading);
    let closed = false;
    return {
      pageCount: pdf.numPages,
      close: async () => {
        if (!closed) {
          closed = true;
          await task.destroy();
        }
      },
      importPages: async (options: PdfImportOptions = {}) => {
        if (closed) throw new Error('PDF를 다시 선택해주세요.');
        const selected = parsePdfPages(options.pages || '', pdf.numPages);
        const mode = options.mode || 'text-images';
        const pages: string[] = [],
          assetIds: string[] = [];
        let textPages = 0;
        const estimate = await navigator.storage?.estimate?.();
        let available = estimate?.quota ? estimate.quota - (estimate.usage || 0) : Infinity;
        try {
          for (const [index, number] of selected.entries()) {
            checkAbort(options.signal);
            const page = await pdf.getPage(number);
            const canvas = document.createElement('canvas');
            try {
              let imageHtml = '';
              if (mode !== 'text') {
                const base = page.getViewport({ scale: 1 });
                const viewport = page.getViewport({ scale: Math.min(1.5, 1400 / Math.max(base.width, base.height)) });
                canvas.width = Math.ceil(viewport.width);
                canvas.height = Math.ceil(viewport.height);
                const rendering = page.render({ canvas, canvasContext: canvas.getContext('2d')!, viewport });
                const cancel = () => rendering.cancel();
                options.signal?.addEventListener('abort', cancel, { once: true });
                try {
                  await rendering.promise;
                } finally {
                  options.signal?.removeEventListener('abort', cancel);
                }
                checkAbort(options.signal);
                const blob = await new Promise<Blob>((resolve, reject) =>
                  canvas.toBlob(
                    (blob) => (blob ? resolve(blob) : reject(new Error('PDF 페이지 이미지를 만들 수 없습니다.'))),
                    'image/jpeg',
                    0.85,
                  ),
                );
                if (blob.size > available)
                  throw new Error('이미지를 저장할 공간이 부족합니다. 텍스트만 가져오거나 페이지 범위를 줄여주세요.');
                available -= blob.size;
                const asset = await storeNoteImage(blob, `pdf-page-${number}.jpg`);
                assetIds.push(asset.id);
                imageHtml = `<p><img src="${asset.url}" alt="PDF ${number}페이지 이미지" loading="lazy"></p>`;
              }
              let textHtml = '';
              if (mode !== 'images') {
                const content = await page.getTextContent();
                const lines: string[] = [];
                let line = '';
                let previousY: number | undefined;
                for (const item of content.items) {
                  if (!('str' in item)) continue;
                  const y = item.transform[5];
                  if (previousY !== undefined && Math.abs(y - previousY) > 3 && line) {
                    lines.push(line);
                    line = '';
                  }
                  line += item.str + ' ';
                  previousY = y;
                  if (item.hasEOL && line.trim()) {
                    lines.push(line);
                    line = '';
                  }
                }
                if (line.trim()) lines.push(line);
                if (lines.some((line) => line.trim())) textPages++;
                textHtml = lines
                  .filter((line) => line.trim())
                  .map((line) => `<p>${escape(line.trim())}</p>`)
                  .join('');
                if (!textHtml) textHtml = '<p><em>추출 가능한 텍스트가 없습니다.</em></p>';
              }
              pages.push(`<div data-pdf-page="${number}" data-pdf-total="${pdf.numPages}">${textHtml}${imageHtml}</div>`);
            } finally {
              page.cleanup();
              canvas.width = 0;
              canvas.height = 0;
            }
            checkAbort(options.signal);
            options.onProgress?.({ completed: index + 1, total: selected.length, page: number });
            if ((index + 1) % 10 === 0) await pdf.cleanup();
            // Yield between pages for progress, UI interaction, and cancellation.
            await new Promise((resolve) => setTimeout(resolve, 0));
          }
          checkAbort(options.signal);
          return {
            html: pages.join('<hr>'),
            pageCount: selected.length,
            assetIds,
            warnings:
              mode !== 'images' && textPages < selected.length
                ? ['일부 페이지에서 텍스트를 추출할 수 없습니다. 스캔 문서의 OCR은 지원하지 않습니다.']
                : [],
          };
        } catch (error) {
          await discardNoteImages(assetIds);
          checkAbort(options.signal);
          if (error instanceof Error && error.name === 'QuotaExceededError')
            throw new Error('브라우저 저장 공간이 부족합니다. 텍스트만 가져오거나 페이지 범위를 줄여주세요.');
          throw error;
        }
      },
    };
  } catch (error) {
    await task.destroy();
    checkAbort(signal);
    if (error instanceof Error && error.name === 'PasswordException')
      throw new Error('암호를 해제한 PDF를 선택해주세요.');
    throw error instanceof Error ? error : new Error('PDF 파일을 읽을 수 없습니다.');
  } finally {
    signal?.removeEventListener('abort', abortLoading);
  }
}

export async function importPdf(data: ArrayBuffer, options: PdfImportOptions = {}) {
  const session = await openPdfImport(data, options.signal);
  try {
    return await session.importPages(options);
  } finally {
    await session.close();
  }
}

/** Raster PDF preserves Korean glyphs and local images without external font services. */
export async function createPdf(html: string, title: string) {
  const source = new DOMParser().parseFromString(html, 'text/html').body;
  if (!(source.textContent || '').trim() && !source.querySelector('img'))
    throw new Error('내보낼 노트 내용이 없습니다.');
  // Rebuild a small allowlisted DOM: imported HTML cannot run scripts or fetch external resources.
  const safe = async (node: Node): Promise<Node | null> => {
    if (node.nodeType === Node.TEXT_NODE) return document.createTextNode(node.textContent || '');
    if (!(node instanceof Element)) return null;
    if (['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'LINK'].includes(node.tagName)) return null;
    if (node.tagName === 'IMG') {
      const src = await noteImageDataUrl(node.getAttribute('src') || '');
      if (!src) return null;
      const img = document.createElement('img');
      img.src = src;
      img.alt = node.getAttribute('alt') || '';
      return img;
    }
    const allowed = /^(P|H[1-6]|BR|HR|UL|OL|LI|BLOCKQUOTE|PRE|CODE|STRONG|EM|B|I|U|S|TABLE|THEAD|TBODY|TR|TD|TH)$/;
    const element = document.createElement(allowed.test(node.tagName) ? node.tagName.toLowerCase() : 'span');
    for (const child of Array.from(node.childNodes)) {
      const copy = await safe(child);
      if (copy) element.append(copy);
    }
    return element;
  };
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:794px;background:white;color:#292524;z-index:-1';
  host.setAttribute('aria-hidden', 'true');
  const style = document.createElement('style');
  style.textContent =
    '.note-pdf-sheet{width:794px;min-height:1123px;padding:48px;box-sizing:border-box;background:#fff;color:#292524;font:16px/1.6 "Malgun Gothic",sans-serif;overflow-wrap:anywhere}.note-pdf-sheet h1{font-size:28px;font-weight:bold;margin:12px 0;color:#92400e}.note-pdf-sheet h2{font-size:23px;font-weight:bold;margin:12px 0}.note-pdf-sheet h3{font-size:20px;font-weight:bold}.note-pdf-sheet p,.note-pdf-sheet pre{margin:8px 0;white-space:pre-wrap}.note-pdf-sheet img{max-width:100%;max-height:900px;object-fit:contain}.note-pdf-sheet table{width:100%;border-collapse:collapse;table-layout:fixed}.note-pdf-sheet td,.note-pdf-sheet th{border:1px solid #aaa;padding:8px;word-break:break-word}.note-pdf-sheet blockquote{border-left:3px solid #d6d3d1;padding-left:12px}.note-pdf-sheet ul{list-style:disc;padding-left:24px}.note-pdf-sheet ol{list-style:decimal;padding-left:24px}.note-pdf-sheet hr{border-top:1px solid #aaa;margin:16px 0}';
  host.append(style);
  document.body.append(host);
  const sheets: HTMLElement[] = [];
  const newSheet = () => {
    if (sheets.length >= 150) throw new Error('내보낼 PDF가 너무 큽니다. 노트를 나누어주세요.');
    const sheet = document.createElement('div');
    sheet.className = 'note-pdf-sheet';
    host.append(sheet);
    sheets.push(sheet);
    return sheet;
  };
  let sheet = newSheet();
  const add = async (block: Node): Promise<void> => {
    const originalSheet = sheet;
    sheet.append(block);
    if (block instanceof HTMLImageElement) {
      try {
        await block.decode();
      } catch {
        throw new Error('노트의 이미지를 읽을 수 없습니다.');
      }
    }
    for (const img of block instanceof Element ? Array.from(block.querySelectorAll('img')) : []) {
      try {
        await img.decode();
      } catch {
        /* broken image remains visibly marked */
      }
    }
    if (sheet.scrollHeight <= 1123) return;
    block.parentNode?.removeChild(block);
    if (sheet.childNodes.length) sheet = newSheet();
    sheet.append(block);
    if (sheet.scrollHeight <= 1123) return;
    block.parentNode?.removeChild(block);
    // A block taller than an entire page must start splitting in the remaining
    // space of the previous page instead of leaving a title-only page behind.
    if (sheet !== originalSheet && !sheet.childNodes.length) {
      sheet.remove();
      sheets.pop();
      sheet = originalSheet;
    }
    if (block instanceof Element && block.tagName === 'TABLE') {
      const rows = Array.from(block.querySelectorAll('tr'));
      if (rows.length > 1) {
        for (const row of rows) {
          const table = document.createElement('table');
          table.append(row);
          await add(table);
        }
      } else {
        for (const cell of Array.from(block.querySelectorAll('td,th'))) {
          const p = document.createElement('p');
          p.textContent = cell.textContent;
          await add(p);
        }
      }
    } else if (
      block instanceof Element &&
      block.children.length &&
      !['P', 'PRE', 'LI', 'TD', 'TH', 'TABLE'].includes(block.tagName)
    ) {
      for (const child of Array.from(block.childNodes)) await add(child);
    } else {
      const chars = Array.from(block.textContent || '');
      // Binary search the largest paragraph that fits, so long paragraphs never clip.
      let offset = 0;
      while (offset < chars.length) {
        const p = document.createElement('p');
        sheet.append(p);
        let low = 1,
          high = chars.length - offset,
          length = 0;
        while (low <= high) {
          const mid = Math.floor((low + high) / 2);
          p.textContent = chars.slice(offset, offset + mid).join('');
          if (sheet.scrollHeight <= 1123) {
            length = mid;
            low = mid + 1;
          } else high = mid - 1;
        }
        if (!length) {
          p.remove();
          sheet = newSheet();
          continue;
        }
        p.textContent = chars.slice(offset, offset + length).join('');
        offset += length;
        if (offset < chars.length) sheet = newSheet();
      }
    }
    if (sheets.length > 150) throw new Error('내보낼 PDF가 너무 큽니다. 노트를 나누어주세요.');
  };
  try {
    const header = document.createElement('h1');
    header.textContent = title;
    await add(header);
    for (const node of Array.from(source.childNodes)) {
      const clean = await safe(node);
      if (clean) await add(clean);
    }
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    for (const [index, page] of sheets.entries()) {
      if (index) pdf.addPage();
      const canvas = await html2canvas(page, { scale: 1.5, backgroundColor: '#ffffff', logging: false });
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 210, 297);
      pdf.setFontSize(9);
      pdf.setTextColor(100);
      pdf.text(`${index + 1} / ${sheets.length}`, 195, 291, { align: 'right' });
      canvas.width = 0;
      canvas.height = 0;
    }
    return pdf;
  } finally {
    host.remove();
  }
}
