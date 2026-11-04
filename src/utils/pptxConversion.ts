import JSZip from 'jszip';
import PptxGenJS from 'pptxgenjs';
import { noteImageDataUrl } from './noteImageAssets';

const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const P = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const elements = (node: Document | Element, ns: string, name: string) => Array.from(node.getElementsByTagNameNS(ns, name));
function xml(text: string) {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('PPTX 내부 XML이 손상되었습니다.');
  return doc;
}
function resolvePart(base: string, target: string) {
  const path = target.startsWith('/') ? [] : base.split('/').slice(0, -1);
  for (const part of target.split('/')) {
    if (part === '..') path.pop();
    else if (part && part !== '.') path.push(part);
  }
  return path.join('/');
}
async function relationships(zip: JSZip, part: string) {
  const relPath = part.replace(/([^/]+)$/, '_rels/$1.rels');
  const entry = zip.file(relPath);
  const result = new Map<string, { path: string; type: string }>();
  if (entry) for (const rel of Array.from(xml(await entry.async('string')).getElementsByTagNameNS('*', 'Relationship'))) {
    if (rel.getAttribute('TargetMode') === 'External') continue;
    result.set(rel.getAttribute('Id')!, { path: resolvePart(part, rel.getAttribute('Target') || ''), type: rel.getAttribute('Type') || '' });
  }
  return result;
}
function paragraph(p: Element) {
  const plain = elements(p, A, 't').map(t => t.textContent || '').join('');
  let content = '';
  for (const child of Array.from(p.children)) {
    if (child.localName === 'br') content += '<br>';
    if (child.localName !== 'r' && child.localName !== 'fld') continue;
    let text = escape(elements(child, A, 't').map(t => t.textContent || '').join(''));
    const props = elements(child, A, 'rPr')[0];
    if (props?.getAttribute('b') === '1') text = `<strong>${text}</strong>`;
    if (props?.getAttribute('i') === '1') text = `<em>${text}</em>`;
    if (props?.getAttribute('u') && props.getAttribute('u') !== 'none') text = `<u>${text}</u>`;
    content += text;
  }
  const bullet = elements(p, A, 'buChar').length || elements(p, A, 'buAutoNum').length;
  return { plain, html: `<p>${bullet ? '• ' : ''}${content || '<br>'}</p>` };
}

export interface PptxImportResult { html: string; slideCount: number; warnings: string[] }
/** Content conversion: deliberately does not execute external links or embedded objects. */
export async function importPptx(data: ArrayBuffer): Promise<PptxImportResult> {
  if (data.byteLength > 50 * 1024 * 1024) throw new Error('50MB 이하의 PPTX 파일을 선택해주세요.');
  let zip: JSZip;
  try { zip = await JSZip.loadAsync(data); } catch { throw new Error('PPTX 파일을 읽을 수 없습니다. 암호를 해제한 .pptx 파일을 선택해주세요.'); }
  const presentation = zip.file('ppt/presentation.xml');
  if (!presentation) throw new Error('유효한 PowerPoint PPTX 파일이 아닙니다.');
  const rels = await relationships(zip, 'ppt/presentation.xml');
  const ids = elements(xml(await presentation.async('string')), P, 'sldId');
  if (!ids.length) throw new Error('슬라이드가 없는 파일입니다.');
  if (ids.length > 300) throw new Error('한 번에 300장 이하의 슬라이드를 가져올 수 있습니다.');
  const warnings = new Set<string>();
  let totalBytes = 0;
  const read = async (path: string) => {
    const entry = zip.file(path);
    if (!entry) throw new Error(`PPTX 구성요소를 찾을 수 없습니다: ${path}`);
    const bytes = await entry.async('uint8array');
    totalBytes += bytes.length;
    if (totalBytes > 150 * 1024 * 1024) throw new Error('압축 해제한 문서가 너무 큽니다. 슬라이드를 나누어 가져와주세요.');
    return bytes;
  };
  const sections: string[] = [];
  for (const [index, id] of ids.entries()) {
    const part = rels.get(id.getAttributeNS(R, 'id') || '')?.path;
    if (!part) throw new Error('슬라이드 순서 정보를 읽을 수 없습니다.');
    const doc = xml(new TextDecoder().decode(await read(part)));
    const slideRels = await relationships(zip, part);
    const tree = elements(doc, P, 'spTree')[0];
    const blocks: string[] = [];
    let title = '';
    const visit = async (parent: Element) => {
      for (const shape of Array.from(parent.children)) {
        if (shape.localName === 'grpSp') { await visit(shape); continue; }
        if (shape.localName === 'sp') {
          const ph = elements(shape, P, 'ph')[0]?.getAttribute('type');
          if (['sldNum', 'dt', 'ftr', 'hdr'].includes(ph || '')) continue;
          const paragraphs = elements(shape, A, 'p').map(paragraph);
          if (!title && (ph === 'title' || ph === 'ctrTitle')) title = paragraphs.map(p => p.plain).join(' ');
          else blocks.push(...paragraphs.map(p => p.html));
        } else if (shape.localName === 'pic') {
          const embed = elements(shape, A, 'blip')[0]?.getAttributeNS(R, 'embed');
          const image = embed ? slideRels.get(embed)?.path : undefined;
          const ext = image?.split('.').pop()?.toLowerCase();
          const mime = ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' } as Record<string, string>)[ext || ''];
          if (image && mime) {
            const bytes = await read(image);
            let binary = '';
            for (let n = 0; n < bytes.length; n += 8192) binary += String.fromCharCode(...bytes.subarray(n, n + 8192));
            blocks.push(`<p><img src="data:${mime};base64,${btoa(binary)}" alt="슬라이드 ${index + 1} 이미지"></p>`);
          } else warnings.add('외부 링크 이미지와 지원하지 않는 이미지 형식은 제외했습니다.');
        } else if (shape.localName === 'graphicFrame') {
          const table = elements(shape, A, 'tbl')[0];
          if (table) blocks.push('<table><tbody>' + elements(table, A, 'tr').map(row => '<tr>' + Array.from(row.children).filter(c => c.localName === 'tc').map(cell => `<td>${elements(cell, A, 'p').map(p => paragraph(p).html).join('')}</td>`).join('') + '</tr>').join('') + '</tbody></table>');
          else warnings.add('차트·SmartArt 등은 변환되지 않습니다.');
        }
      }
    };
    if (tree) await visit(tree);
    for (const rel of slideRels.values()) if (rel.type.endsWith('/notesSlide')) {
      const notes = xml(new TextDecoder().decode(await read(rel.path)));
      const body = elements(notes, P, 'sp').filter(s => elements(s, P, 'ph')[0]?.getAttribute('type') === 'body');
      const text = body.flatMap(s => elements(s, A, 'p')).map(paragraph).filter(p => p.plain.trim());
      if (text.length) blocks.push('<blockquote><p><strong>발표자 메모</strong></p>' + text.map(p => p.html).join('') + '</blockquote>');
    }
    sections.push(`<h1>${escape(title || `슬라이드 ${index + 1}`)}</h1>${blocks.join('') || '<p></p>'}`);
  }
  return { html: sections.join('<hr>'), slideCount: sections.length, warnings: Array.from(warnings) };
}

/** Uses headings/HR as slide boundaries and paginates long content without truncation. */
export async function createPptx(html: string, title: string) {
  const root = new DOMParser().parseFromString(html, 'text/html').body;
  if (!(root.textContent || '').trim() && !root.querySelector('img')) throw new Error('내보낼 노트 내용이 없습니다.');
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = 'WON Note'; pptx.title = title;
  pptx.subject = 'WON Note에서 변환한 노트';
  pptx.theme = { headFontFace: '맑은 고딕', bodyFontFace: '맑은 고딕' };
  let heading = title || 'WON 노트';
  let slide: ReturnType<typeof pptx.addSlide> | undefined;
  let y = 1.25;
  let count = 0;
  let pendingHeading = false;
  const warnings = new Set<string>();
  const page = () => {
    slide = pptx.addSlide(); count++; y = 1.25; pendingHeading = false;
    slide.background = { color: 'FFFDF8' };
    slide.addText(heading, { x: 0.6, y: 0.35, w: 12.1, h: 0.7, fontSize: 26, bold: true, color: '92400E', breakLine: false, fit: 'shrink' });
    slide.addText(String(count), { x: 12.2, y: 7.1, w: 0.5, h: 0.2, fontSize: 10, color: '78716C' });
    return slide;
  };
  const text = (value: string, bullet = false) => {
    const lines = value.split('\n').flatMap(line => {
      const chars = Array.from(line); const chunks: string[] = [];
      for (let i = 0; i < chars.length; i += 55) chunks.push(chars.slice(i, i + 55).join(''));
      return chunks.length ? chunks : [''];
    });
    for (const line of lines) {
      if (!slide || y + 0.39 > 6.95) page();
      slide!.addText((bullet ? '• ' : '') + line, { x: 0.7, y, w: 11.9, h: 0.38, fontSize: 18, color: '292524', margin: 0, breakLine: false, fit: 'shrink' });
      y += 0.4;
    }
    y += 0.12;
  };
  const visit = async (node: Element): Promise<void> => {
    if (node.tagName === 'HR') { if (pendingHeading) page(); slide = undefined; return; }
    if (/^H[12]$/.test(node.tagName)) { if (pendingHeading) page(); heading = node.textContent?.trim() || title; slide = undefined; pendingHeading = true; return; }
    if (node.tagName === 'IMG') {
      const src = await noteImageDataUrl(node.getAttribute('src') || '');
      if (!src) { warnings.add('외부 URL 이미지는 내보내기에서 제외했습니다.'); return; }
      const current = page();
      // Contain the image in the available content rectangle, preserving its ratio.
      const img = new Image(); img.src = src;
      try { await img.decode(); } catch { warnings.add('읽을 수 없는 이미지는 제외했습니다.'); return; }
      const ratio = Math.min(11.9 / img.naturalWidth, 5.5 / img.naturalHeight);
      const w = img.naturalWidth * ratio, h = img.naturalHeight * ratio;
      current.addImage({ data: src, x: (13.333 - w) / 2, y: 1.25 + (5.5 - h) / 2, w, h });
      slide = undefined; return;
    }
    if (node.tagName === 'TABLE') {
      const rows = Array.from(node.querySelectorAll('tr')).map(row => Array.from(row.cells).map(cell => cell.textContent || ''));
      if (!rows.length) return;
      // Split very long cells first, then let PowerPoint paginate editable rows.
      const outputRows: string[][] = [];
      for (const row of rows) {
        const longest = Math.max(...row.map(cell => Array.from(cell).length));
        const perLine = Math.max(4, Math.floor(65 / row.length));
        const chunkSize = perLine * 8;
        for (let offset = 0; offset < Math.max(longest, 1); offset += chunkSize) {
          outputRows.push(row.map(cell => Array.from(cell).slice(offset, offset + chunkSize).join('')));
        }
      }
      const columns = Math.max(...outputRows.map(row => row.length));
      const tableSlide = page();
      tableSlide.addTable(outputRows.map(row => Array.from({ length: columns }, (_, i) => ({ text: row[i] || '' }))), {
        x: 0.65, y: 1.4, w: 12, h: 5.3, fontSize: 16, border: { pt: 1, color: 'D6D3D1' },
        fill: { color: 'FFFFFF' }, color: '292524', margin: 0.12, autoPage: true, autoPageSlideStartY: 1.4,
      });
      count += tableSlide.newAutoPagedSlides.length;
      slide = undefined; return;
    }
    if (node.tagName === 'BLOCKQUOTE' && node.textContent?.includes('발표자 메모')) {
      if (!slide) page();
      slide!.addNotes(node.textContent.replace(/^발표자 메모\s*/, '')); return;
    }
    if (node.querySelector('img,table') || ['UL', 'OL', 'DIV', 'SECTION'].includes(node.tagName)) {
      for (const child of Array.from(node.childNodes)) {
        if (child.nodeType === 1) await visit(child as Element);
        else if (child.textContent?.trim()) text(child.textContent);
      }
      return;
    }
    const value = (node as HTMLElement).innerText || node.textContent || '';
    if (value.trim()) text(value, node.tagName === 'LI');
  };
  for (const node of Array.from(root.children)) await visit(node);
  if (!count || pendingHeading) page();
  return { pptx, warnings: Array.from(warnings), slideCount: count };
}
