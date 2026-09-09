import React, { useState, useRef, useEffect, useCallback } from 'react';
import { NodeViewWrapper, ReactNodeViewProps } from '@tiptap/react';
import {
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Trash2,
  Maximize2,
  Minimize2,
  Move,
  GripHorizontal,
} from 'lucide-react';

export const ImageComponent: React.FC<ReactNodeViewProps> = ({
  node,
  updateAttributes,
  deleteNode,
  selected,
}) => {
  const src = (node.attrs.src as string) || '';
  const alt = (node.attrs.alt as string) || '';
  const currentWidth = (node.attrs.width as string) || 'auto';
  const layout = (node.attrs.layout as 'inline' | 'center' | 'left' | 'right') || 'inline';

  const [isHovered, setIsHovered] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [resizingWidth, setResizingWidth] = useState<string | null>(null);

  const containerRef = useRef<HTMLSpanElement | null>(null);
  const startDragRef = useRef<{ startX: number; startWidthPx: number; parentWidthPx: number } | null>(null);

  // Resize drag handling
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const parentRect = containerRef.current.parentElement?.getBoundingClientRect() || rect;

    startDragRef.current = {
      startX: e.clientX,
      startWidthPx: rect.width,
      parentWidthPx: parentRect.width || 800,
    };
    setIsResizing(true);
  }, []);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!startDragRef.current) return;
      const { startX, startWidthPx, parentWidthPx } = startDragRef.current;
      const deltaX = e.clientX - startX;
      const newWidthPx = Math.max(80, Math.min(parentWidthPx, startWidthPx + deltaX));
      const pct = Math.round((newWidthPx / parentWidthPx) * 100);
      setResizingWidth(`${pct}%`);
    };

    const handleMouseUp = () => {
      if (resizingWidth) {
        updateAttributes({ width: resizingWidth });
      }
      setIsResizing(false);
      setResizingWidth(null);
      startDragRef.current = null;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, resizingWidth, updateAttributes]);

  const effectiveWidth = resizingWidth || currentWidth;

  // Determine wrapper styling based on layout
  let layoutClasses = 'inline-block align-middle my-1 mx-1.5';
  let layoutStyles: React.CSSProperties = {};

  if (layout === 'center') {
    layoutClasses = 'block my-3 mx-auto text-center clear-both';
    layoutStyles = { display: 'block', margin: '0.75rem auto' };
  } else if (layout === 'left') {
    layoutClasses = 'float-left mr-4 mb-2 clear-left';
    layoutStyles = { float: 'left', margin: '0 1rem 0.5rem 0' };
  } else if (layout === 'right') {
    layoutClasses = 'float-right ml-4 mb-2 clear-right';
    layoutStyles = { float: 'right', margin: '0 0 0.5rem 1rem' };
  } else {
    // 'inline' - enables two or more images side by side!
    layoutClasses = 'inline-block align-middle my-1 mx-1';
    layoutStyles = { display: 'inline-block', verticalAlign: 'middle' };
  }

  const showToolbar = isHovered || selected || isResizing;

  return (
    <NodeViewWrapper
      as="span"
      ref={containerRef}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`relative group select-none transition-all duration-100 ${layoutClasses}`}
      style={{
        ...layoutStyles,
        width: effectiveWidth === 'auto' ? undefined : effectiveWidth,
        maxWidth: '100%',
      }}
    >
      {/* Floating Toolbar */}
      {showToolbar && (
        <div
          contentEditable={false}
          className="absolute -top-11 left-1/2 -translate-x-1/2 z-40 flex items-center gap-1 bg-white/95 dark:bg-[#1e1e1e]/95 text-stone-800 dark:text-white px-2 py-1 rounded-xl shadow-xl border border-stone-200/90 dark:border-stone-600/80 backdrop-blur-sm text-xs animate-in fade-in zoom-in-95 select-none"
        >
          {/* Quick Width Presets */}
          <div className="flex items-center gap-0.5 border-r border-stone-200 dark:border-stone-700 pr-1.5 mr-0.5">
            {[
              { label: '25%', val: '25%' },
              { label: '50%', val: '48%' }, // 48% is optimal for 2 side-by-side images
              { label: '75%', val: '75%' },
              { label: '100%', val: '100%' },
              { label: 'Auto', val: 'auto' },
            ].map((p) => (
              <button
                key={p.val}
                type="button"
                onClick={() => updateAttributes({ width: p.val })}
                className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors ${
                  currentWidth === p.val
                    ? 'bg-amber-500 text-stone-950 font-bold'
                    : 'text-stone-600 dark:text-stone-300 hover:text-stone-900 dark:hover:text-white hover:bg-stone-100 dark:hover:bg-stone-800'
                }`}
                title={`너비 ${p.label}로 설정`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Layout Options */}
          <div className="flex items-center gap-0.5 border-r border-stone-200 dark:border-stone-700 pr-1.5 mr-0.5">
            <button
              type="button"
              onClick={() => updateAttributes({ layout: 'inline' })}
              className={`p-1 rounded transition-colors ${
                layout === 'inline'
                  ? 'bg-amber-500 text-stone-950'
                  : 'text-stone-600 dark:text-stone-300 hover:text-stone-900 dark:hover:text-white hover:bg-stone-100 dark:hover:bg-stone-800'
              }`}
              title="텍스트처럼 나란히 배치 (두 개 이상 이미지 가로 배열)"
            >
              <AlignJustify className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => updateAttributes({ layout: 'center' })}
              className={`p-1 rounded transition-colors ${
                layout === 'center'
                  ? 'bg-amber-500 text-stone-950'
                  : 'text-stone-600 dark:text-stone-300 hover:text-stone-900 dark:hover:text-white hover:bg-stone-100 dark:hover:bg-stone-800'
              }`}
              title="가운데 정렬 (블록)"
            >
              <AlignCenter className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => updateAttributes({ layout: 'left' })}
              className={`p-1 rounded transition-colors ${
                layout === 'left'
                  ? 'bg-amber-500 text-stone-950'
                  : 'text-stone-600 dark:text-stone-300 hover:text-stone-900 dark:hover:text-white hover:bg-stone-100 dark:hover:bg-stone-800'
              }`}
              title="텍스트 왼쪽 감싸기"
            >
              <AlignLeft className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => updateAttributes({ layout: 'right' })}
              className={`p-1 rounded transition-colors ${
                layout === 'right'
                  ? 'bg-amber-500 text-stone-950'
                  : 'text-stone-600 dark:text-stone-300 hover:text-stone-900 dark:hover:text-white hover:bg-stone-100 dark:hover:bg-stone-800'
              }`}
              title="텍스트 오른쪽 감싸기"
            >
              <AlignRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Delete Button */}
          <button
            type="button"
            onClick={deleteNode}
            className="p-1 rounded text-rose-500 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-200 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
            title="이미지 삭제"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main Image */}
      <img
        src={src}
        alt={alt}
        className={`rounded-xl object-contain shadow-md border border-stone-200 dark:border-[#383838] transition-all block w-full ${
          selected ? 'ring-2 ring-amber-500 ring-offset-2 dark:ring-offset-stone-900' : ''
        }`}
        style={{
          maxHeight: '520px',
          width: '100%',
        }}
      />

      {/* Resize Handle (Bottom-Right Corner) */}
      {(isHovered || selected || isResizing) && (
        <div
          contentEditable={false}
          onMouseDown={handleMouseDown}
          className="absolute -bottom-2 -right-2 w-5 h-5 bg-amber-500 hover:bg-amber-400 text-stone-950 rounded-full flex items-center justify-center cursor-nwse-resize shadow-lg z-30 transition-transform hover:scale-125 border-2 border-white dark:border-stone-900 select-none"
          title="드래그하여 이미지 크기 조절"
        >
          <GripHorizontal className="w-3 h-3 text-stone-950" />
        </div>
      )}

      {/* Real-time Resizing Tooltip */}
      {isResizing && resizingWidth && (
        <div
          contentEditable={false}
          className="absolute bottom-3 right-3 bg-stone-900/90 text-white px-2 py-0.5 rounded text-[10px] font-mono font-bold z-40 pointer-events-none shadow"
        >
          {resizingWidth}
        </div>
      )}
    </NodeViewWrapper>
  );
};
