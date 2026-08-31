import { TableColumn, TableRow, ColumnType, ColumnOption } from '../types';

export interface ParseResult {
  delimiter: string;
  delimiterName: string;
  columns: TableColumn[];
  rows: TableRow[];
  totalRows: number;
}

/**
 * Robust RFC-4180 compliant CSV / TSV / Delimited Text Parser.
 * Handles multi-line cell values enclosed in quotes ("..."),
 * escaped quotes (""), mixed delimiters, and whitespace.
 */
export function parseDelimitedText(
  rawText: string,
  options?: {
    forcedDelimiter?: 'auto' | 'tab' | 'comma' | 'pipe' | 'semicolon' | 'space';
    hasHeader?: boolean;
    defaultTableName?: string;
  }
): ParseResult {
  const text = rawText || '';
  if (!text.trim()) {
    return {
      delimiter: ',',
      delimiterName: '쉼표 (CSV)',
      columns: [],
      rows: [],
      totalRows: 0,
    };
  }

  const forcedDel = options?.forcedDelimiter || 'auto';
  const hasHeader = options?.hasHeader !== false;

  // 1. Detect Delimiter (analyzing only characters outside double quotes)
  let activeDelimiter = ',';
  let delimiterName = '쉼표 (CSV)';

  if (forcedDel !== 'auto') {
    switch (forcedDel) {
      case 'tab':
        activeDelimiter = '\t';
        delimiterName = '탭 (Tab / TSV / 엑셀)';
        break;
      case 'comma':
        activeDelimiter = ',';
        delimiterName = '쉼표 (CSV)';
        break;
      case 'pipe':
        activeDelimiter = '|';
        delimiterName = '파이프 (| / 마크다운)';
        break;
      case 'semicolon':
        activeDelimiter = ';';
        delimiterName = '세미콜론 (;)';
        break;
      case 'space':
        activeDelimiter = ' ';
        delimiterName = '공백 (Space)';
        break;
    }
  } else {
    // Count delimiters outside quotes in first ~2000 chars
    let inQuote = false;
    let commaCount = 0;
    let tabCount = 0;
    let pipeCount = 0;
    let semicolonCount = 0;

    const sample = text.slice(0, 4000);
    for (let i = 0; i < sample.length; i++) {
      const ch = sample[i];
      if (ch === '"') {
        if (inQuote && sample[i + 1] === '"') {
          i++; // escaped quote
        } else {
          inQuote = !inQuote;
        }
      } else if (!inQuote) {
        if (ch === ',') commaCount++;
        else if (ch === '\t') tabCount++;
        else if (ch === '|') pipeCount++;
        else if (ch === ';') semicolonCount++;
      }
    }

    if (tabCount >= commaCount && tabCount >= pipeCount && tabCount >= semicolonCount && tabCount > 0) {
      activeDelimiter = '\t';
      delimiterName = '탭 (Tab / TSV / 엑셀 복사)';
    } else if (commaCount >= pipeCount && commaCount >= semicolonCount && commaCount > 0) {
      activeDelimiter = ',';
      delimiterName = '쉼표 (CSV)';
    } else if (pipeCount >= semicolonCount && pipeCount > 0) {
      activeDelimiter = '|';
      delimiterName = '파이프 (| / 마크다운 표)';
    } else if (semicolonCount > 0) {
      activeDelimiter = ';';
      delimiterName = '세미콜론 (;)';
    } else {
      activeDelimiter = ',';
      delimiterName = '쉼표 (CSV)';
    }
  }

  // 2. Full RFC-4180 State Machine Parsing
  const rawGrid: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let insideQuote = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (insideQuote && nextChar === '"') {
        // Escaped quote: "" -> "
        currentCell += '"';
        i++;
      } else {
        // Toggle quote state
        insideQuote = !insideQuote;
      }
    } else if (char === activeDelimiter && !insideQuote) {
      // Cell delimiter reached
      currentRow.push(cleanCell(currentCell, activeDelimiter));
      currentCell = '';
    } else if ((char === '\r' || char === '\n') && !insideQuote) {
      // Row delimiter reached outside quotes
      if (char === '\r' && nextChar === '\n') {
        i++; // skip \n of \r\n
      }
      currentRow.push(cleanCell(currentCell, activeDelimiter));
      currentCell = '';

      // Skip markdown separator lines like |---|---|
      const isMdDivider =
        activeDelimiter === '|' &&
        currentRow.every((cell) => !cell || /^:?-+:?$/.test(cell.trim()));

      // Only push non-empty rows
      if (!isMdDivider && (currentRow.length > 1 || (currentRow.length === 1 && currentRow[0] !== ''))) {
        rawGrid.push(currentRow);
      }
      currentRow = [];
    } else {
      currentCell += char;
    }
  }

  // Flush remaining cell/row
  if (currentCell !== '' || currentRow.length > 0) {
    currentRow.push(cleanCell(currentCell, activeDelimiter));
    const isMdDivider =
      activeDelimiter === '|' &&
      currentRow.every((cell) => !cell || /^:?-+:?$/.test(cell.trim()));
    if (!isMdDivider && (currentRow.length > 1 || (currentRow.length === 1 && currentRow[0] !== ''))) {
      rawGrid.push(currentRow);
    }
  }

  if (rawGrid.length === 0) {
    return {
      delimiter: activeDelimiter,
      delimiterName,
      columns: [],
      rows: [],
      totalRows: 0,
    };
  }

  // Clean empty markdown outer cells (e.g. `| a | b |` produces empty leading/trailing tokens)
  let cleanGrid = rawGrid;
  if (activeDelimiter === '|') {
    cleanGrid = rawGrid.map((row) => {
      let r = [...row];
      if (r.length > 0 && r[0] === '') r.shift();
      if (r.length > 0 && r[r.length - 1] === '') r.pop();
      return r;
    });
  }

  // 3. Determine Headers and Data Rows
  let headers: string[] = [];
  let dataGrid: string[][] = [];

  if (hasHeader && cleanGrid.length > 0) {
    headers = cleanGrid[0];
    dataGrid = cleanGrid.slice(1);
  } else {
    const maxTokens = Math.max(...cleanGrid.map((r) => r.length), 1);
    headers = Array.from({ length: maxTokens }, (_, i) => `열 ${i + 1}`);
    dataGrid = cleanGrid;
  }

  // Ensure header names are unique and valid
  const colCount = Math.max(headers.length, ...dataGrid.map((r) => r.length), 1);
  while (headers.length < colCount) {
    headers.push(`열 ${headers.length + 1}`);
  }

  // Auto-detect column types based on row values
  const columns: TableColumn[] = headers.map((rawHeader, idx) => {
    const colName = rawHeader.trim() || `열 ${idx + 1}`;
    const colId = `col-${idx}-${Date.now().toString(36)}`;

    // Sample column values to determine appropriate column type
    const sampleValues = dataGrid.slice(0, 50).map((row) => row[idx] || '').filter(Boolean);
    const colType = inferColumnType(colName, sampleValues, idx);

    // Auto-generate options for select / status columns based on unique distinct values
    let options: ColumnOption[] | undefined = undefined;
    if (colType === 'select' || colType === 'status') {
      const distinctVals = Array.from(new Set(sampleValues.map((s) => s.trim()).filter(Boolean)));
      const palette = ['#F59E0B', '#3B82F6', '#10B981', '#8B5CF6', '#EC4899', '#06B6D4', '#6366F1', '#14B8A6'];
      options = distinctVals.map((val, vIdx) => ({
        id: val,
        label: val,
        color: palette[vIdx % palette.length],
      }));
    }

    return {
      id: colId,
      name: colName,
      type: colType,
      width: idx === 0 ? 180 : colType === 'richText' ? 320 : 160,
      options,
      isPrimaryKey: idx === 0,
    };
  });

  // 4. Map into WonBee TableRows
  const now = Date.now();
  const rows: TableRow[] = dataGrid.map((rowCells, rIdx) => {
    const data: Record<string, any> = {};
    columns.forEach((col, cIdx) => {
      const rawVal = rowCells[cIdx] !== undefined ? rowCells[cIdx] : '';
      data[col.id] = rawVal;
    });

    return {
      id: `row-import-${rIdx}-${now.toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      data,
      richContent: '',
      stickers: [],
      createdAt: now - (dataGrid.length - rIdx) * 1000,
      updatedAt: now,
    };
  });

  return {
    delimiter: activeDelimiter,
    delimiterName,
    columns,
    rows,
    totalRows: rows.length,
  };
}

function cleanCell(cell: string, delimiter: string): string {
  let val = cell;
  // In space delimiter or pipe delimiter, trim ends
  if (delimiter === ' ' || delimiter === '|') {
    val = val.trim();
  }
  // Trim outer quotes if they were wrapping the cell
  if (val.startsWith('"') && val.endsWith('"') && val.length >= 2) {
    val = val.slice(1, -1);
  }
  return val;
}

function inferColumnType(colName: string, values: string[], colIndex: number): ColumnType {
  const lowerName = colName.toLowerCase();

  // Name heuristics
  if (lowerName.includes('상태') || lowerName.includes('status') || lowerName.includes('진행')) {
    return 'status';
  }
  if (lowerName.includes('우선순위') || lowerName.includes('priority') || lowerName.includes('분류') || lowerName.includes('구분') || lowerName.includes('category')) {
    return 'select';
  }
  if (lowerName.includes('날짜') || lowerName.includes('일자') || lowerName.includes('date') || lowerName.includes('마감')) {
    return 'date';
  }
  if (lowerName.includes('여부') || lowerName.includes('완료') || lowerName.includes('check') || lowerName.includes('동의')) {
    return 'checkbox';
  }
  if (
    lowerName.includes('내용') ||
    lowerName.includes('처리방법') ||
    lowerName.includes('설명') ||
    lowerName.includes('desc') ||
    lowerName.includes('detail') ||
    lowerName.includes('메모') ||
    lowerName.includes('비고') ||
    lowerName.includes('기타')
  ) {
    return 'richText';
  }

  // Value heuristics
  if (values.length > 0) {
    const hasMultiLine = values.some((v) => v.includes('\n'));
    if (hasMultiLine) return 'richText';

    const isAllNumeric = values.every((v) => /^-?\d+(\.\d+)?$/.test(v.trim()));
    if (isAllNumeric && !colName.includes('번호') && !colName.includes('코드') && !colName.includes('id') && !colName.includes('순번')) {
      return 'number';
    }

    const isAllDate = values.every((v) => /^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/.test(v.trim()));
    if (isAllDate) return 'date';

    const isAllBool = values.every((v) => ['y', 'n', 'true', 'false', '1', '0', '완료', '미완료', 'o', 'x'].includes(v.trim().toLowerCase()));
    if (isAllBool) return 'checkbox';
  }

  return 'text';
}
