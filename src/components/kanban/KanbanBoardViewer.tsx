import React, { useState, useMemo, useEffect } from 'react';
import {
  Plus,
  Calendar,
  FileText,
  Pin,
  Trash2,
  Maximize2,
  Edit3,
  Layers,
  Type,
  AlignLeft,
  Settings,
  GripVertical,
  X,
  Check,
  Tag,
} from 'lucide-react';
import { TableDocument, TableColumn, TableRow, ColumnOption } from '../../types';
import { cleanTextValue, extractFirstImageSrc } from '../../utils/textSanitizer';
import { LazyImage } from '../common/LazyImage';
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

const COLOR_PRESETS = [
  { label: 'Amber', color: 'bg-amber-500' },
  { label: 'Blue', color: 'bg-blue-500' },
  { label: 'Emerald', color: 'bg-emerald-500' },
  { label: 'Purple', color: 'bg-purple-500' },
  { label: 'Rose', color: 'bg-rose-500' },
  { label: 'Indigo', color: 'bg-indigo-500' },
  { label: 'Cyan', color: 'bg-cyan-500' },
  { label: 'Stone', color: 'bg-stone-500' },
];

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

const inferDefaultTitleColId = (columns: TableColumn[], groupColId: string): string => {
  const candidates = columns.filter((c) => c.id !== groupColId);
  if (candidates.length === 0) return columns[0]?.id || '';

  const namedContentCol = candidates.find(
    (c) => isTitleOrContentColumn(c.name) && !isIdOrPkColumn(c)
  );
  if (namedContentCol) return namedContentCol.id;

  const nonIdTextCols = candidates.filter(
    (c) => (c.type === 'text' || c.type === 'richText') && !isIdOrPkColumn(c)
  );
  if (nonIdTextCols.length > 0) {
    const nonPk = nonIdTextCols.find((c) => !c.isPrimaryKey);
    return (nonPk || nonIdTextCols[0]).id;
  }

  const nonIdCols = candidates.filter((c) => !isIdOrPkColumn(c));
  if (nonIdCols.length > 0) return nonIdCols[0].id;

  return candidates[0].id;
};

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

  const namedContent = candidates.find(
    (c) =>
      (c.type === 'richText' || c.type === 'text') &&
      contentKeywords.some((k) => (c.name || '').toLowerCase().includes(k))
  );
  if (namedContent) return namedContent.id;

  const richTextCol = candidates.find((c) => c.type === 'richText');
  if (richTextCol) return richTextCol.id;

  const textContent = candidates.find((c) =>
    contentKeywords.some((k) => (c.name || '').toLowerCase().includes(k))
  );
  if (textContent) return textContent.id;

  return '';
};

/* ------------------------------------------------------------------------- */
/* 🟢 상태 열 통합 관리 모달 컴포넌트 (추가/수정/색상/순서/삭제 한번에)        */
/* ------------------------------------------------------------------------- */
interface ManageStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
  groupColumn: TableColumn;
  allRows: TableRow[];
  onSaveOptions: (updatedOptions: ColumnOption[], deletedOptionLabels: string[]) => void;
}

const ManageStatusOptionsModal: React.FC<ManageStatusModalProps> = ({
  isOpen,
  onClose,
  groupColumn,
  allRows,
  onSaveOptions,
}) => {
  const [options, setOptions] = useState<ColumnOption[]>([]);
  const [deletedLabels, setDeletedLabels] = useState<string[]>([]);
  const [newLabel, setNewLabel] = useState('');
  const [newColor, setNewColor] = useState(DEFAULT_LANE_COLORS[0]);

  useEffect(() => {
    if (isOpen && groupColumn) {
      const effective = getEffectiveColumnOptions(groupColumn, allRows);
      const initialOpts = (groupColumn.options && groupColumn.options.length > 0)
        ? [...groupColumn.options]
        : effective.map((e, idx) => ({
            id: e.id || `opt_${idx}`,
            label: e.label,
            color: e.color || DEFAULT_LANE_COLORS[idx % DEFAULT_LANE_COLORS.length],
          }));
      setOptions(initialOpts);
      setDeletedLabels([]);
      setNewLabel('');
      setNewColor(DEFAULT_LANE_COLORS[initialOpts.length % DEFAULT_LANE_COLORS.length]);
    }
  }, [isOpen, groupColumn, allRows]);

  if (!isOpen) return null;

  const handleAddOption = () => {
    const trimmed = newLabel.trim();
    if (!trimmed) return;
    if (options.some((o) => o.label.toLowerCase() === trimmed.toLowerCase())) {
      alert('이미 존재하는 상태 이름입니다.');
      return;
    }
    const newOpt: ColumnOption = {
      id: `opt_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
      label: trimmed,
      color: newColor,
    };
    setOptions((prev) => [...prev, newOpt]);
    setNewLabel('');
    setNewColor(DEFAULT_LANE_COLORS[(options.length + 1) % DEFAULT_LANE_COLORS.length]);
  };

  const handleUpdateLabel = (id: string, label: string) => {
    setOptions((prev) =>
      prev.map((o) => (o.id === id ? { ...o, label } : o))
    );
  };

  const handleUpdateColor = (id: string, color: string) => {
    setOptions((prev) =>
      prev.map((o) => (o.id === id ? { ...o, color } : o))
    );
  };

  const handleDeleteOption = (opt: ColumnOption) => {
    const countInRows = allRows.filter((r) => {
      const val = cleanTextValue(r.data[groupColumn.id]);
      return val === opt.label || val === opt.id;
    }).length;

    let confirmMsg = `'${opt.label}' 상태 항목을 삭제하시겠습니까?`;
    if (countInRows > 0) {
      confirmMsg = `⚠️ 현재 이 상태를 사용하는 카드가 ${countInRows}개 존재합니다.\n삭제 시 해당 카드들의 분류가 '미지정/분류 없음'으로 변경됩니다.\n정말 삭제하시겠습니까?`;
    }

    if (window.confirm(confirmMsg)) {
      setOptions((prev) => prev.filter((o) => o.id !== opt.id));
      setDeletedLabels((prev) => [...prev, opt.label]);
    }
  };

  const handleMove = (index: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= options.length) return;
    const next = [...options];
    const temp = next[index];
    next[index] = next[targetIdx];
    next[targetIdx] = temp;
    setOptions(next);
  };

  const handleSave = () => {
    onSaveOptions(options, deletedLabels);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-white dark:bg-[#1e1e1e] border border-stone-200 dark:border-[#333333] rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col text-xs animate-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="px-5 py-3.5 bg-stone-50 dark:bg-[#252525] border-b border-stone-200 dark:border-[#333333] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Settings className="w-4 h-4 text-amber-500" />
            <h3 className="font-bold text-sm text-stone-900 dark:text-white">
              [{groupColumn.name}] 상태 열 관리
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-200/50 dark:hover:bg-[#333333]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto custom-scrollbar">
          {/* Quick Add Form */}
          <div className="p-3 rounded-xl bg-stone-50 dark:bg-[#252525] border border-stone-200/80 dark:border-[#333333] space-y-2">
            <span className="font-bold text-[11px] text-stone-600 dark:text-[#bbbbbb] uppercase">
              + 새 상태 항목 추가
            </span>
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="상태 이름 입력 (예: 진행중, 검수완료)"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddOption()}
                className="flex-1 px-3 py-1.5 bg-white dark:bg-[#1a1a1a] border border-stone-200 dark:border-[#383838] rounded-lg text-xs text-stone-900 dark:text-white outline-none focus:border-amber-500"
              />
              <button
                onClick={handleAddOption}
                className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold rounded-lg shrink-0"
              >
                추가
              </button>
            </div>
            {/* Color Presets */}
            <div className="flex items-center gap-1.5 pt-1 overflow-x-auto custom-scrollbar">
              <span className="text-[10px] text-stone-400 mr-1">색상:</span>
              {COLOR_PRESETS.map((c) => (
                <button
                  key={c.color}
                  type="button"
                  onClick={() => setNewColor(c.color)}
                  className={`w-5 h-5 rounded-full ${c.color} flex items-center justify-center transition-transform ${
                    newColor === c.color ? 'scale-125 ring-2 ring-amber-400 ring-offset-1 dark:ring-offset-[#252525]' : 'opacity-80 hover:opacity-100'
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Options List */}
          <div className="space-y-2">
            <span className="font-bold text-[11px] text-stone-600 dark:text-[#bbbbbb] uppercase">
              상태 목록 ({options.length}개)
            </span>
            {options.length === 0 ? (
              <p className="text-center text-stone-400 py-4 italic">등록된 상태 옵션이 없습니다.</p>
            ) : (
              options.map((opt, idx) => {
                const rowCount = allRows.filter((r) => {
                  const val = cleanTextValue(r.data[groupColumn.id]);
                  return val === opt.label || val === opt.id;
                }).length;

                return (
                  <div
                    key={opt.id}
                    className="flex items-center gap-2 p-2.5 rounded-xl bg-white dark:bg-[#242424] border border-stone-200 dark:border-[#333333] shadow-2xs"
                  >
                    {/* Reorder Buttons */}
                    <div className="flex flex-col gap-0.5">
                      <button
                        disabled={idx === 0}
                        onClick={() => handleMove(idx, 'up')}
                        className="text-[9px] px-1 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 disabled:opacity-20"
                      >
                        ▲
                      </button>
                      <button
                        disabled={idx === options.length - 1}
                        onClick={() => handleMove(idx, 'down')}
                        className="text-[9px] px-1 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 disabled:opacity-20"
                      >
                        ▼
                      </button>
                    </div>

                    {/* Color Dot Picker */}
                    <div className="relative group/color shrink-0">
                      <span className={`w-3.5 h-3.5 rounded-full block cursor-pointer ${opt.color || 'bg-amber-500'}`} />
                      <div className="absolute left-0 top-full mt-1 hidden group-hover/color:flex items-center gap-1 p-1 bg-stone-900 border border-stone-700 rounded-lg z-50 shadow-xl">
                        {COLOR_PRESETS.map((c) => (
                          <button
                            key={c.color}
                            onClick={() => handleUpdateColor(opt.id, c.color)}
                            className={`w-4 h-4 rounded-full ${c.color}`}
                          />
                        ))}
                      </div>
                    </div>

                    {/* Label Input */}
                    <input
                      type="text"
                      value={opt.label}
                      onChange={(e) => handleUpdateLabel(opt.id, e.target.value)}
                      className="flex-1 px-2 py-1 bg-stone-50 dark:bg-[#1a1a1a] border border-stone-200/80 dark:border-[#333333] rounded-lg text-xs font-semibold text-stone-800 dark:text-white outline-none focus:border-amber-500"
                    />

                    {/* Card Count Badge */}
                    <span className="text-[10px] font-mono px-2 py-0.5 bg-stone-100 dark:bg-[#303030] text-stone-500 dark:text-[#aaaaaa] rounded-full shrink-0">
                      {rowCount}개
                    </span>

                    {/* Delete Option */}
                    <button
                      type="button"
                      onClick={() => handleDeleteOption(opt)}
                      className="p-1.5 text-stone-400 hover:text-rose-500 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors shrink-0"
                      title="이 상태 삭제"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 bg-stone-50 dark:bg-[#252525] border-t border-stone-200 dark:border-[#333333] flex items-center justify-between">
          <span className="text-[11px] text-stone-400">
            💡 삭제 시 카드 분류는 미지정 상태로 유지됩니다.
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-xl bg-stone-200 dark:bg-[#333333] text-stone-700 dark:text-[#cccccc] font-semibold text-xs hover:bg-stone-300 dark:hover:bg-[#404040]"
            >
              취소
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-1.5 rounded-xl bg-amber-500 text-stone-950 font-bold text-xs hover:bg-amber-400 shadow-sm"
            >
              저장 및 적용
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export const KanbanBoardViewer: React.FC<KanbanBoardViewerProps> = ({
  table,
  rows,
  onUpdateTable,
  onOpenRowDetail,
  onOpenRowEditor,
  onDeleteRow,
}) => {
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

  const [selectedTitleColId, setSelectedTitleColId] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(`wonbee_kanban_title_col_${table.id}`);
      if (saved && table.columns.some((c) => c.id === saved)) {
        return saved;
      }
    } catch (e) {}
    return inferDefaultTitleColId(table.columns, defaultGroupColId);
  });

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
    } catch (e) {}
  };

  const titleColumn = useMemo(() => {
    return table.columns.find((c) => c.id === selectedTitleColId) || table.columns[0];
  }, [table.columns, selectedTitleColId]);

  const [selectedContentColId, setSelectedContentColId] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(`wonbee_kanban_content_col_${table.id}`);
      if (saved !== null) {
        if (saved === '' || table.columns.some((c) => c.id === saved)) {
          return saved;
        }
      }
    } catch (e) {}
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
    } catch (e) {}
  };

  const contentColumn = useMemo(() => {
    if (!selectedContentColId) return null;
    return table.columns.find((c) => c.id === selectedContentColId) || null;
  }, [table.columns, selectedContentColId]);

  const pkColumn = useMemo(() => {
    return table.columns.find((c) => (c.isPrimaryKey || isIdOrPkColumn(c)) && c.id !== selectedTitleColId);
  }, [table.columns, selectedTitleColId]);

  // Modal State for Manage Status
  const [isManageStatusModalOpen, setIsManageStatusModalOpen] = useState(false);

  const [draggedRowId, setDraggedRowId] = useState<string | null>(null);
  const [activeDropLaneId, setActiveDropLaneId] = useState<string | null>(null);

  const [addingToLaneId, setAddingToLaneId] = useState<string | null>(null);
  const [newCardTitle, setNewCardTitle] = useState('');

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

    const unassignedLane: Lane = {
      id: '__UNASSIGNED__',
      title: '미지정 / 분류 없음',
      color: 'bg-stone-400 dark:bg-stone-600',
      isUnassigned: true,
      rows: [],
      optionValue: '',
    };

    rows.forEach((r) => {
      const val = r.data[groupColumn.id];
      const strVal = val !== undefined && val !== null ? String(val).trim() : '';
      const cleaned = cleanTextValue(strVal);

      if (!strVal || !cleaned) {
        unassignedLane.rows.push(r);
        return;
      }

      const targetLane =
        laneLookup.get(strVal) ||
        laneLookup.get(strVal.toLowerCase()) ||
        laneLookup.get(cleaned) ||
        laneLookup.get(cleaned.toLowerCase());

      if (targetLane) {
        targetLane.rows.push(r);
      } else {
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

  const handleConfirmAddCard = (lane: Lane) => {
    const trimmed = newCardTitle.trim();
    if (!trimmed || !titleColumn) {
      setAddingToLaneId(null);
      setNewCardTitle('');
      return;
    }

    const newRowId = `row_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const initialData: Record<string, any> = {};

    if (pkColumn && pkColumn.id !== titleColumn.id) {
      const existingNumericVals = table.rows
        .map((r) => Number(r.data[pkColumn.id]))
        .filter((n) => !isNaN(n) && isFinite(n));
      const nextNum = existingNumericVals.length > 0 ? Math.max(...existingNumericVals) + 1 : table.rows.length + 1;
      initialData[pkColumn.id] = nextNum;
    }

    initialData[titleColumn.id] = trimmed;

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

  /* Save Batch Options from Manage Status Modal */
  const handleSaveOptionsBatch = (updatedOptions: ColumnOption[], deletedLabels: string[]) => {
    if (!groupColumn) return;

    // 1. Update column options
    const updatedColumns = table.columns.map((c) => {
      if (c.id === groupColumn.id) {
        return {
          ...c,
          options: updatedOptions,
        };
      }
      return c;
    });

    // 2. Clear out deleted labels from rows
    let updatedRows = table.rows;
    if (deletedLabels.length > 0) {
      const deletedSet = new Set(deletedLabels.map((l) => l.toLowerCase()));
      updatedRows = table.rows.map((r) => {
        const val = cleanTextValue(r.data[groupColumn.id]);
        if (deletedSet.has(val.toLowerCase())) {
          return {
            ...r,
            data: {
              ...r.data,
              [groupColumn.id]: '',
            },
            updatedAt: Date.now(),
          };
        }
        return r;
      });
    }

    onUpdateTable({
      ...table,
      columns: updatedColumns,
      rows: updatedRows,
      updatedAt: Date.now(),
    });
  };

  return (
    <div className="flex-1 h-full flex flex-col overflow-hidden bg-stone-100/60 dark:bg-[#151515] select-none transition-colors">
      {/* Kanban Sub-Header & Controls */}
      <div className="px-4 sm:px-6 py-2.5 bg-white dark:bg-[#1c1c1c] border-b border-stone-200/80 dark:border-[#2e2e2e] flex items-center justify-between gap-3 flex-wrap flex-shrink-0">
        <div className="flex items-center gap-3 flex-wrap flex-1 min-w-0">
          {/* Group Column Dropdown */}
          <div className="flex items-center gap-1.5 shrink-0 whitespace-nowrap">
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

          <div className="h-4 w-px bg-stone-200 dark:bg-[#333333] hidden sm:block shrink-0" />

          {/* Card Title Column Dropdown */}
          <div className="flex items-center gap-1.5 shrink-0 whitespace-nowrap">
            <Type className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
            <span className="text-xs font-semibold text-stone-600 dark:text-[#cccccc]">카드 제목:</span>
            <select
              value={selectedTitleColId}
              onChange={(e) => handleTitleColChange(e.target.value)}
              className="px-2.5 py-1 bg-stone-50 dark:bg-[#252525] border border-stone-200 dark:border-[#383838] rounded-lg text-xs font-semibold text-stone-800 dark:text-[#f0f0f0] outline-none focus:border-blue-500 cursor-pointer shadow-2xs"
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
          <div className="flex items-center gap-1.5 shrink-0 whitespace-nowrap">
            <AlignLeft className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
            <span className="text-xs font-semibold text-stone-600 dark:text-[#cccccc]">카드 본문(내용):</span>
            <select
              value={selectedContentColId}
              onChange={(e) => handleContentColChange(e.target.value)}
              className="px-2.5 py-1 bg-stone-50 dark:bg-[#252525] border border-stone-200 dark:border-[#383838] rounded-lg text-xs font-semibold text-stone-800 dark:text-[#f0f0f0] outline-none focus:border-emerald-500 cursor-pointer shadow-2xs"
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

          <div className="h-4 w-px bg-stone-200 dark:bg-[#333333] hidden md:block shrink-0" />

          <span className="text-xs text-stone-400 dark:text-[#777777] shrink-0 whitespace-nowrap">
            총 <strong className="text-stone-700 dark:text-[#cccccc]">{rows.length}</strong>개 카드 • {lanes.length}개 상태 열
          </span>
        </div>

        {/* Action Controls: 🟢 통합 상태 열 관리 버튼 */}
        <div className="flex items-center gap-2 shrink-0 whitespace-nowrap">
          {groupColumn && (groupColumn.type === 'status' || groupColumn.type === 'select') && (
            <button
              onClick={() => setIsManageStatusModalOpen(true)}
              className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold rounded-lg text-xs flex items-center gap-1.5 transition-all shadow-xs shrink-0 whitespace-nowrap cursor-pointer"
              title="상태 항목 추가, 수정, 순서 변경, 색상 변경, 삭제 일괄 관리"
            >
              <Settings className="w-3.5 h-3.5 shrink-0" />
              <span>상태 열 관리</span>
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

                  const rawTitle = titleColumn ? row.data[titleColumn.id] : '';
                  const cleanTitle = cleanTextValue(rawTitle) || '(제목 없음)';

                  const pkVal = pkColumn ? row.data[pkColumn.id] : null;

                  let contentSnippet = '';
                  if (contentColumn) {
                    const rawContent = row.data[contentColumn.id];
                    contentSnippet = cleanTextValue(rawContent);
                  }
                  if (!contentSnippet && row.richContent && row.richContent.trim().length > 10) {
                    contentSnippet = cleanTextValue(row.richContent);
                  }

                  const rowStickers = getAllStickersFromRow(row, table.columns);

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
                          <LazyImage
                            src={firstImg}
                            alt=""
                            className="w-full h-full object-cover"
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

                      {/* Card Body Snippet */}
                      {contentSnippet && (
                        <p className="mt-1.5 text-[11px] text-stone-600 dark:text-[#a0a0a0] line-clamp-2 leading-relaxed bg-stone-50/80 dark:bg-[#1c1c1c]/80 px-2 py-1 rounded border border-stone-200/50 dark:border-[#2e2e2e] break-words">
                          {contentSnippet}
                        </p>
                      )}

                      {/* Card Metadata Chips */}
                      <div className="mt-2.5 flex items-center gap-1.5 flex-wrap">
                        {rowStickers.length > 0 && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200/70 dark:border-amber-800/60">
                            <Pin className="w-2.5 h-2.5 fill-current" />
                            <span>{rowStickers.length}</span>
                          </span>
                        )}

                        {dateVal && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-stone-100 dark:bg-[#303030] text-stone-600 dark:text-[#bbbbbb]">
                            <Calendar className="w-2.5 h-2.5 text-stone-400" />
                            <span>{String(dateVal)}</span>
                          </span>
                        )}

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

      {/* Status Options Management Modal Popup */}
      <ManageStatusOptionsModal
        isOpen={isManageStatusModalOpen}
        onClose={() => setIsManageStatusModalOpen(false)}
        groupColumn={groupColumn}
        allRows={rows}
        onSaveOptions={handleSaveOptionsBatch}
      />
    </div>
  );
};