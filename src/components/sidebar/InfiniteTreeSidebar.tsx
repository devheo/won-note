import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { TreeItem, ItemType, WonNoteDocument, TableDocument } from '../../types';
import { useItemExchange, type ReceivedItem } from '../../hooks/useItemExchange';
import type { materializeFolder } from '../../utils/itemExchange';
import { useNoteTransfer } from '../../hooks/useNoteTransfer';
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
  Shield,
  Users,
  MessageCircle,
} from 'lucide-react';
import { fetchBridge } from '../../services/httpBridge';
import { GroupAccessModal } from './GroupAccessModal';
import { useChatNotifications } from '../../hooks/useChatNotifications';
import { isElectron, isTauri } from '../../utils/platformBridge';

interface InfiniteTreeSidebarProps {
  tree: TreeItem[];
  documents?: Record<string, WonNoteDocument>;
  tables?: Record<string, TableDocument>;
  onImportSharedItem?: (item: ReceivedItem) => Promise<void | { discardLocalAssets: boolean }>;
  onImportSharedFolder?: (folder: ReturnType<typeof materializeFolder>) => Promise<void | { discardLocalAssets: boolean }>;
  onUpdateDocument?: (document: WonNoteDocument) => void;
  activeTableId: string | null;
  activeDocId?: string | null;
  selectedFolderId?: string | null;
  onSelectFolder?: (folderId: string | null) => void;
  onSelectTable: (tableId: string) => void;
  onUpdateTree: (updatedTree: TreeItem[]) => void;
  onAddTable: (parentId: string | null, title?: string) => void;
  onAddNote?: (parentId: string | null, title?: string) => string | void | Promise<string | void>;
  onAddParentNote?: () => void;
  onCreateNoteFromTable?: (tableId: string) => void;
  onAddTodoBoard?: (parentId: string | null, title?: string) => void;
  onAddCalendarTable?: (parentId: string | null, title?: string) => void;
  onAddMemoBoard?: (parentId: string | null, title?: string) => void;
  onAddFolder: (parentId: string | null, title?: string) => void;
  onDeleteTreeItem: (itemId: string) => void;
  onDuplicateTable: (tableId: string) => void;
  onUpdateTable?: (table: TableDocument) => void;
  useServer?: boolean;
  onOpenDataPortability?: () => void;
}

export const InfiniteTreeSidebar: React.FC<InfiniteTreeSidebarProps> = ({
  tree,
  documents = {},
  tables = {},
  onImportSharedItem,
  onImportSharedFolder,
  onUpdateDocument,
  activeTableId,
  activeDocId = null,
  selectedFolderId = null,
  onSelectFolder,
  onSelectTable,
  onUpdateTree,
  onAddTable,
  onAddNote,
  onAddParentNote,
  onCreateNoteFromTable,
  onAddTodoBoard,
  onAddCalendarTable,
  onAddMemoBoard,
  onAddFolder,
  onDeleteTreeItem,
  onDuplicateTable,
  onUpdateTable,
  useServer,
  onOpenDataPortability,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const { chooseImport, exportNote, transferUi } = useNoteTransfer(documents, onUpdateDocument);
  const exchange = useItemExchange(tree, documents, tables, onImportSharedItem, onImportSharedFolder);
  const [moveMenuOpenId, setMoveMenuOpenId] = useState<string | null>(null);
  const [contextMenuPosition, setContextMenuPosition] = useState<{ right: number; top?: number; bottom?: number } | null>(null);
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [groupModalTableId, setGroupModalTableId] = useState<string | null>(null);
  useChatNotifications(useServer ? sessionUserId : '__local__');
  useEffect(() => {
    let active = true;
    setSessionUserId(null);
    if (useServer) fetchBridge('/api/auth/me').then(response => response.ok ? response.json() : null)
      .then(result => { if (active) setSessionUserId(result?.user?.id || null); }).catch(() => {});
    return () => { active = false; };
  }, [useServer]);
  useEffect(() => {
    const close = (event: PointerEvent) => { if (!(event.target as Element)?.closest('[data-note-context]')) setMenuOpenId(null); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setMenuOpenId(null); };
    if (menuOpenId) { window.addEventListener('pointerdown', close); window.addEventListener('keydown', escape); }
    return () => { window.removeEventListener('pointerdown', close); window.removeEventListener('keydown', escape); };
  }, [menuOpenId]);
  useEffect(() => {
    const handleFileTransfer = (event: Event) => {
      const action = (event as CustomEvent<string>).detail;
      if (action === 'exchange-import') exchange.chooseImport();
      else if (action.startsWith('import:')) {
        const format = action.slice(7) as 'ppt' | 'pptx' | 'pdf' | 'md' | 'excel' | 'docx';
        void (async () => {
          if (!onAddNote) return;
          const noteId = await onAddNote(selectedFolderId, '가져온 문서');
          if (noteId) chooseImport(noteId, format, true);
        })();
      }
      else if (activeDocId && action === 'export:wonnote') void exchange.exportItem(activeDocId);
      else if (selectedFolderId && action === 'export:folder') void exchange.exportItem(selectedFolderId);
      else if (activeDocId && (action === 'export:pdf' || action === 'export:pptx' || action === 'export:docx')) void exportNote(activeDocId, action.slice(7) as 'pdf' | 'pptx' | 'docx');
    };
    window.addEventListener('wonbee:file-transfer', handleFileTransfer);
    return () => window.removeEventListener('wonbee:file-transfer', handleFileTransfer);
  }, [activeDocId, selectedFolderId, chooseImport, exportNote, exchange, onAddNote]);
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

  const knownFolderIdsRef = useRef(new Set(tree.filter((item) => item.type === 'folder').map((item) => item.id)));
  useEffect(() => {
    const newlyExpandedFolders = tree
      .filter((item) => item.type === 'folder' && item.isExpanded && !knownFolderIdsRef.current.has(item.id))
      .map((item) => item.id);
    tree.forEach((item) => { if (item.type === 'folder') knownFolderIdsRef.current.add(item.id); });
    if (newlyExpandedFolders.length) {
      setExpandedFolderIds((previous) => new Set([...previous, ...newlyExpandedFolders]));
    }
  }, [tree]);

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

  const handleMoveItem = (itemId: string, parentId: string | null) => {
    const item = tree.find((entry) => entry.id === itemId);
    if (!item || item.parentId === parentId) {
      setMoveMenuOpenId(null);
      setMenuOpenId(null);
      return;
    }
    // Prevent moving a folder into itself or one of its descendants.
    let ancestor = parentId ? tree.find((entry) => entry.id === parentId) : undefined;
    while (ancestor) {
      if (ancestor.id === itemId) return;
      const ancestorParentId = ancestor.parentId;
      ancestor = ancestorParentId ? tree.find((entry) => entry.id === ancestorParentId) : undefined;
    }
    onUpdateTree(tree.map((entry) => entry.id === itemId ? { ...entry, parentId, updatedAt: Date.now() } : entry));
    setMoveMenuOpenId(null);
    setMenuOpenId(null);
  };

  const canMoveInto = (itemId: string, folderId: string) => {
    let parent = tree.find((entry) => entry.id === folderId);
    while (parent) {
      if (parent.id === itemId) return false;
      const parentId = parent.parentId;
      parent = parentId ? tree.find((entry) => entry.id === parentId) : undefined;
    }
    return true;
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

  const handleDragEnd = () => {
    setDraggedItemId(null);
    setDropTargetId(null);
    setDropPosition(null);
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
    if (item.type === 'document') {
      return <FileText className={`w-4 h-4 shrink-0 ${isSelected ? 'text-amber-600 dark:text-amber-400' : 'text-amber-500 dark:text-amber-400'}`} />;
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
      const isSelected = isFolder
        ? selectedFolderId === item.id
        : isTable
        ? activeTableId === item.id
        : item.type === 'document' && (activeTableId === item.id || activeDocId === item.id);
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
            data-tree-item-id={item.id}
            onContextMenu={(event) => {
              event.preventDefault(); event.stopPropagation();
              setMoveMenuOpenId(null); setMenuOpenId(item.id);
              setContextMenuPosition({ right: Math.max(8, window.innerWidth - Math.max(216, event.clientX + 208)), top: Math.max(8, Math.min(event.clientY, window.innerHeight - 420)) });
            }}
            onDragStart={(e) => handleDragStart(e, item)}
            onDragOver={(e) => handleDragOver(e, item)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, item)}
            onDragEnd={handleDragEnd}
            onClick={(e) => {
              if (isFolder) {
                onSelectFolder?.(item.id);
                toggleFolder(item.id, e);
              } else {
                onSelectFolder?.(null);
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
              {item.type === 'table' && tables[item.id]?.visibility === 'private' && <span title="나와 관리자만 볼 수 있는 보드"><Shield className="h-3 w-3 shrink-0 text-amber-600" aria-label="개인 보드" /></span>}
              {item.type === 'table' && tables[item.id]?.visibility === 'group' && <span title="지정된 그룹만 볼 수 있는 보드"><Users className="h-3 w-3 shrink-0 text-indigo-600" aria-label="그룹 전용 보드" /></span>}
            </div>

            {/* Quick Hover Action Menu */}
            <div className="flex items-center gap-0.5">
              {isFolder && (
                <button
                  type="button"
                  title="하위 테이블 추가"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAddTable(item.id);
                  }}
                  className="p-1 rounded hover:bg-amber-200/50 dark:hover:bg-stone-700 text-stone-500 hover:text-amber-700 dark:hover:text-amber-400"
                >
                  <Plus className="w-3 h-3" />
                </button>
              )}

              <div className="relative">
                <button
                  type="button"
                  data-note-context
                  aria-label={`${item.title} 메뉴`}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (menuOpenId === item.id) {
                      setMenuOpenId(null);
                      setContextMenuPosition(null);
                      setMoveMenuOpenId(null);
                      return;
                    }
                    const rect = e.currentTarget.getBoundingClientRect();
                    const openAbove = window.innerHeight - rect.bottom < 420;
                    setContextMenuPosition({
                      right: Math.max(8, window.innerWidth - rect.right),
                      ...(openAbove
                        ? { bottom: Math.max(8, window.innerHeight - rect.top + 4) }
                        : { top: rect.bottom + 4 }),
                    });
                    setMoveMenuOpenId(null);
                    setMenuOpenId(item.id);
                  }}
                  className="p-1 rounded hover:bg-stone-300/50 dark:hover:bg-stone-700 text-stone-500"
                >
                  <MoreVertical className="w-3 h-3" />
                </button>

                {/* Dropdown Context Menu */}
                {menuOpenId === item.id && contextMenuPosition && createPortal(
                  <div
                    data-note-context
                    role="menu"
                    aria-label={`${item.title} 컨텍스트 메뉴`}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      position: 'fixed',
                      zIndex: 10000,
                      right: contextMenuPosition.right,
                      top: contextMenuPosition.top,
                      bottom: contextMenuPosition.bottom,
                      maxHeight: 'calc(100vh - 16px)',
                      overflowY: 'auto',
                    }}
                    className="w-52 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl shadow-xl py-1 text-xs animate-in fade-in"
                  >
                    {isFolder && (
                      <>
                        <button type="button" role="menuitem" disabled={exchange.busy} onClick={() => { setMenuOpenId(null); exchange.chooseImport(item.id); }} className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-amber-50 dark:hover:bg-amber-950/40 text-stone-700 dark:text-stone-300 font-medium">교환 파일을 이 폴더에 가져오기</button>
                        <button type="button" role="menuitem" disabled={exchange.busy} onClick={() => { setMenuOpenId(null); void exchange.exportItem(item.id); }} className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-amber-50 dark:hover:bg-amber-950/40 text-stone-700 dark:text-stone-300 font-medium">폴더 교환 파일 내보내기</button>
                        <div className="my-1 border-t border-stone-100 dark:border-stone-800" />
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
                        {onAddNote && (
                          <button onClick={() => { onAddNote(item.id); setExpandedFolderIds((previous) => new Set(previous).add(item.id)); setMenuOpenId(null); }} className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-amber-50 dark:hover:bg-amber-950/40 text-stone-700 dark:text-stone-300 font-medium">
                            <FileText className="w-3.5 h-3.5 text-amber-500" />
                            새 노트 페이지
                          </button>
                        )}
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
                      <>
                        {useServer && sessionUserId && tables[item.id] && <button onClick={() => { setGroupModalTableId(item.id); setGroupModalOpen(true); setMenuOpenId(null); }} className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 text-stone-700 dark:text-stone-300 font-medium"><Shield className="w-3.5 h-3.5 text-indigo-600" />공유 및 그룹 권한</button>}
                        {onCreateNoteFromTable && <button onClick={() => { onCreateNoteFromTable(item.id); setMenuOpenId(null); }} className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-amber-50 dark:hover:bg-amber-950/40 text-stone-700 dark:text-stone-300 font-medium"><FileText className="w-3.5 h-3.5 text-amber-500" />표 데이터를 노트로 복사</button>}
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
                      </>
                    )}

                    <button
                      onClick={() => setMoveMenuOpenId(moveMenuOpenId === item.id ? null : item.id)}
                      className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-300 font-medium"
                    >
                      <GripVertical className="w-3.5 h-3.5 text-stone-500" />
                      이동 위치 선택
                    </button>
                    {moveMenuOpenId === item.id && (
                      <div className="max-h-40 overflow-y-auto border-y border-stone-100 bg-stone-50 py-1 dark:border-stone-800 dark:bg-stone-950/60">
                        <button onClick={() => handleMoveItem(item.id, null)} className="w-full px-6 py-1.5 text-left hover:bg-amber-50 dark:hover:bg-amber-950/40">최상위</button>
                        {tree.filter((candidate) => candidate.type === 'folder' && canMoveInto(item.id, candidate.id)).map((folder) => (
                          <button key={folder.id} onClick={() => handleMoveItem(item.id, folder.id)} className="w-full truncate px-6 py-1.5 text-left hover:bg-amber-50 dark:hover:bg-amber-950/40">📁 {folder.title}</button>
                        ))}
                      </div>
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
                  </div>,
                  document.body
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

  // The sidebar badge represents all visible workspace entries, including folders and WonNote documents.
  const totalWorkspaceItemsCount = tree.length;

  return (
    <aside
      id="wonbee-infinite-sidebar"
      style={{ width: `${sidebarWidth}px` }}
      className="relative flex-shrink-0 h-full min-h-0 flex flex-col border-r border-stone-200/80 dark:border-[#333333] bg-stone-50/90 dark:bg-[#1c1c1c] backdrop-blur-md select-none transition-colors"
    >
      {/* Sidebar Resizing Drag Handle */}
      <div
        onMouseDown={handleResizeMouseDown}
        className="absolute top-0 right-0 bottom-0 w-1.5 cursor-col-resize hover:bg-amber-500 active:bg-amber-600 transition-colors z-30 group"
        title="사이드바 크기 조절 (드래그)"
      >
        <div className="w-full h-full opacity-0 group-hover:opacity-100 bg-amber-500" />
      </div>

      {/* Brand Header: WON 노트 */}
      <div className="p-4 border-b border-stone-200/80 dark:border-[#333333] flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-amber-400 flex items-center justify-center shadow-sm text-stone-950 font-bold text-lg">
            🐝
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="text-sm font-bold text-stone-900 dark:text-[#f5f5f5] tracking-tight">
                WON 노트
              </h1>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {useServer && sessionUserId && <button type="button" onClick={() => { setGroupModalTableId(null); setGroupModalOpen(true); }} title="그룹 및 팀 권한" aria-label="그룹 및 팀 권한" className="rounded-lg p-2 text-stone-500 hover:bg-stone-100 hover:text-indigo-600 dark:hover:bg-stone-800"><Users size={17}/></button>}
          {(!useServer || sessionUserId) && <button type="button" onClick={() => { const chatUrl = new URL(window.location.href); chatUrl.search = ''; chatUrl.searchParams.set('chatWindow', '1'); chatUrl.searchParams.set('chatMode', useServer ? 'server' : 'client'); const webTab = !isElectron() && !isTauri() && (window.location.protocol === 'http:' || window.location.protocol === 'https:'); if (webTab) window.open(chatUrl.href, '_blank'); else window.open(chatUrl.href, 'wonbee-chat', 'popup,width=1120,height=780,resizable=yes,scrollbars=yes'); }} title="채팅 탭 열기" aria-label="채팅 탭 열기" className="rounded-lg p-2 text-stone-500 hover:bg-stone-100 hover:text-indigo-600 dark:hover:bg-stone-800"><MessageCircle size={17}/></button>}
        </div>
      </div>

      {useServer && sessionUserId && <GroupAccessModal isOpen={groupModalOpen} onClose={() => setGroupModalOpen(false)} currentUserId={sessionUserId} table={groupModalTableId ? tables[groupModalTableId] || null : null} onUpdateTable={onUpdateTable} />}

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
          <div>
            <button
              id="btn-add-root-table"
              type="button"
              aria-haspopup="menu"
              aria-expanded={isCreateMenuOpen}
              onClick={() => setIsCreateMenuOpen(!isCreateMenuOpen)}
              className="w-full py-2 px-3 bg-amber-400 hover:bg-amber-500 text-stone-950 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 shadow-2xs transition-all active:scale-98 cursor-pointer"
              title="새 항목 만들기"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>새로 만들기</span>
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isCreateMenuOpen ? 'rotate-180' : ''}`} />
            </button>
          </div>

          {/* Quick Add Popover Dropdown */}
          {isCreateMenuOpen && (
            <div
              role="menu"
              aria-label="새로 만들기 항목"
              className="absolute left-0 right-0 top-10 z-50 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl shadow-2xl p-1 text-xs animate-in fade-in zoom-in-95"
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

              {onAddParentNote && <button type="button" onClick={() => onAddParentNote()} className="w-full px-3 py-2 rounded-xl text-left flex items-center gap-2 hover:bg-amber-50 dark:hover:bg-amber-950/40 text-stone-800 dark:text-stone-200 font-semibold"><FileText className="w-4 h-4 text-amber-500" /><span>📝 새 노트 섹션</span></button>}

              {onAddNote && <button type="button" onClick={() => onAddNote(null)} className="w-full px-3 py-2 rounded-xl text-left flex items-center gap-2 hover:bg-amber-50 dark:hover:bg-amber-950/40 text-stone-800 dark:text-stone-200 font-semibold"><FileText className="w-4 h-4 text-amber-600" /><span>📄 새 노트 페이지</span></button>}

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
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2 space-y-0.5 custom-scrollbar">
        <div className="flex items-center justify-between px-2 py-1 text-[11px] font-bold tracking-wider text-stone-400 dark:text-[#888888] uppercase">
          <span>WORKSPACES</span>
          <span className="font-mono text-[10px] text-amber-600 dark:text-amber-400 font-bold px-1.5 py-0.2 rounded bg-amber-500/10">
            {totalWorkspaceItemsCount}
          </span>
        </div>

        {renderTreeNodes(null, 0)}
        {tree.length === 0 && (
          <div className="text-center py-8 text-stone-400 dark:text-[#888888] text-xs">
            항목이 없습니다.<br />새 테이블이나 노트를 만들어 시작하세요! 🐝
          </div>
        )}
      </div>
      {transferUi}
      {exchange.ui}
    </aside>
  );
};
