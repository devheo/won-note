import type { TableDocument, TableRow } from '../types';

const encoder = new TextEncoder();
const rowMetricsCache = new WeakMap<TableRow, { bytes: number; chars: number; lines: number }>();

/** Estimate JSON storage bytes while reusing serialized row sizes across table renders. */
export function estimateTableJsonMetrics(table: TableDocument): { bytes: number; chars: number; lines: number } {
  const { rows = [], ...metadata } = table;
  const baseJson = JSON.stringify({ ...metadata, rows: [] });
  const baseBytes = encoder.encode(baseJson).length;
  let rowBytes = 0;
  let rowChars = 0;
  let rowLines = 0;
  for (const row of rows) {
    let metrics = rowMetricsCache.get(row);
    if (!metrics) {
      const json = JSON.stringify(row);
      metrics = { bytes: encoder.encode(json).length, chars: json.length, lines: (json.match(/\n/g) || []).length };
      rowMetricsCache.set(row, metrics);
    }
    rowBytes += metrics.bytes;
    rowChars += metrics.chars;
    rowLines += metrics.lines;
  }
  const separators = Math.max(0, rows.length - 1);
  return {
    bytes: baseBytes + rowBytes + separators,
    chars: baseJson.length + rowChars + separators,
    lines: 1 + rowLines,
  };
}
