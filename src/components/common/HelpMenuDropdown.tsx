import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BookOpen, ChevronDown, CircleHelp } from 'lucide-react';
import { guideTopics, type GuideTopic } from '../help/guideTopics';

interface HelpMenuDropdownProps {
  onOpenGuide: (topic: GuideTopic) => void;
}

export const HelpMenuDropdown: React.FC<HelpMenuDropdownProps> = ({ onOpenGuide }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const closeOutside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) setIsOpen(false);
    };
    const closeEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setIsOpen(false); };
    window.addEventListener('pointerdown', closeOutside);
    window.addEventListener('keydown', closeEscape);
    return () => {
      window.removeEventListener('pointerdown', closeOutside);
      window.removeEventListener('keydown', closeEscape);
    };
  }, [isOpen]);

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={(event) => {
          if (!isOpen) setAnchorRect(event.currentTarget.getBoundingClientRect());
          setIsOpen((open) => !open);
        }}
        className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${isOpen
          ? 'bg-amber-500 text-stone-950 shadow-sm'
          : 'bg-stone-100 dark:bg-[#282828] hover:bg-stone-200 dark:hover:bg-[#333333] text-stone-700 dark:text-[#e0e0e0] border border-stone-200 dark:border-[#383838]'}`}
      >
        <CircleHelp className="w-3.5 h-3.5 text-amber-500" />도움말
        <ChevronDown className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && anchorRect && createPortal(
        <div
          ref={menuRef}
          role="menu"
          aria-label="도움말 가이드"
          style={{
            position: 'fixed',
            top: `${Math.min(anchorRect.bottom + 4, Math.max(8, window.innerHeight - 440))}px`,
            left: `${Math.min(anchorRect.left, Math.max(8, window.innerWidth - 300))}px`,
            width: '288px',
            maxHeight: 'min(440px, calc(100vh - 16px))',
            overflowY: 'auto',
            zIndex: 999999,
          }}
          className="rounded-xl bg-white dark:bg-[#222222] border border-stone-200 dark:border-[#383838] shadow-2xl p-1.5 text-xs text-stone-700 dark:text-[#cccccc] animate-in fade-in zoom-in-95 duration-150"
        >
          <div className="px-2.5 py-2 mb-1 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200/70 dark:border-amber-900/60">
            <div className="flex items-center gap-2 font-bold text-stone-800 dark:text-stone-100"><BookOpen className="w-4 h-4 text-amber-600" />WON 노트 사용 가이드</div>
            <p className="mt-1 text-[11px] leading-relaxed text-stone-500 dark:text-stone-400">기능별 사용 방법과 작업 흐름을 확인하세요.</p>
          </div>
          {guideTopics.map((topic) => (
            <button
              key={topic.id}
              type="button"
              role="menuitem"
              onClick={() => { setIsOpen(false); onOpenGuide(topic.id as GuideTopic); }}
              className="w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-left font-medium hover:bg-amber-500/10 dark:hover:bg-[#303030] transition-colors"
            >
              <span aria-hidden="true" className="w-5 text-center">{topic.icon}</span>{topic.label}
            </button>
          ))}
        </div>, document.body,
      )}
    </div>
  );
};
