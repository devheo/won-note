import { TableColumn, TableRow } from '../types';
import { cleanTextValue } from './textSanitizer';

/**
 * Escapes a field string for standard RFC 4180 CSV
 */
export function escapeCsvField(val: any): string {
  if (val === null || val === undefined) return '';
  let str = '';
  if (typeof val === 'object') {
    str = JSON.stringify(val);
  } else {
    str = cleanTextValue(val);
  }

  // If contains commas, double quotes, or newlines, wrap in quotes and double internal quotes
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Convert rows to RFC 4180 CSV with UTF-8 BOM for Microsoft Excel compatibility
 */
export function formatRowsAsCsv(columns: TableColumn[], rows: TableRow[]): string {
  const visibleCols = columns;
  const headerLine = visibleCols.map((c) => escapeCsvField(c.name)).join(',');

  const rowLines = rows.map((r) => {
    return visibleCols
      .map((c) => {
        const val = r.data[c.id];
        return escapeCsvField(val);
      })
      .join(',');
  });

  return [headerLine, ...rowLines].join('\r\n');
}

/**
 * Convert rows to human-readable TXT format
 */
export function formatRowsAsTxt(
  tableName: string,
  columns: TableColumn[],
  rows: TableRow[]
): string {
  const divider = '='.repeat(48);
  const subDivider = '-'.repeat(48);

  const lines: string[] = [];
  lines.push(divider);
  lines.push(`[테이블: ${tableName}] 데이터 내보내기 (총 ${rows.length}개 행)`);
  lines.push(`내보낸 시간: ${new Date().toLocaleString('ko-KR')}`);
  lines.push(divider);
  lines.push('');

  rows.forEach((r, idx) => {
    lines.push(`▶ 레코드 #${idx + 1} (ID: ${r.id})`);
    columns.forEach((col) => {
      const val = r.data[col.id];
      const cleaned = val === null || val === undefined ? '(비어 있음)' : cleanTextValue(val);
      const isPk = col.isPrimaryKey ? ' [기본키 PK]' : '';
      
      // If multi-line value, indent subsequent lines
      if (cleaned.includes('\n')) {
        const indented = cleaned
          .split('\n')
          .map((line, lIdx) => (lIdx === 0 ? line : `    ${line}`))
          .join('\n');
        lines.push(`  • ${col.name}${isPk}:\n    ${indented}`);
      } else {
        lines.push(`  • ${col.name}${isPk}: ${cleaned}`);
      }
    });
    lines.push(subDivider);
  });

  return lines.join('\n');
}

/**
 * Triggers a browser file download
 */
export function downloadFile(
  filename: string,
  content: string,
  mimeType: string,
  withBom = false
): void {
  const blobData = withBom ? ['\uFEFF' + content] : [content];
  const blob = new Blob(blobData, { type: `${mimeType};charset=utf-8;` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Download rows as a CSV file
 */
export function downloadRowsAsCsv(
  baseName: string,
  columns: TableColumn[],
  rows: TableRow[]
): void {
  const csvContent = formatRowsAsCsv(columns, rows);
  const safeName = (baseName || 'table_data').replace(/[^\w\s가-힣-]/g, '_').trim();
  downloadFile(`${safeName}_${Date.now()}.csv`, csvContent, 'text/csv', true);
}

/**
 * Download rows as a TXT file
 */
export function downloadRowsAsTxt(
  tableName: string,
  columns: TableColumn[],
  rows: TableRow[]
): void {
  const txtContent = formatRowsAsTxt(tableName, columns, rows);
  const safeName = (tableName || 'table_data').replace(/[^\w\s가-힣-]/g, '_').trim();
  downloadFile(`${safeName}_${Date.now()}.txt`, txtContent, 'text/plain;charset=utf-8');
}

/**
 * Copy rows to clipboard as CSV
 */
export async function copyRowsAsCsv(
  columns: TableColumn[],
  rows: TableRow[]
): Promise<void> {
  const csvContent = formatRowsAsCsv(columns, rows);
  await navigator.clipboard.writeText(csvContent);
}

/**
 * Copy rows to clipboard as TXT
 */
export async function copyRowsAsTxt(
  tableName: string,
  columns: TableColumn[],
  rows: TableRow[]
): Promise<void> {
  const txtContent = formatRowsAsTxt(tableName, columns, rows);
  await navigator.clipboard.writeText(txtContent);
}
