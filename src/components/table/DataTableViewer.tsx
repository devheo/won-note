import React, { useState, useRef, useMemo, useEffect } from 'react';
import { TableDocument, TableColumn, TableRow, ColumnType, RowDensity } from '../../types';
import { TruncatedPreviewCell } from '../common/TruncatedPreviewCell';
import { ColumnManagerModal } from '../modals/ColumnManagerModal';
import { AddRowModal } from '../modals/AddRowModal';
import { ImportRowsModal } from '../modals/ImportRowsModal';
import { SelectOrCustomInput } from '../common/SelectOrCustomInput';
import { cleanTextValue, extractFirstImageSrc } from '../../utils/textSanitizer';
import { ImageLightboxModal } from '../common/ImageLightboxModal';
import { ExcelColumnFilterDropdown } from './ExcelColumnFilterDropdown';
import {
  downloadRowsAsCsv,
  downloadRowsAsTxt,
  copyRowsAsCsv,
  copyRowsAsTxt,
} from '../../utils/exportUtils';
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
  FileSpreadsheet,
  FileText,
  ClipboardPaste,
  Download,
  Check,
  Upload,
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

  // Excel-style column filters state: { [columnId]: string[] } (list of allowed distinct values)
  const [columnFilters, setColumnFilters] = useState<Record<string, string[]>>({});
  const [openFilterColId, setOpenFilterColId] = useState<string | null>(null);
  const [filterAnchorRect, setFilterAnchorRect] = useState<DOMRect | null>(null);

  // Reset filters and selection when table changes
  useEffect(() => {
    setColumnFilters({});
    setOpenFilterColId(null);
    setSelectedRowIds(new Set());
  }, [table.id]);

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

  // Import Rows Modal State (CSV / TXT / TSV / Excel Import into current table)
  const [isImportRowsModalOpen, setIsImportRowsModalOpen] = useState(false);
  const [importInitialText, setImportInitialText] = useState<string>('');
  const [importInitialTab, setImportInitialTab] = useState<'file' | 'text'>('file');

  // Global Ctrl+V / Cmd+V paste listener for Excel/TSV/CSV tabular data
  useEffect(() => {
    const handleGlobalPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      // Ignore when user is actively editing inside an input, textarea or contenteditable element
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable ||
        target.closest('[contenteditable="true"]') ||
        target.closest('input') ||
        target.closest('textarea')
      ) {
        return;
      }

      const pastedText = e.clipboardData?.getData('text');
      if (pastedText && pastedText.trim()) {
        e.preventDefault();
        setImportInitialText(pastedText);
        setImportInitialTab('text');
        setIsImportRowsModalOpen(true);
      }
    };

    window.addEventListener('paste', handleGlobalPaste);
    return () => window.removeEventListener('paste', handleGlobalPaste);
  }, []);

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

  // Import Rows from CSV / TXT / TSV
  const handleImportRows = (
    newRows: TableRow[],
    updatedColumns?: TableColumn[],
    position: 'bottom' | 'top' | 'replace' = 'bottom'
  ) => {
    let nextRows: TableRow[] = [];
    if (position === 'replace') {
      nextRows = newRows;
    } else if (position === 'top') {
      nextRows = [...newRows, ...table.rows];
    } else {
      nextRows = [...table.rows, ...newRows];
    }

    onUpdateTable({
      ...table,
      columns: updatedColumns || table.columns,
      rows: nextRows,
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

  // Export handlers
  const [copiedBatchFormat, setCopiedBatchFormat] = useState<string | null>(null);

  const getTargetRowsForExport = () => {
    if (selectedRowIds.size > 0) {
      return table.rows.filter((r) => selectedRowIds.has(r.id));
    }
    return processedRows.length > 0 ? processedRows : table.rows;
  };

  const handleExportCsv = (rowsToExport = getTargetRowsForExport()) => {
    downloadRowsAsCsv(table.title || 'table_data', table.columns, rowsToExport);
    setIsRowMenuOpen(false);
  };

  const handleExportTxt = (rowsToExport = getTargetRowsForExport()) => {
    downloadRowsAsTxt(table.title || 'table_data', table.columns, rowsToExport);
    setIsRowMenuOpen(false);
  };

  const handleCopyCsv = async (rowsToExport = getTargetRowsForExport()) => {
    await copyRowsAsCsv(table.columns, rowsToExport);
    setCopiedBatchFormat('CSV');
    setTimeout(() => setCopiedBatchFormat(null), 1800);
  };

  const handleCopyTxt = async (rowsToExport = getTargetRowsForExport()) => {
    await copyRowsAsTxt(table.title || 'table_data', table.columns, rowsToExport);
    setCopiedBatchFormat('TXT');
    setTimeout(() => setCopiedBatchFormat(null), 1800);
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

  // Excel-style filter handlers
  const handleApplyColumnFilter = (colId: string, selectedValues: string[] | null) => {
    setColumnFilters((prev) => {
      const next = { ...prev };
      if (!selectedValues || selectedValues.length === 0) {
        delete next[colId];
      } else {
        next[colId] = selectedValues;
      }
      return next;
    });
  };

  const handleApplySort = (colId: string, direction: 'asc' | 'desc' | null) => {
    if (direction === null) {
      if (sortColumnId === colId) {
        setSortColumnId(null);
      }
    } else {
      setSortColumnId(colId);
      setSortDirection(direction);
    }
  };

  const handleClearColumnFilter = (colId: string) => {
    setColumnFilters((prev) => {
      const next = { ...prev };
      delete next[colId];
      return next;
    });
  };

  const handleClearAllFilters = () => {
    setColumnFilters({});
    setSearchQuery('');
  };

  // Filtered & Sorted Rows (Applied across all columns)
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

    // 2. Excel-style Column Filters (Available for ALL columns across any table)
    for (const [colId, allowedKeys] of Object.entries(columnFilters)) {
      if (!allowedKeys || allowedKeys.length === 0) continue;
      const targetCol = table.columns.find((c) => c.id === colId);
      if (!targetCol) continue;
      const allowedSet = new Set(allowedKeys);

      list = list.filter((r) => {
        const rawVal = r.data[colId];
        let rowKey = '';

        if (rawVal === undefined || rawVal === null || rawVal === '') {
          rowKey = '__EMPTY__';
        } else if (targetCol.type === 'checkbox') {
          rowKey = rawVal ? 'true' : 'false';
        } else if (targetCol.type === 'status' || targetCol.type === 'select') {
          const cleaned = cleanTextValue(rawVal);
          const opt = targetCol.options?.find(
            (o) => o.id === cleaned || o.label === cleaned || o.id === String(rawVal) || o.label === String(rawVal)
          );
          rowKey = opt ? opt.label : cleaned;
        } else {
          rowKey = cleanTextValue(rawVal);
        }

        return allowedSet.has(rowKey);
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
        const numB = Number(strB);

        if (
          targetCol?.type === 'number' ||
          (!isNaN(numA) && !isNaN(numB) && strA !== '' && strB !== '')
        ) {
          return sortDirection === 'asc' ? numA - numB : numB - numA;
        }

        const comp = strA.localeCompare(strB, 'ko', { numeric: true, sensitivity: 'base' });
        return sortDirection === 'asc' ? comp : -comp;
      });
    }

    return list;
  }, [table.rows, table.columns, searchQuery, columnFilters, sortColumnId, sortDirection]);

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

          {/* Direct Excel / TSV / CSV Paste Button */}
          <button
            onClick={async () => {
              try {
                const text = await navigator.clipboard.readText();
                if (text && text.trim()) {
                  setImportInitialText(text);
                  setImportInitialTab('text');
                } else {
                  setImportInitialText('');
                  setImportInitialTab('text');
                }
              } catch {
                setImportInitialText('');
                setImportInitialTab('text');
              }
              setIsImportRowsModalOpen(true);
            }}
            className="px-3 py-1.5 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors border border-emerald-200/80 dark:border-emerald-800/80 shadow-2xs"
            title="엑셀(Excel), 구글 시트, 메모장에서 복사한 테이블 데이터를 붙여넣어 행으로 추가합니다 (단축키: Ctrl+V)"
          >
            <ClipboardPaste className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>엑셀/데이터 붙여넣기</span>
          </button>

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
              <div className="absolute right-0 top-full mt-1 w-64 bg-white dark:bg-[#222222] border border-stone-200 dark:border-[#383838] rounded-xl shadow-xl p-1.5 z-40 text-xs animate-in fade-in slide-in-from-top-1 duration-150 mat-shadow-3">
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
                <button
                  onClick={() => {
                    setImportInitialText('');
                    setImportInitialTab('file');
                    setIsImportRowsModalOpen(true);
                    setIsRowMenuOpen(false);
                  }}
                  className="w-full px-2 py-1.5 text-left hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-stone-800 dark:text-[#eeeeee] rounded-lg flex items-center gap-2 font-medium"
                >
                  <Upload className="w-3.5 h-3.5 text-emerald-500" />
                  <span>엑셀/CSV/TXT 파일에서 가져오기</span>
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
                    <div className="px-2 py-1 text-[10px] font-semibold text-stone-400 dark:text-[#888888] uppercase">
                      선택된 {selectedRowIds.size}개 행 내보내기 (CSV / TXT)
                    </div>
                    <button
                      onClick={() => handleExportCsv()}
                      className="w-full px-2 py-1.5 text-left hover:bg-stone-100 dark:hover:bg-[#333333] text-stone-700 dark:text-[#cccccc] rounded-lg flex items-center gap-2"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500" />
                      <span>선택 행 CSV 파일 다운로드</span>
                    </button>
                    <button
                      onClick={() => handleExportTxt()}
                      className="w-full px-2 py-1.5 text-left hover:bg-stone-100 dark:hover:bg-[#333333] text-stone-700 dark:text-[#cccccc] rounded-lg flex items-center gap-2"
                    >
                      <FileText className="w-3.5 h-3.5 text-blue-500" />
                      <span>선택 행 TXT 파일 다운로드</span>
                    </button>
                    <button
                      onClick={() => handleCopyCsv()}
                      className="w-full px-2 py-1.5 text-left hover:bg-stone-100 dark:hover:bg-[#333333] text-stone-700 dark:text-[#cccccc] rounded-lg flex items-center gap-2"
                    >
                      {copiedBatchFormat === 'CSV' ? (
                        <Check className="w-3.5 h-3.5 text-emerald-500" />
                      ) : (
                        <Copy className="w-3.5 h-3.5 text-stone-500" />
                      )}
                      <span>{copiedBatchFormat === 'CSV' ? 'CSV 복사 완료!' : '선택 행 CSV로 클립보드 복사'}</span>
                    </button>
                    <button
                      onClick={() => handleCopyTxt()}
                      className="w-full px-2 py-1.5 text-left hover:bg-stone-100 dark:hover:bg-[#333333] text-stone-700 dark:text-[#cccccc] rounded-lg flex items-center gap-2"
                    >
                      {copiedBatchFormat === 'TXT' ? (
                        <Check className="w-3.5 h-3.5 text-emerald-500" />
                      ) : (
                        <Copy className="w-3.5 h-3.5 text-stone-500" />
                      )}
                      <span>{copiedBatchFormat === 'TXT' ? 'TXT 복사 완료!' : '선택 행 TXT로 클립보드 복사'}</span>
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

                {selectedRowIds.size === 0 && (
                  <>
                    <div className="my-1 border-t border-stone-200 dark:border-[#333333]" />
                    <div className="px-2 py-1 text-[10px] font-semibold text-stone-400 dark:text-[#888888] uppercase">
                      전체 행 내보내기 ({table.rows.length}개)
                    </div>
                    <button
                      onClick={() => handleExportCsv(processedRows)}
                      className="w-full px-2 py-1.5 text-left hover:bg-stone-100 dark:hover:bg-[#333333] text-stone-700 dark:text-[#cccccc] rounded-lg flex items-center gap-2"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500" />
                      <span>전체 행 CSV 파일 다운로드</span>
                    </button>
                    <button
                      onClick={() => handleExportTxt(processedRows)}
                      className="w-full px-2 py-1.5 text-left hover:bg-stone-100 dark:hover:bg-[#333333] text-stone-700 dark:text-[#cccccc] rounded-lg flex items-center gap-2"
                    >
                      <FileText className="w-3.5 h-3.5 text-blue-500" />
                      <span>전체 행 TXT 파일 다운로드</span>
                    </button>
                    <button
                      onClick={() => handleCopyCsv(processedRows)}
                      className="w-full px-2 py-1.5 text-left hover:bg-stone-100 dark:hover:bg-[#333333] text-stone-700 dark:text-[#cccccc] rounded-lg flex items-center gap-2"
                    >
                      {copiedBatchFormat === 'CSV' ? (
                        <Check className="w-3.5 h-3.5 text-emerald-500" />
                      ) : (
                        <Copy className="w-3.5 h-3.5 text-stone-500" />
                      )}
                      <span>{copiedBatchFormat === 'CSV' ? 'CSV 복사 완료!' : '전체 행 CSV로 클립보드 복사'}</span>
                    </button>
                    <button
                      onClick={() => handleCopyTxt(processedRows)}
                      className="w-full px-2 py-1.5 text-left hover:bg-stone-100 dark:hover:bg-[#333333] text-stone-700 dark:text-[#cccccc] rounded-lg flex items-center gap-2"
                    >
                      {copiedBatchFormat === 'TXT' ? (
                        <Check className="w-3.5 h-3.5 text-emerald-500" />
                      ) : (
                        <Copy className="w-3.5 h-3.5 text-stone-500" />
                      )}
                      <span>{copiedBatchFormat === 'TXT' ? 'TXT 복사 완료!' : '전체 행 TXT로 클립보드 복사'}</span>
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Quick Import Rows Button */}
          <button
            onClick={() => setIsImportRowsModalOpen(true)}
            className="px-3 py-1.5 bg-stone-100 hover:bg-emerald-50 dark:bg-[#282828] dark:hover:bg-emerald-950/40 text-stone-700 hover:text-emerald-700 dark:text-[#e0e0e0] dark:hover:text-emerald-400 font-semibold rounded-lg text-xs flex items-center gap-1.5 transition-colors border border-stone-200/60 dark:border-[#383838]"
            title="CSV 또는 TXT 파일을 불러와 행으로 일괄 추가"
          >
            <Upload className="w-3.5 h-3.5 text-emerald-500" />
            <span>CSV/TXT 가져오기</span>
          </button>

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

      {/* Active Column Filters Bar (Excel-style Applied Filters Status) */}
      {Object.keys(columnFilters).length > 0 && (
        <div className="px-6 py-1.5 border-b border-stone-200/60 dark:border-[#2d2d2d] bg-amber-50/40 dark:bg-[#1f1d18] flex items-center gap-2 overflow-x-auto custom-scrollbar flex-shrink-0 text-xs">
          <div className="flex items-center gap-1 text-[11px] font-bold text-amber-700 dark:text-amber-400 flex-shrink-0">
            <Filter className="w-3 h-3 text-amber-500 fill-current" />
            <span>적용된 열 필터 ({Object.keys(columnFilters).length}개):</span>
          </div>

          {Object.entries(columnFilters).map(([colId, allowedKeys]) => {
            const col = table.columns.find((c) => c.id === colId);
            if (!col) return null;
            return (
              <div
                key={colId}
                className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white dark:bg-[#282828] border border-amber-400/50 dark:border-amber-700/50 text-stone-800 dark:text-[#dddddd] shadow-2xs flex-shrink-0 text-xs"
              >
                <span className="font-semibold text-amber-600 dark:text-amber-400">{col.name}:</span>
                <span className="truncate max-w-[150px] font-medium text-stone-700 dark:text-[#cccccc]">
                  {allowedKeys.length === 1
                    ? allowedKeys[0] === '__EMPTY__' ? '(비어 있음)' : allowedKeys[0]
                    : `${allowedKeys.length}개 선택됨`}
                </span>
                <button
                  onClick={() => handleClearColumnFilter(colId)}
                  className="p-0.5 rounded-full hover:bg-rose-100 dark:hover:bg-rose-900/40 text-stone-400 hover:text-rose-500 transition-colors ml-0.5"
                  title={`${col.name} 필터 해제`}
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </div>
            );
          })}

          <button
            onClick={handleClearAllFilters}
            className="ml-auto text-[11px] text-rose-500 hover:underline flex items-center gap-0.5 flex-shrink-0 font-semibold"
          >
            <X className="w-3 h-3" /> 전체 필터 초기화
          </button>
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
                const hasFilter = !!columnFilters[col.id];

                return (
                  <th
                    key={col.id}
                    style={{ width: `${currentWidth}px` }}
                    className="relative px-3 py-2 font-semibold text-stone-800 dark:text-[#f0f0f0] border-r border-stone-200 dark:border-[#333333] select-none group/th hover:bg-stone-200/50 dark:hover:bg-[#2a2a2a] transition-colors"
                  >
                    <div className="flex items-center justify-between gap-1.5">
                      {/* Column Name & Quick Sort Trigger */}
                      <div
                        className="flex items-center gap-1.5 min-w-0 flex-1 cursor-pointer"
                        onClick={() => handleHeaderSort(col.id)}
                        title="클릭하여 정렬"
                      >
                        {getColTypeIcon(col.type)}
                        <span className="truncate font-semibold text-xs text-stone-800 dark:text-[#f5f5f5]" title={col.name}>
                          {col.name}
                        </span>
                        {col.isPrimaryKey && (
                          <span className="text-[9px] px-1 py-0.2 rounded bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 font-bold">
                            PK
                          </span>
                        )}
                        {isSorted && (
                          sortDirection === 'asc' ? (
                            <ArrowUp className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                          ) : (
                            <ArrowDown className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                          )
                        )}
                      </div>

                      {/* Excel-style Filter Button Trigger */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const rect = e.currentTarget.getBoundingClientRect();
                          if (openFilterColId === col.id) {
                            setOpenFilterColId(null);
                          } else {
                            setOpenFilterColId(col.id);
                            setFilterAnchorRect(rect);
                          }
                        }}
                        className={`p-1 rounded-md transition-all flex-shrink-0 ${
                          hasFilter
                            ? 'bg-amber-500 text-stone-950 shadow-xs font-bold'
                            : 'text-stone-400 dark:text-[#777777] hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-200/60 dark:hover:bg-[#333333] opacity-0 group-hover/th:opacity-100'
                        }`}
                        title={hasFilter ? '이 열에 필터 적용됨 (클릭하여 수정)' : '엑셀 스타일 열 필터 및 정렬'}
                      >
                        <Filter className={`w-3 h-3 ${hasFilter ? 'fill-current' : ''}`} />
                      </button>
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

                      {/* Export Single Row CSV */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleExportCsv([row]);
                        }}
                        title="이 행 CSV 파일 다운로드 (.csv)"
                        className="p-1 rounded hover:bg-emerald-100 dark:hover:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 transition-colors"
                      >
                        <FileSpreadsheet className="w-3.5 h-3.5" />
                      </button>

                      {/* Export Single Row TXT */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleExportTxt([row]);
                        }}
                        title="이 행 TXT 파일 다운로드 (.txt)"
                        className="p-1 rounded hover:bg-blue-100 dark:hover:bg-blue-950/60 text-blue-600 dark:text-blue-400 transition-colors"
                      >
                        <FileText className="w-3.5 h-3.5" />
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
                  <p className="text-sm font-medium text-stone-600 dark:text-[#cccccc] mb-1">
                    데이터 행이 없습니다.
                  </p>
                  <p className="text-[11px] text-stone-400 dark:text-[#777777] mb-3">
                    새로운 행을 직접 추가하거나, 엑셀/스프레드시트에서 복사한 데이터를 붙여넣으세요.
                  </p>
                  <div className="flex items-center justify-center gap-2">
                    <button
                      onClick={() => handleOpenAddRowModal('bottom')}
                      className="px-3.5 py-1.5 bg-amber-500 text-stone-950 font-bold rounded-lg text-xs hover:bg-amber-400 transition-colors flex items-center gap-1.5"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>첫 번째 행 추가하기 🐝</span>
                    </button>
                    <button
                      onClick={async () => {
                        try {
                          const text = await navigator.clipboard.readText();
                          if (text && text.trim()) {
                            setImportInitialText(text);
                            setImportInitialTab('text');
                          } else {
                            setImportInitialText('');
                            setImportInitialTab('text');
                          }
                        } catch {
                          setImportInitialText('');
                          setImportInitialTab('text');
                        }
                        setIsImportRowsModalOpen(true);
                      }}
                      className="px-3.5 py-1.5 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-semibold rounded-lg text-xs hover:bg-emerald-100 dark:hover:bg-emerald-900/50 border border-emerald-300 dark:border-emerald-700 transition-colors flex items-center gap-1.5"
                    >
                      <ClipboardPaste className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span>엑셀 / 데이터 붙여넣기 (Ctrl+V)</span>
                    </button>
                  </div>
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
            (💡 엑셀 셀 복사 후 화면에서 바로 Ctrl+V를 누르면 일괄 가져오기가 실행됩니다)
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
        onOpenImportModal={() => {
          setImportInitialText('');
          setImportInitialTab('file');
          setIsImportRowsModalOpen(true);
        }}
      />

      {/* Import Rows Modal (CSV / TXT / TSV / Excel Import into current table) */}
      <ImportRowsModal
        isOpen={isImportRowsModalOpen}
        onClose={() => {
          setIsImportRowsModalOpen(false);
          setImportInitialText('');
        }}
        tableName={table.title}
        existingColumns={table.columns}
        initialText={importInitialText}
        initialTab={importInitialTab}
        onImportRows={handleImportRows}
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

      {/* Excel Column Filter & Sort Dropdown Popover */}
      {openFilterColId && (
        (() => {
          const targetCol = table.columns.find((c) => c.id === openFilterColId);
          if (!targetCol) return null;
          return (
            <ExcelColumnFilterDropdown
              isOpen={true}
              onClose={() => setOpenFilterColId(null)}
              column={targetCol}
              allRows={table.rows}
              activeFilterValues={columnFilters[openFilterColId]}
              isSorted={sortColumnId === openFilterColId}
              sortDirection={sortColumnId === openFilterColId ? sortDirection : 'asc'}
              onApplyFilter={handleApplyColumnFilter}
              onApplySort={handleApplySort}
              anchorRect={filterAnchorRect}
            />
          );
        })()
      )}

      {/* Image Lightbox Modal */}
      <ImageLightboxModal
        isOpen={!!lightboxImg}
        imageUrl={lightboxImg}
        onClose={() => setLightboxImg(null)}
      />
    </div>
  );
};
