import React, { useRef, useState, useMemo } from 'react';
import { useTruncatedTooltip } from '../../hooks/useTruncatedTooltip';
import { Maximize2, Sparkles, Copy, Check, Image as ImageIcon, Pin, Code } from 'lucide-react';
import { detectLanguage, highlightHtmlCodeBlocks, extractCodeBlockFromContent } from '../../utils/codeHighlighter';
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
  isWrapCells?: boolean;
}

const TruncatedPreviewCellComponent: React.FC<TruncatedPreviewCellProps> = ({
  value,
  columnType,
  highlightQuery = '',
  onOpenEditor,
  onOpenImage,
  className = '',
  renderCustomContent,
  skipImageDetection = false,
  tooltipOnlyRichText = false,
  isWrapCells = false,
}) => {
  const {
    textRef,
    isHovered,
    handleMouseEnter,
    handleMouseLeave,
    handlePopoverMouseEnter,
    handlePopoverMouseLeave,
    forceClose,
  } = useTruncatedTooltip(350); // 350ms hover delay
  const [popoverPos, setPopoverPos] = useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
    isAbove: boolean;
    isRightOfCursor: boolean;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mousePosRef = useRef<{ clientX: number; clientY: number }>({ clientX: 0, clientY: 0 });
  const prevMouseXRef = useRef<number>(0);
  const isOverPopoverRef = useRef<boolean>(false);

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
    rawString.includes('<pre') ||
    rawString.includes('<code') ||
    rawString.includes('<h1>') ||
    rawString.includes('<h2>') ||
    rawString.includes('<strong>') ||
    rawString.includes('<span') ||
    rawString.includes('<mark') ||
    rawString.includes('<u>') ||
    rawString.includes('<em>') ||
    rawString.includes('<i>') ||
    rawString.includes('<b>') ||
    rawString.includes('style=') ||
    (rawString.startsWith('<p>') && rawString.includes('</p>'));

  const pureCodeInfo = extractCodeBlockFromContent(rawString);
  const displayPlainText = cleanTextValue(rawString);
  const detectedCode = pureCodeInfo.isPureCode
    ? { isCode: true, language: pureCodeInfo.language }
    : !isRich
    ? detectLanguage(displayPlainText)
    : { isCode: false, language: 'plaintext' as const };

  const highlightedRichHtml = useMemo(() => {
    if (!isRich) return '';
    return highlightHtmlCodeBlocks(rawString);
  }, [isRich, rawString]);

  // Only suppress floating popover for plain text if tooltipOnlyRichText is explicitly enabled by user
  const shouldShowTooltipPopover = !tooltipOnlyRichText || isRich;

  const calculatePosition = (coords?: { clientX: number; clientY: number }) => {
    let clientX = coords?.clientX ?? mousePosRef.current.clientX;
    let clientY = coords?.clientY ?? mousePosRef.current.clientY;

    if (!clientX && !clientY && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      clientX = rect.right;
      clientY = rect.top + rect.height / 2;
    }

    const popoverWidth = Math.min(Math.max(340, isRich ? 420 : 360), 540);
    const estimatedHeight = Math.min(360, isRich || displayPlainText.length > 80 ? 280 : 160);

    // Standard position: anchored to the RIGHT of the mouse cursor
    let isRightOfCursor = true;
    let left = clientX + 16;

    // Viewport right edge check: if overflowing, flip to the left of the cursor
    if (left + popoverWidth > window.innerWidth - 16) {
      left = clientX - popoverWidth - 16;
      isRightOfCursor = false;
    }
    // Prevent left edge overflow
    if (left < 12) {
      left = Math.max(12, window.innerWidth - popoverWidth - 16);
    }

    // Vertical position: slightly below cursor tip
    let isAbove = false;
    let top = clientY + 8;

    // Viewport bottom edge check: if overflowing bottom, flip to above cursor
    if (top + estimatedHeight > window.innerHeight - 16) {
      top = clientY - estimatedHeight - 12;
      isAbove = true;
    }
    // Prevent top edge overflow
    if (top < 12) {
      top = Math.max(12, window.innerHeight - estimatedHeight - 16);
    }

    const maxHeight = Math.max(
      160,
      Math.min(420, isAbove ? Math.max(160, clientY - 24) : window.innerHeight - top - 24)
    );

    setPopoverPos({
      top,
      left,
      width: popoverWidth,
      maxHeight,
      isAbove,
      isRightOfCursor,
    });
  };

  const onMouseEnterWithCoords = (e: React.MouseEvent) => {
    mousePosRef.current = { clientX: e.clientX, clientY: e.clientY };
    prevMouseXRef.current = e.clientX;
    isOverPopoverRef.current = false;

    // If tooltipOnlyRichText is on and not rich, fall back to native title
    if (!shouldShowTooltipPopover) {
      return;
    }

    handleMouseEnter(
      {
        isRich,
        hasImage,
        hasSticker,
        hasCode: detectedCode.isCode,
        textLength: displayPlainText.length,
        hasNewlines,
      },
      () => {
        calculatePosition();
      }
    );
  };

  const onCellMouseMove = (e: React.MouseEvent) => {
    const currentX = e.clientX;
    const currentY = e.clientY;
    mousePosRef.current = { clientX: currentX, clientY: currentY };

    // If popover is already visible and user isn't hovering on the popover itself:
    if (isHovered && popoverPos && !isOverPopoverRef.current) {
      // If mouse is moving towards the popover, don't move the popover away
      // so the user can smoothly enter the popover to click copy or scroll
      const isMovingTowards = popoverPos.isRightOfCursor
        ? currentX > prevMouseXRef.current + 2
        : currentX < prevMouseXRef.current - 2;

      if (!isMovingTowards) {
        calculatePosition({ clientX: currentX, clientY: currentY });
      }
    }
    prevMouseXRef.current = currentX;
  };

  const onMouseLeaveWithDelay = () => {
    isOverPopoverRef.current = false;
    handleMouseLeave();
  };

  const onPopoverMouseEnter = () => {
    isOverPopoverRef.current = true;
    handlePopoverMouseEnter();
  };

  const onPopoverMouseLeave = () => {
    isOverPopoverRef.current = false;
    handlePopoverMouseLeave();
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
      onMouseMove={onCellMouseMove}
      onMouseLeave={onMouseLeaveWithDelay}
      title={
        !shouldShowTooltipPopover && displayPlainText.trim().length > 0
          ? displayPlainText
          : undefined
      }
    >
      {/* Visible Cell Content (Truncated to maximum 3 lines with ellipsis, or fully wrapped if isWrapCells is true) */}
      {(() => {
        const clampClass = isWrapCells
          ? 'break-words whitespace-pre-wrap leading-snug'
          : 'line-clamp-3 break-words whitespace-pre-wrap leading-snug';

        return (
          <div
            ref={textRef}
            className="w-full text-xs font-normal text-stone-800 dark:text-stone-200 flex items-start gap-1.5 overflow-hidden"
          >
            {customRender !== null && customRender !== undefined ? (
              <div className={clampClass}>
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
                <span className={`${clampClass} text-xs text-stone-700 dark:text-stone-300`}>
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
                <span className={`${clampClass} text-xs text-amber-900 dark:text-amber-300 font-medium`}>
                  {displayPlainText.length > 0 ? (
                    <HighlightText text={displayPlainText} highlight={highlightQuery} />
                  ) : (
                    '📌 원노트 스티커 메모'
                  )}
                </span>
              </div>
            ) : (pureCodeInfo.isPureCode || detectedCode.isCode) ? (
              <div className="flex items-start gap-1.5 min-w-0 w-full">
                <Code className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                <span className={`${clampClass} font-mono text-[11px] text-stone-700 dark:text-stone-300`}>
                  <HighlightText text={pureCodeInfo.isPureCode ? pureCodeInfo.code : displayPlainText} highlight={highlightQuery} />
                </span>
              </div>
            ) : (
              <div className={`${clampClass} w-full`}>
                {displayPlainText.length > 0 ? (
                  <HighlightText text={displayPlainText} highlight={highlightQuery} />
                ) : (
                  <span className="text-stone-400 dark:text-[#666666] italic">(비어 있음)</span>
                )}
              </div>
            )}
          </div>
        );
      })()}

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
          onMouseEnter={onPopoverMouseEnter}
          onMouseLeave={onPopoverMouseLeave}
          onDoubleClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            forceClose();
            if (onOpenEditor) onOpenEditor();
          }}
          title={onOpenEditor ? "더블 클릭하여 에디터에서 열기" : undefined}
          className="animate-in fade-in zoom-in-95 duration-150 p-3.5 bg-white/95 dark:bg-[#1c1c1c]/98 backdrop-blur-md text-stone-800 dark:text-stone-100 rounded-xl shadow-2xl border border-stone-200/90 dark:border-stone-700/60 text-xs pointer-events-auto cursor-pointer flex flex-col shadow-stone-400/20 dark:shadow-black/60"
        >
          <div className="flex items-center justify-between gap-2 pb-1.5 mb-2 border-b border-stone-200 dark:border-stone-800 text-[11px] text-stone-500 dark:text-stone-400 font-medium shrink-0">
            <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400 font-semibold">
              <Sparkles className="w-3 h-3" />
              {pureCodeInfo.isPureCode
                ? `코드 미리보기 (${pureCodeInfo.language.toUpperCase()})`
                : hasImage
                ? '이미지 및 서식 내용 미리보기'
                : detectedCode.isCode
                ? `코드 미리보기 (${detectedCode.language.toUpperCase()})`
                : '전체 내용 미리보기'}
            </span>
            <div className="flex items-center gap-2">
              <span className="text-stone-400 dark:text-stone-500">{(displayPlainText || rawString).length}자</span>
              {!pureCodeInfo.isPureCode && !detectedCode.isCode && (
                <button
                  onClick={handleCopyText}
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-600 dark:text-stone-300 text-[10px] transition-colors border border-stone-200/80 dark:border-transparent"
                  title="내용 복사"
                >
                  {copied ? <Check className="w-2.5 h-2.5 text-emerald-500 dark:text-emerald-400" /> : <Copy className="w-2.5 h-2.5" />}
                  <span>{copied ? '복사됨' : '복사'}</span>
                </button>
              )}
            </div>
          </div>

          <div className="overflow-y-auto custom-scrollbar flex-1 min-h-0">
            {pureCodeInfo.isPureCode ? (
              <CodeBlockViewer
                code={pureCodeInfo.code}
                language={pureCodeInfo.language}
                maxHeight="max-h-64"
              />
            ) : isRich ? (
              <div
                className="max-h-64 leading-relaxed text-stone-800 dark:text-stone-200 font-sans text-xs prose dark:prose-invert wonbee-rendered-table tiptap"
                dangerouslySetInnerHTML={{ __html: highlightedRichHtml }}
              />
            ) : detectedCode.isCode ? (
              <CodeBlockViewer
                code={displayPlainText}
                language={detectedCode.language}
                maxHeight="max-h-56"
              />
            ) : (
              <div className="max-h-52 whitespace-pre-wrap break-words leading-relaxed text-stone-800 dark:text-stone-200 font-sans text-xs">
                <HighlightText text={displayPlainText} highlight={highlightQuery} />
              </div>
            )}
          </div>

          {onOpenEditor && (
            <div className="mt-2 pt-2 border-t border-stone-200 dark:border-stone-800 flex justify-end shrink-0">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleMouseLeave();
                  onOpenEditor();
                }}
                className="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold rounded-md flex items-center gap-1.5 text-[11px] transition-colors shadow-xs"
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

export const TruncatedPreviewCell = React.memo(TruncatedPreviewCellComponent);

