import JSZip from 'jszip';

const MAX_WORKSHEETS = 20;
const MAX_ROWS_PER_SHEET = 5_000;
const MAX_COLUMNS_PER_SHEET = 100;
const MAX_TOTAL_CELLS = 100_000;
const ROW_YIELD_INTERVAL = 200;

export interface XlsxImportProgress {
  sheetIndex: number;
  sheetCount: number;
  rowsProcessed: number;
  totalRows: number;
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]!));

function parseXml(source: string): Document {
  const document = new DOMParser().parseFromString(source, 'application/xml');
  if (document.querySelector('parsererror')) throw new Error('엑셀 파일의 XML을 읽을 수 없습니다.');
  return document;
}

function resolveWorkbookPart(target: string): string {
  const parts = target.startsWith('/') ? [] : ['xl'];
  for (const part of target.replace(/^\//, '').split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') parts.pop();
    else parts.push(part);
  }
  return parts.join('/');
}

function columnIndex(reference: string): number {
  const letters = reference.match(/^[A-Z]+/i)?.[0]?.toUpperCase() || 'A';
  let index = 0;
  for (const letter of letters) index = index * 26 + letter.charCodeAt(0) - 64;
  return index - 1;
}

/** Reads cached cell values from an Office Open XML workbook and renders sheets as editor tables. */
export async function xlsxToEditorHtml(data: ArrayBuffer, onProgress?: (progress: XlsxImportProgress) => void): Promise<{ html: string; sheetCount: number; truncated: boolean }> {
  if (data.byteLength > 50 * 1024 * 1024) throw new Error('50MB 이하의 XLSX 파일을 선택해주세요.');

  let zip: JSZip;
  try { zip = await JSZip.loadAsync(data); }
  catch { throw new Error('XLSX 파일을 열 수 없습니다. 암호가 설정되지 않은 .xlsx 파일인지 확인해주세요.'); }

  const workbookFile = zip.file('xl/workbook.xml');
  const relationshipsFile = zip.file('xl/_rels/workbook.xml.rels');
  if (!workbookFile || !relationshipsFile) throw new Error('유효한 XLSX 파일이 아닙니다.');

  const workbook = parseXml(await workbookFile.async('string'));
  const relationships = parseXml(await relationshipsFile.async('string'));
  const relationshipTargets = new Map<string, string>();
  for (const relation of Array.from(relationships.getElementsByTagNameNS('*', 'Relationship'))) {
    const id = relation.getAttribute('Id');
    const target = relation.getAttribute('Target');
    if (id && target && relation.getAttribute('TargetMode') !== 'External') relationshipTargets.set(id, resolveWorkbookPart(target));
  }

  const sharedStringsFile = zip.file('xl/sharedStrings.xml');
  const sharedStrings = sharedStringsFile
    ? Array.from(parseXml(await sharedStringsFile.async('string')).getElementsByTagNameNS('*', 'si'))
        .map(item => Array.from(item.getElementsByTagNameNS('*', 't')).map(text => text.textContent || '').join(''))
    : [];

  const sheets = Array.from(workbook.getElementsByTagNameNS('*', 'sheet')).slice(0, MAX_WORKSHEETS);
  if (!sheets.length) throw new Error('엑셀 통합 문서에 시트가 없습니다.');

  let totalCells = 0;
  let truncated = sheets.length < workbook.getElementsByTagNameNS('*', 'sheet').length;
  const sections: string[] = [];

  for (const [sheetIndex, sheet] of sheets.entries()) {
    const name = sheet.getAttribute('name') || `시트 ${sheetIndex + 1}`;
    const relationId = sheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id')
      || sheet.getAttribute('r:id');
    const sheetPath = relationId ? relationshipTargets.get(relationId) : undefined;
    const sheetFile = sheetPath ? zip.file(sheetPath) : null;
    if (!sheetFile) continue;

    const sheetXml = parseXml(await sheetFile.async('string'));
    const rowNodes = Array.from(sheetXml.getElementsByTagNameNS('*', 'row'));
    if (rowNodes.length > MAX_ROWS_PER_SHEET) truncated = true;
    const rows: string[][] = [];
    let maxColumns = 0;
    const rowsToRead = Math.min(rowNodes.length, MAX_ROWS_PER_SHEET);
    if (rowNodes.length > MAX_ROWS_PER_SHEET) truncated = true;
    onProgress?.({ sheetIndex: sheetIndex + 1, sheetCount: sheets.length, rowsProcessed: 0, totalRows: rowsToRead });
    for (let rowIndex = 0; rowIndex < rowsToRead; rowIndex++) {
      const rowNode = rowNodes[rowIndex];
      const cells: string[] = [];
      for (const cell of Array.from(rowNode.children).filter(child => child.localName === 'c')) {
        const ref = cell.getAttribute('r') || 'A1';
        const index = columnIndex(ref);
        if (index >= MAX_COLUMNS_PER_SHEET) { truncated = true; continue; }
        const type = cell.getAttribute('t');
        const valueNode = Array.from(cell.children).find(child => child.localName === 'v');
        let value = valueNode?.textContent || '';
        if (type === 's') value = sharedStrings[Number(value)] || '';
        else if (type === 'inlineStr') value = Array.from(cell.getElementsByTagNameNS('*', 't')).map(text => text.textContent || '').join('');
        else if (type === 'b') value = value === '1' ? 'TRUE' : 'FALSE';
        cells[index] = value;
      }
      maxColumns = Math.max(maxColumns, cells.length);
      rows.push(cells);
      const estimatedTotalCells = totalCells + rows.length * maxColumns;
      if (estimatedTotalCells > MAX_TOTAL_CELLS) throw new Error('시트가 너무 큽니다. 필요한 범위를 CSV로 저장해 나누어 가져와주세요.');
      if ((rowIndex + 1) % ROW_YIELD_INTERVAL === 0) {
        onProgress?.({ sheetIndex: sheetIndex + 1, sheetCount: sheets.length, rowsProcessed: rowIndex + 1, totalRows: rowsToRead });
        await new Promise<void>(resolve => setTimeout(resolve, 0));
      }
    }

    if (!rows.length) continue;
    totalCells += rows.length * maxColumns;
    if (totalCells > MAX_TOTAL_CELLS) throw new Error('시트가 너무 큽니다. 필요한 범위를 CSV로 저장해 나누어 가져와주세요.');

    const tableRows = rows.map((row, rowIndex) => {
      const tag = rowIndex === 0 ? 'th' : 'td';
      const cells = Array.from({ length: maxColumns }, (_, index) => `<${tag}>${escapeHtml(row[index] || '') || '<br>'}</${tag}>`).join('');
      return `<tr>${cells}</tr>`;
    }).join('');
    sections.push(`<h2>${escapeHtml(name)}</h2><table><tbody>${tableRows}</tbody></table><p></p>`);
  }

  if (!sections.length) throw new Error('가져올 수 있는 시트 데이터가 없습니다.');
  return { html: sections.join(''), sheetCount: sections.length, truncated };
}
