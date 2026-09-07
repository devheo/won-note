import { TableColumn, TableRow, ColumnOption } from '../types';
import { cleanTextValue } from './textSanitizer';

export const DEFAULT_OPTION_PALETTE = [
  '#F59E0B', // Amber
  '#3B82F6', // Blue
  '#10B981', // Emerald
  '#8B5CF6', // Purple
  '#EC4899', // Pink
  '#06B6D4', // Cyan
  '#F97316', // Orange
  '#6366F1', // Indigo
  '#14B8A6', // Teal
  '#84CC16', // Lime
  '#64748B', // Slate
];

export function getOptionColorForValue(val: string, index = 0): string {
  if (!val) return '#9CA3AF';
  let hash = 0;
  for (let i = 0; i < val.length; i++) {
    hash = (hash << 5) - hash + val.charCodeAt(i);
  }
  return DEFAULT_OPTION_PALETTE[Math.abs(hash + index) % DEFAULT_OPTION_PALETTE.length];
}

export interface EffectiveColumnOption extends ColumnOption {
  count?: number;
  source: 'cell' | 'configured';
}

/**
 * Extracts and merges all distinct values currently existing in the table's cells
 * for a given column, along with any configured column options.
 *
 * Current cell values present in rows are prioritized and displayed with their frequency count.
 * Unused generic dummy presets (e.g. 대기/진행중/완료 when 0 cells use them) are deprioritized or omitted
 * so users can see and pick from their real cell data.
 */
export function getEffectiveColumnOptions(
  col: TableColumn | undefined,
  rows: TableRow[] = []
): EffectiveColumnOption[] {
  if (!col) return [];

  // 1. Gather all non-empty values from actual rows
  const cellCounts = new Map<string, number>();
  const originalCasing = new Map<string, string>();

  rows.forEach((r) => {
    if (!r.data) return;
    const rawVal = r.data[col.id];
    if (rawVal !== undefined && rawVal !== null && rawVal !== '') {
      const clean = cleanTextValue(rawVal).trim();
      if (clean) {
        const key = clean.toLowerCase();
        cellCounts.set(key, (cellCounts.get(key) || 0) + 1);
        if (!originalCasing.has(key)) {
          originalCasing.set(key, clean);
        }
      }
    }
  });

  const result: EffectiveColumnOption[] = [];
  const processedKeys = new Set<string>();

  // 2. Map existing configured options if they match or to retain their custom colors
  const configuredOptions = col.options || [];
  const configuredMap = new Map<string, ColumnOption>();
  configuredOptions.forEach((opt) => {
    if (opt.id) configuredMap.set(opt.id.toLowerCase(), opt);
    if (opt.label) configuredMap.set(opt.label.toLowerCase(), opt);
  });

  // 3. First, add all values actually present in current cells (ordered by frequency then appearance)
  const sortedKeys = Array.from(cellCounts.keys()).sort((a, b) => {
    return (cellCounts.get(b) || 0) - (cellCounts.get(a) || 0);
  });

  sortedKeys.forEach((key, idx) => {
    processedKeys.add(key);
    const label = originalCasing.get(key) || key;
    const configured = configuredMap.get(key);
    const count = cellCounts.get(key) || 0;

    result.push({
      id: configured?.id || label,
      label: configured?.label || label,
      color: configured?.color || getOptionColorForValue(label, idx),
      count,
      source: 'cell',
    });
  });

  // 4. If there are NO rows or NO cells with values yet, retain configured options
  if (cellCounts.size === 0) {
    configuredOptions.forEach((opt, idx) => {
      const key = (opt.label || opt.id || '').toLowerCase();
      if (!processedKeys.has(key) && key) {
        processedKeys.add(key);
        result.push({
          id: opt.id || opt.label,
          label: opt.label || opt.id,
          color: opt.color || getOptionColorForValue(opt.label || opt.id, idx),
          count: 0,
          source: 'configured',
        });
      }
    });
  } else {
    // If cells have data, include configured options only if they were explicitly defined and not dummy
    // But check if they are the default "대기/진행중/완료" which user didn't want when cell data exists:
    const isGenericDefault = (optLabel: string) => {
      const lower = optLabel.toLowerCase().trim();
      return ['대기', '대기중', 'todo', '진행중', '진행', 'progress', 'in progress', '완료', '완료됨', 'done'].includes(lower);
    };

    configuredOptions.forEach((opt, idx) => {
      const key = (opt.label || opt.id || '').toLowerCase();
      if (!processedKeys.has(key) && key) {
        // Only include if it's not an unused generic default when other real cell values exist
        if (!isGenericDefault(opt.label || opt.id)) {
          processedKeys.add(key);
          result.push({
            id: opt.id || opt.label,
            label: opt.label || opt.id,
            color: opt.color || getOptionColorForValue(opt.label || opt.id, result.length),
            count: 0,
            source: 'configured',
          });
        }
      }
    });
  }

  return result;
}
