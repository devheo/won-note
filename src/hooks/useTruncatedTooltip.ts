import { useState, useRef, useCallback, useEffect } from 'react';

export interface TruncationHint {
  isRich?: boolean;
  hasImage?: boolean;
  hasSticker?: boolean;
  hasCode?: boolean;
  textLength?: number;
  hasNewlines?: boolean;
}

export function useTruncatedTooltip() {
  const [isTruncated, setIsTruncated] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const textRef = useRef<HTMLDivElement | null>(null);

  const checkTruncation = useCallback((hint?: TruncationHint): boolean => {
    // 1. Rich elements (images, stickers, code blocks, HTML tables/formatting) always warrant preview
    if (hint?.isRich || hint?.hasImage || hint?.hasSticker || hint?.hasCode) {
      setIsTruncated(true);
      return true;
    }

    const el = textRef.current;
    if (!el) {
      const likelyTruncated = !!(hint?.hasNewlines || (hint?.textLength && hint.textLength > 36));
      setIsTruncated(likelyTruncated);
      return likelyTruncated;
    }

    // 2. Direct DOM scroll overflow on container
    if (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1) {
      setIsTruncated(true);
      return true;
    }

    // 3. Check child elements (especially elements with line-clamp-3, truncate, or text wrappers)
    // In CSS line-clamp, overflow is clipped on the clamped child element, not on the outer container!
    const allDescendants = el.querySelectorAll('*');
    for (let i = 0; i < allDescendants.length; i++) {
      const child = allDescendants[i] as HTMLElement;
      if (
        child.scrollHeight > child.clientHeight + 1 ||
        child.scrollWidth > child.clientWidth + 1
      ) {
        setIsTruncated(true);
        return true;
      }
    }

    // 4. Reliable content-based heuristic fallback:
    // If text has newlines, or has significant length (exceeds typical single/multi-line capacity)
    if (hint?.hasNewlines || (hint?.textLength && hint.textLength > 36)) {
      setIsTruncated(true);
      return true;
    }

    setIsTruncated(false);
    return false;
  }, []);

  const handleMouseEnter = useCallback((hint?: TruncationHint) => {
    const truncated = checkTruncation(hint);
    if (truncated) {
      setIsHovered(true);
    }
  }, [checkTruncation]);

  const handleMouseLeave = useCallback(() => {
    setIsHovered(false);
  }, []);

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
    checkTruncation,
  };
}

