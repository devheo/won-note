import React, { useState, useRef, useMemo, useEffect } from 'react';
import { TableDocument, TableColumn, TableRow, ColumnType, RowDensity } from '../../types';
import { TruncatedPreviewCell } from '../common/TruncatedPreviewCell';
import { ColumnManagerModal } from '../modals/ColumnManagerModal';
import { AddRowModal } from '../modals/AddRowModal';
import { SelectOrCustomInput } from '../common/SelectOrCustomInput';
import { cleanTextValue, extractFirstImageSrc } from '../../utils/textSanitizer';
import { ImageLightboxModal } from '../common/ImageLightboxModal';
import {
  Plus,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronsUp,
  ChevronsDown,
  Trash2,
  Search,
  Maximize2,
  Calendar,
  Code,
  Tag,
  Hash,
  Type,
  CheckSquare,
  Sparkles,
  Columns,
  Eye,
  Sliders,
  ChevronDown,
  Copy,
  AlignJustify,
  Rows,
  GripVertical,
  Filter,
  X,
} from 'lucide-react';

interface DataTableViewerProps {
  table: TableDocument;
  onUpdateTable: (updatedTable: TableDocument) => void;
  onOpenRowEditor: (row: TableRow) => void;
  onOpenRowDetail: (row: TableRow, index: number) => void;
  onImportCsvToNewTable?: (fileName: string, columns: TableColumn[], rows: TableRow[]) => void;
}

export const DataTableViewer: React.FC<DataTableViewerProps> = ({
  table,
  onUpdateTable,
  onOpenRowEditor,
  onOpenRowDetail,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortColumnId, setSortColumnId] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());

  // Tag filter state: { [columnId]: selectedOptionLabelOrId }
  const [selectedTagFilters, setSelectedTagFilters] = useState<Record<string, string>>({});

  // Image Lightbox state
  const [lightboxImg, setLightboxImg] = useState<string | null>(null);

  // Row Density State (Compact: 32px, Normal: 44px, Spacious: 58px) with localStorage persistence
  const [rowDensity, setRowDensity] = useState<RowDensity>(() => {
    return (localStorage.getItem('wonbee_row_density') as RowDensity) || 'normal';
  });

  const handleDensityChange = (density: RowDensity) => {
    setRowDensity(density);
    localStorage.setItem('wonbee_row_density', density);
  };

  // Column Manager Modal State
  const [isColumnManagerOpen, setIsColumnManagerOpen] = useState(false);
  const [hiddenColumnIds, setHiddenColumnIds] = useState<Set<string>>(new Set());

  // Add Row Modal State (Opens popup instead of just inserting empty row)
  const [isAddRowModalOpen, setIsAddRowModalOpen] = useState(false);
  const [addRowPosition, setAddRowPosition] = useState<'bottom' | 'top'>('bottom');

  // Row Action Dropdown Menu
  const [isRowMenuOpen, setIsRowMenuOpen] = useState(false);
  const rowMenuRef = useRef<HTMLDivElement | null>(null);

  // Density Menu
  const [isDensityMenuOpen, setIsDensityMenuOpen] = useState(false);
  const densityMenuRef = useRef<HTMLDivElement | null>(null);

  // Drag & Drop Row Reorder State
  const [draggedRowId, setDraggedRowId] = useState<string | null>(null);
  const [dropTargetRowId, setDropTargetRowId] = useState<string | null>(null);
  const [dropIndicatorPosition, setDropIndicatorPosition] = useState<'above' | 'below' | null>(null);

  // Inline Cell Editing state
  const [editingCell, setEditingCell] = useState<{ rowId: string; colId: string } | null>(null);
  const [editingValue, setEditingValue] = useState<any>('');

  // Inline Cell Commit
  const commitCellEdit人力 = (rowId: string, colId: string, val: any) => {
    const targetCol = table.columns.find((c) => c.id === colId);
    const cleaned =
      typeof val === 'string' && targetCol?.type !== 'richText'
        ? cleanTextValue(val)
        : val;

    const updatedRows = table.rows.map((row) => {
      if (row.id === rowId) {
        return {
          ...row,
          data: {
            ...row.data,
            [colId]: cleaned,
          },
          updatedAt: Date.now(),
        };
      }
      return row;
    });

    onUpdateTable({
      ...table,
      rows: updatedRows,
      updatedAt: Date.now(),
    });
    setEditingCell(null);
  };

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (rowMenuRef.current && !rowMenuRef.current.contains(e.target as Node)) {
        setIsRowMenuOpen(false);
      }
      if (densityMenuRef.current && !densityMenuRef.current.contains(e.target as Node)) {
        setIsDensityMenuOpen(false);
      }
      if (editingCell) {
        const target实施 = e.target as HTMLElement;
        if (!target实施.closest('[data-editing-cell="true"]')) {
          commitCellEdit人力(editingCell.rowId, editingCell.colId, editingValue);
        }
      }
    };
    window.addEventListener('mousedown', handleOutsideClick);
    return () => window.removeEventListener('mousedown', handleOutsideClick);
  }, [editingCell, editingValue, table]);

  // Reset editing cell whenever table changes
  useEffect(() => {
    setEditingCell(null);
    setEditingValue('');
  }, [table.id]);

  // Column Resizing state
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    table.columns.forEach((c) => {
      map[c.id] = c.width || 180;
    });
    return map;
  });

  // Sync column widths if table columns change
  useEffect(() => {
    setColumnWidths((prev) => {
      const next = { ...prev };
      table.columns.forEach((c) => {
        if (!next[c.id]) {
          next[c.id] = c.width || 180;
        }
      });
      return next;
    });
  }, [table.columns]);

  // Handle Column Resize mouse events
  const handleResizeStart = (e: React.MouseEvent, colId: string, currentWidth: number) => {
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const startWidth = currentWidth || 160;
    let latestWidth = startWidth;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX;
      const newWidth = Math.max(60, startWidth + delta);
      latestWidth = newWidth;

      setColumnWidths((prev) => ({
        ...prev,
        [colId]: newWidth,
      }));
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);

      if (latestWidth && !isNaN(latestWidth)) {
        setColumnWidths((prev) => ({
          ...prev,
          [colId]: latestWidth,
        }));

        const updatedCols = table.columns.map((c) =>
          c.id === colId ? { ...c, width: latestWidth } : c
        );
        onUpdateTable({
          ...table,
          columns: updatedCols,
          updatedAt: Date.now(),
        });
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // Header Sorting
  const handleHeaderSort = (colId: string) => {
    if (sortColumnId === colId) {
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else {
        setSortColumnId(null);
        setSortDirection('asc');
      }
    } else {
      setSortColumnId(colId);
      setSortDirection('asc');
    }
  };

  // Trigger Add Row Modal (Opens Popup as requested by user)
  const handleOpenAddRowModal = (pos: 'bottom' | 'top' = 'bottom') => {
    setAddRowPosition(pos);
    setIsAddRowModalOpen(true);
    setIsRowMenuOpen(false);
  };

  // Commit Row created from Modal
  const handleCreateRowFromModal = (
    rowData: Record<string, any>,
    richContent?: string,
    pos: 'bottom' | 'top' = 'bottom'
  ) => {
    const newRowId = `row-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 5)}`;
    const newRow: TableRow = {
      id: newRowId,
      data: rowData,
      richContent: richContent || undefined,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const newRows = pos === 'top' ? [newRow, ...table.rows] : [...table.rows, newRow];
    onUpdateTable({
      ...table,
      rows: newRows,
      updatedAt: Date.now(),
    });
  };

  // Duplicate Selected Rows
  const handleDuplicateSelectedRows = () => {
    if (selectedRowIds.size === 0) return;
    const rowsToDuplicate = table.rows.filter((r) => selectedRowIds.has(r.id));
    const clonedRows: TableRow[] = rowsToDuplicate.map((r) => ({
      ...r,
      id: `row-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 5)}`,
      data: { ...r.data },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }));

    onUpdateTable({
      ...table,
      rows: [...table.rows, ...clonedRows],
      updatedAt: Date.now(),
    });
    setSelectedRowIds(new Set());
    setIsRowMenuOpen(false);
  };

  // Delete Selected Rows
  const handleDeleteSelectedRows = () => {
    if (selectedRowIds.size === 0) return;
    const remainingRows = table.rows.filter((r) => !selectedRowIds.has(r.id));
    onUpdateTable({
      ...table,
      rows: remainingRows,
      updatedAt: Date.now(),
    });
    setSelectedRowIds(new Set());
    setIsRowMenuOpen(false);
  };

  // Reorder Row by Index (Drag & Drop or Manual Swap)
  const handleReorderRow = (sourceRowId: string, targetRowId: string, position: 'above' | 'below') => {
    if (sortColumnId) {
      setSortColumnId(null);
    }

    const sourceIdx = table.rows.findIndex((r) => r.id === sourceRowId);
    const targetIdx = table.rows.findIndex((r) => r.id === targetRowId);
    if (sourceIdx === -1 || targetIdx === -1 || sourceIdx === targetIdx) return;

    const newRows = [...table.rows];
    const [movedRow] = newRows.splice(sourceIdx, 1);

    const insertIdx = position === 'above' ? (targetIdx > sourceIdx ? targetIdx - 1 : targetIdx) : (targetIdx > sourceIdx ? targetIdx : targetIdx + 1);
    newRows.splice(insertIdx, 0, movedRow);

    onUpdateTable({
      ...table,
      rows: newRows,
      updatedAt: Date.now(),
    });
  };

  // Move Single Row Up/Down
  const handleMoveRow = (rowId: string, direction: 'up' | 'down') => {
    if (sortColumnId) {
      setSortColumnId(null);
    }

    const index = table.rows.findIndex((r) => r.id === rowId);
    if (index === -1) return;
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === table.rows.length - 1) return;

    const newRows = [...table.rows];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    const temp = newRows[index];
    newRows[index] = newRows[targetIndex];
    newRows[targetIndex] = temp;

    onUpdateTable({
      ...table,
      rows: newRows,
      updatedAt: Date.now(),
    });
  };

  // Move Selected Rows Up / Down / Top / Bottom
  const handleMoveSelectedRows = (direction: 'up' | 'down' | 'top' | 'bottom') => {
    if (selectedRowIds.size === 0) return;
    if (sortColumnId) setSortColumnId(null);

    const currentRows = [...table.rows];
    if (direction === 'top') {
      const selected = currentRows.filter((r) => selectedRowIds.has(r.id));
      const unselected = currentRows.filter((r) => !selectedRowIds.has(r.id));
      onUpdateTable({
        ...table,
        rows: [...selected, ...unselected],
        updatedAt: Date.now(),
      });
      return;
    }

    if (direction === 'bottom') {
      const selected = currentRows.filter((r) => selectedRowIds.has(r.id));
      const unselected而去 = currentRows.filter((r) => !selectedRowIds.has(r.id));
      onUpdateTable({
        ...table,
        rows: [...unselected而去, ...selected],
        updatedAt: Date.now(),
      });
      return;
    }

    if (direction === 'up') {
      for (let i = 1; i < currentRows.length; i++) {
        if (selectedRowIds.has(currentRows[i].id) && !selectedRowIds.has(currentRows[i - 1].id)) {
          const temp = currentRows[i];
          currentRows[i] = currentRows[i - 1];
          currentRows[i - 1] = temp;
        }
      }
    } else if (direction === 'down') {
      for (let i地理 = currentRows.length - 2; i地理 >= 0; i地理--) {
        if (selectedRowIds.has(currentRows[i地理].id) && !selectedRowIds.has(currentRows[i地理 + 1].id)) {
          const temp = currentRows[i地理];
          currentRows[i地理] = currentRows[i地理 + 1];
          currentRows[i地理 + 1] = temp;
        }
      }
    }

    onUpdateTable({
      ...table,
      rows: currentRows,
      updatedAt: Date.now(),
    });
  };

  // Drag & Drop event handlers for table rows
  const handleRowDragStart = (e: React.DragEvent, rowId: string) => {
    e.dataTransfer.setData('text/plain', rowId);
    e.dataTransfer.effectAllowed = 'move';
    setDraggedRowId(rowId);
  };

  const handleRowDragOver = (e: React.DragEvent, targetRowId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (!draggedRowId || draggedRowId === targetRowId) {
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const isAbove = e.clientY < rect.top + rect.height / 2;

    setDropTargetRowId(targetRowId);
    setDropIndicatorPosition(isAbove ? 'above' : 'below');
  };

  const handleRowDrop = (e: React.DragEvent, targetRowId: string) => {
    e.preventDefault();
    if (draggedRowId && draggedRowId !== targetRowId && dropIndicatorPosition) {
      handleReorderRow(draggedRowId, targetRowId, dropIndicatorPosition);
    }
    setDraggedRowId(null);
    setDropTargetRowId(null);
    setDropIndicatorPosition(null);
  };

  const handleRowDragEnd = () => {
    setDraggedRowId(null);
    setDropTargetRowId(null);
    setDropIndicatorPosition(null);
  };

  // Toggle Single Row Selection
  const toggleSelectRow = (rowId: string) => {
    setSelectedRowIds((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) {
        next.delete(rowId);
      } else {
        next.add(rowId);
      }
      return next;
    });
  };

  // Toggle Select All Rows
  const toggleSelectAll = () => {
    if (selectedRowIds.size === table.rows.length) {
      setSelectedRowIds(new Set());
    } else {
      setSelectedRowIds(new Set(table.rows.map((r) => r.id)));
    }
  };

  // Column Visibility Toggle
  const toggleColumnVisibility = (colId: string) => {
    setHiddenColumnIds((prev) => {
      const next = new Set(prev);
      if (next.has(colId)) {
        next.delete(colId);
      } else {
        next.add(colId);
      }
      return next;
    });
  };

  // Column Reorder
  const handleReorderColumns = (newCols: TableColumn[]) => {
    onUpdateTable({
      ...table,
      columns: newCols,
      updatedAt: Date.now(),
    });
  };

  // Add Column from Column Manager Modal
  const handleAddColumnFromModal = (newCol: TableColumn) => {
    setColumnWidths((prev) => ({ ...prev, [newCol.id]: newCol.width || 160 }));
    onUpdateTable({
      ...table,
      columns: [...table.columns, newCol],
      updatedAt: Date.now(),
    });
  };

  // Update Column from Column Manager Modal
  const handleUpdateColumnFromModal = (colId: string, updated: Partial<TableColumn>) => {
    const updatedCols = table.columns.map((c) => (c.id === colId ? { ...c, ...updated } : c));
    onUpdateTable({
      ...table,
      columns: updatedCols,
      updatedAt: Date.now(),
    });
  };

  // Delete Column from Column Manager Modal
  const handleDeleteColumnFromModal = (colId: string) => {
    const updatedCols = table.columns.filter((c) => c.id !== colId);
    const updatedRows = table.rows.map((r) => {
      const { [colId]: _, ...restData } = r.data;
      return {
        ...r,
        data: restData,
        updatedAt: Date.now(),
      };
    });

    setHiddenColumnIds((prev) => {
      const next = new Set(prev);
      next.delete(colId);
      return next;
    });

    setColumnWidths((prev) => {
      const next = { ...prev };
      delete next[colId];
      return next;
    });

    if (sortColumnId === colId) {
      setSortColumnId(null);
    }

    onUpdateTable({
      ...table,
      columns: updatedCols,
      rows: updatedRows,
      updatedAt: Date.now(),
    });
  };

  // Visible columns filtered out
  const visibleColumns = useMemo(() => {
    return table.columns.filter((c) => !hiddenColumnIds.has(c.id));
  }, [table.columns, hiddenColumnIds]);

  // List of status or select columns that can be filtered
  const filterableTagColumns = useMemo(() => {
    return table.columns.filter((c) => c.type === 'status' || c.type === 'select');
  }, [table.columns]);

  // Filtered & Sorted Rows
  const processedRows = useMemo(() => {
    let list = [...table.rows];

    // 1. Search Query Filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((r) => {
        return table.columns.some((col) => {
          const val = r.data[col.id];
          if (val === undefined || val === null) return false;
          const cleaned = cleanTextValue(val).toLowerCase();
          return cleaned.includes(q) || String(val).toLowerCase().includes(q);
        });
      });
    }

    // 2. Tag Column Filters (Request 10)
    for (const [colId, selectedOpt] of Object.entries(selectedTagFilters)) {
      if (!selectedOpt) continue;
      const targetCol = table.columns.find((c) => c.id === colId);
      if (!targetCol) continue;

      list = list.filter((r) => {
        const val = r.data[colId];
        if (val === undefined || val === null || val === '') return false;
        const cleaned = cleanTextValue(val);
        const opt = targetCol.options?.find(
          (o) => o.id === cleaned || o.label === cleaned || o.id === String(val) || o.label === String(val)
        );
        const matchLabel = opt ? opt.label : cleaned;
        return matchLabel === selectedOpt || cleaned === selectedOpt || String(val) === selectedOpt;
      });
    }

    // 3. Sorting
    if (sortColumnId) {
      const targetCol = table.columns.find((c) => c.id === sortColumnId);

      const getDisplayValue = (val: any): string => {
        if (val === undefined || val === null) return '';
        const cleaned = cleanTextValue(val).trim();
        if (targetCol && (targetCol.type === 'select' || targetCol.type === 'status')) {
          const opt = targetCol.options?.find(
            (o) => o.id === cleaned || o.label === cleaned || o.id === String(val) || o.label === String(val)
          );
          if (opt) return opt.label.trim();
        }
        return cleaned;
      };

      list.sort((a, b) => {
        const rawA = a.data[sortColumnId];
        const rawB = b.data[sortColumnId];

        const strA = getDisplayValue(rawA);
        const strB = getDisplayValue(rawB);

        const numA = Number(strA);
        const numB不易 = Number(strB);

        if (
          targetCol?.type === 'number' ||
          (!isNaN(numA) && !isNaN(numB不易) && strA !== '' && strB !== '')
        ) {
          return sortDirection === 'asc' ? numA - numB不易 : numB不易 - numA;
        }

        const comp = strA.localeCompare(strB, 'ko', { numeric: true, sensitivity: 'base' });
        return sortDirection === 'asc' ? comp : -comp;
      });
    }

    return list;
  }, [table.rows, table.columns, searchQuery, selectedTagFilters, sortColumnId, sortDirection]);

  // Column Icon helper
  const getColTypeIcon = (type: ColumnType) => {
    switch (type) {
      case 'number':
        return <Hash className="w-3.5 h-3.5 text-blue-500" />;
      case 'select':
      case 'status':
        return <Tag className="w-3.5 h-3.5 text-amber-500" />;
      case 'date':
        return <Calendar className="w-3.5 h-3.5 text-purple-500" />;
      case 'checkbox':
        return <CheckSquare className="w-3.5 h-3.5 text-emerald-500" />;
      case 'code':
        return <Code className="w-3.5 h-3.5 text-stone-500 dark:text-amber-400" />;
      case 'richText':
        return <Sparkles className="w-3.5 h-3.5 text-amber-500" />;
      default:
        return <Type className="w-3.5 h-3.5 text-stone-400" />;
    }
  };

  // Row height CSS classes based on row density
  const getRowHeightClass = () => {
    switch (rowDensity) {
      case 'compact':
        return 'h-8 py-0.5';
      case 'spacious':
        return 'h-14 py-3';
      case 'normal':
      default:
        return 'h-11 py-1.5';
    }
  };

  return (
    <div className="flex-1 h-screen flex flex-col overflow-hidden bg-white dark:bg-[#181818] select-none transition-colors">
      {/* Table Action Bar */}
      <div className="px-6 py-3 border-b border-stone-200/80 dark:border-[#333333] bg-stone-50/70 dark:bg-[#1e1e1e]/60 flex items-center justify-between gap-4 flex-wrap">
        {/* Search Input & Active Sort Notification */}
        <div className="flex items-center gap-2.5 flex-1 min-w-[240px]">
          <div className="relative w-full max-w-sm">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 dark:text-[#777777]" />
            <input
              type="text"
              placeholder="테이블 내 실시간 데이터 필터링..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-8 py-1.5 bg-white dark:bg-[#252525] border border-stone-200 dark:border-[#383838] rounded-xl text-xs placeholder:text-stone-400 dark:placeholder:text-[#777777] text-stone-800 dark:text-[#f0f0f0] outline-none focus:border-amber-500 transition-colors shadow-2xs"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 dark:hover:text-[#ffffff] text-xs"
              >
                ✕
              </button>
            )}
          </div>

          {/* Active Sort Notification & Priority Reset Button */}
          {sortColumnId && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-100/90 dark:bg-amber-950/80 text-amber-900 dark:text-amber-300 text-xs border border-amber-300 dark:border-amber-800 animate-in fade-in flex-shrink-0">
              <span>{table.columns.find((c) => c.id === sortColumnId)?.name} 열 정렬 중</span>
              <button
                onClick={() => setSortColumnId(null)}
                className="ml-1 px-1.5 py-0.2 rounded bg-white/80 dark:bg-amber-900/60 hover:bg-white dark:hover:bg-amber-800 text-[10px] font-bold transition-colors"
                title="행 위치/우선순위 직접 변경을 위해 사용자 우선순위 순서로 복귀"
              >
                우선순위(수동) 순서로 복귀
              </button>
            </div>
          )}
        </div>

        {/* Right Toolbar Controls */}
        <div className="flex items-center gap-2">
          {/* Row Height Density Dropdown */}
          <div className="relative" ref={densityMenuRef}>
            <button
              onClick={() => setIsDensityMenuOpen(!isDensityMenuOpen)}
              className="px-2.5 py-1.5 bg-stone-100 dark:bg-[#282828] hover:bg-stone-200 dark:hover:bg-[#333333] text-stone-700 dark:text-[#e0e0e0] rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors border border-stone-200/60 dark:border-[#383838]"
              title="행 높이 밀도 조절"
            >
              <AlignJustify className="w-3.5 h-3.5 text-stone-500 dark:text-stone-400" />
              <span>
                높이: {rowDensity === 'compact' ? '좁게' : rowDensity === 'spacious' ? '넓게' : '보통'}
              </span>
              <ChevronDown className="w-3 h-3 text-stone-400" />
            </button>

            {isDensityMenuOpen && (
              <div className="absolute right-0 top-full mt-1 w-36 bg-white dark:bg-[#222222] border border-stone-200 dark:border-[#383838] rounded-xl shadow-xl p-1 z-40 text-xs animate-in fade-in slide-in-from-top-1 duration-150 mat-shadow-3">
                <button
                  onClick={() => {
                    handleDensityChange('compact');
                    setIsDensityMenuOpen(false);
                  }}
                  className={`w-full px-2 py-1.5 rounded-lg text-left flex items-center justify-between transition-colors ${
                    rowDensity === 'compact'
                      ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 font-bold'
                      : 'hover:bg-stone-100 dark:hover:bg-[#2e2e2e] text-stone-700 dark:text-[#cccccc]'
                  }`}
                >
                  <span>좁게 (Compact)</span>
                  {rowDensity === 'compact' && <span className="text-amber-500">•</span>}
                </button>
                <button
                  onClick={() => {
                    handleDensityChange('normal');
                    setIsDensityMenuOpen(false);
                  }}
                  className={`w-full px-2 py-1.5 rounded-lg text-left flex items-center justify-between transition-colors ${
                    rowDensity === 'normal'
                      ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 font-bold'
                      : 'hover:bg-stone-100 dark:hover:bg-[#2e2e2e] text-stone-700 dark:text-[#cccccc]'
                  }`}
                >
                  <span>보통 (Normal)</span>
                  {rowDensity === 'normal' && <span className="text-amber-500">•</span>}
                </button>
                <button
                  onClick={() => {
                    handleDensityChange('spacious');
                    setIsDensityMenuOpen(false);
                  }}
                  className={`w-full px-2 py-1.5 rounded-lg text-left flex items-center justify-between transition-colors ${
                    rowDensity === 'spacious'
                      ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 font-bold'
                      : 'hover:bg-stone-100 dark:hover:bg-[#2e2e2e] text-stone-700 dark:text-[#cccccc]'
                  }`}
                >
                  <span>넓게 (Spacious)</span>
                  {rowDensity === 'spacious' && <span className="text-amber-500">•</span>}
                </button>
              </div>
            )}
          </div>

          {/* Row Actions Menu Button */}
          <div className="relative" ref={rowMenuRef}>
            <button
              onClick={() => setIsRowMenuOpen(!isRowMenuOpen)}
              className="px-3 py-1.5 bg-stone-100 dark:bg-[#282828] hover:bg-stone-200 dark:hover:bg-[#333333] text-stone-700 dark:text-[#e0e0e0] rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors border border-stone-200/60 dark:border-[#383838]"
            >
              <Rows className="w-3.5 h-3.5 text-stone-500 dark:text-stone-400" />
              <span>행 작업 ({selectedRowIds.size}개 선택)</span>
              <ChevronDown className="w-3 h-3 text-stone-400" />
            </button>

            {isRowMenuOpen && (
              <div className="absolute right-0 top-full mt-1 w-56 bg-white dark:bg-[#222222] border border-stone-200 dark:border-[#383838] rounded-xl shadow-xl p-1.5 z-40 text-xs animate-in fade-in slide-in-from-top-1 duration-150 mat-shadow-3">
                <div className="px-2 py-1 text-[10px] font-semibold text-stone-400 dark:text-[#888888] uppercase">
                  새 행 추가 (팝업 대화상자)
                </div>
                <button
                  onClick={() => handleOpenAddRowModal('bottom')}
                  className="w-full px-2 py-1.5 text-left hover:bg-amber-50 dark:hover:bg-amber-950/40 text-stone-800 dark:text-[#eeeeee] rounded-lg flex items-center gap-2"
                >
                  <Plus className="w-3.5 h-3.5 text-amber-500" />
                  <span>맨 아래에 새 행 추가</span>
                </button>
                <button
                  onClick={() => handleOpenAddRowModal('top')}
                  className="w-full px-2 py-1.5 text-left hover:bg-amber-50 dark:hover:bg-amber-950/40 text-stone-800 dark:text-[#eeeeee] rounded-lg flex items-center gap-2"
                >
                  <Plus className="w-3.5 h-3.5 text-amber-500" />
                  <span>맨 위에 새 행 추가</span>
                </button>

                {selectedRowIds.size > 0 && (
                  <>
                    <div className="my-1 border-t border-stone-200 dark:border-[#333333]" />
                    <div className="px-2 py-1 text-[10px] font-semibold text-stone-400 dark:text-[#888888] uppercase">
                      선택된 {selectedRowIds.size}개 행 우선순위 이동
                    </div>
                    <button
                      onClick={() => handleMoveSelectedRows('top')}
                      className="w-full px-2 py-1.5 text-left hover:bg-stone-100 dark:hover:bg-[#333333] text-stone-700 dark:text-[#cccccc] rounded-lg flex items-center gap-2"
                    >
                      <ChevronsUp className="w-3.5 h-3.5 text-amber-500" />
                      <span>최상단으로 일괄 이동</span>
                    </button>
                    <button
                      onClick={() => handleMoveSelectedRows('up')}
                      className="w-full px-2 py-1.5 text-left hover:bg-stone-100 dark:hover:bg-[#333333] text-stone-700 dark:text-[#cccccc] rounded-lg flex items-center gap-2"
                    >
                      <ArrowUp className="w-3.5 h-3.5 text-stone-500" />
                      <span>위로 한 칸 이동</span>
                    </button>
                    <button
                      onClick={() => handleMoveSelectedRows('down')}
                      className="w-full px-2 py-1.5 text-left hover:bg-stone-100 dark:hover:bg-[#333333] text-stone-700 dark:text-[#cccccc] rounded-lg flex items-center gap-2"
                    >
                      <ArrowDown className="w-3.5 h-3.5 text-stone-500" />
                      <span>아래로 한 칸 이동</span>
                    </button>
                    <button
                      onClick={() => handleMoveSelectedRows('bottom')}
                      className="w-full px-2 py-1.5 text-left hover:bg-stone-100 dark:hover:bg-[#333333] text-stone-700 dark:text-[#cccccc] rounded-lg flex items-center gap-2"
                    >
                      <ChevronsDown className="w-3.5 h-3.5 text-amber-500" />
                      <span>최하단으로 일괄 이동</span>
                    </button>

                    <div className="my-1 border-t border-stone-200 dark:border-[#333333]" />
                    <button
                      onClick={handleDuplicateSelectedRows}
                      className="w-full px-2 py-1.5 text-left hover:bg-stone-100 dark:hover:bg-[#333333] text-stone-700 dark:text-[#cccccc] rounded-lg flex items-center gap-2"
                    >
                      <Copy className="w-3.5 h-3.5 text-blue-500" />
                      <span>선택 행 복제하기</span>
                    </button>
                    <button
                      onClick={handleDeleteSelectedRows}
                      className="w-full px-2 py-1.5 text-left hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600 dark:text-rose-400 rounded-lg flex items-center gap-2 font-semibold"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>선택 행 삭제하기</span>
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Quick Add Row Button (Opens Add Row Modal) */}
          <button
            onClick={() => handleOpenAddRowModal('bottom')}
            className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold rounded-lg text-xs flex items-center gap-1.5 transition-all shadow-sm active:scale-98"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>새 행 추가</span>
          </button>
        </div>
      </div>

      {/* Tag Filter Bar (Request 10: 분류/상태/선택 태그 열 필터 적용) */}
      {filterableTagColumns.length > 0 && (
        <div className="px-6 py-2 border-b border-stone-200/60 dark:border-[#2d2d2d] bg-amber-50/20 dark:bg-[#1a1a1a] flex items-center gap-3 overflow-x-auto custom-scrollbar flex-shrink-0">
          <div className="flex items-center gap-1 text-[11px] font-bold text-stone-500 dark:text-stone-400 flex-shrink-0">
            <Filter className="w-3 h-3 text-amber-500" />
            <span>태그 필터:</span>
          </div>

          {filterableTagColumns.map((col) => {
            const activeFilter = selectedTagFilters[col.id];
            const options = col.options || [];

            return (
              <div key={col.id} className="flex items-center gap-1.5 flex-shrink-0">
                <span className="text-[11px] font-semibold text-stone-600 dark:text-stone-300">
                  {col.name}:
                </span>
                <button
                  onClick={() => {
                    setSelectedTagFilters((prev) => {
                      const next = { ...prev };
                      delete next[col.id];
                      return next;
                    });
                  }}
                  className={`px-2 py-0.5 text-[11px] rounded-full font-medium transition-all ${
                    !activeFilter
                      ? 'bg-amber-500 text-stone-950 font-bold shadow-xs'
                      : 'bg-stone-200/70 dark:bg-[#282828] text-stone-600 dark:text-stone-400 hover:bg-stone-300'
                  }`}
                >
                  전체
                </button>

                {options.map((opt) => {
                  const isSelected = activeFilter === opt.label || activeFilter === opt.id;
                  return (
                    <button
                      key={opt.id}
                      onClick={() => {
                        setSelectedTagFilters((prev) => ({
                          ...prev,
                          [col.id]: isSelected ? '' : opt.label,
                        }));
                      }}
                      style={{
                        backgroundColor: isSelected ? opt.color : `${opt.color}15`,
                        color: isSelected ? '#ffffff' : opt.color,
                        borderColor: opt.color,
                      }}
                      className="px-2 py-0.5 text-[11px] rounded-full font-semibold border transition-all"
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            );
          })}

          {Object.values(selectedTagFilters).some(Boolean) && (
            <button
              onClick={() => setSelectedTagFilters({})}
              className="ml-auto text-[11px] text-rose-500 hover:underline flex items-center gap-0.5 flex-shrink-0 font-medium"
            >
              <X className="w-3 h-3" /> 필터 초기화
            </button>
          )}
        </div>
      )}

      {/* Main Grid View Container */}
      <div className="flex-1 overflow-auto custom-scrollbar relative">
        <table className="w-full border-collapse text-left text-xs font-sans">
          {/* Table Header Columns Width Mapping */}
          <colgroup>
            <col style={{ width: '80px' }} />
            {visibleColumns.map((col) => (
              <col
                key={col.id}
                style={{ width: `${columnWidths[col.id] || col.width || 160}px` }}
              />
            ))}
            <col style={{ width: '144px' }} />
          </colgroup>
          {/* Table Header Row */}
          <thead className="sticky top-0 z-30 bg-stone-100/95 dark:bg-[#222222]/95 backdrop-blur-md border-b border-stone-200 dark:border-[#383838] shadow-2xs">
            <tr>
              {/* Checkbox, Drag Handle & Priority Index Header */}
              <th className="w-20 px-2 py-2.5 text-center font-semibold text-stone-400 dark:text-[#888888] border-r border-stone-200 dark:border-[#333333] select-none">
                <div className="flex items-center justify-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={table.rows.length > 0 && selectedRowIds.size === table.rows.length}
                    onChange={toggleSelectAll}
                    className="rounded accent-amber-500 cursor-pointer"
                    title="전체 선택"
                  />
                  <span className="text-[10px] uppercase font-mono font-bold" title="우선순위 순번">#</span>
                </div>
              </th>

              {/* Dynamic Visible Columns */}
              {visibleColumns.map((col) => {
                const currentWidth = columnWidths[col.id] || col.width || 160;
                const isSorted = sortColumnId === col.id;

                return (
                  <th
                    key={col.id}
                    style={{ width: `${currentWidth}px` }}
                    className="relative px-3 py-2.5 font-semibold text-stone-800 dark:text-[#f0f0f0] border-r border-stone-200 dark:border-[#333333] select-none group/th hover:bg-stone-200/50 dark:hover:bg-[#2a2a2a] transition-colors"
                  >
                    <div
                      className="flex items-center justify-between gap-1.5 cursor-pointer"
                      onClick={() => handleHeaderSort(col.id)}
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        {getColTypeIcon(col.type)}
                        <span className="truncate font-semibold text-xs text-stone-800 dark:text-[#f5f5f5]" title={col.name}>
                          {col.name}
                        </span>
                        {col.isPrimaryKey && (
                          <span className="text-[9px] px-1 py-0.2 rounded bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 font-bold">
                            PK
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1">
                        {isSorted ? (
                          sortDirection === 'asc' ? (
                            <ArrowUp className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                          ) : (
                            <ArrowDown className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                          )
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-stone-400 dark:text-[#666666] opacity-0 group-hover/th:opacity-60" />
                        )}
                      </div>
                    </div>

                    {/* Column Resizing Drag Handle */}
                    <div
                      onMouseDown={(e) => handleResizeStart(e, col.id, currentWidth)}
                      className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-amber-500 active:bg-amber-600 z-10"
                    />
                  </th>
                );
              })}

              {/* Add / Manage Columns Header */}
              <th className="w-36 px-3 py-2.5 text-center font-medium border-b border-stone-200 dark:border-[#383838]">
                <button
                  onClick={() => setIsColumnManagerOpen(true)}
                  className="px-2 py-1 bg-stone-200/80 dark:bg-[#2a2a2a] hover:bg-amber-100 dark:hover:bg-amber-950 text-stone-700 dark:text-[#dddddd] hover:text-amber-700 dark:hover:text-amber-300 rounded text-xs font-semibold flex items-center gap-1 mx-auto transition-colors border border-stone-300/60 dark:border-[#404040]"
                  title="열 추가 및 관리"
                >
                  <Plus className="w-3 h-3" />
                  열 관리
                </button>
              </th>
            </tr>
          </thead>

          {/* Table Body Rows with Drag-and-Drop */}
          <tbody className="divide-y divide-stone-200/70 dark:divide-[#2d2d2d] bg-white dark:bg-[#181818]">
            {processedRows.map((row, rIdx) => {
              const isSelected深受 = selectedRowIds.has(row.id);
              const heightClass = getRowHeightClass();
              const isDragging = draggedRowId === row.id;
              const isDropTarget = dropTargetRowId === row.id;

              return (
                <tr
                  key={row.id}
                  onDragOver={(e) => handleRowDragOver(e, row.id)}
                  onDrop={(e) => handleRowDrop(e, row.id)}
                  onDragEnd={handleRowDragEnd}
                  onClick={(e) => {
                    const target = e.target as HTMLElement;
                    if (
                      target.tagName === 'INPUT' ||
                      target.tagName === 'SELECT' ||
                      target.tagName === 'BUTTON' ||
                      target.closest('button') ||
                      target.closest('input') ||
                      target.closest('select') ||
                      target.closest('[data-editing-cell="true"]')
                    ) {
                      return;
                    }
                    if (editingCell) {
                      commitCellEdit人力(editingCell.rowId, editingCell.colId, editingValue);
                    }
                    onOpenRowDetail(row, rIdx);
                  }}
                  className={`group/row transition-all cursor-pointer relative ${
                    isDragging ? 'opacity-30 bg-amber-200 dark:bg-amber-950' : ''
                  } ${
                    isDropTarget && dropIndicatorPosition === 'above'
                      ? 'border-t-2 border-t-amber-500'
                      : ''
                  } ${
                    isDropTarget && dropIndicatorPosition === 'below'
                      ? 'border-b-2 border-b-amber-500'
                      : ''
                  } ${
                    isSelected深受
                      ? 'bg-amber-500/15 dark:bg-amber-500/20'
                      : rIdx % 2 === 0
                      ? 'bg-white dark:bg-[#181818] hover:bg-stone-100/70 dark:hover:bg-[#252525]'
                      : 'bg-stone-50/40 dark:bg-[#1c1c1c] hover:bg-stone-100/70 dark:hover:bg-[#252525]'
                  }`}
                >
                  {/* Row Checkbox, Drag Handle & Priority Index */}
                  <td
                    onClick={(e) => e.stopPropagation()}
                    className={`px-2 ${heightClass} text-center font-mono text-[11px] text-stone-400 dark:text-[#888888] border-r border-stone-200/70 dark:border-[#2d2d2d] select-none`}
                  >
                    <div className="flex items-center justify-center gap-1.5">
                      {/* Drag Handle */}
                      <div
                        draggable
                        onDragStart={(e) => handleRowDragStart(e, row.id)}
                        className="cursor-grab active:cursor-grabbing p-0.5 text-stone-300 dark:text-[#555555] hover:text-amber-500 dark:hover:text-amber-400 transition-colors"
                        title="드래그하여 우선순위(위치) 변경"
                      >
                        <GripVertical className="w-3.5 h-3.5" />
                      </div>

                      <input
                        type="checkbox"
                        checked={isSelected深受}
                        onChange={() => toggleSelectRow(row.id)}
                        className="rounded accent-amber-500 cursor-pointer"
                      />
                      <span className="font-semibold text-stone-600 dark:text-[#aaaaaa] min-w-[14px]">
                        {rIdx + 1}
                      </span>
                    </div>
                  </td>

                  {/* Render Visible Column Cells */}
                  {visibleColumns.map((col) => {
                    const rawVal = row.data[col.id];
                    const isEditing = editingCell?.rowId === row.id && editingCell?.colId === col.id;

                    return (
                      <td
                        key={col.id}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          if (editingCell) {
                            commitCellEdit人力(editingCell.rowId, editingCell.colId, editingValue);
                          }
                          setEditingCell({ rowId: row.id, colId: col.id });
                          setEditingValue(rawVal ?? '');
                        }}
                        className={`px-3 ${heightClass} border-r border-stone-200/70 dark:border-[#2d2d2d] font-sans text-xs relative overflow-hidden text-stone-900 dark:text-[#f0f0f0]`}
                      >
                        {isEditing ? (
                          <div data-editing-cell="true" className="w-full" onClick={(e) => e.stopPropagation()}>
                            {col.type === 'status' || col.type === 'select' ? (
                              <SelectOrCustomInput
                                autoFocus
                                value={editingValue}
                                options={col.options}
                                placeholder="선택 안 함"
                                onChange={(val) => {
                                  setEditingValue(val);
                                  commitCellEdit人力(row.id, col.id, val);
                                }}
                                onBlur={() => commitCellEdit人力(row.id, col.id, editingValue)}
                              />
                            ) : col.type === 'checkbox' ? (
                              <input
                                type="checkbox"
                                autoFocus
                                checked={!!editingValue}
                                onChange={(e) => {
                                  commitCellEdit人力(row.id, col.id, e.target.checked);
                                }}
                                onBlur={() => commitCellEdit人力(row.id, col.id, editingValue)}
                                className="rounded accent-amber-500"
                              />
                            ) : (
                              <input
                                autoFocus
                                type={col.type === 'number' ? 'number' : col.type === 'date' ? 'date' : 'text'}
                                value={editingValue}
                                onChange={(e) => setEditingValue(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') commitCellEdit人力(row.id, col.id, editingValue);
                                  if (e.key === 'Escape') setEditingCell(null);
                                }}
                                onBlur={() => commitCellEdit人力(row.id, col.id, editingValue)}
                                className="w-full bg-white dark:bg-[#242424] border border-amber-500 rounded px-1.5 py-0.5 outline-none text-xs text-stone-900 dark:text-[#ffffff]"
                              />
                            )}
                          </div>
                        ) : (
                          <TruncatedPreviewCell
                            value={rawVal}
                            columnType={col.type}
                            onOpenEditor={() => onOpenRowDetail(row, rIdx)}
                            onOpenImage={(src) => setLightboxImg(src)}
                            renderCustomContent={(val) => {
                              if (col.type === 'checkbox') {
                                return (
                                  <input
                                    type="checkbox"
                                    checked={!!val}
                                    onChange={(e) => {
                                      commitCellEdit人力(row.id, col.id, e.target.checked);
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                    className="rounded accent-amber-500 cursor-pointer"
                                  />
                                );
                              }

                              if (col.type === 'status' || col.type === 'select') {
                                if (val === undefined || val === null || val === '') {
                                  return <span className="text-stone-400 dark:text-[#777777] italic">미정</span>;
                                }

                                const strVal = cleanTextValue(val);
                                const option = col.options?.find(
                                  (o) => o.id === strVal || o.label === strVal || o.id === String(val) || o.label === String(val)
                                );

                                if (option) {
                                  return (
                                    <span
                                      style={{
                                        backgroundColor: `${option.color}25`,
                                        color: option.color,
                                        borderColor: `${option.color}50`,
                                      }}
                                      className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border"
                                    >
                                      {option.label}
                                    </span>
                                  );
                                }

                                const defaultTagColors = ['#F59E0B', '#3B82F6', '#10B981', '#8B5CF6', '#EC4899', '#06B6D4'];
                                let hash = 0;
                                for (let i = 0; i < strVal.length; i++) hash = (hash << 5) - hash + strVal.charCodeAt(i);
                                const color = defaultTagColors[Math.abs(hash) % defaultTagColors.length];

                                return (
                                  <span
                                    style={{
                                      backgroundColor: `${color}25`,
                                      color: color,
                                      borderColor: `${color}50`,
                                    }}
                                    className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border"
                                  >
                                    {strVal}
                                  </span>
                                );
                              }

                              if (col.type === 'code') {
                                return (
                                  <code className="px-1.5 py-0.5 rounded bg-stone-100 dark:bg-[#282828] border border-stone-200 dark:border-[#383838] text-amber-700 dark:text-amber-300 font-mono text-[11px]">
                                    {cleanTextValue(val)}
                                  </code>
                                );
                              }

                              return (
                                <span className="text-stone-800 dark:text-[#f0f0f0] font-normal">
                                  {cleanTextValue(val)}
                                </span>
                              );
                            }}
                          />
                        )}
                      </td>
                    );
                  })}

                  {/* Row Actions: Reorder Up/Down, Detail, Rich Editor, Delete */}
                  <td className={`px-2 ${heightClass} text-center border-b border-stone-200/70 dark:border-[#2d2d2d]`}>
                    <div className="flex items-center justify-center gap-0.5 opacity-0 group-hover/row:opacity-100 transition-opacity">
                      {/* Move Row Up */}
                      <button
                        disabled={rIdx === 0}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMoveRow(row.id, 'up');
                        }}
                        title="위로 이동 (우선순위 상승)"
                        className="p-1 rounded hover:bg-amber-100 dark:hover:bg-amber-950/60 disabled:opacity-20 text-stone-500 dark:text-[#aaaaaa] hover:text-amber-600 dark:hover:text-amber-400 transition-colors"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>

                      {/* Move Row Down */}
                      <button
                        disabled={rIdx === table.rows.length - 1}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMoveRow(row.id, 'down');
                        }}
                        title="아래로 이동 (우선순위 하락)"
                        className="p-1 rounded hover:bg-amber-100 dark:hover:bg-amber-950/60 disabled:opacity-20 text-stone-500 dark:text-[#aaaaaa] hover:text-amber-600 dark:hover:text-amber-400 transition-colors"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>

                      {/* Detail View */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenRowDetail(row, rIdx);
                        }}
                        title="전체 데이터 상세 뷰어 열기"
                        className="p-1 rounded hover:bg-stone-200 dark:hover:bg-[#333333] text-stone-600 dark:text-[#cccccc] transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>

                      {/* TipTap Rich Editor */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenRowEditor(row);
                        }}
                        title="리치 에디터 &amp; 스티커 열기"
                        className="p-1 rounded hover:bg-amber-100 dark:hover:bg-amber-950/60 text-amber-700 dark:text-amber-400 transition-colors"
                      >
                        <Maximize2 className="w-3.5 h-3.5" />
                      </button>

                      {/* Delete Single Row */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const updated = table.rows.filter((r) => r.id !== row.id);
                          onUpdateTable({ ...table, rows: updated, updatedAt: Date.now() });
                        }}
                        title="행 삭제"
                        className="p-1 rounded hover:bg-rose-100 dark:hover:bg-rose-950/60 text-rose-600 dark:text-rose-400 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}

            {processedRows.length === 0 && (
              <tr>
                <td
                  colSpan={visibleColumns.length + 2}
                  className="py-12 text-center text-stone-400 dark:text-[#888888] text-xs bg-white dark:bg-[#181818]"
                >
                  <p>데이터 행이 없습니다.</p>
                  <button
                    onClick={() => handleOpenAddRowModal('bottom')}
                    className="mt-2 px-3 py-1.5 bg-amber-500 text-stone-950 font-bold rounded-lg text-xs hover:bg-amber-400"
                  >
                    첫 번째 행 추가하기 🐝
                  </button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Table Footer Status */}
      <div className="px-6 py-2.5 border-t border-stone-200/80 dark:border-[#333333] bg-stone-50/70 dark:bg-[#1e1e1e]/60 flex items-center justify-between text-xs text-stone-500 dark:text-[#a0a0a0]">
        <div className="flex items-center gap-3">
          <span>총 <strong className="text-stone-800 dark:text-[#f0f0f0]">{table.rows.length}</strong>개 행</span>
          <span>•</span>
          <span><strong className="text-stone-800 dark:text-[#f0f0f0]">{visibleColumns.length}</strong>/{table.columns.length}개 컬럼 표시중</span>
          <span className="text-[11px] text-stone-400 dark:text-[#777777]">
            (💡 행 좌측의 드래그 핸들이나 화살표로 우선순위 위치를 언제든 교체할 수 있습니다)
          </span>
        </div>
        <div>
          <span>WonBee Realtime Data Grid</span>
        </div>
      </div>

      {/* Add Row Modal (Popup as requested) */}
      <AddRowModal
        isOpen={isAddRowModalOpen}
        onClose={() => setIsAddRowModalOpen(false)}
        columns={table.columns}
        tableName={table.title}
        insertPosition={addRowPosition}
        onAddRow={handleCreateRowFromModal}
      />

      {/* Column Manager Modal */}
      <ColumnManagerModal
        isOpen={isColumnManagerOpen}
        onClose={() => setIsColumnManagerOpen(false)}
        columns={table.columns}
        hiddenColumnIds={hiddenColumnIds}
        onToggleColumnVisibility={toggleColumnVisibility}
        onReorderColumns={handleReorderColumns}
        onAddColumn={handleAddColumnFromModal}
        onUpdateColumn={handleUpdateColumnFromModal}
        onDeleteColumn={handleDeleteColumnFromModal}
      />

      {/* Image Lightbox Modal */}
      <ImageLightboxModal
        isOpen={!!lightboxImg}
        imageUrl={lightboxImg}
        onClose={() => setLightboxImg(null)}
      />
    </div>
  );
};
