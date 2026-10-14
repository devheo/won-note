import React, { useState, useRef } from 'react';
import { TreeItem, ItemType } from '../../types';
import {
  Folder,
  FolderOpen,
  Table,
  FileText,
  ChevronRight,
  ChevronDown,
  Plus,
  MoreVertical,
  Trash2,
  Edit2,
  Copy,
  Search,
  GripVertical,
  Sparkles,
  Layers,
  Calendar,
  StickyNote,
} from 'lucide-react';

interface InfiniteTreeSidebarProps {
  tree: TreeItem[];
  activeTableId: string | null;
  onSelectTable: (tableId: string) => void;
  onUpdateTree: (updatedTree: TreeItem[]) => void;
  onAddTable: (parentId: string | null, title?: string) => void;
  onAddTodoBoard?: (parentId: string | null, title?: string) => void;
  onAddCalendarTable?: (parentId: string | null, title?: string) => void;
  onAddMemoBoard?: (parentId: string | null, title?: string) => void;
  onAddFolder: (parentId: string | null, title?: string) => void;
  onDeleteTreeItem: (itemId: string) => void;
  onDuplicateTable: (tableId: string) => void;
  useServer?: boolean;
  onOpenServerSettings?: () => void;
  onOpenDataPortability?: () => void;
}

export const InfiniteTreeSidebar: React.FC<InfiniteTreeSidebarProps> = ({
  tree,
  activeTableId,
  onSelectTable,
  onUpdateTree,
  onAddTable,
  onAddTodoBoard,
  onAddCalendarTable,
  onAddMemoBoard,
  onAddFolder,
  onDeleteTreeItem,
  onDuplicateTable,
  useServer,
  onOpenServerSettings,
  onOpenDataPortability,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(() => {
    // Default expand folders that contain active table
    const expanded = new Set<string>();
    tree.forEach((t) => {
      if (t.type === 'folder' && t.isExpanded !== false) {
        expanded.add(t.id);
      }
    });
    return expanded;
  });

  const [isCreateMenuOpen, setIsCreateMenuOpen] = useState(false);

  // Resizable Sidebar width state (persisted in localStorage)
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    const saved = localStorage.getItem('wonbee_sidebar_width');
    return saved ? Math.max(180, Math.min(520, parseInt(saved, 10))) : 260;
  });

  const isResizingRef = useRef(false);

  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    isResizingRef.current = true;
    const startX = e.clientX;
    const startWidth = sidebarWidth;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isResizingRef.current) return;
      const delta = moveEvent.clientX - startX;
      const newWidth = Math.max(180, Math.min(520, startWidth + delta));
      setSidebarWidth(newWidth);
      localStorage.setItem('wonbee_sidebar_width', newWidth.toString());
    };

    const handleMouseUp = () => {
      isResizingRef.current = false;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const toggleFolder = (folderId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setExpandedFolderIds((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  };

  // Inline renaming
  const handleStartRename = (item: TreeItem, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setEditingItemId(item.id);
    setEditingTitle(item.title);
    setMenuOpenId(null);
  };

  const handleFinishRename = (itemId: string) => {
    if (!editingTitle.trim()) {
      setEditingItemId(null);
      return;
    }

    const updatedTree = tree.map((item) => {
      if (item.id === itemId) {
        return {
          ...item,
          title: editingTitle.trim(),
          updatedAt: Date.now(),
        };
      }
      return item;
    });

    onUpdateTree(updatedTree);
    setEditingItemId(null);
  };

  // Drag and Drop reordering state
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [dropPosition, setDropPosition] = useState<'before' | 'after' | 'inside' | null>(null);

  const handleDragStart = (e: React.DragEvent, item: TreeItem) => {
    e.stopPropagation();
    setDraggedItemId(item.id);
    e.dataTransfer.setData('text/plain', item.id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, targetItem: TreeItem) => {
    e.preventDefault();
    e.stopPropagation();

    if (!draggedItemId || draggedItemId === targetItem.id) return;

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const offsetY = e.clientY - rect.top;
    const height = rect.height;

    if (targetItem.type === 'folder') {
      if (offsetY < height * 0.25) {
        setDropPosition('before');
      } else if (offsetY > height * 0.75) {
        setDropPosition('after');
      } else {
        setDropPosition('inside');
      }
    } else {
      if (offsetY < height * 0.5) {
        setDropPosition('before');
      } else {
        setDropPosition('after');
      }
    }

    setDropTargetId(targetItem.id);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent, targetItem: TreeItem) => {
    e.preventDefault();
    e.stopPropagation();

    if (!draggedItemId || !dropTargetId || !dropPosition) return;

    const dragged = tree.find((t) => t.id === draggedItemId);
    if (!dragged) return;

    let newParentId: string | null = targetItem.parentId;
    if (dropPosition === 'inside' && targetItem.type === 'folder') {
      newParentId = targetItem.id;
    }

    const filteredTree = tree.filter((t) => t.id !== draggedItemId);
    const targetIndex = filteredTree.findIndex((t) => t.id === targetItem.id);

    const updatedDragged: TreeItem = {
      ...dragged,
      parentId: newParentId,
      updatedAt: Date.now(),
    };

    let insertIndex = targetIndex;
    if (dropPosition === 'after') {
      insertIndex = targetIndex + 1;
    } else if (dropPosition === 'inside') {
      insertIndex = targetIndex + 1;
      const targetInFiltered = filteredTree.find((t) => t.id === targetItem.id);
      if (targetInFiltered) targetInFiltered.isExpanded = true;
    }

    filteredTree.splice(insertIndex, 0, updatedDragged);
    onUpdateTree(filteredTree);

    setDraggedItemId(null);
    setDropTargetId(null);
    setDropPosition(null);
  };

  // Helper for type-specific icon rendering
  const getItemIcon = (item: TreeItem, isSelected: boolean) => {
    if (item.type === 'folder') {
      return expandedFolderIds.has(item.id) ? (
        <FolderOpen className="w-4 h-4 text-amber-500 dark:text-amber-400 shrink-0" />
      ) : (
        <Folder className="w-4 h-4 text-amber-500/80 dark:text-amber-400/80 shrink-0" />
      );
    }

    const iconType = item.icon || '';
    const title = item.title || '';

    if (iconType === 'sticky-note' || title.includes('📌') || title.includes('메모')) {
      return <StickyNote className={`w-4 h-4 shrink-0 ${isSelected ? 'text-amber-600 dark:text-amber-400' : 'text-amber-500 dark:text-amber-400'}`} />;
    }
    if (iconType === 'kanban' || title.includes('📋') || title.includes('칸반') || title.includes('TO-DO')) {
      return <Layers className={`w-4 h-4 shrink-0 ${isSelected ? 'text-emerald-600 dark:text-emerald-400' : 'text-emerald-500 dark:text-emerald-400'}`} />;
    }
    if (iconType === 'calendar' || title.includes('📅') || title.includes('캘린더') || title.includes('일정')) {
      return <Calendar className={`w-4 h-4 shrink-0 ${isSelected ? 'text-purple-600 dark:text-purple-400' : 'text-purple-500 dark:text-purple-400'}`} />;
    }

    return <Table className={`w-4 h-4 shrink-0 ${isSelected ? 'text-blue-600 dark:text-blue-400' : 'text-blue-500/80 dark:text-blue-400/80'}`} />;
  };

  // Render Infinite Depth Recursive Tree Nodes
  const renderTreeNodes = (parentId: string | null = null, depth: number = 0) => {
    const isRoot = parentId === null || parentId === '' || parentId === undefined;
    const nodes = (tree || []).filter((item) => {
      if (isRoot) {
        return !item.parentId || item.parentId === null || item.parentId === '';
      }
      return item.parentId === parentId;
    });

    const filteredNodes = searchQuery.trim()
      ? nodes.filter((n) => n.title.toLowerCase().includes(searchQuery.toLowerCase()) || hasMatchingChild(n.id))
      : nodes;

    return filteredNodes.map((item) => {
      const isFolder = item.type === 'folder';
      const isTable = item.type === 'table';
      const isSelected = isTable && activeTableId === item.id;
      const isDragging = draggedItemId === item.id;
      const isTarget = dropTargetId === item.id;

      return (
        <div key={item.id} className="relative group/tree-item">
          {/* Drop Indicator Bar */}
          {isTarget && dropPosition === 'before' && (
            <div className="absolute top-0 left-0 right-0 h-0.5 bg-amber-500 z-20 rounded-full" />
          )}

          <div
            draggable
            onDragStart={(e) => handleDragStart(e, item)}
            onDragOver={(e) => handleDragOver(e, item)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, item)}
            onClick={(e) => {
              if (isFolder) {
                toggleFolder(item.id, e);
              } else {
                onSelectTable(item.id);
              }
            }}
            style={{ paddingLeft: `${Math.max(8, depth * 14 + 10)}px` }}
            className={`flex items-center justify-between py-1.5 pr-2 rounded-xl text-xs font-medium cursor-pointer transition-all duration-150 relative ${
              isSelected
                ? 'bg-amber-500/15 dark:bg-amber-500/20 text-amber-950 dark:text-amber-200 font-bold shadow-2xs border border-amber-500/30 dark:border-amber-500/40 before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-1 before:bg-amber-500 before:rounded-r-full'
                : 'text-stone-700 dark:text-stone-300 hover:bg-stone-200/60 dark:hover:bg-stone-800/60'
            } ${isDragging ? 'opacity-40 scale-98' : ''} ${
              isTarget && dropPosition === 'inside'
                ? 'ring-2 ring-amber-500 bg-amber-50 dark:bg-amber-950/40'
                : ''
            }`}
          >
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              <GripVertical className="w-3 h-3 opacity-0 group-hover/tree-item:opacity-40 hover:opacity-100 flex-shrink-0 cursor-grab" />

              {/* Folder Expand/Collapse Chevron Icon */}
              {isFolder ? (
                <button
                  type="button"
                  onClick={(e) => toggleFolder(item.id, e)}
                  className="p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors flex-shrink-0"
                >
                  <ChevronRight
                    className={`w-3.5 h-3.5 text-stone-400 transition-transform duration-200 ${
                      expandedFolderIds.has(item.id) ? 'rotate-90 text-amber-500' : ''
                    }`}
                  />
                </button>
              ) : (
                <div className="w-3.5" />
              )}

              {/* Item Type Icon */}
              <div className="flex-shrink-0 flex items-center justify-center">
                {getItemIcon(item, isSelected)}
              </div>

              {/* Item Title / Inline Rename Input */}
              {editingItemId === item.id ? (
                <input
                  type="text"
                  value={editingTitle}
                  onChange={(e) => setEditingTitle(e.target.value)}
                  onBlur={() => handleFinishRename(item.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleFinishRename(item.id);
                    if (e.key === 'Escape') setEditingItemId(null);
                  }}
                  autoFocus
                  onClick={(e) => e.stopPropagation()}
                  className="bg-white dark:bg-stone-900 px-1.5 py-0.5 rounded border border-amber-500 outline-none text-xs w-full text-stone-900 dark:text-stone-100 font-bold"
                />
              ) : (
                <span className="truncate flex-1 select-none" title={item.title}>
                  {item.title}
                </span>
              )}
            </div>

            {/* Quick Hover Action Menu */}
            <div className="flex items-center gap-0.5 opacity-0 group-hover/tree-item:opacity-100 transition-opacity">
              {isFolder && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAddTable(item.id);
                  }}
                  title="하위 테이블 추가"
                  className="p-1 rounded hover:bg-amber-200/50 dark:hover:bg-stone-700 text-stone-500 hover:text-amber-700 dark:hover:text-amber-400"
                >
                  <Plus className="w-3 h-3" />
                </button>
              )}

              <div className="relative">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpenId(menuOpenId === item.id ? null : item.id);
                  }}
                  className="p-1 rounded hover:bg-stone-300/50 dark:hover:bg-stone-700 text-stone-500"
                >
                  <MoreVertical className="w-3 h-3" />
                </button>

                {/* Dropdown Context Menu */}
                {menuOpenId === item.id && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="absolute right-0 top-6 z-50 w-44 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl shadow-xl py-1 text-xs animate-in fade-in"
                  >
                    {isFolder && (
                      <>
                        <button
                          onClick={() => {
                            onAddTable(item.id);
                            setMenuOpenId(null);
                          }}
                          className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-300 font-medium"
                        >
                          <Table className="w-3.5 h-3.5 text-blue-500" />
                          새 데이터 테이블
                        </button>
                        {onAddTodoBoard && (
                          <button
                            onClick={() => {
                              onAddTodoBoard(item.id);
                              setMenuOpenId(null);
                            }}
                            className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-300 font-medium"
                          >
                            <Layers className="w-3.5 h-3.5 text-emerald-500" />
                            새 TO-DO 칸반보드
                          </button>
                        )}
                        {onAddCalendarTable && (
                          <button
                            onClick={() => {
                              onAddCalendarTable(item.id);
                              setMenuOpenId(null);
                            }}
                            className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-300 font-medium"
                          >
                            <Calendar className="w-3.5 h-3.5 text-purple-500" />
                            새 일정 캘린더
                          </button>
                        )}
                        {onAddMemoBoard && (
                          <button
                            onClick={() => {
                              onAddMemoBoard(item.id);
                              setMenuOpenId(null);
                            }}
                            className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-300 font-medium"
                          >
                            <StickyNote className="w-3.5 h-3.5 text-amber-500" />
                            새 스티커 메모보드
                          </button>
                        )}
                        <button
                          onClick={() => {
                            onAddFolder(item.id);
                            setMenuOpenId(null);
                          }}
                          className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-300 font-medium"
                        >
                          <Folder className="w-3.5 h-3.5 text-stone-400" />
                          하위 폴더 추가
                        </button>
                        <div className="my-1 border-t border-stone-100 dark:border-stone-800" />
                      </>
                    )}

                    {isTable && (
                      <button
                        onClick={() => {
                          onDuplicateTable(item.id);
                          setMenuOpenId(null);
                        }}
                        className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-300 font-medium"
                      >
                        <Copy className="w-3.5 h-3.5 text-blue-500" />
                        테이블 복제
                      </button>
                    )}

                    <button
                      onClick={(e) => handleStartRename(item, e)}
                      className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-300 font-medium"
                    >
                      <Edit2 className="w-3.5 h-3.5 text-stone-500" />
                      이름 변경
                    </button>

                    <button
                      onClick={() => {
                        onDeleteTreeItem(item.id);
                        setMenuOpenId(null);
                      }}
                      className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600 dark:text-rose-400 font-medium"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      삭제
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* After Drop Indicator */}
          {isTarget && dropPosition === 'after' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-500 z-20 rounded-full" />
          )}

          {/* Recursive Render Child Nodes if Folder is Expanded */}
          {isFolder && expandedFolderIds.has(item.id) && renderTreeNodes(item.id, depth + 1)}
        </div>
      );
    });
  };

  const hasMatchingChild = (folderId: string): boolean => {
    const children = tree.filter((t) => t.parentId === folderId);
    for (const c of children) {
      if (c.title.toLowerCase().includes(searchQuery.toLowerCase())) return true;
      if (c.type === 'folder' && hasMatchingChild(c.id)) return true;
    }
    return false;
  };

  const totalTablesCount = tree.filter((t) => t.type === 'table').length;

  return (
    <aside
      id="wonbee-infinite-sidebar"
      style={{ width: `${sidebarWidth}px` }}
      className="relative flex-shrink-0 h-screen flex flex-col border-r border-stone-200/80 dark:border-[#333333] bg-stone-50/90 dark:bg-[#1c1c1c] backdrop-blur-md select-none transition-colors"
    >
      {/* Sidebar Resizing Drag Handle */}
      <div
        onMouseDown={handleResizeMouseDown}
        className="absolute top-0 right-0 bottom-0 w-1.5 cursor-col-resize hover:bg-amber-500 active:bg-amber-600 transition-colors z-30 group"
        title="사이드바 크기 조절 (드래그)"
      >
        <div className="w-full h-full opacity-0 group-hover:opacity-100 bg-amber-500" />
      </div>

      {/* Brand Header: WonBee */}
      <div className="p-4 border-b border-stone-200/80 dark:border-[#333333] flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-amber-400 flex items-center justify-center shadow-sm text-stone-950 font-bold text-lg">
            🐝
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="text-sm font-bold text-stone-900 dark:text-[#f5f5f5] tracking-tight">
                WonBee
              </h1>
              <span className="text-[10px] px-1.5 py-0.2 font-semibold rounded-md bg-amber-200/80 dark:bg-amber-950 text-amber-900 dark:text-amber-300">
                원비
              </span>
            </div>
            <p className="text-[11px] text-stone-500 dark:text-[#888888]">
              미니멀 데이터 워크스페이스
            </p>
          </div>
        </div>
      </div>

      {/* Quick Search Bar */}
      <div className="p-3 pb-2">
        <div className="relative flex items-center">
          <Search className="w-3.5 h-3.5 absolute left-2.5 text-stone-400 dark:text-[#777777]" />
          <input
            type="text"
            placeholder="테이블 또는 폴더 검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 bg-white/80 dark:bg-[#222222] border border-stone-200/80 dark:border-[#383838] rounded-lg text-xs placeholder:text-stone-400 dark:placeholder:text-[#777777] text-stone-800 dark:text-[#f0f0f0] outline-none focus:border-amber-500 transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 text-stone-400 hover:text-stone-600 dark:hover:text-[#ffffff] text-xs"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Unified Quick Creation Bar */}
      <div className="px-3 py-1.5">
        <div className="relative">
          <div className="flex items-center gap-1.5">
            <button
              id="btn-add-root-table"
              onClick={() => onAddTable(null)}
              className="flex-1 py-1.5 px-3 bg-amber-400 hover:bg-amber-500 text-stone-950 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 shadow-2xs transition-all active:scale-98 cursor-pointer"
              title="새 데이터 테이블 만들기"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>새 테이블</span>
            </button>

            <button
              type="button"
              onClick={() => setIsCreateMenuOpen(!isCreateMenuOpen)}
              className="p-1.5 bg-white dark:bg-[#252525] hover:bg-stone-100 dark:hover:bg-[#333333] text-stone-700 dark:text-[#e0e0e0] border border-stone-200 dark:border-[#383838] rounded-xl flex items-center justify-center transition-colors shadow-2xs cursor-pointer"
              title="다양한 유형의 보드/폴더 생성 메뉴 열기"
            >
              <MoreVertical className="w-4 h-4" />
            </button>
          </div>

          {/* Quick Add Popover Dropdown */}
          {isCreateMenuOpen && (
            <div
              className="absolute left-0 right-0 top-9 z-50 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl shadow-2xl p-1 text-xs animate-in fade-in zoom-in-95"
              onClick={() => setIsCreateMenuOpen(false)}
            >
              <button
                type="button"
                onClick={() => onAddTable(null)}
                className="w-full px-3 py-2 rounded-xl text-left flex items-center gap-2 hover:bg-amber-50 dark:hover:bg-amber-950/40 text-stone-800 dark:text-stone-200 font-semibold"
              >
                <Table className="w-4 h-4 text-blue-500" />
                <span>📋 새 데이터 테이블</span>
              </button>

              {onAddTodoBoard && (
                <button
                  type="button"
                  onClick={() => onAddTodoBoard(null)}
                  className="w-full px-3 py-2 rounded-xl text-left flex items-center gap-2 hover:bg-amber-50 dark:hover:bg-amber-950/40 text-stone-800 dark:text-stone-200 font-semibold"
                >
                  <Layers className="w-4 h-4 text-emerald-500" />
                  <span>🎯 새 TO-DO 칸반보드</span>
                </button>
              )}

              {onAddCalendarTable && (
                <button
                  type="button"
                  onClick={() => onAddCalendarTable(null)}
                  className="w-full px-3 py-2 rounded-xl text-left flex items-center gap-2 hover:bg-amber-50 dark:hover:bg-amber-950/40 text-stone-800 dark:text-stone-200 font-semibold"
                >
                  <Calendar className="w-4 h-4 text-purple-500" />
                  <span>📅 새 일정 캘린더</span>
                </button>
              )}

              {onAddMemoBoard && (
                <button
                  type="button"
                  onClick={() => onAddMemoBoard(null)}
                  className="w-full px-3 py-2 rounded-xl text-left flex items-center gap-2 hover:bg-amber-50 dark:hover:bg-amber-950/40 text-stone-800 dark:text-stone-200 font-semibold"
                >
                  <StickyNote className="w-4 h-4 text-amber-500" />
                  <span>📌 새 스티커 메모보드</span>
                </button>
              )}

              <div className="my-1 border-t border-stone-100 dark:border-stone-800" />

              <button
                type="button"
                onClick={() => onAddFolder(null)}
                className="w-full px-3 py-2 rounded-xl text-left flex items-center gap-2 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-300 font-medium"
              >
                <Folder className="w-4 h-4 text-stone-400" />
                <span>📁 새 폴더</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Infinite Depth Tree Container */}
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5 custom-scrollbar">
        <div className="flex items-center justify-between px-2 py-1 text-[11px] font-bold tracking-wider text-stone-400 dark:text-[#888888] uppercase">
          <span>WORKSPACES</span>
          <span className="font-mono text-[10px] text-amber-600 dark:text-amber-400 font-bold px-1.5 py-0.2 rounded bg-amber-500/10">
            {totalTablesCount}
          </span>
        </div>

        {renderTreeNodes(null, 0)}

        {tree.length === 0 && (
          <div className="text-center py-8 text-stone-400 dark:text-[#888888] text-xs">
            테이블이 없습니다.<br />새 테이블을 만들어 시작하세요! 🐝
          </div>
        )}
      </div>
    </aside>
  );
};
