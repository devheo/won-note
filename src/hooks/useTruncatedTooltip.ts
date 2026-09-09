import { useState, useRef, useCallback, useEffect } from 'react';

export interface TruncationHint {
  isRich?: boolean;
  hasImage?: boolean;
  hasSticker?: boolean;
  hasCode?: boolean;
  textLength?: number;
  hasNewlines?: boolean;
}

// Global active tooltip manager to ensure only ONE cell tooltip is ever visible at a time.
let activeTooltipDismissFn: (() => void) | null = null;

export function dismissAllCellTooltips() {
  if (activeTooltipDismissFn) {
    activeTooltipDismissFn();
    activeTooltipDismissFn = null;
  }
}

export function useTruncatedTooltip(hoverDelayMs = 380) {
  const [isTruncated, setIsTruncated] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const textRef = useRef<HTMLDivElement | null>(null);
  const enterTimerRef = useRef<NodeJS.Timeout | null>(null);
  const leaveTimerRef = useRef<NodeJS.Timeout | null>(null);

  const clearEnterTimer = useCallback(() => {
    if (enterTimerRef.current) {
      clearTimeout(enterTimerRef.current);
      enterTimerRef.current = null;
    }
  }, []);

  const clearLeaveTimer = useCallback(() => {
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }
  }, []);

  const forceClose = useCallback(() => {
    clearEnterTimer();
    clearLeaveTimer();
    setIsHovered(false);
  }, [clearEnterTimer, clearLeaveTimer]);

  const checkTruncation = useCallback((hint?: TruncationHint): boolean => {
    // 1. Rich elements (images, stickers, code blocks, HTML tables/formatting) always warrant preview
    if (hint?.isRich || hint?.hasImage || hint?.hasSticker || hint?.hasCode) {
      setIsTruncated(true);
      return true;
    }

    const el = textRef.current;
    if (!el) {
      const likelyTruncated = !!(hint?.hasNewlines || (hint?.textLength && hint.textLength > 15));
      setIsTruncated(likelyTruncated);
      return likelyTruncated;
    }

    // 2. Direct DOM scroll overflow on container
    if (el.scrollWidth > el.clientWidth + 0.5 || el.scrollHeight > el.clientHeight + 0.5) {
      setIsTruncated(true);
      return true;
    }

    // 3. Check child elements (especially elements with line-clamp-3, truncate, or text wrappers)
    const allDescendants = el.querySelectorAll('*');
    for (let i = 0; i < allDescendants.length; i++) {
      const child = allDescendants[i] as HTMLElement;
      if (
        child.scrollHeight > child.clientHeight + 0.5 ||
        child.scrollWidth > child.clientWidth + 0.5
      ) {
        setIsTruncated(true);
        return true;
      }
    }

    // 4. Reliable content-based heuristic fallback:
    if (hint?.hasNewlines || (hint?.textLength && hint.textLength > 15)) {
      setIsTruncated(true);
      return true;
    }

    setIsTruncated(false);
    return false;
  }, []);

  const handleMouseEnter = useCallback(
    (hint?: TruncationHint, onWillShow?: () => void) => {
      clearLeaveTimer();
      clearEnterTimer();

      // Dismiss any other currently open tooltip immediately so two tooltips NEVER overlap
      if (activeTooltipDismissFn && activeTooltipDismissFn !== forceClose) {
        activeTooltipDismissFn();
        activeTooltipDismissFn = null;
      }

      const truncated = checkTruncation(hint);
      if (!truncated) return;

      // Register this instance as the pending/active tooltip dismisser
      activeTooltipDismissFn = forceClose;

      // Add a deliberate hover delay (380ms) so passing the mouse over doesn't trigger rapid flashing
      enterTimerRef.current = setTimeout(() => {
        if (onWillShow) {
          onWillShow();
        }
        setIsHovered(true);
        activeTooltipDismissFn = forceClose;
      }, hoverDelayMs);
    },
    [checkTruncation, clearEnterTimer, clearLeaveTimer, forceClose, hoverDelayMs]
  );

  const handleMouseLeave = useCallback(() => {
    clearEnterTimer();
    clearLeaveTimer();

    // Short grace period (120ms) so user can move mouse onto the floating popover itself
    leaveTimerRef.current = setTimeout(() => {
      setIsHovered(false);
      if (activeTooltipDismissFn === forceClose) {
        activeTooltipDismissFn = null;
      }
    }, 120);
  }, [clearEnterTimer, clearLeaveTimer, forceClose]);

  const handlePopoverMouseEnter = useCallback(() => {
    clearLeaveTimer();
    clearEnterTimer();
  }, [clearEnterTimer, clearLeaveTimer]);

  const handlePopoverMouseLeave = useCallback(() => {
    handleMouseLeave();
  }, [handleMouseLeave]);

  useEffect(() => {
    return () => {
      clearEnterTimer();
      clearLeaveTimer();
      if (activeTooltipDismissFn === forceClose) {
        activeTooltipDismissFn = null;
      }
    };
  }, [clearEnterTimer, clearLeaveTimer, forceClose]);

  useEffect(() => {
    const el = textRef.current;
    if (!el) return;

    // Re-check whenever window resizes or container width changes
    const resizeObserver = new ResizeObserver(() => {
      checkTruncation();
    });

    resizeObserver.observe(el);
    return () => resizeObserver.disconnect();
  }, [checkTruncation]);

  return {
    textRef,
    isTruncated,
    isHovered,
    handleMouseEnter,
    handleMouseLeave,
    handlePopoverMouseEnter,
    handlePopoverMouseLeave,
    forceClose,
    checkTruncation,
  };
}

