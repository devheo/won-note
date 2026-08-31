import React, { useRef, useState } from 'react';
import { useTruncatedTooltip } from '../../hooks/useTruncatedTooltip';
import { Maximize2, Sparkles, Copy, Check } from 'lucide-react';
import { detectLanguage } from '../../utils/codeHighlighter';
import { CodeBlockViewer } from './CodeBlockViewer';
import { cleanTextValue } from '../../utils/textSanitizer';

interface TruncatedPreviewCellProps {
  value: any;
  columnType: string;
  onOpenEditor?: () => void;
  className?: string;
  renderCustomContent?: (val: any) => React.ReactNode;
}

export const TruncatedPreviewCell: React.FC<TruncatedPreviewCellProps> = ({
  value,
  columnType,
  onOpenEditor,
  className = '',
  renderCustomContent,
}) => {
  const { textRef, isHovered, handleMouseEnter, handleMouseLeave } = useTruncatedTooltip();
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const [copied, setCopied] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const rawString = typeof value === 'object' ? JSON.stringify(value) : String(value ?? '');
  const displayString = columnType !== 'richText' ? cleanTextValue(rawString) : rawString;
  const detectedCode = detectLanguage(displayString);

  const onMouseEnterWithCoords = () => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      // Position calculation to ensure popover stays within viewport bounds
      const popoverWidth = Math.min(Math.max(rect.width * 1.6, 320), 540);
      let left = rect.left;
      if (left + popoverWidth > window.innerWidth - 20) {
        left = window.innerWidth - popoverWidth - 20;
      }

      setPopoverPos({
        top: rect.bottom + 6,
        left: Math.max(16, left),
        width: popoverWidth,
      });
    }
    handleMouseEnter();
  };

  const handleCopyText = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(displayString);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy', err);
    }
  };

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full flex items-center select-none group/cell ${className}`}
      onMouseEnter={onMouseEnterWithCoords}
      onMouseLeave={handleMouseLeave}
    >
      {/* Visible Cell Content (Truncated) */}
      <div
        ref={textRef}
        className="w-full truncate text-sm font-normal text-stone-800 dark:text-stone-200"
      >
        {renderCustomContent ? renderCustomContent(value) : displayString}
      </div>

      {/* Quick edit button on cell hover */}
      {onOpenEditor && (
        <button
          id={`quick-edit-${displayString.slice(0, 10)}`}
          onClick={(e) => {
            e.stopPropagation();
            onOpenEditor();
          }}
          title="세부 리치 에디터 열기"
          className="opacity-0 group-hover/cell:opacity-100 transition-opacity ml-1.5 p-1 rounded hover:bg-amber-100 dark:hover:bg-stone-800 text-stone-400 hover:text-amber-600 dark:hover:text-amber-400 flex-shrink-0"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
      )}

      {/* Truncation-only Hover Preview Floating Popover */}
      {isHovered && popoverPos && (
        <div
          style={{
            position: 'fixed',
            top: `${popoverPos.top}px`,
            left: `${popoverPos.left}px`,
            maxWidth: `${popoverPos.width}px`,
            zIndex: 9999,
          }}
          className="animate-in fade-in zoom-in-95 duration-150 p-3 bg-stone-900/95 dark:bg-[#181a20]/98 backdrop-blur-md text-stone-100 rounded-xl shadow-2xl border border-stone-700/60 text-xs pointer-events-auto"
        >
          <div className="flex items-center justify-between gap-2 pb-1.5 mb-2 border-b border-stone-800 text-[11px] text-stone-400 font-medium">
            <span className="flex items-center gap-1 text-amber-400">
              <Sparkles className="w-3 h-3" />
              전체 내용 미리보기 {detectedCode.isCode && `(${detectedCode.language.toUpperCase()})`}
            </span>
            <div className="flex items-center gap-2">
              <span>{displayString.length}자</span>
              {!detectedCode.isCode && (
                <button
                  onClick={handleCopyText}
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-stone-800 hover:bg-stone-700 text-stone-300 text-[10px] transition-colors"
                  title="내용 복사"
                >
                  {copied ? <Check className="w-2.5 h-2.5 text-emerald-400" /> : <Copy className="w-2.5 h-2.5" />}
                  <span>{copied ? '복사됨' : '복사'}</span>
                </button>
              )}
            </div>
          </div>

          {detectedCode.isCode ? (
            <CodeBlockViewer
              code={displayString}
              language={detectedCode.language}
              maxHeight="max-h-60"
            />
          ) : (
            <div className="max-h-52 overflow-y-auto whitespace-pre-wrap break-words leading-relaxed text-stone-200 font-sans text-xs custom-scrollbar">
              {displayString}
            </div>
          )}

          {onOpenEditor && (
            <div className="mt-2 pt-2 border-t border-stone-800 flex justify-end">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleMouseLeave();
                  onOpenEditor();
                }}
                className="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold rounded-md flex items-center gap-1.5 text-[11px] transition-colors shadow-sm"
              >
                <Maximize2 className="w-3 h-3" />
                에디터에서 열기
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

