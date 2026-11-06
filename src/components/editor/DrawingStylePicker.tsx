import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Pencil } from 'lucide-react';

const BASIC_DRAWING_COLORS = [
  '#fff200', '#00d331', '#00d9e8', '#e83ad9',
  '#ff8a00', '#8dcc65', '#8dc9f2', '#efa2c9',
  '#ed174c', '#00a94f', '#0874b9', '#c99af2',
  '#f02b16', '#e7e7e7', '#969696', '#111111',
];
const DRAWING_WIDTHS = [0.75, 1, 1.5, 2, 3, 4, 5, 6];

export const DrawingStylePicker: React.FC<{
  color: string;
  width: number;
  onColorChange: (color: string) => void;
  onWidthChange: (width: number) => void;
}> = ({ color, width, onColorChange, onWidthChange }) => {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 12, top: 70 });
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      setPosition({ left: Math.max(8, Math.min(rect.left, window.innerWidth - 252)), top: Math.max(8, Math.min(rect.bottom + 5, window.innerHeight - 410)) });
    };
    const closeOutside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    window.document.addEventListener('pointerdown', closeOutside, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      window.document.removeEventListener('pointerdown', closeOutside, true);
    };
  }, [open]);

  const chooseColor = (next: string) => {
    onColorChange(next);
    setRecent(previous => [next, ...previous.filter(value => value.toLowerCase() !== next.toLowerCase())].slice(0, 8));
  };

  return <div className="shrink-0">
    <button ref={buttonRef} type="button" aria-label="펜 색상과 굵기" aria-expanded={open} onMouseDown={event => event.preventDefault()} onClick={() => setOpen(value => !value)} className="flex h-9 items-center gap-2 rounded-lg border border-stone-200 bg-white px-2.5 hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-800 dark:hover:bg-stone-700" title="펜 색상과 굵기 선택">
      <span className="relative flex h-6 w-7 items-center justify-center rounded border border-stone-300 bg-white dark:border-stone-600"><Pencil size={14} className="absolute top-0.5 text-stone-700 dark:text-stone-200"/><span className="absolute bottom-0.5 h-1.5 w-5 rounded-full" style={{ backgroundColor: color }}/></span>
      <span className="h-0.5 w-8 rounded-full" style={{ backgroundColor: color, height: Math.max(1, Math.min(width, 6)) }}/><ChevronDown size={13} className="text-stone-500"/>
    </button>
    {open && createPortal(<div ref={menuRef} className="fixed z-[31000] w-[244px] rounded-md border border-stone-400 bg-white p-2 text-stone-800 shadow-xl dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100" style={{ left: position.left, top: position.top }}>
      <div className="mb-2 border-b border-stone-200 pb-2 dark:border-stone-700">
        <div className="mb-1.5 text-[11px] font-semibold">두께</div>
        <div className="flex items-center justify-between gap-0.5">
          {DRAWING_WIDTHS.map(size => <button key={size} type="button" aria-label={`${size}px 굵기`} title={`${size}px`} onClick={() => onWidthChange(size)} className={`flex h-7 w-7 items-center justify-center rounded-full hover:bg-stone-100 dark:hover:bg-stone-800 ${width === size ? 'ring-2 ring-indigo-500 ring-offset-1 dark:ring-offset-stone-900' : ''}`}><span className="rounded-full bg-stone-800 dark:bg-stone-100" style={{ width: Math.max(3, size * 2.2), height: Math.max(3, size * 2.2) }}/></button>)}
        </div>
      </div>
      <div className="mb-2 border-b border-stone-200 pb-2 dark:border-stone-700">
        <div className="mb-1.5 text-[11px] font-semibold">최근에 사용한 색</div>
        <div className="flex min-h-8 items-center gap-1">{(recent.length ? recent : [color]).map((recentColor, index) => <button key={`${recentColor}-${index}`} type="button" aria-label={`최근 색상 ${recentColor}`} onClick={() => chooseColor(recentColor)} className={`h-7 w-7 border ${color.toLowerCase() === recentColor.toLowerCase() ? 'border-indigo-600 ring-1 ring-indigo-500' : 'border-stone-400'}`} style={{ backgroundColor: recentColor }}/>)}</div>
      </div>
      <div className="mb-2">
        <div className="mb-1.5 text-[11px] font-semibold">색</div>
        <div className="grid grid-cols-4 gap-1">
          {BASIC_DRAWING_COLORS.map(preset => <button key={preset} type="button" aria-label={`색상 ${preset}`} title={preset} onClick={() => chooseColor(preset)} className={`h-8 border ${color.toLowerCase() === preset ? 'border-stone-900 ring-2 ring-indigo-500 ring-offset-1 dark:border-white dark:ring-offset-stone-900' : 'border-white shadow-sm dark:border-stone-800'}`} style={{ backgroundColor: preset }}/>) }
        </div>
      </div>
      <label className="flex cursor-pointer items-center gap-2 border-t border-stone-200 px-1 pt-2 text-[11px] hover:text-indigo-600 dark:border-stone-700 dark:hover:text-indigo-300"><span className="text-base">🎨</span>다른 색 선택<input aria-label="사용자 지정 색상" type="color" value={color} onChange={event => chooseColor(event.target.value)} className="ml-auto h-6 w-8 cursor-pointer border-0 bg-transparent"/></label>
    </div>, window.document.body)}
  </div>;
};
