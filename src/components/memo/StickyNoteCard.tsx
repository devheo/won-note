import React, { useState, useRef, useEffect, useCallback } from 'react';
import { TableRow, TableColumn } from '../../types';
import { BoardNoteLayout } from '../../services/storage/boardLayoutStore';
import {
  Pin,
  Trash2,
  Edit3,
  GripHorizontal,
  Sparkles,
  Maximize2,
  Check,
} from 'lucide-react';
import { cleanTextValue } from '../../utils/textSanitizer';

interface StickyNoteCardProps {
  row: TableRow;
  layout: BoardNoteLayout;
  columns: TableColumn[];
  onLayoutChange: (updatedLayout: BoardNoteLayout, isFinal: boolean) => void;
  onUpdateRowData: (updatedRow: TableRow) => void;
  onDeleteRow: (rowId: string) => void;
  onOpenRichEditor: (row: TableRow, colId?: string) => void;
  onBringToFront: () => void;
}

const BG_COLOR_STYLES: Record<
  BoardNoteLayout['bgColor'],
  { card: string; header: string; border: string; accent: string }
> = {
  amber: {
    card: 'bg-amber-100/95 dark:bg-[#2e2315]/95 text-amber-950 dark:text-amber-100',
    header: 'bg-amber-200/60 dark:bg-amber-900/40 border-amber-300/80 dark:border-amber-800/60',
    border: 'border-amber-300 dark:border-amber-800/80',
    accent: 'bg-amber-400 text-stone-950',
  },
  yellow: {
    card: 'bg-yellow-100/95 dark:bg-[#2b2713]/95 text-yellow-950 dark:text-yellow-100',
    header: 'bg-yellow-200/60 dark:bg-yellow-900/40 border-yellow-300/80 dark:border-yellow-800/60',
    border: 'border-yellow-300 dark:border-yellow-800/80',
    accent: 'bg-yellow-400 text-stone-950',
  },
  green: {
    card: 'bg-emerald-100/95 dark:bg-[#13271d]/95 text-emerald-950 dark:text-emerald-100',
    header: 'bg-emerald-200/60 dark:bg-emerald-900/40 border-emerald-300/80 dark:border-emerald-800/60',
    border: 'border-emerald-300 dark:border-emerald-800/80',
    accent: 'bg-emerald-400 text-stone-950',
  },
  blue: {
    card: 'bg-sky-100/95 dark:bg-[#132333]/95 text-sky-950 dark:text-sky-100',
    header: 'bg-sky-200/60 dark:bg-sky-900/40 border-sky-300/80 dark:border-sky-800/60',
    border: 'border-sky-300 dark:border-sky-800/80',
    accent: 'bg-sky-400 text-stone-950',
  },
  rose: {
    card: 'bg-rose-100/95 dark:bg-[#2e151d]/95 text-rose-950 dark:text-rose-100',
    header: 'bg-rose-200/60 dark:bg-rose-900/40 border-rose-300/80 dark:border-rose-800/60',
    border: 'border-rose-300 dark:border-rose-800/80',
    accent: 'bg-rose-400 text-stone-950',
  },
  purple: {
    card: 'bg-purple-100/95 dark:bg-[#23152e]/95 text-purple-950 dark:text-purple-100',
    header: 'bg-purple-200/60 dark:bg-purple-900/40 border-purple-300/80 dark:border-purple-800/60',
    border: 'border-purple-300 dark:border-purple-800/80',
    accent: 'bg-purple-400 text-stone-950',
  },
  dark: {
    card: 'bg-stone-800/95 dark:bg-stone-900/95 text-stone-100',
    header: 'bg-stone-700/60 border-stone-600',
    border: 'border-stone-700',
    accent: 'bg-stone-600 text-stone-100',
  },
};

export const StickyNoteCard: React.FC<StickyNoteCardProps> = ({
  row,
  layout,
  columns,
  onLayoutChange,
  onUpdateRowData,
  onDeleteRow,
  onOpenRichEditor,
  onBringToFront,
}) => {
  const primaryCol = columns.find((c) => c.isPrimaryKey) || columns[0];
  const contentCol = columns.find((c) => c.type === 'richText' || c.name.includes('내용') || c.name.includes('설명')) || columns[1] || primaryCol;

  const titleVal = cleanTextValue(row.data[primaryCol?.id || 'title'] ?? `메모 #${row.id.slice(-4)}`);
  const contentVal = cleanTextValue(row.data[contentCol?.id || 'content'] ?? row.richContent ?? '');

  const [localTitle, setLocalTitle] = useState(titleVal);
  const [localContent, setLocalContent] = useState(contentVal);
  const [showPalette, setShowPalette] = useState(false);

  useEffect(() => {
    setLocalTitle(titleVal);
  }, [titleVal]);

  useEffect(() => {
    setLocalContent(contentVal);
  }, [contentVal]);

  // Dragging and Resizing state
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const dragStartRef = useRef<{ startX: number; startY: number; initX: number; initY: number } | null>(null);
  const resizeStartRef = useRef<{ startX: number; startY: number; initW: number; initH: number } | null>(null);

  // 1. Dragging Handler (PointerEvent)
  const handleDragPointerDown = (e: React.PointerEvent) => {
    if (layout.isPinned) return; // Pinned cards cannot be moved
    e.stopPropagation();
    onBringToFront();

    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initX: layout.x,
      initY: layout.y,
    };
    setIsDragging(true);
  };

  const handleDragPointerMove = (e: React.PointerEvent) => {
    if (!isDragging || !dragStartRef.current) return;
    const dx = e.clientX - dragStartRef.current.startX;
    const dy = e.clientY - dragStartRef.current.startY;

    const newX = Math.max(10, dragStartRef.current.initX + dx);
    const newY = Math.max(10, dragStartRef.current.initY + dy);

    onLayoutChange({ ...layout, x: newX, y: newY }, false);
  };

  const handleDragPointerUp = (e: React.PointerEvent) => {
    if (!isDragging) return;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch (_) {}
    setIsDragging(false);
    dragStartRef.current = null;
    onLayoutChange(layout, true); // Save layout
  };

  // 2. Resizing Handler (PointerEvent)
  const handleResizePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    onBringToFront();

    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    resizeStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initW: layout.width,
      initH: layout.height,
    };
    setIsResizing(true);
  };

  const handleResizePointerMove = (e: React.PointerEvent) => {
    if (!isResizing || !resizeStartRef.current) return;
    const dx = e.clientX - resizeStartRef.current.startX;
    const dy = e.clientY - resizeStartRef.current.startY;

    const newW = Math.max(180, resizeStartRef.current.initW + dx);
    const newH = Math.max(140, resizeStartRef.current.initH + dy);

    onLayoutChange({ ...layout, width: newW, height: newH }, false);
  };

  const handleResizePointerUp = (e: React.PointerEvent) => {
    if (!isResizing) return;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch (_) {}
    setIsResizing(false);
    resizeStartRef.current = null;
    onLayoutChange(layout, true); // Save layout
  };

  // Content auto-save on blur
  const handleTitleBlur = () => {
    if (!primaryCol) return;
    if (localTitle !== titleVal) {
      onUpdateRowData({
        ...row,
        data: {
          ...row.data,
          [primaryCol.id]: localTitle,
        },
        updatedAt: Date.now(),
      });
    }
  };

  const handleContentBlur = () => {
    if (localContent !== contentVal) {
      const targetColId = contentCol?.id || 'content';
      onUpdateRowData({
        ...row,
        data: {
          ...row.data,
          [targetColId]: localContent,
        },
        updatedAt: Date.now(),
      });
    }
  };

  const colorStyle = BG_COLOR_STYLES[layout.bgColor] || BG_COLOR_STYLES.amber;

  return (
    <div
      id={`sticky-note-${row.id}`}
      style={{
        position: 'absolute',
        left: `${layout.x}px`,
        top: `${layout.y}px`,
        width: `${layout.width}px`,
        height: `${layout.height}px`,
        zIndex: layout.zIndex,
      }}
      onClick={onBringToFront}
      className={`rounded-2xl shadow-xl border flex flex-col overflow-hidden transition-shadow duration-150 select-none group/card ${colorStyle.card} ${colorStyle.border} ${
        isDragging ? 'opacity-90 shadow-2xl scale-[1.01] cursor-grabbing' : 'hover:shadow-2xl'
      } ${layout.isPinned ? 'ring-2 ring-amber-500/80 shadow-2xl' : ''}`}
    >
      {/* Top Header Drag Bar */}
      <div
        onPointerDown={handleDragPointerDown}
        onPointerMove={handleDragPointerMove}
        onPointerUp={handleDragPointerUp}
        className={`px-3 py-1.5 border-b flex items-center justify-between gap-1.5 cursor-grab active:cursor-grabbing select-none ${colorStyle.header}`}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onLayoutChange({ ...layout, isPinned: !layout.isPinned }, true);
            }}
            className={`p-1 rounded-lg transition-colors ${
              layout.isPinned
                ? 'bg-amber-500 text-stone-950 font-bold shadow-2xs'
                : 'text-stone-500 hover:text-stone-900 dark:hover:text-stone-100 hover:bg-black/5 dark:hover:bg-white/10'
            }`}
            title={layout.isPinned ? '고정 해제' : '상단 고정 (Pin)'}
          >
            <Pin className={`w-3.5 h-3.5 ${layout.isPinned ? 'fill-current' : ''}`} />
          </button>

          <input
            type="text"
            value={localTitle}
            onChange={(e) => setLocalTitle(e.target.value)}
            onBlur={handleTitleBlur}
            onPointerDown={(e) => e.stopPropagation()}
            placeholder="제목 없음"
            className="font-bold text-xs bg-transparent border-b border-transparent focus:border-stone-400 focus:outline-hidden truncate flex-1"
          />
        </div>

        {/* Header Action Controls */}
        <div className="flex items-center gap-1 shrink-0" onPointerDown={(e) => e.stopPropagation()}>
          {/* Color Palette Toggle */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowPalette(!showPalette)}
              className="w-4 h-4 rounded-full border border-black/20 hover:scale-110 transition-transform shadow-2xs"
              style={{
                backgroundColor:
                  layout.bgColor === 'amber' ? '#fcd34d' :
                  layout.bgColor === 'yellow' ? '#fef08a' :
                  layout.bgColor === 'green' ? '#6ee7b7' :
                  layout.bgColor === 'blue' ? '#7dd3fc' :
                  layout.bgColor === 'rose' ? '#fda4af' :
                  layout.bgColor === 'purple' ? '#d8b4fe' : '#44403c',
              }}
              title="스티커 색상 변경"
            />

            {showPalette && (
              <div className="absolute top-6 right-0 z-50 p-1.5 rounded-xl bg-white dark:bg-stone-900 shadow-2xl border border-stone-200 dark:border-stone-700 flex items-center gap-1 animate-in fade-in zoom-in-95">
                {(['amber', 'yellow', 'green', 'blue', 'rose', 'purple', 'dark'] as const).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => {
                      onLayoutChange({ ...layout, bgColor: c }, true);
                      setShowPalette(false);
                    }}
                    className="w-5 h-5 rounded-full border border-black/20 hover:scale-125 transition-transform"
                    style={{
                      backgroundColor:
                        c === 'amber' ? '#fcd34d' :
                        c === 'yellow' ? '#fef08a' :
                        c === 'green' ? '#6ee7b7' :
                        c === 'blue' ? '#7dd3fc' :
                        c === 'rose' ? '#fda4af' :
                        c === 'purple' ? '#d8b4fe' : '#44403c',
                    }}
                  />
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => onOpenRichEditor(row, contentCol?.id)}
            className="p-1 rounded-lg text-stone-500 hover:text-stone-900 dark:hover:text-stone-100 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
            title="리치 에디터로 확장"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => onDeleteRow(row.id)}
            className="p-1 rounded-lg text-stone-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
            title="메모 삭제"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Body Area */}
      <div className="flex-1 p-3 flex flex-col min-h-0 relative">
        <textarea
          value={localContent}
          onChange={(e) => setLocalContent(e.target.value)}
          onBlur={handleContentBlur}
          onPointerDown={(e) => e.stopPropagation()}
          placeholder="메모 내용을 입력하세요..."
          className="w-full flex-1 bg-transparent resize-none border-none outline-hidden text-xs leading-relaxed custom-scrollbar font-sans"
        />
      </div>

      {/* Resize Handle (Bottom Right Corner) */}
      <div
        onPointerDown={handleResizePointerDown}
        onPointerMove={handleResizePointerMove}
        onPointerUp={handleResizePointerUp}
        className="absolute bottom-1 right-1 p-1 cursor-nwse-resize text-stone-400 hover:text-amber-600 dark:hover:text-amber-400 transition-colors select-none z-20"
        title="드래그하여 크기 조절"
      >
        <GripHorizontal className="w-3.5 h-3.5 rotate-45" />
      </div>
    </div>
  );
};
