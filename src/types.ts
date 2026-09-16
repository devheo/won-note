/**
 * WonBee (원비) - Type Definitions
 * Minimalist Workspace & Data Grid Architecture
 */

export type ItemType = 'table' | 'folder' | 'document';

export interface TreeItem {
  id: string;
  parentId: string | null;
  title: string;
  type: ItemType;
  icon?: string;
  color?: string;
  children?: string[]; // Child item IDs for ordering
  isExpanded?: boolean;
  createdAt: number;
  updatedAt: number;
}

export type ColumnType = 'text' | 'number' | 'select' | 'status' | 'date' | 'checkbox' | 'richText' | 'code';

export type RowDensity = 'compact' | 'normal' | 'spacious';

export interface ColumnOption {
  id: string;
  label: string;
  color: string; // Tailwind color or hex
}

export interface TableColumn {
  id: string;
  name: string;
  type: ColumnType;
  width: number;
  options?: ColumnOption[]; // For select & status types
  format?: string;
  isPrimaryKey?: boolean;
  autoUpdateDate?: boolean; // Automatically manages modification date/time
}

export interface TableRow {
  id: string;
  data: Record<string, any>;
  richContent?: string; // HTML / JSON string for rich editor
  stickers?: StickerData[];
  createdAt: number;
  updatedAt: number;
}

export interface StickerData {
  id: string;
  title: string;
  content: string;
  color: 'yellow' | 'amber' | 'green' | 'blue' | 'rose' | 'purple';
  position: { x: number; y: number };
  width?: number;
  height?: number;
  isPinned?: boolean;
  tags?: string[];
  completed?: boolean;
}

export type CalendarCategory = 'work' | 'meeting' | 'personal' | 'deadline' | 'urgent' | 'etc';

export type ReminderOffset =
  | 'none'
  | 'on_time'
  | '5m'
  | '10m'
  | '15m'
  | '30m'
  | '1h'
  | '2h'
  | '1d';

export interface CalendarReminder {
  enabled: boolean;
  offset: ReminderOffset;
  sound?: boolean;
  snoozeUntil?: number; // timestamp in ms if snoozed
}

export interface CalendarEvent {
  id: string;
  tableRowId?: string; // Linkage to parent table row if generated from or synced to table
  title: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  startTime?: string; // HH:mm (e.g. "09:30")
  endTime?: string; // HH:mm (e.g. "11:00")
  isAllDay: boolean;
  category: CalendarCategory;
  color?: string; // Custom color override (hex or tailwind)
  location?: string;
  description?: string;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  completed?: boolean;
  reminder?: CalendarReminder;
  createdAt: number;
  updatedAt: number;
}

export type CalendarMacroType =
  | 'recurring'
  | 'shift'
  | 'date_shift'
  | 'bulk_text'
  | 'ics_sync'
  | 'cleanup';

export interface TableDocument {
  id: string;
  title: string;
  description?: string;
  columns: TableColumn[];
  rows: TableRow[];
  defaultView?: 'grid' | 'cards' | 'calendar';
  createdAt: number;
  updatedAt: number;
}

export interface WorkspaceData {
  version: string;
  exportedAt?: number;
  author?: string;
  tree: TreeItem[];
  tables: Record<string, TableDocument>;
  settings?: {
    theme?: 'light' | 'dark' | 'system';
    zoom?: number;
    useServer?: boolean;
    serverUrl?: string;
  };
}

export type AutoSaveStatus = 'saved' | 'saving' | 'error' | 'idle';

export interface StorageConfig {
  useServer: boolean;
  serverUrl?: string;
  apiKey?: string;
}

export interface UserEnvData {
  version: string;
  theme: 'light' | 'dark';
  zoomLevel: number;
  activeTableId: string | null;
  rowDensity: RowDensity;
  // tableId -> { colId -> width }
  columnWidths: Record<string, Record<string, number>>;
  // tableId -> hidden colIds[]
  hiddenColumns: Record<string, string[]>;
  updatedAt: number;
}

export type UserData = WorkspaceData;

/**
 * Storage Repository Interface (Repository Pattern)
 * Provides transparent data operations regardless of local IndexedDB or remote API backend.
 */
export interface IWorkspaceRepository {
  loadWorkspace(): Promise<WorkspaceData>;
  saveWorkspace(data: WorkspaceData): Promise<void>;
  getTable(tableId: string): Promise<TableDocument | null>;
  saveTable(table: TableDocument): Promise<void>;
  deleteTable(tableId: string): Promise<void>;
  saveTree(tree: TreeItem[]): Promise<void>;
  mergeWorkspace(imported: WorkspaceData, mode: 'merge' | 'replace' | 'keep_both'): Promise<WorkspaceData>;
  getStorageInfo(): Promise<{ type: 'indexeddb' | 'server'; status: 'connected' | 'offline'; totalItems: number; sizeBytes?: number }>;
}
