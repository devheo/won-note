import React, { useState } from 'react';
import { Plus, Minus, Table as TableIcon } from 'lucide-react';

interface TableGridPickerProps {
  onInsert: (rows: number, cols: number) => void;
  onCancel?: () => void;
}

const MAX_ROWS = 8;
const MAX_COLS = 10;

export const TableGridPicker: React.FC<TableGridPickerProps> = ({ onInsert, onCancel }) => {
  const [hoverRows, setHoverRows] = useState(3);
  const [hoverCols, setHoverCols] = useState(3);

  const handleCellHover = (r: number, c: number) => {
    setHoverRows(r);
    setHoverCols(c);
  };

  const handleClick = (r: number, c: number) => {
    onInsert(r, c);
  };

  return (
    <div className="p-3 select-none text-xs w-64 bg-white dark:bg-[#242424] rounded-xl">
      {/* Dynamic Header Display */}
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-stone-100 dark:border-[#333333]">
        <div className="flex items-center gap-1.5 font-bold text-stone-800 dark:text-[#f0f0f0]">
          <TableIcon className="w-3.5 h-3.5 text-amber-500" />
          <span>표 크기 선택</span>
        </div>
        <div className="px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 font-mono font-bold text-[11px] ring-1 ring-amber-400/40">
          {hoverCols} × {hoverRows}
        </div>
      </div>

      <div className="text-[11px] text-stone-500 dark:text-stone-400 mb-2">
        마우스를 움직여 행/열을 가감하세요:
      </div>

      {/* Interactive Grid Matrix (Excel Style) */}
      <div
        className="grid gap-1 mb-3 p-1.5 bg-stone-50 dark:bg-[#1c1c1c] rounded-lg border border-stone-200/70 dark:border-[#383838]"
        style={{ gridTemplateColumns: `repeat(${MAX_COLS}, minmax(0, 1fr))` }}
        onMouseLeave={() => {
          // Keep current selection
        }}
      >
        {Array.from({ length: MAX_ROWS }).map((_, rIdx) => {
          const r = rIdx + 1;
          return Array.from({ length: MAX_COLS }).map((_, cIdx) => {
            const c = cIdx + 1;
            const isHighlighted = r <= hoverRows && c <= hoverCols;

            return (
              <div
                key={`${r}-${c}`}
                onMouseEnter={() => handleCellHover(r, c)}
                onClick={() => handleClick(r, c)}
                className={`w-4 h-4 rounded-xs border transition-all cursor-pointer ${
                  isHighlighted
                    ? 'bg-amber-500 border-amber-600 dark:border-amber-400 scale-105 shadow-2xs'
                    : 'bg-white dark:bg-[#2a2a2a] border-stone-200 dark:border-[#404040] hover:border-amber-300'
                }`}
                title={`${c}열 × ${r}행`}
              />
            );
          });
        })}
      </div>

      {/* Manual Stepper Adjusters */}
      <div className="flex items-center justify-between gap-2 mb-3 bg-stone-50 dark:bg-[#1e1e1e] p-2 rounded-lg border border-stone-200/60 dark:border-[#333333]">
        <div className="flex items-center gap-1">
          <span className="text-[10px] font-bold text-stone-500 dark:text-stone-400 uppercase">열(Col):</span>
          <div className="flex items-center bg-white dark:bg-[#2c2c2c] rounded border border-stone-200 dark:border-[#444444]">
            <button
              type="button"
              onClick={() => setHoverCols((prev) => Math.max(1, prev - 1))}
              className="px-1.5 py-0.5 text-stone-500 hover:text-stone-900 dark:hover:text-stone-100 hover:bg-stone-100 dark:hover:bg-[#383838]"
              title="열 1개 감소"
            >
              <Minus className="w-2.5 h-2.5" />
            </button>
            <span className="px-2 font-mono font-bold text-stone-800 dark:text-stone-200">{hoverCols}</span>
            <button
              type="button"
              onClick={() => setHoverCols((prev) => Math.min(MAX_COLS, prev + 1))}
              className="px-1.5 py-0.5 text-stone-500 hover:text-stone-900 dark:hover:text-stone-100 hover:bg-stone-100 dark:hover:bg-[#383838]"
              title="열 1개 증가"
            >
              <Plus className="w-2.5 h-2.5" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <span className="text-[10px] font-bold text-stone-500 dark:text-stone-400 uppercase">행(Row):</span>
          <div className="flex items-center bg-white dark:bg-[#2c2c2c] rounded border border-stone-200 dark:border-[#444444]">
            <button
              type="button"
              onClick={() => setHoverRows((prev) => Math.max(1, prev - 1))}
              className="px-1.5 py-0.5 text-stone-500 hover:text-stone-900 dark:hover:text-stone-100 hover:bg-stone-100 dark:hover:bg-[#383838]"
              title="행 1개 감소"
            >
              <Minus className="w-2.5 h-2.5" />
            </button>
            <span className="px-2 font-mono font-bold text-stone-800 dark:text-stone-200">{hoverRows}</span>
            <button
              type="button"
              onClick={() => setHoverRows((prev) => Math.min(MAX_ROWS, prev + 1))}
              className="px-1.5 py-0.5 text-stone-500 hover:text-stone-900 dark:hover:text-stone-100 hover:bg-stone-100 dark:hover:bg-[#383838]"
              title="행 1개 증가"
            >
              <Plus className="w-2.5 h-2.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Quick Preset Buttons */}
      <div className="flex items-center gap-1 mb-2.5">
        <span className="text-[10px] font-bold text-stone-400 uppercase mr-1">프리셋:</span>
        {[
          { r: 2, c: 2 },
          { r: 3, c: 3 },
          { r: 4, c: 4 },
          { r: 5, c: 5 },
          { r: 4, c: 6 },
        ].map((p) => (
          <button
            key={`${p.c}x${p.r}`}
            type="button"
            onClick={() => onInsert(p.r, p.c)}
            className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-stone-100 dark:bg-[#303030] hover:bg-amber-100 dark:hover:bg-amber-950/60 hover:text-amber-800 dark:hover:text-amber-300 text-stone-600 dark:text-stone-300 transition-colors"
          >
            {p.c}×{p.r}
          </button>
        ))}
      </div>

      {/* Primary Action Button */}
      <button
        type="button"
        onClick={() => handleClick(hoverRows, hoverCols)}
        className="w-full py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-stone-950 font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition-colors"
      >
        <Plus className="w-3.5 h-3.5" />
        <span>{hoverCols}열 × {hoverRows}행 표 생성</span>
      </button>
    </div>
  );
};
