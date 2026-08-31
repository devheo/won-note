import React, { useState, useRef, useMemo, useEffect } from 'react';
import { TableDocument, TableColumn, TableRow, ColumnType, RowDensity } from '../../types';
import { TruncatedPreviewCell } from '../common/TruncatedPreviewCell';
import { ColumnManagerModal } from '../modals/ColumnManagerModal';
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

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (rowMenuRef.current && !rowMenuRef.current.contains(e.target as Node)) {
        setIsRowMenuOpen(false);
      }
      if (densityMenuRef.current && !densityMenuRef.current.contains(e.target as Node)) {
        setIsDensityMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', handleOutsideClick);
    return () => window.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // Inline Cell Editing state
  const [editingCell, setEditingCell] = useState<{ rowId: string; colId: string } | null>(null);
  const [editingValue, setEditingValue] = useState<any>('');

  // Column Resizing state
  const resizingColumnRef = useRef<{ id: string; startX: number; startWidth: number } | null>(null);
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
    resizingColumnRef.current = {
      id: colId,
      startX: e.clientX,
      startWidth: currentWidth,
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!resizingColumnRef.current) return;
      const delta = moveEvent.clientX - resizingColumnRef.current.startX;
      const newWidth = Math.max(80, resizingColumnRef.current.startWidth + delta);

      setColumnWidths((prev) => ({
        ...prev,
        [resizingColumnRef.current!.id]: newWidth,
      }));
    };

    const handleMouseUp = () => {
      if (resizingColumnRef.current) {
        const finishedId = resizingColumnRef.current.id;
        const finalWidth = columnWidths[finishedId];
        if (finalWidth) {
          const updatedCols = table.columns.map((c) =>
            c.id === finishedId ? { ...c, width: finalWidth } : c
          );
          onUpdateTable({
            ...table,
            columns: updatedCols,
            updatedAt: Date.now(),
          });
        }
      }
      resizingColumnRef.current = null;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
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

  // Add Row to Bottom
  const handleAddRowBottom = () => {
    const newRowId = `row-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 5)}`;
    const newRow: TableRow = {
      id: newRowId,
      data: {
        title: `새 항목 #${table.rows.length + 1}`,
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const updated = {
      ...table,
      rows: [...table.rows, newRow],
      updatedAt: Date.now(),
    };
    onUpdateTable(updated);
  };

  // Add Row to Top
  const handleAddRowTop = () => {
    const newRowId = `row-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 5)}`;
    const newRow: TableRow = {
      id: newRowId,
      data: {
        title: `새 항목 (상단)`,
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const updated = {
      ...table,
      rows: [newRow, ...table.rows],
      updatedAt: Date.now(),
    };
    onUpdateTable(updated);
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

  // ===================== Row Position & Priority Moving =====================
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
    
    let newTargetIdx = newRows.findIndex((r) => r.id === targetRowId);
    if (position === 'below') {
      newTargetIdx += 1;
    }

    newRows.splice(newTargetIdx, 0, movedRow);

    onUpdateTable({
      ...table,
      rows: newRows,
      updatedAt: Date.now(),
    });
  };

  // Move Single Row Up / Down / Top / Bottom
  const handleMoveRow = (rowId: string, direction: 'up' | 'down' | 'top' | 'bottom') => {
    if (sortColumnId) {
      setSortColumnId(null);
    }
    const idx = table.rows.findIndex((r) => r.id === rowId);
    if (idx === -1) return;

    const newRows = [...table.rows];
    const [moved] = newRows.splice(idx, 1);

    if (direction === 'top') {
      newRows.unshift(moved);
    } else if (direction === 'bottom') {
      newRows.push(moved);
    } else if (direction === 'up') {
      const targetIdx = Math.max(0, idx - 1);
      newRows.splice(targetIdx, 0, moved);
    } else if (direction === 'down') {
      const targetIdx = Math.min(newRows.length, idx + 1);
      newRows.splice(targetIdx, 0, moved);
    }

    onUpdateTable({
      ...table,
      rows: newRows,
      updatedAt: Date.now(),
    });
  };

  // Move Selected Rows Up / Down / Top / Bottom
  const handleMoveSelectedRows = (direction: 'up' | 'down' | 'top' | 'bottom') => {
    if (selectedRowIds.size === 0) return;
    if (sortColumnId) {
      setSortColumnId(null);
    }

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
      const unselected = currentRows.filter((r) => !selectedRowIds.has(r.id));
      onUpdateTable({
        ...table,
        rows: [...unselected, ...selected],
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
      for (let i = currentRows.length - 2; i >= 0; i--) {
        if (selectedRowIds.has(currentRows[i].id) && !selectedRowIds.has(currentRows[i + 1].id)) {
          const temp = currentRows[i];
          currentRows[i] = currentRows[i + 1];
          currentRows[i + 1] = temp;
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

  // Inline Cell Commit
  const commitCellEdit = (rowId: string, colId: string, val: any) => {
    const updatedRows = table.rows.map((row) => {
      if (row.id === rowId) {
        return {
          ...row,
          data: {
            ...row.data,
            [colId]: val,
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

  // Filtered & Sorted Rows
  const processedRows = useMemo(() => {
    let list = [...table.rows];

    // Filter Query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((r) => {
        return table.columns.some((col) => {
          const val = r.data[col.id];
          return val !== undefined && val !== null && String(val).toLowerCase().includes(q);
        });
      });
    }

    // Sort
    if (sortColumnId) {
      list.sort((a, b) => {
        const valA = a.data[sortColumnId];
        const valB = b.data[sortColumnId];

        if (valA === undefined || valA === null) return 1;
        if (valB === undefined || valB === null) return -1;

        if (typeof valA === 'number' && typeof valB === 'number') {
          return sortDirection === 'asc' ? valA - valB : valB - valA;
        }

        const strA = String(valA);
        const strB = String(valB);
        return sortDirection === 'asc'
          ? strA.localeCompare(strB, 'ko-KR')
          : strB.localeCompare(strA, 'ko-KR');
      });
    }

    return list;
  }, [table.rows, table.columns, searchQuery, sortColumnId, sortDirection]);

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

          {/* Column Management Button (열 관리) */}
          <button
            onClick={() => setIsColumnManagerOpen(true)}
            className="px-2.5 py-1.5 bg-stone-100 dark:bg-[#282828] hover:bg-stone-200 dark:hover:bg-[#333333] text-stone-700 dark:text-[#e0e0e0] rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors border border-stone-200/60 dark:border-[#383838]"
            title="열(Column) 관리: 추가, 수정, 순서 변경, 삭제, 숨기기"
          >
            <Sliders className="w-3.5 h-3.5 text-amber-500" />
            <span>열 관리 ({visibleColumns.length}/{table.columns.length})</span>
          </button>

          {/* Row Management Dropdown & Add Row Button */}
          <div className="relative flex items-center" ref={rowMenuRef}>
            <button
              id="btn-add-table-row"
              onClick={handleAddRowBottom}
              className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-stone-950 rounded-l-lg text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all active:scale-98"
            >
              <Plus className="w-3.5 h-3.5" />
              행 추가
            </button>
            <button
              onClick={() => setIsRowMenuOpen(!isRowMenuOpen)}
              className="px-1.5 py-1.5 bg-amber-600 hover:bg-amber-500 text-stone-950 rounded-r-lg border-l border-amber-400/40 text-xs font-bold flex items-center transition-colors"
              title="행 관리 및 우선순위 이동 옵션"
            >
              <ChevronDown className="w-3.5 h-3.5" />
            </button>

            {isRowMenuOpen && (
              <div className="absolute right-0 top-full mt-1 w-52 bg-white dark:bg-[#222222] border border-stone-200 dark:border-[#383838] rounded-xl shadow-xl p-1 z-40 text-xs animate-in fade-in slide-in-from-top-1 duration-150 mat-shadow-3">
                <button
                  onClick={() => {
                    handleAddRowTop();
                    setIsRowMenuOpen(false);
                  }}
                  className="w-full px-2.5 py-1.5 rounded-lg text-left hover:bg-stone-100 dark:hover:bg-[#2e2e2e] text-stone-700 dark:text-[#cccccc] flex items-center gap-2 transition-colors"
                >
                  <ArrowUp className="w-3.5 h-3.5 text-amber-500" />
                  맨 위에 새 행 추가
                </button>
                <button
                  onClick={() => {
                    handleAddRowBottom();
                    setIsRowMenuOpen(false);
                  }}
                  className="w-full px-2.5 py-1.5 rounded-lg text-left hover:bg-stone-100 dark:hover:bg-[#2e2e2e] text-stone-700 dark:text-[#cccccc] flex items-center gap-2 transition-colors"
                >
                  <ArrowDown className="w-3.5 h-3.5 text-amber-500" />
                  맨 아래에 새 행 추가
                </button>

                {selectedRowIds.size > 0 && (
                  <>
                    <div className="my-1 border-t border-stone-200 dark:border-[#333333]" />
                    <div className="px-2.5 py-1 text-[10px] font-semibold text-stone-400 dark:text-[#888888] uppercase">
                      선택 행 우선순위 이동 ({selectedRowIds.size}개)
                    </div>
                    <button
                      onClick={() => {
                        handleMoveSelectedRows('top');
                        setIsRowMenuOpen(false);
                      }}
                      className="w-full px-2.5 py-1.5 rounded-lg text-left hover:bg-stone-100 dark:hover:bg-[#2e2e2e] text-stone-700 dark:text-[#cccccc] flex items-center gap-2 transition-colors"
                    >
                      <ChevronsUp className="w-3.5 h-3.5 text-amber-500" />
                      최상단으로 이동 (최우선순위)
                    </button>
                    <button
                      onClick={() => {
                        handleMoveSelectedRows('up');
                        setIsRowMenuOpen(false);
                      }}
                      className="w-full px-2.5 py-1.5 rounded-lg text-left hover:bg-stone-100 dark:hover:bg-[#2e2e2e] text-stone-700 dark:text-[#cccccc] flex items-center gap-2 transition-colors"
                    >
                      <ArrowUp className="w-3.5 h-3.5 text-amber-500" />
                      위로 한 칸 이동
                    </button>
                    <button
                      onClick={() => {
                        handleMoveSelectedRows('down');
                        setIsRowMenuOpen(false);
                      }}
                      className="w-full px-2.5 py-1.5 rounded-lg text-left hover:bg-stone-100 dark:hover:bg-[#2e2e2e] text-stone-700 dark:text-[#cccccc] flex items-center gap-2 transition-colors"
                    >
                      <ArrowDown className="w-3.5 h-3.5 text-amber-500" />
                      아래로 한 칸 이동
                    </button>
                    <button
                      onClick={() => {
                        handleMoveSelectedRows('bottom');
                        setIsRowMenuOpen(false);
                      }}
                      className="w-full px-2.5 py-1.5 rounded-lg text-left hover:bg-stone-100 dark:hover:bg-[#2e2e2e] text-stone-700 dark:text-[#cccccc] flex items-center gap-2 transition-colors"
                    >
                      <ChevronsDown className="w-3.5 h-3.5 text-amber-500" />
                      최하단으로 이동 (최하위)
                    </button>

                    <div className="my-1 border-t border-stone-200 dark:border-[#333333]" />
                    <button
                      onClick={handleDuplicateSelectedRows}
                      className="w-full px-2.5 py-1.5 rounded-lg text-left hover:bg-stone-100 dark:hover:bg-[#2e2e2e] text-stone-700 dark:text-[#cccccc] flex items-center gap-2 transition-colors"
                    >
                      <Copy className="w-3.5 h-3.5 text-blue-500" />
                      선택 행({selectedRowIds.size}) 복제
                    </button>
                    <button
                      onClick={handleDeleteSelectedRows}
                      className="w-full px-2.5 py-1.5 rounded-lg text-left hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600 dark:text-rose-400 flex items-center gap-2 transition-colors font-medium"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      선택 행({selectedRowIds.size}) 삭제
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bulk Action Bar (when rows are selected) */}
      {selectedRowIds.size > 0 && (
        <div className="px-6 py-2 bg-amber-500/10 dark:bg-amber-400/10 border-b border-amber-200/60 dark:border-amber-900/60 flex items-center justify-between flex-wrap gap-2 animate-in fade-in text-xs">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-amber-900 dark:text-amber-200">
              {selectedRowIds.size}개 행 선택됨
            </span>
            <span className="text-stone-400">•</span>
            <span className="text-stone-500 dark:text-[#a0a0a0]">우선순위 / 위치 변경:</span>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => handleMoveSelectedRows('top')}
              className="px-2 py-1 bg-stone-100 dark:bg-[#282828] hover:bg-stone-200 dark:hover:bg-[#333333] text-stone-700 dark:text-[#e0e0e0] rounded-md font-medium flex items-center gap-1 transition-colors border border-stone-200/60 dark:border-[#383838]"
              title="선택 행을 최상단(최우선순위)으로 이동"
            >
              <ChevronsUp className="w-3 h-3 text-amber-500" />
              맨 위로
            </button>
            <button
              onClick={() => handleMoveSelectedRows('up')}
              className="px-2 py-1 bg-stone-100 dark:bg-[#282828] hover:bg-stone-200 dark:hover:bg-[#333333] text-stone-700 dark:text-[#e0e0e0] rounded-md font-medium flex items-center gap-1 transition-colors border border-stone-200/60 dark:border-[#383838]"
              title="선택 행을 위로 한 칸 이동"
            >
              <ArrowUp className="w-3 h-3 text-amber-500" />
              위로
            </button>
            <button
              onClick={() => handleMoveSelectedRows('down')}
              className="px-2 py-1 bg-stone-100 dark:bg-[#282828] hover:bg-stone-200 dark:hover:bg-[#333333] text-stone-700 dark:text-[#e0e0e0] rounded-md font-medium flex items-center gap-1 transition-colors border border-stone-200/60 dark:border-[#383838]"
              title="선택 행을 아래로 한 칸 이동"
            >
              <ArrowDown className="w-3 h-3 text-amber-500" />
              아래로
            </button>
            <button
              onClick={() => handleMoveSelectedRows('bottom')}
              className="px-2 py-1 bg-stone-100 dark:bg-[#282828] hover:bg-stone-200 dark:hover:bg-[#333333] text-stone-700 dark:text-[#e0e0e0] rounded-md font-medium flex items-center gap-1 transition-colors border border-stone-200/60 dark:border-[#383838]"
              title="선택 행을 최하단으로 이동"
            >
              <ChevronsDown className="w-3 h-3 text-amber-500" />
              맨 아래로
            </button>

            <span className="text-stone-300 dark:text-[#444444]">|</span>

            <button
              onClick={handleDuplicateSelectedRows}
              className="px-2.5 py-1 bg-stone-100 dark:bg-[#282828] hover:bg-stone-200 dark:hover:bg-[#333333] text-stone-700 dark:text-[#e0e0e0] rounded-md font-medium flex items-center gap-1 transition-colors border border-stone-200/60 dark:border-[#383838]"
            >
              <Copy className="w-3 h-3 text-blue-500" />
              복제
            </button>
            <button
              onClick={handleDeleteSelectedRows}
              className="px-2.5 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded-md font-medium flex items-center gap-1 transition-colors shadow-2xs"
            >
              <Trash2 className="w-3 h-3" />
              삭제
            </button>
            <button
              onClick={() => setSelectedRowIds(new Set())}
              className="px-2.5 py-1 text-stone-600 dark:text-[#a0a0a0] hover:bg-black/5 dark:hover:bg-white/5 rounded-md font-medium"
            >
              선택 해제
            </button>
          </div>
        </div>
      )}

      {/* Excel-like Data Grid Container with High Dark Contrast */}
      <div className="flex-1 overflow-auto custom-scrollbar relative bg-white dark:bg-[#181818]">
        <table className="w-full border-collapse text-left text-xs table-fixed">
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

          {/* Table Body Rows with Drag-and-Drop & Enhanced Dark Mode Contrast */}
          <tbody className="divide-y divide-stone-200/70 dark:divide-[#2d2d2d] bg-white dark:bg-[#181818]">
            {processedRows.map((row, rIdx) => {
              const isSelected = selectedRowIds.has(row.id);
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
                      target.closest('select')
                    ) {
                      return;
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
                    isSelected
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
                        checked={isSelected}
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
                          setEditingCell({ rowId: row.id, colId: col.id });
                          setEditingValue(rawVal ?? '');
                        }}
                        className={`px-3 ${heightClass} border-r border-stone-200/70 dark:border-[#2d2d2d] font-sans text-xs relative overflow-hidden text-stone-900 dark:text-[#f0f0f0]`}
                      >
                        {isEditing ? (
                          <div className="w-full" onClick={(e) => e.stopPropagation()}>
                            {col.type === 'status' || col.type === 'select' ? (
                              <select
                                autoFocus
                                value={editingValue}
                                onChange={(e) => {
                                  setEditingValue(e.target.value);
                                  commitCellEdit(row.id, col.id, e.target.value);
                                }}
                                onBlur={() => commitCellEdit(row.id, col.id, editingValue)}
                                className="w-full bg-white dark:bg-[#242424] border border-amber-500 rounded px-1.5 py-0.5 outline-none text-xs text-stone-900 dark:text-[#ffffff]"
                              >
                                <option value="">선택 안 함</option>
                                {col.options && col.options.length > 0 ? (
                                  col.options.map((opt) => (
                                    <option key={opt.id} value={opt.label || opt.id} className="dark:bg-[#1f1f1f]">
                                      {opt.label}
                                    </option>
                                  ))
                                ) : (
                                  editingValue && (
                                    <option value={editingValue} className="dark:bg-[#1f1f1f]">
                                      {editingValue}
                                    </option>
                                  )
                                )}
                              </select>
                            ) : col.type === 'checkbox' ? (
                              <input
                                type="checkbox"
                                autoFocus
                                checked={!!editingValue}
                                onChange={(e) => {
                                  commitCellEdit(row.id, col.id, e.target.checked);
                                }}
                                onBlur={() => commitCellEdit(row.id, col.id, editingValue)}
                                className="rounded accent-amber-500"
                              />
                            ) : (
                              <input
                                autoFocus
                                type={col.type === 'number' ? 'number' : col.type === 'date' ? 'date' : 'text'}
                                value={editingValue}
                                onChange={(e) => setEditingValue(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') commitCellEdit(row.id, col.id, editingValue);
                                  if (e.key === 'Escape') setEditingCell(null);
                                }}
                                onBlur={() => commitCellEdit(row.id, col.id, editingValue)}
                                className="w-full bg-white dark:bg-[#242424] border border-amber-500 rounded px-1.5 py-0.5 outline-none text-xs text-stone-900 dark:text-[#ffffff]"
                              />
                            )}
                          </div>
                        ) : (
                          <TruncatedPreviewCell
                            value={rawVal}
                            columnType={col.name}
                            onOpenEditor={() => onOpenRowDetail(row, rIdx)}
                            renderCustomContent={(val) => {
                              if (col.type === 'checkbox') {
                                return (
                                  <input
                                    type="checkbox"
                                    checked={!!val}
                                    onChange={(e) => {
                                      commitCellEdit(row.id, col.id, e.target.checked);
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

                                // Check if option matches by ID or by label
                                const strVal = String(val);
                                const option = col.options?.find(
                                  (o) => o.id === strVal || o.label === strVal
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

                                // If value is directly given as a string (e.g. '자기앞', '거액', '완료') but no option exists
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
                                    {String(val || '')}
                                  </code>
                                );
                              }

                              return (
                                <span className="text-stone-800 dark:text-[#f0f0f0] font-normal">
                                  {String(val ?? '')}
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
                    <div className="flex items-center justify-center gap-0.5 opacity-0 group-row:opacity-100 group-hover/row:opacity-100 transition-opacity">
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
                    onClick={handleAddRowBottom}
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
    </div>
  );
};
