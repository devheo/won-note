import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Calculator, ChevronDown, Code, Code2, GitCompare, Lock, Terminal, Wrench } from 'lucide-react';

interface ToolsMenuDropdownProps {
  onOpen: (tool: 'prettyJson' | 'fileDiff' | 'formatExpress' | 'cryptoCodec' | 'postman' | 'calculator') => void;
}

const tools = [
  { id: 'prettyJson', label: 'Pretty JSON', icon: Code2 },
  { id: 'fileDiff', label: '소스 비교', icon: GitCompare },
  { id: 'formatExpress', label: 'Format Express', icon: Code },
  { id: 'cryptoCodec', label: '암/복호화', icon: Lock },
  { id: 'postman', label: 'Postman', icon: Terminal },
  { id: 'calculator', label: '계산기', icon: Calculator },
] as const;

export const ToolsMenuDropdown: React.FC<ToolsMenuDropdownProps> = ({ onOpen }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const portalRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !portalRef.current?.contains(target)) setIsOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen]);

  return (
    <div ref={menuRef} className="relative inline-block">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={(event) => {
          if (!isOpen) setAnchorRect(event.currentTarget.getBoundingClientRect());
          setIsOpen((open) => !open);
        }}
        className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
          isOpen
            ? 'bg-amber-500 text-stone-950 shadow-sm'
            : 'bg-stone-100 dark:bg-[#282828] hover:bg-stone-200 dark:hover:bg-[#333333] text-stone-700 dark:text-[#e0e0e0] border border-stone-200 dark:border-[#383838]'
        }`}
      >
        <Wrench className="w-3.5 h-3.5 text-amber-500" />
        도구
        <ChevronDown className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && anchorRect && createPortal(
        <div
          ref={portalRef}
          role="menu"
          style={{
            position: 'fixed',
            top: `${Math.min(anchorRect.bottom + 4, Math.max(8, window.innerHeight - 270))}px`,
            left: `${Math.min(anchorRect.left, Math.max(8, window.innerWidth - 232))}px`,
            width: '220px',
            maxHeight: 'min(420px, calc(100vh - 16px))',
            overflowY: 'auto',
            zIndex: 999999,
          }}
          className="rounded-xl bg-white dark:bg-[#222222] border border-stone-200 dark:border-[#383838] shadow-2xl p-1.5 text-xs text-stone-700 dark:text-[#cccccc] animate-in fade-in zoom-in-95 duration-150"
        >
          {tools.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="menuitem"
              onClick={() => { setIsOpen(false); onOpen(id); }}
              className="w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-stone-700 dark:text-[#cccccc] hover:bg-amber-500/10 dark:hover:bg-[#303030] transition-colors"
            >
              <Icon className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              {label}
            </button>
          ))}
        </div>
      , document.body)}
    </div>
  );
};
