import React, { useState, useMemo, useEffect } from 'react';
import {
  Plus,
  MoreHorizontal,
  Calendar,
  Tag,
  FileText,
  Pin,
  Trash2,
  Maximize2,
  Edit3,
  CheckCircle2,
  Clock,
  AlertCircle,
  HelpCircle,
  Layers,
  Type,
  AlignLeft,
  Hash,
  Sparkles,
} from 'lucide-react';
import { TableDocument, TableColumn, TableRow, ColumnOption } from '../../types';
import { cleanTextValue, extractFirstImageSrc } from '../../utils/textSanitizer';
import { getAllStickersFromRow } from '../../utils/stickerUtils';
import { applyAutoUpdateDateToRow } from '../../utils/dateColumnUtils';
import { getEffectiveColumnOptions } from '../../utils/columnOptionsUtils';

interface KanbanBoardViewerProps {
  table: TableDocument;
  rows: TableRow[];
  onUpdateTable: (updated: TableDocument) => void;
  onOpenRowDetail: (row: TableRow, idx: number) => void;
  onOpenRowEditor: (row: TableRow, colId?: string) => void;
  onDeleteRow?: (rowId: string) => void;
}

const DEFAULT_LANE_COLORS = [
  'bg-amber-500',
  'bg-blue-500',
  'bg-emerald-500',
  'bg-purple-500',
  'bg-rose-500',
  'bg-indigo-500',
  'bg-cyan-500',
  'bg-stone-500',
];

// Helper: Detect if a column looks like a Primary Key, ID, No, or sequence number
export const isIdOrPkColumn = (col: TableColumn): boolean => {
  const lowerName = (col.name || '').toLowerCase().trim();
  const lowerId = (col.id || '').toLowerCase().trim();
  const idPatterns = /^(id|no|pk|seq|code|순번|번호|코드|식별자|아이디|no\.|key)$/i;
  if (idPatterns.test(lowerName)) return true;
  if (/^(col-id|col-no|col-pk|col-seq|id|no)$/i.test(lowerId)) return true;
  if (col.isPrimaryKey && /^(id|no|pk|seq|code|순번|번호)$/i.test(lowerName)) return true;
  if (col.type === 'number' && (lowerName.includes('id') || lowerName.includes('no') || lowerName.includes('번호') || lowerName.includes('순번'))) {
    return true;
  }
  return false;
};

// Helper: Detect if a column name represents meaningful card content/title
const isTitleOrContentColumn = (name: string): boolean => {
  const lower = (name || '').toLowerCase();
  return [
    '내용',
    '제목',
    '작업',
    '항목',
    '할일',
    '과제',
    '이슈',
    '업무',
    '명칭',
    '이름',
    '기능',
    '모듈',
    'title',
    'name',
    'task',
    'content',
    'subject',
    'summary',
    'item',
    'desc',
    'description',
    'todo',
    'feature',
    'module',
  ].some((keyword) => lower.includes(keyword));
};

// Smart heuristic to infer the best Card Title column (avoids PK/No/ID columns)
const inferDefaultTitleColId = (columns: TableColumn[], groupColId: string): string => {
  const candidates = columns.filter((c) => c.id !== groupColId);
  if (candidates.length === 0) return columns[0]?.id || '';

  // 1. Column matching title/content keywords and NOT an ID/PK column
  const namedContentCol = candidates.find(
    (c) => isTitleOrContentColumn(c.name) && !isIdOrPkColumn(c)
  );
  if (namedContentCol) return namedContentCol.id;

  // 2. Any non-ID text or richText column
  const nonIdTextCols = candidates.filter(
    (c) => (c.type === 'text' || c.type === 'richText') && !isIdOrPkColumn(c)
  );
  if (nonIdTextCols.length > 0) {
    const nonPk = nonIdTextCols.find((c) => !c.isPrimaryKey);
    return (nonPk || nonIdTextCols[0]).id;
  }

  // 3. Non-ID column of any type
  const nonIdCols = candidates.filter((c) => !isIdOrPkColumn(c));
  if (nonIdCols.length > 0) return nonIdCols[0].id;

  // 4. Fallback: first candidate
  return candidates[0].id;
};

// Smart heuristic to infer the best Card Body / Description column
const inferDefaultContentColId = (
  columns: TableColumn[],
  groupColId: string,
  titleColId: string
): string => {
  const candidates = columns.filter((c) => c.id !== groupColId && c.id !== titleColId);
  if (candidates.length === 0) return '';

  const contentKeywords = [
    '내용',
    '설명',
    '메모',
    '상세',
    '노트',
    '비고',
    '요약',
    'details',
    'content',
    'desc',
    'description',
    'note',
    'comment',
    'memo',
  ];

  // 1. richText or text column with content keywords
  const namedContent = candidates.find(
    (c) =>
      (c.type === 'richText' || c.type === 'text') &&
      contentKeywords.some((k) => (c.name || '').toLowerCase().includes(k))
  );
  if (namedContent) return namedContent.id;

  // 2. Any richText column
  const richTextCol = candidates.find((c) => c.type === 'richText');
  if (richTextCol) return richTextCol.id;

  // 3. Any text column with content keywords
  const textContent = candidates.find((c) =>
    contentKeywords.some((k) => (c.name || '').toLowerCase().includes(k))
  );
  if (textContent) return textContent.id;

  return '';
};

export const KanbanBoardViewer: React.FC<KanbanBoardViewerProps> = ({
  table,
  rows,
  onUpdateTable,
  onOpenRowDetail,
  onOpenRowEditor,
  onDeleteRow,
}) => {
  // Candidate group columns (prefer status, select, text)
  const candidateGroupColumns = useMemo(() => {
    return table.columns.filter((c) => c.type === 'status' || c.type === 'select' || c.type === 'text');
  }, [table.columns]);

  const defaultGroupColId = useMemo(() => {
    const statusCol = table.columns.find((c) => c.type === 'status');
    if (statusCol) return statusCol.id;
    const selectCol = table.columns.find((c) => c.type === 'select');
    if (selectCol) return selectCol.id;
    return table.columns[0]?.id || '';
  }, [table.columns]);

  const [selectedGroupColId, setSelectedGroupColId] = useState<string>(() => {
    return defaultGroupColId;
  });

  const groupColumn = useMemo(() => {
    return table.columns.find((c) => c.id === selectedGroupColId) || table.columns[0];
  }, [table.columns, selectedGroupColId]);

  // 1. User-configurable Card Title Column (defaults smartly to task/content name, avoiding ID/PK)
  const [selectedTitleColId, setSelectedTitleColId] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(`wonbee_kanban_title_col_${table.id}`);
      if (saved && table.columns.some((c) => c.id === saved)) {
        return saved;
      }
    } catch (e) {
      // ignore
    }
    return inferDefaultTitleColId(table.columns, defaultGroupColId);
  });

  // Keep title column synchronized if columns change
  useEffect(() => {
    if (!table.columns.some((c) => c.id === selectedTitleColId) || selectedTitleColId === selectedGroupColId) {
      const nextId = inferDefaultTitleColId(table.columns, selectedGroupColId);
      setSelectedTitleColId(nextId);
    }
  }, [table.columns, selectedGroupColId, selectedTitleColId]);

  const handleTitleColChange = (newColId: string) => {
    setSelectedTitleColId(newColId);
    try {
      localStorage.setItem(`wonbee_kanban_title_col_${table.id}`, newColId);
    } catch (e) {
      // ignore
    }
  };

  const titleColumn = useMemo(() => {
    return table.columns.find((c) => c.id === selectedTitleColId) || table.columns[0];
  }, [table.columns, selectedTitleColId]);

  // 2. User-configurable Card Body / Content Column (defaults to richText or content/notes column)
  const [selectedContentColId, setSelectedContentColId] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(`wonbee_kanban_content_col_${table.id}`);
      if (saved !== null) {
        if (saved === '' || table.columns.some((c) => c.id === saved)) {
          return saved;
        }
      }
    } catch (e) {
      // ignore
    }
    return inferDefaultContentColId(table.columns, defaultGroupColId, selectedTitleColId);
  });

  useEffect(() => {
    if (
      selectedContentColId &&
      (!table.columns.some((c) => c.id === selectedContentColId) ||
        selectedContentColId === selectedGroupColId ||
        selectedContentColId === selectedTitleColId)
    ) {
      const nextContentId = inferDefaultContentColId(table.columns, selectedGroupColId, selectedTitleColId);
      setSelectedContentColId(nextContentId);
    }
  }, [table.columns, selectedGroupColId, selectedTitleColId, selectedContentColId]);

  const handleContentColChange = (newColId: string) => {
    setSelectedContentColId(newColId);
    try {
      localStorage.setItem(`wonbee_kanban_content_col_${table.id}`, newColId);
    } catch (e) {
      // ignore
    }
  };

  const contentColumn = useMemo(() => {
    if (!selectedContentColId) return null;
    return table.columns.find((c) => c.id === selectedContentColId) || null;
  }, [table.columns, selectedContentColId]);

  // 3. Primary Key or ID Column (for displaying neat #ID badge)
  const pkColumn = useMemo(() => {
    return table.columns.find((c) => (c.isPrimaryKey || isIdOrPkColumn(c)) && c.id !== selectedTitleColId);
  }, [table.columns, selectedTitleColId]);

  // Drag-and-drop state
  const [draggedRowId, setDraggedRowId] = useState<string | null>(null);
  const [activeDropLaneId, setActiveDropLaneId] = useState<string | null>(null);

  // Quick Inline Add Card in lane state
  const [addingToLaneId, setAddingToLaneId] = useState<string | null>(null);
  const [newCardTitle, setNewCardTitle] = useState('');

  // Extract lanes based on groupColumn
  interface Lane {
    id: string;
    title: string;
    color: string;
    isUnassigned?: boolean;
    rows: TableRow[];
    optionValue?: string;
  }

  const lanes: Lane[] = useMemo(() => {
    if (!groupColumn) return [];

    const laneList: Lane[] = [];
    const laneLookup = new Map<string, Lane>();
    const usedLaneIds = new Set<string>();

    // 1. Get effective options (combining actual cell values present in rows and configured options,
    // avoiding empty generic default placeholders like '대기' if none exist in the data)
    const effectiveOptions = getEffectiveColumnOptions(groupColumn, rows);

    effectiveOptions.forEach((opt, idx) => {
      const colorClass = opt.color || DEFAULT_LANE_COLORS[idx % DEFAULT_LANE_COLORS.length];
      const rawKey = opt.id || opt.label || `opt-${idx}`;
      const uniqueId = `lane-opt-${rawKey}-${idx}`;
      usedLaneIds.add(uniqueId);

      const lane: Lane = {
        id: uniqueId,
        title: opt.label || opt.id,
        color: colorClass,
        rows: [],
        optionValue: opt.label || opt.id,
      };
      laneList.push(lane);

      // Register in lookup map by id, label, and clean variations
      if (opt.id) {
        laneLookup.set(opt.id, lane);
        laneLookup.set(opt.id.toLowerCase(), lane);
      }
      if (opt.label) {
        laneLookup.set(opt.label, lane);
        laneLookup.set(opt.label.toLowerCase(), lane);
        laneLookup.set(cleanTextValue(opt.label), lane);
      }
    });

    // 2. Always have an "Unassigned" lane for cards without a value
    const unassignedLane: Lane = {
      id: '__UNASSIGNED__',
      title: '미지정 / 분류 없음',
      color: 'bg-stone-400 dark:bg-stone-600',
      isUnassigned: true,
      rows: [],
      optionValue: '',
    };

    // 3. Distribute rows to lanes
    rows.forEach((r) => {
      const val = r.data[groupColumn.id];
      const strVal = val !== undefined && val !== null ? String(val).trim() : '';
      const cleaned = cleanTextValue(strVal);

      if (!strVal || !cleaned) {
        unassignedLane.rows.push(r);
        return;
      }

      // Check if matches an existing predefined or discovered lane
      const targetLane =
        laneLookup.get(strVal) ||
        laneLookup.get(strVal.toLowerCase()) ||
        laneLookup.get(cleaned) ||
        laneLookup.get(cleaned.toLowerCase());

      if (targetLane) {
        targetLane.rows.push(r);
      } else {
        // New dynamic lane for value not in predefined options
        let dynamicId = `lane-custom-${cleaned || 'item'}`;
        if (usedLaneIds.has(dynamicId)) {
          dynamicId = `${dynamicId}-${laneList.length}`;
        }
        usedLaneIds.add(dynamicId);

        const newLane: Lane = {
          id: dynamicId,
          title: strVal,
          color: DEFAULT_LANE_COLORS[laneList.length % DEFAULT_LANE_COLORS.length],
          rows: [r],
          optionValue: strVal,
        };
        laneList.push(newLane);
        laneLookup.set(strVal, newLane);
        laneLookup.set(strVal.toLowerCase(), newLane);
        if (cleaned) {
          laneLookup.set(cleaned, newLane);
          laneLookup.set(cleaned.toLowerCase(), newLane);
        }
      }
    });

    const result = [...laneList];
    if (unassignedLane.rows.length > 0 || result.length === 0) {
      result.push(unassignedLane);
    }
    return result;
  }, [groupColumn, rows]);

  // Handle Drag & Drop to change card lane
  const handleDragStart = (e: React.DragEvent, rowId: string) => {
    e.dataTransfer.setData('text/plain', rowId);
    e.dataTransfer.effectAllowed = 'move';
    setDraggedRowId(rowId);
  };

  const handleDragOver = (e: React.DragEvent, laneId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (activeDropLaneId !== laneId) {
      setActiveDropLaneId(laneId);
    }
  };

  const handleDragLeave = (e: React.DragEvent, laneId: string) => {
    if (activeDropLaneId === laneId) {
      setActiveDropLaneId(null);
    }
  };

  const handleDrop = (e: React.DragEvent, targetLane: Lane) => {
    e.preventDefault();
    setActiveDropLaneId(null);
    const rowId = e.dataTransfer.getData('text/plain') || draggedRowId;
    setDraggedRowId(null);

    if (!rowId || !groupColumn) return;

    const targetRow = table.rows.find((r) => r.id === rowId);
    if (!targetRow) return;

    // Check if value already equals lane title or optionValue
    const currentVal = targetRow.data[groupColumn.id];
    const newVal = targetLane.isUnassigned ? '' : (targetLane.optionValue || targetLane.title);

    if (
      currentVal === newVal ||
      (targetLane.title && currentVal === targetLane.title) ||
      (targetLane.optionValue && currentVal === targetLane.optionValue)
    ) {
      return;
    }

    const updatedData = {
      ...targetRow.data,
      [groupColumn.id]: newVal,
    };

    const { updatedTable } = applyAutoUpdateDateToRow(
      table,
      rowId,
      updatedData,
      undefined,
      { richContent: targetRow.richContent, stickers: targetRow.stickers }
    );

    onUpdateTable(updatedTable);
  };

  // Quick Add Card in lane
  const handleConfirmAddCard = (lane: Lane) => {
    const trimmed = newCardTitle.trim();
    if (!trimmed || !titleColumn) {
      setAddingToLaneId(null);
      setNewCardTitle('');
      return;
    }

    const newRowId = `row_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const initialData: Record<string, any> = {};

    // Auto-generate PK/ID if a primary key or sequence column exists
    if (pkColumn && pkColumn.id !== titleColumn.id) {
      const existingNumericVals = table.rows
        .map((r) => Number(r.data[pkColumn.id]))
        .filter((n) => !isNaN(n) && isFinite(n));
      const nextNum = existingNumericVals.length > 0 ? Math.max(...existingNumericVals) + 1 : table.rows.length + 1;
      initialData[pkColumn.id] = nextNum;
    }

    // Fill primary title column with user-entered title
    initialData[titleColumn.id] = trimmed;

    // Fill group column if not unassigned
    if (!lane.isUnassigned && groupColumn) {
      initialData[groupColumn.id] = lane.optionValue || lane.title;
    }

    const newRow: TableRow = {
      id: newRowId,
      data: initialData,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const updatedTable: TableDocument = {
      ...table,
      rows: [newRow, ...table.rows],
      updatedAt: Date.now(),
    };

    onUpdateTable(updatedTable);
    setNewCardTitle('');
    setAddingToLaneId(null);
  };

  // Add new status option
  const handleAddNewOption = () => {
    const newName = prompt('새로운 상태/분류 이름을 입력하세요:');
    if (!newName || !newName.trim() || !groupColumn) return;

    const trimmed = newName.trim();
    const existingOptions = groupColumn.options || [];

    if (existingOptions.some((o) => o.label.toLowerCase() === trimmed.toLowerCase())) {
      alert('이미 존재하는 상태/분류입니다.');
      return;
    }

    const newOption: ColumnOption = {
      id: `opt_${Date.now()}`,
      label: trimmed,
      color: DEFAULT_LANE_COLORS[existingOptions.length % DEFAULT_LANE_COLORS.length],
    };

    const updatedColumns = table.columns.map((c) => {
      if (c.id === groupColumn.id) {
        return {
          ...c,
          options: [...existingOptions, newOption],
        };
      }
      return c;
    });

    onUpdateTable({
      ...table,
      columns: updatedColumns,
      updatedAt: Date.now(),
    });
  };

  return (
    <div className="flex-1 h-full flex flex-col overflow-hidden bg-stone-100/60 dark:bg-[#151515] select-none transition-colors">
      {/* Kanban Sub-Header & Controls */}
      <div className="px-6 py-2.5 bg-white dark:bg-[#1c1c1c] border-b border-stone-200/80 dark:border-[#2e2e2e] flex items-center justify-between gap-4 flex-wrap flex-shrink-0">
        <div className="flex items-center gap-3.5 flex-wrap">
          {/* Group Column Dropdown */}
          <div className="flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
            <span className="text-xs font-semibold text-stone-600 dark:text-[#cccccc]">그룹화:</span>
            <select
              value={selectedGroupColId}
              onChange={(e) => setSelectedGroupColId(e.target.value)}
              className="px-2.5 py-1 bg-stone-50 dark:bg-[#252525] border border-stone-200 dark:border-[#383838] rounded-lg text-xs font-semibold text-stone-800 dark:text-[#f0f0f0] outline-none focus:border-amber-500 cursor-pointer shadow-2xs"
            >
              {candidateGroupColumns.map((col) => (
                <option key={col.id} value={col.id}>
                  {col.name} ({col.type === 'status' ? '상태' : col.type === 'select' ? '선택' : '텍스트'})
                </option>
              ))}
            </select>
          </div>

          <div className="h-4 w-px bg-stone-200 dark:bg-[#333333] hidden sm:block" />

          {/* Card Title Column Dropdown */}
          <div className="flex items-center gap-1.5">
            <Type className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
            <span className="text-xs font-semibold text-stone-600 dark:text-[#cccccc]">카드 제목:</span>
            <select
              value={selectedTitleColId}
              onChange={(e) => handleTitleColChange(e.target.value)}
              className="px-2.5 py-1 bg-stone-50 dark:bg-[#252525] border border-stone-200 dark:border-[#383838] rounded-lg text-xs font-semibold text-stone-800 dark:text-[#f0f0f0] outline-none focus:border-blue-500 cursor-pointer shadow-2xs"
              title="칸반 카드의 메인 제목으로 표시할 열을 선택하세요 (숫자 PK 대신 실제 내용/작업명 선택 가능)"
            >
              {table.columns
                .filter((c) => c.id !== selectedGroupColId)
                .map((col) => (
                  <option key={col.id} value={col.id}>
                    {col.name} {col.isPrimaryKey ? '(PK)' : ''}
                  </option>
                ))}
            </select>
          </div>

          {/* Card Content Column Dropdown */}
          <div className="flex items-center gap-1.5">
            <AlignLeft className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
            <span className="text-xs font-semibold text-stone-600 dark:text-[#cccccc]">카드 본문(내용):</span>
            <select
              value={selectedContentColId}
              onChange={(e) => handleContentColChange(e.target.value)}
              className="px-2.5 py-1 bg-stone-50 dark:bg-[#252525] border border-stone-200 dark:border-[#383838] rounded-lg text-xs font-semibold text-stone-800 dark:text-[#f0f0f0] outline-none focus:border-emerald-500 cursor-pointer shadow-2xs"
              title="카드 하단에 미리보기 본문으로 표시할 열을 선택하세요"
            >
              <option value="">(표시 안 함)</option>
              {table.columns
                .filter((c) => c.id !== selectedGroupColId && c.id !== selectedTitleColId)
                .map((col) => (
                  <option key={col.id} value={col.id}>
                    {col.name} ({col.type === 'richText' ? '리치' : col.type === 'text' ? '텍스트' : col.type})
                  </option>
                ))}
            </select>
          </div>

          <div className="h-4 w-px bg-stone-200 dark:bg-[#333333] hidden md:block" />

          <span className="text-xs text-stone-400 dark:text-[#777777]">
            총 <strong className="text-stone-700 dark:text-[#cccccc]">{rows.length}</strong>개 카드 • {lanes.length}개 상태 열
          </span>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {groupColumn && (groupColumn.type === 'status' || groupColumn.type === 'select') && (
            <button
              onClick={handleAddNewOption}
              className="px-2.5 py-1 bg-stone-100 hover:bg-stone-200 dark:bg-[#282828] dark:hover:bg-[#333333] text-stone-700 dark:text-[#e0e0e0] border border-stone-200/70 dark:border-[#3a3a3a] rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
              title="새 상태/분류 열 추가"
            >
              <Plus className="w-3 h-3 text-amber-500" />
              <span>새 상태 열 추가</span>
            </button>
          )}
        </div>
      </div>

      {/* Kanban Lanes Container (Horizontal Scrolling Canvas) */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden p-6 flex gap-4 custom-scrollbar items-start">
        {lanes.map((lane) => {
          const isDropActive = activeDropLaneId === lane.id;
          const isAdding = addingToLaneId === lane.id;

          return (
            <div
              key={lane.id}
              onDragOver={(e) => handleDragOver(e, lane.id)}
              onDragLeave={(e) => handleDragLeave(e, lane.id)}
              onDrop={(e) => handleDrop(e, lane)}
              className={`w-80 max-w-[340px] flex-shrink-0 flex flex-col rounded-2xl border transition-all max-h-full ${
                isDropActive
                  ? 'bg-amber-50/70 dark:bg-amber-950/30 border-amber-400 dark:border-amber-600 shadow-md ring-2 ring-amber-400/30'
                  : 'bg-stone-50/80 dark:bg-[#1e1e1e] border-stone-200/80 dark:border-[#2d2d2d] shadow-2xs'
              }`}
            >
              {/* Lane Header */}
              <div className="p-3.5 pb-2 border-b border-stone-200/60 dark:border-[#2a2a2a] flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${lane.color}`} />
                  <h4
                    className="font-bold text-xs text-stone-800 dark:text-[#eeeeee] truncate"
                    title={lane.title}
                  >
                    {lane.title}
                  </h4>
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-white dark:bg-[#282828] text-stone-600 dark:text-[#aaaaaa] border border-stone-200 dark:border-[#333333] shadow-2xs flex-shrink-0">
                    {lane.rows.length}
                  </span>
                </div>

                <button
                  onClick={() => {
                    setAddingToLaneId(lane.id);
                    setNewCardTitle('');
                  }}
                  className="p-1 rounded-lg hover:bg-stone-200 dark:hover:bg-[#333333] text-stone-500 hover:text-stone-800 dark:hover:text-white transition-colors"
                  title="이 상태에 새 카드 추가"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Quick Inline Card Creator */}
              {isAdding && (
                <div className="p-2.5 bg-white dark:bg-[#252525] border-b border-amber-200 dark:border-amber-800/60 animate-in fade-in slide-in-from-top-1">
                  <input
                    type="text"
                    autoFocus
                    placeholder="카드 제목 입력 후 Enter..."
                    value={newCardTitle}
                    onChange={(e) => setNewCardTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleConfirmAddCard(lane);
                      if (e.key === 'Escape') {
                        setAddingToLaneId(null);
                        setNewCardTitle('');
                      }
                    }}
                    className="w-full px-2.5 py-1.5 bg-stone-50 dark:bg-[#1a1a1a] border border-amber-400 dark:border-amber-600 rounded-lg text-xs text-stone-900 dark:text-white outline-none"
                  />
                  <div className="flex items-center justify-end gap-1.5 mt-2">
                    <button
                      onClick={() => {
                        setAddingToLaneId(null);
                        setNewCardTitle('');
                      }}
                      className="px-2 py-1 text-[11px] text-stone-500 dark:text-[#888888] hover:text-stone-800 dark:hover:text-white rounded"
                    >
                      취소
                    </button>
                    <button
                      onClick={() => handleConfirmAddCard(lane)}
                      className="px-2.5 py-1 text-[11px] bg-amber-500 text-stone-950 font-bold rounded-lg shadow-2xs hover:bg-amber-400"
                    >
                      추가
                    </button>
                  </div>
                </div>
              )}

              {/* Lane Cards List (Vertical Scrollable) */}
              <div className="p-2.5 space-y-2.5 overflow-y-auto custom-scrollbar flex-1 min-h-[120px] max-h-[calc(100vh-210px)]">
                {lane.rows.map((row) => {
                  const isBeingDragged = draggedRowId === row.id;

                  // 1. Compute Title (from user-selected or auto-inferred titleColumn)
                  const rawTitle = titleColumn ? row.data[titleColumn.id] : '';
                  const cleanTitle = cleanTextValue(rawTitle) || '(제목 없음)';

                  // 2. Compute PK / ID badge if available
                  const pkVal = pkColumn ? row.data[pkColumn.id] : null;

                  // 3. Compute Body Content snippet if contentColumn is chosen
                  let contentSnippet = '';
                  if (contentColumn) {
                    const rawContent = row.data[contentColumn.id];
                    contentSnippet = cleanTextValue(rawContent);
                  }
                  // If no content column was chosen, but the card has richContent, preview first few lines
                  if (!contentSnippet && row.richContent && row.richContent.trim().length > 10) {
                    contentSnippet = cleanTextValue(row.richContent);
                  }

                  // Compute Stickers
                  const rowStickers = getAllStickersFromRow(row, table.columns);

                  // Compute thumbnail image if any
                  let firstImg = extractFirstImageSrc(row.richContent || '');
                  if (!firstImg) {
                    for (const col of table.columns) {
                      const val = row.data[col.id];
                      if (typeof val === 'string' && val.includes('<img')) {
                        firstImg = extractFirstImageSrc(val);
                        if (firstImg) break;
                      }
                    }
                  }

                  // Find date / tags for preview
                  const otherCols = table.columns.filter(
                    (c) => c.id !== titleColumn?.id && c.id !== groupColumn?.id && c.id !== contentColumn?.id
                  );
                  const dateCol = otherCols.find((c) => c.type === 'date');
                  const dateVal = dateCol ? row.data[dateCol.id] : null;

                  return (
                    <div
                      key={row.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, row.id)}
                      onClick={() => {
                        const originalIdx = table.rows.findIndex((r) => r.id === row.id);
                        onOpenRowDetail(row, originalIdx >= 0 ? originalIdx : 0);
                      }}
                      className={`group relative bg-white dark:bg-[#242424] hover:bg-stone-50/90 dark:hover:bg-[#2b2b2b] p-3 rounded-xl border border-stone-200/80 dark:border-[#333333] shadow-2xs hover:shadow-md transition-all cursor-grab active:cursor-grabbing ${
                        isBeingDragged ? 'opacity-40 scale-95 border-amber-400 ring-2 ring-amber-400/40' : ''
                      }`}
                    >
                      {/* Image Thumbnail Preview */}
                      {firstImg && (
                        <div className="mb-2 w-full h-24 rounded-lg overflow-hidden bg-stone-100 dark:bg-[#1a1a1a] border border-stone-200/50 dark:border-[#333333]">
                          <img
                            src={firstImg}
                            alt=""
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        </div>
                      )}

                      {/* Header Line: Optional ID Badge */}
                      {pkVal !== undefined && pkVal !== null && String(pkVal).trim() !== '' && (
                        <div className="mb-1.5 flex items-center gap-1.5">
                          <span
                            className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-stone-100 dark:bg-[#2c2c2c] text-stone-600 dark:text-[#aaaaaa] border border-stone-200/80 dark:border-[#3a3a3a]"
                            title={`식별 번호 (${pkColumn?.name || 'PK'}): ${pkVal}`}
                          >
                            #{String(pkVal)}
                          </span>
                        </div>
                      )}

                      {/* Card Title */}
                      <h5 className="font-semibold text-xs text-stone-900 dark:text-[#f0f0f0] line-clamp-2 leading-snug">
                        {cleanTitle}
                      </h5>

                      {/* Card Body Snippet (if content column has data) */}
                      {contentSnippet && (
                        <p className="mt-1.5 text-[11px] text-stone-600 dark:text-[#a0a0a0] line-clamp-2 leading-relaxed bg-stone-50/80 dark:bg-[#1c1c1c]/80 px-2 py-1 rounded border border-stone-200/50 dark:border-[#2e2e2e] break-words">
                          {contentSnippet}
                        </p>
                      )}

                      {/* Card Metadata Chips (Dates, Stickers, Tags) */}
                      <div className="mt-2.5 flex items-center gap-1.5 flex-wrap">
                        {/* Stickers Pill */}
                        {rowStickers.length > 0 && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200/70 dark:border-amber-800/60">
                            <Pin className="w-2.5 h-2.5 fill-current" />
                            <span>{rowStickers.length}</span>
                          </span>
                        )}

                        {/* Date Pill */}
                        {dateVal && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-stone-100 dark:bg-[#303030] text-stone-600 dark:text-[#bbbbbb]">
                            <Calendar className="w-2.5 h-2.5 text-stone-400" />
                            <span>{String(dateVal)}</span>
                          </span>
                        )}

                        {/* Rich Content indicator */}
                        {row.richContent && row.richContent.trim().length > 10 && (
                          <span
                            className="inline-flex items-center gap-0.5 text-[10px] text-stone-400 dark:text-[#888888]"
                            title="리치 텍스트 본문 포함"
                          >
                            <FileText className="w-2.5 h-2.5 text-stone-400" />
                          </span>
                        )}
                      </div>

                      {/* Hover Action Buttons */}
                      <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 dark:bg-[#242424]/90 p-0.5 rounded-lg border border-stone-200 dark:border-[#383838] shadow-2xs">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenRowEditor(row);
                          }}
                          className="p-1 text-stone-500 hover:text-amber-600 dark:hover:text-amber-400 rounded hover:bg-stone-100 dark:hover:bg-[#333333] transition-colors"
                          title="리치 에디터로 편집"
                        >
                          <Edit3 className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            const originalIdx = table.rows.findIndex((r) => r.id === row.id);
                            onOpenRowDetail(row, originalIdx >= 0 ? originalIdx : 0);
                          }}
                          className="p-1 text-stone-500 hover:text-blue-600 dark:hover:text-blue-400 rounded hover:bg-stone-100 dark:hover:bg-[#333333] transition-colors"
                          title="상세 서랍 열기"
                        >
                          <Maximize2 className="w-3 h-3" />
                        </button>
                        {onDeleteRow && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm('이 카드를 삭제하시겠습니까?')) {
                                onDeleteRow(row.id);
                              }
                            }}
                            className="p-1 text-stone-400 hover:text-rose-500 rounded hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                            title="카드 삭제"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}

                {lane.rows.length === 0 && !isAdding && (
                  <div className="py-8 text-center text-stone-400 dark:text-[#666666] text-xs border-2 border-dashed border-stone-200/70 dark:border-[#2f2f2f] rounded-xl flex flex-col items-center justify-center gap-1">
                    <span>카드가 없습니다</span>
                    <button
                      onClick={() => {
                        setAddingToLaneId(lane.id);
                        setNewCardTitle('');
                      }}
                      className="text-[11px] text-amber-600 dark:text-amber-400 font-semibold hover:underline"
                    >
                      + 카드 추가하기
                    </button>
                  </div>
                )}
              </div>

              {/* Bottom Quick Add Trigger */}
              <button
                onClick={() => {
                  setAddingToLaneId(lane.id);
                  setNewCardTitle('');
                }}
                className="m-2 py-1.5 px-3 rounded-xl border border-dashed border-stone-300 dark:border-[#383838] text-xs font-semibold text-stone-500 dark:text-[#aaaaaa] hover:text-stone-800 dark:hover:text-[#eeeeee] hover:bg-white dark:hover:bg-[#262626] transition-all flex items-center justify-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5 text-amber-500" />
                <span>카드 추가</span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
