import React, { useState, useRef, useEffect } from 'react';
import { WonNoteDocument } from '../../types';
import { X, Plus, Copy, Edit2, FileText, Check, Trash2 } from 'lucide-react';

interface WonNoteTabBarProps {
  openTabIds: string[];
  documents: Record<string, WonNoteDocument>;
  activeDocId: string | null;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onReorderTabs: (newOrder: string[]) => void;
  onRenameTab: (id: string, newTitle: string) => void;
  onDuplicateTab: (id: string) => void;
  onDeleteNote: (id: string) => void;
  onAddTab: () => void;
}

const TAB_ACCENT_COLORS = [
  'bg-amber-500',
  'bg-blue-500',
  'bg-emerald-500',
  'bg-purple-500',
  'bg-rose-500',
  'bg-sky-500',
  'bg-indigo-500',
];

export const WonNoteTabBar: React.FC<WonNoteTabBarProps> = ({
  openTabIds,
  documents,
  activeDocId,
  onSelectTab,
  onCloseTab,
  onReorderTabs,
  onRenameTab,
  onDuplicateTab,
  onDeleteNote,
  onAddTab,
}) => {
  const [draggedTabId, setDraggedTabId] = useState<string | null>(null);
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editTitleInput, setEditTitleInput] = useState<string>('');
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; tabId: string } | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Close context menu on global click
  useEffect(() => {
    const handleGlobalClick = () => {
      if (contextMenu) setContextMenu(null);
    };
    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, [contextMenu]);

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedTabId(id);
    e.dataTransfer.setData('text/plain', id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!draggedTabId || draggedTabId === targetId) return;

    const oldIndex = openTabIds.indexOf(draggedTabId);
    const newIndex = openTabIds.indexOf(targetId);
    if (oldIndex === -1 || newIndex === -1) return;

    const next = [...openTabIds];
    next.splice(oldIndex, 1);
    next.splice(newIndex, 0, draggedTabId);
    onReorderTabs(next);
  };

  const handleDragEnd = () => {
    setDraggedTabId(null);
  };

  const startEditing = (id: string, currentTitle: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setEditingTabId(id);
    setEditTitleInput(currentTitle);
    setContextMenu(null);
  };

  const saveEditing = (id: string) => {
    if (editTitleInput.trim()) {
      onRenameTab(id, editTitleInput.trim());
    }
    setEditingTabId(null);
  };

  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-stone-100 dark:bg-[#1f1f1f] border-b border-stone-200 dark:border-stone-800 overflow-x-auto custom-scrollbar shrink-0 select-none relative">
      {openTabIds.map((id, index) => {
        const doc = documents[id];
        if (!doc) return null;
        const isActive = activeDocId === id;
        const isEditing = editingTabId === id;
        const accentColor = TAB_ACCENT_COLORS[index % TAB_ACCENT_COLORS.length];

        return (
          <div
            key={id}
            draggable={!isEditing}
            onDragStart={(e) => handleDragStart(e, id)}
            onDragOver={(e) => handleDragOver(e, id)}
            onDragEnd={handleDragEnd}
            onClick={() => {
              if (!isEditing && !isActive) onSelectTab(id);
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setContextMenu({ x: e.clientX, y: e.clientY, tabId: id });
            }}
            className={`group/tab relative flex items-center gap-2 px-3.5 py-2 rounded-t-xl border-t-2 text-xs font-medium cursor-pointer transition-all duration-150 ${
              isActive
                ? 'bg-white dark:bg-[#252525] border-stone-200 dark:border-stone-700 text-stone-900 dark:text-stone-100 shadow-sm font-bold'
                : 'bg-stone-200/60 dark:bg-[#2a2a2a]/60 border-transparent text-stone-600 dark:text-stone-400 hover:bg-stone-200 dark:hover:bg-[#282828] hover:text-stone-800'
            }`}
            style={{
              borderTopColor: isActive ? undefined : 'transparent',
            }}
            title="클릭하여 열기 · 우클릭하여 이름 변경 / 복사 / 삭제 / 닫기"
          >
            {/* OneNote Color Accent Line */}
            <div className={`absolute top-0 left-0 right-0 h-[3px] ${accentColor} rounded-t-xl`} />

            <FileText className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-amber-500' : 'text-stone-400'}`} />

            {isEditing ? (
              <input
                ref={inputRef}
                type="text"
                value={editTitleInput}
                onChange={(e) => setEditTitleInput(e.target.value)}
                onBlur={() => saveEditing(id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveEditing(id);
                  if (e.key === 'Escape') setEditingTabId(null);
                }}
                className="bg-white dark:bg-stone-900 px-1.5 py-0.5 rounded border border-amber-500 text-xs font-bold outline-none w-28"
                autoFocus
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span
                onDoubleClick={(e) => startEditing(id, doc.title, e)}
                className="max-w-[140px] truncate"
                title="더블클릭 또는 우클릭하여 이름 변경"
              >
                {doc.title || '새 노트'}
              </span>
            )}

            {/* Hover Actions */}
            <div className="flex items-center gap-0.5 shrink-0">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onCloseTab(id);
                }}
                className="ml-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-stone-300 bg-white text-stone-700 shadow-sm hover:border-rose-400 hover:bg-rose-50 hover:text-rose-600 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200 dark:hover:border-rose-500 dark:hover:bg-rose-950/50 dark:hover:text-rose-300"
                title="탭 닫기"
                aria-label={`${doc.title || '새 노트'} 탭 닫기`}
              >
                <X className="h-3 w-3" strokeWidth={2.5} />
              </button>
            </div>
          </div>
        );
      })}

      {/* Add New Tab Button */}
      <button
        type="button"
        onClick={onAddTab}
        className="p-2 rounded-xl text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100 hover:bg-stone-200/80 dark:hover:bg-stone-800 transition-colors cursor-pointer shrink-0"
        title="새 노트 탭 추가"
      >
        <Plus className="w-4 h-4" />
      </button>

      {/* Right-Click Context Menu Popup */}
      {contextMenu && (
        <div
          style={{ top: contextMenu.y, left: contextMenu.x }}
          className="fixed z-[999999] w-44 bg-white dark:bg-stone-900 rounded-xl shadow-2xl border border-stone-200 dark:border-stone-700 py-1 text-xs font-medium text-stone-700 dark:text-stone-200 animate-in fade-in zoom-in-95 duration-100"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => {
              const tab = documents[contextMenu.tabId];
              if (tab) startEditing(contextMenu.tabId, tab.title);
            }}
            className="w-full px-3 py-2 text-left hover:bg-stone-100 dark:hover:bg-stone-800 flex items-center gap-2 cursor-pointer transition-colors"
          >
            <Edit2 className="w-3.5 h-3.5 text-amber-500" />
            <span>이름 바꾸기</span>
          </button>
          <button
            type="button"
            onClick={() => {
              onDuplicateTab(contextMenu.tabId);
              setContextMenu(null);
            }}
            className="w-full px-3 py-2 text-left hover:bg-stone-100 dark:hover:bg-stone-800 flex items-center gap-2 cursor-pointer transition-colors"
          >
            <Copy className="w-3.5 h-3.5 text-sky-500" />
            <span>노트 복사 (Duplicate)</span>
          </button>
          <div className="my-1 border-t border-stone-100 dark:border-stone-800" />
          <button
            type="button"
            onClick={() => {
              onDeleteNote(contextMenu.tabId);
              setContextMenu(null);
            }}
            className="w-full px-3 py-2 text-left hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600 dark:text-rose-400 flex items-center gap-2 cursor-pointer transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>노트 삭제</span>
          </button>
          <button
            type="button"
            onClick={() => {
              onCloseTab(contextMenu.tabId);
              setContextMenu(null);
            }}
            className="w-full px-3 py-2 text-left hover:bg-stone-100 dark:hover:bg-stone-800 flex items-center gap-2 cursor-pointer transition-colors text-stone-500"
          >
            <X className="w-3.5 h-3.5" />
            <span>탭만 닫기</span>
          </button>
        </div>
      )}
    </div>
  );
};
