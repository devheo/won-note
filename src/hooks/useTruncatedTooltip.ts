import { useState, useRef, useCallback, useEffect } from 'react';

export function useTruncatedTooltip() {
  const [isTruncated, setIsTruncated] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const textRef = useRef<HTMLDivElement | null>(null);

  const checkTruncation = useCallback(() => {
    const el = textRef.current;
    if (!el) return false;

    // A DOM element is truncated if scroll dimensions strictly exceed visible client dimensions
    const truncated = el.scrollWidth > el.clientWidth || el.scrollHeight > el.clientHeight;
    setIsTruncated(truncated);
    return truncated;
  }, []);

  const handleMouseEnter = useCallback(() => {
    const truncated = checkTruncation();
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
