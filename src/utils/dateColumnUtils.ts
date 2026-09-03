/**
 * WonBee (원비) - Date & Updated-At Column Management Utilities
 * Automatically manages '수정일' / '업데이트 일' down to Year-Month-Day Hour:Minute (YYYY-MM-DD HH:mm).
 * Supports manual editing while auto-updating to current datetime if not manually entered.
 */

import { TableColumn, TableDocument, TableRow } from '../types';

/**
 * Formats a Date or timestamp to YYYY-MM-DD HH:mm (년월일 시분)
 * Example: 2026-09-03 10:05
 */
export function formatDateTime(date: Date | number = new Date()): string {
  const d = typeof date === 'number' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

/**
 * Checks if a column is an auto-updating date/time column
 * Matches explicit autoUpdateDate flag or names like "수정일", "수정 일", "수정일시", "업데이트 일", "updatedAt", etc.
 */
export function isUpdateDateColumn(col?: TableColumn | null): boolean {
  if (!col) return false;
  if (col.autoUpdateDate) return true;
  const trimmed = col.name.trim().toLowerCase();
  return (
    trimmed.includes('수정일') ||
    trimmed.includes('수정 일') ||
    trimmed.includes('수정일시') ||
    trimmed.includes('수정 일시') ||
    trimmed.includes('수정일자') ||
    trimmed.includes('수정 일자') ||
    trimmed.includes('업데이트일') ||
    trimmed.includes('업데이트 일') ||
    trimmed.includes('업데이트일시') ||
    trimmed.includes('업데이트 일시') ||
    trimmed.includes('최근 수정') ||
    trimmed === 'updatedat' ||
    trimmed === 'updated_at' ||
    trimmed === '수정'
  );
}

/**
 * Finds the first column designated as an update date/time column in the list
 */
export function findUpdateDateColumn(columns: TableColumn[]): TableColumn | undefined {
  return columns.find((c) => isUpdateDateColumn(c));
}

/**
 * Ensures that a table has an update date/time column ('수정일').
 * If one does not exist, it appends a '수정일' column and initializes existing rows.
 */
export function ensureUpdateDateColumnInTable(table: TableDocument): {
  table: TableDocument;
  updateCol: TableColumn;
  created: boolean;
} {
  const existingCol = findUpdateDateColumn(table.columns);
  if (existingCol) {
    return { table, updateCol: existingCol, created: false };
  }

  const newColId = `col-updated-at`;
  const newCol: TableColumn = {
    id: newColId,
    name: '수정일',
    type: 'date',
    width: 155,
    autoUpdateDate: true,
  };

  const updatedColumns = [...table.columns, newCol];
  const updatedRows = table.rows.map((row) => {
    if (!row.data[newColId]) {
      return {
        ...row,
        data: {
          ...row.data,
          [newColId]: formatDateTime(row.updatedAt || row.createdAt || Date.now()),
        },
      };
    }
    return row;
  });

  const updatedTable: TableDocument = {
    ...table,
    columns: updatedColumns,
    rows: updatedRows,
    updatedAt: Date.now(),
  };

  return { table: updatedTable, updateCol: newCol, created: true };
}

/**
 * Handles updating row data with auto-update date logic:
 * - If editedColId === updateCol.id: Keep user's manually entered value (수정 가능)
 * - If editedColId !== updateCol.id: Automatically update the update date column to current datetime (년월일 시분)
 */
export function applyAutoUpdateDateToRow(
  table: TableDocument,
  rowId: string,
  updatedData: Record<string, any>,
  editedColId?: string,
  extraRowFields?: Partial<TableRow>
): {
  updatedTable: TableDocument;
  updatedRow: TableRow;
  updateColId: string;
} {
  // Ensure table has an update date column
  const { table: tableWithCol, updateCol } = ensureUpdateDateColumnInTable(table);
  const nowFormatted = formatDateTime(new Date());

  const finalData = { ...updatedData };

  if (editedColId === updateCol.id) {
    // User explicitly modified the update date column: keep their manual input
    // If user cleared it or left it empty, fall back to current datetime
    if (!finalData[updateCol.id] || String(finalData[updateCol.id]).trim() === '') {
      finalData[updateCol.id] = nowFormatted;
    }
  } else {
    // User modified another column or general data: auto-update to current datetime
    finalData[updateCol.id] = nowFormatted;
  }

  let updatedRow: TableRow | null = null;
  const updatedRows = tableWithCol.rows.map((r) => {
    if (r.id === rowId) {
      updatedRow = {
        ...r,
        ...extraRowFields,
        data: finalData,
        updatedAt: Date.now(),
      };
      return updatedRow;
    }
    return r;
  });

  // If row not found (e.g. newly created row being added)
  if (!updatedRow) {
    updatedRow = {
      id: rowId,
      data: finalData,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      ...extraRowFields,
    };
  }

  const updatedTable: TableDocument = {
    ...tableWithCol,
    rows: updatedRows,
    updatedAt: Date.now(),
  };

  return {
    updatedTable,
    updatedRow,
    updateColId: updateCol.id,
  };
}
