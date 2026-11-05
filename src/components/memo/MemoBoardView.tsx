import React, { useState, useEffect, useCallback, useRef } from 'react';
import { TableDocument, TableRow } from '../../types';
import { boardLayoutStore, BoardNoteLayout } from '../../services/storage/boardLayoutStore';
import { StickyNoteCard } from './StickyNoteCard';
import { useStatusBar, computeTextMetrics } from '../common/GlobalStatusBar';
import { estimateTableJsonMetrics } from '../../utils/tableSizeMetrics';
import {
  Sparkles,
  Plus,
  LayoutGrid,
  Search,
  Maximize2,
  Trash2,
  Grid,
  Pin,
  HelpCircle,
  X,
} from 'lucide-react';

interface MemoBoardViewProps {
  table: TableDocument;
  onUpdateTable: (updatedTable: TableDocument) => void;
  onOpenRichEditor: (row: TableRow, targetColId?: string) => void;
  onAddNewRow: (initialPosition?: { x: number; y: number }) => void;
  onDeleteRow: (rowId: string) => void;
  onUpdateRow: (updatedRow: TableRow) => void;
}

export const MemoBoardView: React.FC<MemoBoardViewProps> = ({
  table,
  onUpdateTable,
  onOpenRichEditor,
  onAddNewRow,
  onDeleteRow,
  onUpdateRow,
}) => {
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeColorFilter, setActiveColorFilter] = useState<string>('all');
  const [activeMemoId, setActiveMemoId] = useState<string | null>(null);

  const handleSetColorFilter = (color: string) => {
    setActiveColorFilter(color);
    setActiveMemoId(null);
  };

  const handleSetSearchQuery = (query: string) => {
    setSearchQuery(query);
    setActiveMemoId(null);
  };

  // Load layouts from boardLayoutStore
  const [layouts, setLayouts] = useState<Record<string, BoardNoteLayout>>(() => {
    return boardLayoutStore.getLayouts(table.id);
  });

  const [maxZIndex, setMaxZIndex] = useState<number>(100);

  // Sync layouts when table rows change
  useEffect(() => {
    const existing = boardLayoutStore.getLayouts(table.id);
    let highestZ = 100;

    const updatedMap: Record<string, BoardNoteLayout> = { ...existing };
    table.rows.forEach((row, idx) => {
      const layout = boardLayoutStore.getOrCreateDefaultLayout(table.id, row.id, idx, existing);
      updatedMap[row.id] = layout;
      if (layout.zIndex > highestZ) {
        highestZ = layout.zIndex;
      }
    });

    setLayouts(updatedMap);
    setMaxZIndex(highestZ + 1);

    if (activeMemoId && !table.rows.some((r) => r.id === activeMemoId)) {
      setActiveMemoId(null);
    }
  }, [table.id, table.rows, activeMemoId]);

  const { updateMetrics } = useStatusBar();

  // Track and update GlobalStatusBar metrics for Memo Board
  useEffect(() => {
    const primaryCol = table.columns[0];
    const contentCol = table.columns.find((c) => c.type === 'richText' || c.name.includes('내용') || c.name.includes('설명')) || table.columns[1] || primaryCol;

    const { bytes: totalBytes, chars: totalChars, lines: totalLines } = estimateTableJsonMetrics(table);

    if (activeMemoId) {
      const activeIdx = table.rows.findIndex((r) => r.id === activeMemoId);
      const activeRow = table.rows[activeIdx];
      if (activeRow && activeIdx !== -1) {
        updateMetrics({
          line: activeIdx + 1,
          col: 1,
          selectedChars: 0,
          selectedBytes: 0,
          tableName: table.title || '메모 보드',
          lastModifiedAt: activeRow.updatedAt || table.updatedAt || Date.now(),
          totalBytes,
          totalChars,
          totalLines,
        });
        return;
      }
    }

    // Default when no card is actively selected
    updateMetrics({
      line: table.rows.length > 0 ? 1 : 0,
      col: table.rows.length,
      selectedChars: 0,
      selectedBytes: 0,
      tableName: table.title || '메모 보드',
      lastModifiedAt: table.updatedAt || Date.now(),
      totalBytes,
      totalChars,
      totalLines,
    });
  }, [table, activeMemoId, updateMetrics]);

  // Bring selected note to front
  const handleBringToFront = useCallback((rowId: string) => {
    setActiveMemoId(rowId);
    const nextZ = maxZIndex + 1;
    setMaxZIndex(nextZ);

    setLayouts((prev) => {
      const current = prev[rowId];
      if (!current) return prev;
      const updated = { ...current, zIndex: nextZ };
      boardLayoutStore.saveLayout(table.id, updated);
      return { ...prev, [rowId]: updated };
    });
  }, [maxZIndex, table.id]);

  // Handle single layout change (during drag or on drag stop)
  const handleLayoutChange = useCallback((updatedLayout: BoardNoteLayout, isFinal: boolean) => {
    setLayouts((prev) => ({
      ...prev,
      [updatedLayout.rowId]: updatedLayout,
    }));

    if (isFinal) {
      boardLayoutStore.saveLayout(table.id, updatedLayout);
        // 3초 디바운스가 적용된 App.tsx의 handleUpdateTableDebounced 호출
        onUpdateTable({
          ...table,
          updatedAt: Date.now(),
        });
    }
  }, [table, onUpdateTable]);

  // Auto-arrange all cards in a clean grid
  const handleAutoArrangeGrid = () => {
    const cardWidth = 280;
    const cardHeight = 220;
    const gapX = 24;
    const gapY = 24;
    const paddingX = 32;
    const paddingY = 32;

    // 1. 캔버스 실시간 너비를 기반으로 동적 열 개수(cols) 계산 (최소 1열)
      const canvasWidth = canvasRef.current?.clientWidth || 1000;
      const availableWidth = canvasWidth - paddingX * 2;
      const cols = Math.max(1, Math.floor((availableWidth + gapX) / (cardWidth + gapX)));

      const newLayoutsMap: Record<string, BoardNoteLayout> = { ...layouts };

      // 2. 핀 고정(isPinned) 카드가 점유 중인 격자 위치 마킹
      const occupiedSlots = new Set<string>();
      table.rows.forEach((row) => {
        const layout = layouts[row.id];
        if (layout?.isPinned) {
          const col = Math.round((layout.x - paddingX) / (cardWidth + gapX));
          const rowIdx = Math.round((layout.y - paddingY) / (cardHeight + gapY));
          if (col >= 0 && rowIdx >= 0) {
            occupiedSlots.add(`${col},${rowIdx}`);
          }
        }
      });
  // 3. 비고정 카드를 화면 폭에 맞는 빈 슬롯에 순차적으로 자동 배치
    let currentCol = 0;
    let currentRow = 0;

    table.rows.forEach((row, idx) => {
      const col = idx % cols;
      const r = Math.floor(idx / cols);

      const existing = layouts[row.id];
      // 핀으로 고정된 카드는 위치를 절대 변경하지 않음
      if (existing?.isPinned) {
        return;
      }
      // 이미 점유된 슬롯(핀 고정 카드가 있는 자리)은 건너뜀
      while (occupiedSlots.has(`${currentCol},${currentRow}`)) {
        currentCol++;
        if (currentCol >= cols) {
          currentCol = 0;
          currentRow++;
        }
      }
      const newLayout: BoardNoteLayout = {
            rowId: row.id,
            x: paddingX + currentCol * (cardWidth + gapX),
            y: paddingY + currentRow * (cardHeight + gapY),
            width: existing?.width || cardWidth,
            height: existing?.height || cardHeight,
            zIndex: existing?.zIndex || 10 + idx,
            bgColor: existing?.bgColor || 'amber',
            isPinned: false,
            updatedAt: Date.now(),
          };

          newLayoutsMap[row.id] = newLayout;
          occupiedSlots.add(`${currentCol},${currentRow}`);

          currentCol++;
          if (currentCol >= cols) {
            currentCol = 0;
            currentRow++;
          }
        });

        setLayouts(newLayoutsMap);
        boardLayoutStore.saveLayoutsBatch(table.id, newLayoutsMap);

        // 격자 자동 정렬 완료 후 서버/타 클라이언트로 동기화 알림 발송
        onUpdateTable({
          ...table,
          updatedAt: Date.now(),
        });
  };

  // Double click canvas to add new note at cursor position
  const handleCanvasDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target !== canvasRef.current && !(e.target as HTMLElement).classList.contains('memo-canvas-bg')) {
      return;
    }

    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = Math.max(20, e.clientX - rect.left - 140);
    const y = Math.max(20, e.clientY - rect.top - 110);

    onAddNewRow({ x, y });
  };

  // Filter rows based on search and color
  const filteredRows = table.rows.filter((row) => {
    const primaryCol = table.columns[0];
    const title = String(row.data[primaryCol?.id] || '');
    const content = String(row.richContent || '');

    const matchesSearch = !searchQuery || title.toLowerCase().includes(searchQuery.toLowerCase()) || content.toLowerCase().includes(searchQuery.toLowerCase());
    const layout = layouts[row.id];
    const matchesColor = activeColorFilter === 'all' || layout?.bgColor === activeColorFilter;

    return matchesSearch && matchesColor;
  });

  return (
    <div className="flex flex-col h-full bg-stone-100/60 dark:bg-[#141414] overflow-hidden select-none">
      {/* Top Toolbar Bar */}
      <div className="px-6 py-2.5 bg-white dark:bg-stone-900 border-b border-stone-200 dark:border-stone-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 font-bold text-xs flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-amber-500" />
              <span>스티커 메모 보드</span>
            </span>
            <span className="text-xs text-stone-400 font-medium font-mono">
              ({table.rows.length}개 메모)
            </span>
          </div>

          <div className="h-4 w-px bg-stone-200 dark:bg-stone-800 mx-1" />

          {/* Search Box */}
          <div className="relative flex items-center">
            <Search className="w-3.5 h-3.5 absolute left-2.5 text-stone-400" />
            <input
              type="text"
              placeholder="메모 검색..."
              value={searchQuery}
              onChange={(e) => handleSetSearchQuery(e.target.value)}
              className="pl-8 pr-3 py-1 rounded-xl bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-xs focus:ring-1 focus:ring-amber-500 focus:outline-hidden w-40 sm:w-52"
            />
            {/* 검색어 있을 때 우측 끝 X 지우기 버튼 */}
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => handleSetSearchQuery('')}
                  className="absolute right-2 p-0.5 rounded-full hover:bg-stone-200 dark:hover:bg-stone-700 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 transition-colors"
                  title="검색어 지우기"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
          </div>

          {/* Color Filter */}
          <div className="flex items-center gap-1 bg-stone-100 dark:bg-stone-800 p-1 rounded-xl text-xs">
            <button
              type="button"
              onClick={() => handleSetColorFilter('all')}
              className={`px-2 py-0.5 rounded-lg text-[11px] font-medium transition-colors ${
                activeColorFilter === 'all'
                  ? 'bg-amber-500 text-stone-950 font-bold'
                  : 'text-stone-600 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-700'
              }`}
            >
              전체
            </button>
            {(['amber', 'yellow', 'green', 'blue', 'rose', 'purple', 'dark'] as const).map((color) => (
              <button
                key={color}
                onClick={() => handleSetColorFilter(color)}
                className={`w-4 h-4 rounded-full border border-black/10 transition-transform ${
                  activeColorFilter === color ? 'ring-2 ring-amber-500 scale-110' : 'hover:scale-110'
                }`}
                style={{
                  backgroundColor:
                    color === 'amber' ? '#fcd34d' :
                    color === 'yellow' ? '#fef08a' :
                    color === 'green' ? '#6ee7b7' :
                    color === 'blue' ? '#7dd3fc' :
                    color === 'rose' ? '#fda4af' :
                    color === 'purple' ? '#d8b4fe' : '#44403c', // dark (검정/어두운 회색)
                }}
              />
            ))}
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleAutoArrangeGrid}
            className="px-3 py-1.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 hover:bg-stone-100 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-200 text-xs font-semibold flex items-center gap-1.5 transition-colors"
            title="모든 메모 카드를 깔끔한 격자로 자동 정렬합니다"
          >
            <LayoutGrid className="w-3.5 h-3.5 text-amber-500" />
            <span>격자 자동 정렬</span>
          </button>

          <button
            type="button"
            onClick={() => onAddNewRow()}
            className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>새 스티커 메모</span>
          </button>
        </div>
      </div>

      {/* Main Board Canvas */}
      <div
        ref={canvasRef}
        onClick={(e) => {
          if (e.target === canvasRef.current || (e.target as HTMLElement).classList.contains('memo-canvas-bg')) {
            setActiveMemoId(null);
          }
        }}
        onDoubleClick={handleCanvasDoubleClick}
        className="memo-canvas-bg flex-1 min-h-[500px] overflow-auto relative p-8 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] dark:bg-[radial-gradient(#2d2d2d_1px,transparent_1px)] [background-size:16px_16px]"
      >
        {filteredRows.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-stone-400 py-16 pointer-events-none">
            <Sparkles className="w-12 h-12 stroke-1 mb-3 text-amber-500/50 animate-pulse" />
            <h3 className="font-bold text-sm text-stone-600 dark:text-stone-300">
              {table.rows.length === 0 ? '스티커 메모 보드가 비어있습니다' : '검색 조건에 맞는 메모가 없습니다'}
            </h3>
            <p className="text-xs text-stone-400 mt-1 max-w-sm">
              보드 빈 공간을 더블 클릭하거나 [새 스티커 메모] 버튼을 눌러 메모를 자유롭게 배치해보세요.
            </p>
          </div>
        ) : (
          filteredRows.map((row) => {
            const layout = layouts[row.id] || boardLayoutStore.getOrCreateDefaultLayout(table.id, row.id, 0, layouts);
            return (
              <StickyNoteCard
                key={row.id}
                row={row}
                layout={layout}
                columns={table.columns}
                onLayoutChange={handleLayoutChange}
                onUpdateRowData={onUpdateRow}
                onDeleteRow={onDeleteRow}
                onOpenRichEditor={onOpenRichEditor}
                onBringToFront={() => handleBringToFront(row.id)}
              />
            );
          })
        )}
      </div>

      {/* Bottom Canvas Guide Footer */}
      <div className="px-6 py-2 bg-white/80 dark:bg-stone-900/80 border-t border-stone-200/80 dark:border-stone-800 text-[11px] text-stone-400 flex items-center justify-between shrink-0">
        <span className="flex items-center gap-1.5">
          <HelpCircle className="w-3.5 h-3.5 text-amber-500" />
          <span>캔버스를 더블 클릭하면 마우스 위치에 즉시 메모가 생성됩니다. 상단 헤더 바를 드래그하여 이동하세요.</span>
        </span>
        <span className="font-mono text-[10px]">MEMOJJANG Board Extension</span>
      </div>
    </div>
  );
};
