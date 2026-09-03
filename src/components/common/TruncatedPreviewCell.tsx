import React, { useRef, useState } from 'react';
import { useTruncatedTooltip } from '../../hooks/useTruncatedTooltip';
import { Maximize2, Sparkles, Copy, Check, Image as ImageIcon, Pin } from 'lucide-react';
import { detectLanguage } from '../../utils/codeHighlighter';
import { CodeBlockViewer } from './CodeBlockViewer';
import { cleanTextValue, extractFirstImageSrc } from '../../utils/textSanitizer';
import { HighlightText } from './HighlightText';

interface TruncatedPreviewCellProps {
  value: any;
  columnType: string;
  highlightQuery?: string;
  onOpenEditor?: () => void;
  onOpenImage?: (src: string) => void;
  className?: string;
  renderCustomContent?: (val: any) => React.ReactNode;
  skipImageDetection?: boolean;
  tooltipOnlyRichText?: boolean;
}

export const TruncatedPreviewCell: React.FC<TruncatedPreviewCellProps> = ({
  value,
  columnType,
  highlightQuery = '',
  onOpenEditor,
  onOpenImage,
  className = '',
  renderCustomContent,
  skipImageDetection = false,
  tooltipOnlyRichText = false,
}) => {
  const { textRef, isHovered, handleMouseEnter, handleMouseLeave } = useTruncatedTooltip();
  const [popoverPos, setPopoverPos] = useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
    isAbove: boolean;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const leaveTimerRef = useRef<NodeJS.Timeout | null>(null);

  const rawString = typeof value === 'object' ? JSON.stringify(value) : String(value ?? '');

  // Performance optimization 1: If skipImageDetection is enabled, skip expensive regex parsing for non-image columns
  const shouldDetectImage = !skipImageDetection || columnType === 'image';
  const firstImageSrc = shouldDetectImage ? extractFirstImageSrc(rawString) : null;
  const hasImage = shouldDetectImage && (!!firstImageSrc || rawString.includes('<img'));

  const hasTable = rawString.includes('<table');
  const hasSticker = rawString.includes('wonbee-sticker') || rawString.includes('<sticker-node');
  const hasNewlines = rawString.includes('\n') || rawString.includes('<br') || rawString.includes('<p>');
  const isRich =
    columnType === 'richText' ||
    hasImage ||
    hasTable ||
    hasSticker ||
    rawString.includes('<h1>') ||
    rawString.includes('<h2>') ||
    rawString.includes('<strong>') ||
    (rawString.startsWith('<p>') && rawString.includes('</p>'));

  const displayPlainText = cleanTextValue(rawString);
  const detectedCode = !isRich ? detectLanguage(displayPlainText) : { isCode: false, language: 'plaintext' as const };

  // Only suppress floating popover for plain text if tooltipOnlyRichText is explicitly enabled by user
  const shouldShowTooltipPopover = !tooltipOnlyRichText || isRich;

  const cancelLeaveTimer = () => {
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }
  };

  const calculatePosition = () => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const popoverWidth = Math.min(Math.max(rect.width * 1.8, 360), 600);

    // Calculate left position with window edge clamping
    let left = rect.left;
    if (left + popoverWidth > window.innerWidth - 20) {
      left = window.innerWidth - popoverWidth - 20;
    }
    left = Math.max(16, left);

    const viewportHeight = window.innerHeight;
    const spaceBelow = viewportHeight - rect.bottom;
    const spaceAbove = rect.top;

    // Approximate content height based on length / rich features
    const estimatedHeight = Math.min(320, isRich || displayPlainText.length > 80 ? 280 : 160);

    let top: number;
    let isAbove = false;
    let maxHeight = 380;

    if (spaceBelow < estimatedHeight && spaceAbove > spaceBelow) {
      // Position above the cell
      isAbove = true;
      maxHeight = Math.max(140, spaceAbove - 24);
      top = Math.max(12, rect.top - Math.min(estimatedHeight, maxHeight) - 8);
    } else {
      // Position below the cell
      isAbove = false;
      maxHeight = Math.max(140, spaceBelow - 24);
      top = Math.min(rect.bottom + 6, viewportHeight - 120);
    }

    setPopoverPos({
      top,
      left,
      width: popoverWidth,
      maxHeight,
      isAbove,
    });
  };

  const onMouseEnterWithCoords = () => {
    cancelLeaveTimer();

    // If tooltipOnlyRichText is on and not rich, fall back to native title
    if (!shouldShowTooltipPopover) {
      return;
    }

    calculatePosition();
    handleMouseEnter({
      isRich,
      hasImage,
      hasSticker,
      hasCode: detectedCode.isCode,
      textLength: displayPlainText.length,
      hasNewlines,
    });
  };

  const onMouseLeaveWithDelay = () => {
    cancelLeaveTimer();
    leaveTimerRef.current = setTimeout(() => {
      handleMouseLeave();
    }, 150);
  };

  const handleCopyText = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(displayPlainText || rawString);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy', err);
    }
  };

  const customRender = renderCustomContent ? renderCustomContent(value) : null;

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full flex items-center select-none group/cell ${className}`}
      onMouseEnter={onMouseEnterWithCoords}
      onMouseLeave={onMouseLeaveWithDelay}
      title={
        !shouldShowTooltipPopover && displayPlainText.trim().length > 0
          ? displayPlainText
          : undefined
      }
    >
      {/* Visible Cell Content (Truncated to maximum 3 lines with ellipsis) */}
      <div
        ref={textRef}
        className="w-full text-xs font-normal text-stone-800 dark:text-stone-200 flex items-start gap-1.5 overflow-hidden"
      >
        {customRender !== null && customRender !== undefined ? (
          <div className="line-clamp-3 break-words whitespace-pre-wrap leading-snug">
            {customRender}
          </div>
        ) : hasImage ? (
          <div className="flex items-start gap-1.5 min-w-0">
            {firstImageSrc ? (
              <img
                src={firstImageSrc}
                alt="thumb"
                onClick={(e) => {
                  if (onOpenImage && firstImageSrc) {
                    e.stopPropagation();
                    onOpenImage(firstImageSrc);
                  }
                }}
                className="w-4 h-4 rounded object-cover border border-stone-300 dark:border-[#444444] flex-shrink-0 cursor-zoom-in hover:scale-110 transition-transform mt-0.5"
                title="클릭하여 원본 이미지 뷰어 열기"
              />
            ) : (
              <ImageIcon className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
            )}
            <span className="line-clamp-3 break-words whitespace-pre-wrap leading-snug text-xs text-stone-700 dark:text-stone-300">
              {displayPlainText.length > 0 ? (
                <HighlightText text={displayPlainText} highlight={highlightQuery} />
              ) : (
                '[이미지 첨부]'
              )}
            </span>
          </div>
        ) : hasSticker ? (
          <div className="flex items-start gap-1.5 min-w-0 w-full">
            <Pin className="w-3.5 h-3.5 text-amber-500 fill-current flex-shrink-0 mt-0.5" />
            <span className="line-clamp-3 break-words whitespace-pre-wrap leading-snug text-xs text-amber-900 dark:text-amber-300 font-medium">
              {displayPlainText.length > 0 ? (
                <HighlightText text={displayPlainText} highlight={highlightQuery} />
              ) : (
                '📌 원노트 스티커 메모'
              )}
            </span>
          </div>
        ) : (
          <div className="line-clamp-3 break-words whitespace-pre-wrap leading-snug w-full">
            {displayPlainText.length > 0 ? (
              <HighlightText text={displayPlainText} highlight={highlightQuery} />
            ) : (
              <span className="text-stone-400 dark:text-[#666666] italic">(비어 있음)</span>
            )}
          </div>
        )}
      </div>

      {/* Quick edit button on cell hover */}
      {onOpenEditor && (
        <button
          id={`quick-edit-${displayPlainText.slice(0, 10)}`}
          onClick={(e) => {
            e.stopPropagation();
            onOpenEditor();
          }}
          title="세부 리치 에디터 열기"
          className="opacity-0 group-hover/cell:opacity-100 transition-opacity ml-1.5 p-1 rounded hover:bg-amber-100 dark:hover:bg-[#333333] text-stone-400 hover:text-amber-600 dark:hover:text-amber-400 flex-shrink-0"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
      )}

      {/* Truncation-only Hover Preview Floating Popover */}
      {isHovered && popoverPos && shouldShowTooltipPopover && (
        <div
          style={{
            position: 'fixed',
            top: `${popoverPos.top}px`,
            left: `${popoverPos.left}px`,
            maxWidth: `${popoverPos.width}px`,
            maxHeight: `${popoverPos.maxHeight}px`,
            zIndex: 9999,
          }}
          onMouseEnter={cancelLeaveTimer}
          onMouseLeave={onMouseLeaveWithDelay}
          onDoubleClick={(e) => {
            e.stopPropagation();
            handleMouseLeave();
            if (onOpenEditor) onOpenEditor();
          }}
          title={onOpenEditor ? "더블 클릭하여 에디터에서 열기" : undefined}
          className="animate-in fade-in zoom-in-95 duration-150 p-3.5 bg-stone-900/95 dark:bg-[#1c1c1c]/98 backdrop-blur-md text-stone-100 rounded-xl shadow-2xl border border-stone-700/60 text-xs pointer-events-auto cursor-pointer flex flex-col"
        >
          <div className="flex items-center justify-between gap-2 pb-1.5 mb-2 border-b border-stone-800 text-[11px] text-stone-400 font-medium shrink-0">
            <span className="flex items-center gap-1 text-amber-400 font-semibold">
              <Sparkles className="w-3 h-3" />
              {hasImage
                ? '이미지 및 서식 내용 미리보기'
                : detectedCode.isCode
                ? `코드 미리보기 (${detectedCode.language.toUpperCase()})`
                : '전체 내용 미리보기'}
            </span>
            <div className="flex items-center gap-2">
              <span>{(displayPlainText || rawString).length}자</span>
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

          <div className="overflow-y-auto custom-scrollbar flex-1 min-h-0">
            {isRich ? (
              <div
                className="max-h-64 leading-relaxed text-stone-200 font-sans text-xs prose dark:prose-invert wonbee-rendered-table tiptap"
                dangerouslySetInnerHTML={{ __html: rawString }}
              />
            ) : detectedCode.isCode ? (
              <CodeBlockViewer
                code={displayPlainText}
                language={detectedCode.language}
                maxHeight="max-h-56"
              />
            ) : (
              <div className="max-h-52 whitespace-pre-wrap break-words leading-relaxed text-stone-200 font-sans text-xs">
                <HighlightText text={displayPlainText} highlight={highlightQuery} />
              </div>
            )}
          </div>

          {onOpenEditor && (
            <div className="mt-2 pt-2 border-t border-stone-800 flex justify-end shrink-0">
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
