/**
 * WonBee (원비, wonbee.com)
 * Minimalist Workspace & Data Grid Application
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  WorkspaceData,
  TableDocument,
  TableRow,
  TreeItem,
  TableColumn,
} from './types';
import {
  formatDateTime,
  ensureUpdateDateColumnInTable,
  applyAutoUpdateDateToRow,
} from './utils/dateColumnUtils';
import { WorkspaceRepositoryFactory } from './services/storage/repository';
import { localFileService } from './services/storage/localFileService';
import { INITIAL_WORKSPACE_DATA } from './data/initialData';
import { InfiniteTreeSidebar } from './components/sidebar/InfiniteTreeSidebar';
import { DataTableViewer } from './components/table/DataTableViewer';
import { ModernRowDetailViewer } from './components/table/ModernRowDetailViewer';
// Lazy load RichEditorModal and TipTap dependencies to avoid initializing editor during initial page load
const RichEditorModal = React.lazy(() =>
  import('./components/editor/RichEditorModal').then((module) => ({
    default: module.RichEditorModal,
  }))
);
import { ZoomControls } from './components/common/ZoomControls';
import { DataPortabilityModal } from './components/modals/DataPortabilityModal';
import { TextPasteModal } from './components/modals/TextPasteModal';
import { UniversalImportModal } from './components/modals/UniversalImportModal';
import { ServerSettingsModal } from './components/modals/ServerSettingsModal';
import { WonBeeMascot } from './components/common/WonBeeMascot';
import { FileMenuDropdown } from './components/common/FileMenuDropdown';
import { envService } from './services/storage/envService';
import {
  Sun,
  Moon,
  Database,
  Layers,
  Sparkles,
  Plus,
  Loader2,
  Table as TableIcon,
  ChevronRight,
  Settings,
} from 'lucide-react';

export default function App() {
  const [workspace, setWorkspace] = useState<WorkspaceData>(INITIAL_WORKSPACE_DATA);
  const [activeTableId, setActiveTableId] = useState<string | null>(() => {
    return localStorage.getItem('wonbee_active_table_id') || 'table-roadmap';
  });
  const [isLoading, setIsLoading] = useState(true);

  // Local File System Sync State
  const [connectedFileName, setConnectedFileName] = useState<string | null>(() =>
    localFileService.getConnectedFileName()
  );
  const [isLocalFileSaving, setIsLocalFileSaving] = useState(false);
  const isFsSupported = localFileService.isSupported();

  // Theme State
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return (
        localStorage.getItem('wonbee_theme') === 'dark' ||
        (!localStorage.getItem('wonbee_theme') &&
          window.matchMedia('(prefers-color-scheme: dark)').matches)
      );
    }
    return false;
  });

  // Zoom State (persisted)
  const [zoomLevel, setZoomLevel] = useState<number>(() => {
    const saved = localStorage.getItem('wonbee_zoom_level');
    return saved ? parseInt(saved, 10) : 100;
  });

  const handleZoomChange = (newZoom: number) => {
    setZoomLevel(newZoom);
    localStorage.setItem('wonbee_zoom_level', newZoom.toString());
  };

  // Switch Active Table & Persist
  const handleSelectActiveTable = (tableId: string | null) => {
    setActiveTableId(tableId);
    if (tableId) {
      localStorage.setItem('wonbee_active_table_id', tableId);
    }
  };

  // Server vs Serverless (USE_SERVER) State
  const [useServer, setUseServer] = useState<boolean>(false);
  const [serverUrl, setServerUrl] = useState<string>('https://api.wonbee.com/v1');

  // Modals state
  const [editingRow, setEditingRow] = useState<TableRow | null>(null);
  const [editingTargetColId, setEditingTargetColId] = useState<string | null>(null);
  const [selectedDetailRow, setSelectedDetailRow] = useState<TableRow | null>(null);
  const [selectedDetailRowIndex, setSelectedDetailRowIndex] = useState<number>(0);
  const [isDataPortabilityOpen, setIsDataPortabilityOpen] = useState(false);
  const [isTextPasteOpen, setIsTextPasteOpen] = useState(false);
  const [isUniversalImportOpen, setIsUniversalImportOpen] = useState(false);
  const [isServerSettingsOpen, setIsServerSettingsOpen] = useState(false);

  // Repository Instance
  const repository = useMemo(() => {
    return WorkspaceRepositoryFactory.getRepository({
      useServer,
      serverUrl,
    });
  }, [useServer, serverUrl]);

  // Sync to local file if connected
  const syncToLocalFileIfConnected = useCallback(async (data: WorkspaceData) => {
    if (localFileService.hasConnectedFile()) {
      try {
        setIsLocalFileSaving(true);
        await localFileService.saveToConnectedFile(data);
      } catch (err) {
        console.error('Error auto-syncing to connected local file:', err);
      } finally {
        setIsLocalFileSaving(false);
      }
    }
  }, []);

  // Load initial workspace on mount
  const loadWorkspaceData = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await repository.loadWorkspace();

      // Clean up legacy template welcome richContent if present on any row
      let needsSave = false;
      const cleanedTables = { ...data.tables };
      Object.keys(cleanedTables).forEach((tId) => {
        let table = cleanedTables[tId];
        let tableChanged = false;
        const cleanedRows = table.rows.map((row) => {
          if (row.richContent && (row.richContent.includes('환영합니다') || row.richContent.includes('새 테이블이 성공적으로 생성되었습니다'))) {
            tableChanged = true;
            return { ...row, richContent: '' };
          }
          return row;
        });
        if (tableChanged) {
          table = { ...table, rows: cleanedRows };
          needsSave = true;
        }

        // Auto-ensure update date column exists and rows are populated
        const { table: ensuredTable, created } = ensureUpdateDateColumnInTable(table);
        if (created) {
          table = ensuredTable;
          needsSave = true;
        }

        cleanedTables[tId] = table;
      });
      const finalData = needsSave ? { ...data, tables: cleanedTables } : data;
      setWorkspace(finalData);
      if (needsSave) {
        repository.saveWorkspace(finalData);
      }

      const savedTableId = localStorage.getItem('wonbee_active_table_id');
      if (savedTableId && data.tables[savedTableId]) {
        setActiveTableId(savedTableId);
      } else if (!activeTableId || !data.tables[activeTableId]) {
        const firstTableId = Object.keys(data.tables)[0] || null;
        setActiveTableId(firstTableId);
        if (firstTableId) {
          localStorage.setItem('wonbee_active_table_id', firstTableId);
        }
      }
    } catch (err) {
      console.error('Failed to load workspace:', err);
    } finally {
      setIsLoading(false);
    }
  }, [repository, activeTableId]);

  useEffect(() => {
    loadWorkspaceData();
  }, [loadWorkspaceData]);

  // Theme effect
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('wonbee_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('wonbee_theme', 'light');
    }
  }, [isDarkMode]);

  // Active Table
  const activeTable: TableDocument | null = useMemo(() => {
    if (!activeTableId) return null;
    return workspace.tables[activeTableId] || null;
  }, [workspace.tables, activeTableId]);

  // Update whole tree
  const handleUpdateTree = async (updatedTree: TreeItem[]) => {
    const updatedWs = {
      ...workspace,
      tree: updatedTree,
      exportedAt: Date.now(),
    };
    setWorkspace(updatedWs);
    await repository.saveTree(updatedTree);
    await syncToLocalFileIfConnected(updatedWs);
  };

  // Update specific table
  const handleUpdateTable = async (updatedTable: TableDocument) => {
    const updatedTables = {
      ...workspace.tables,
      [updatedTable.id]: updatedTable,
    };
    const updatedWs = {
      ...workspace,
      tables: updatedTables,
      exportedAt: Date.now(),
    };
    setWorkspace(updatedWs);
    await repository.saveTable(updatedTable);
    await syncToLocalFileIfConnected(updatedWs);
  };

  // Add new Table
  const handleAddTable = async (parentId: string | null = null, title = '새 데이터 테이블') => {
    const newTableId = `table-${Date.now().toString(36)}`;
    const newTableTitle = `🐝 ${title}`;

    const newTable: TableDocument = {
      id: newTableId,
      title: newTableTitle,
      description: '새로 생성된 원비 데이터 테이블입니다.',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      columns: [
        { id: 'col-name', name: '이름 / 항목명', type: 'text', width: 220, isPrimaryKey: true },
        {
          id: 'col-status',
          name: '상태',
          type: 'status',
          width: 140,
          options: [
            { id: 'todo', label: '대기중', color: '#9CA3AF' },
            { id: 'progress', label: '진행중', color: '#F59E0B' },
            { id: 'done', label: '완료됨', color: '#10B981' },
          ],
        },
        { id: 'col-note', name: '상세 노트 & 호버 툴팁', type: 'richText', width: 320 },
        {
          id: 'col-updated-at',
          name: '수정일',
          type: 'date',
          width: 155,
          autoUpdateDate: true,
        },
      ],
      rows: [
        {
          id: 'row-init-1',
          data: {
            'col-name': '첫 번째 데이터 레코드',
            'col-status': 'progress',
            'col-note': '더블 클릭하여 편집하거나 우측 리치 에디터 버튼을 눌러 서식을 작성하세요.',
            'col-updated-at': formatDateTime(Date.now()),
          },
          richContent: '',
          stickers: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
    };

    const newTreeItem: TreeItem = {
      id: newTableId,
      parentId,
      title: newTableTitle,
      type: 'table',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const updatedWs: WorkspaceData = {
      ...workspace,
      tree: [...workspace.tree, newTreeItem],
      tables: {
        ...workspace.tables,
        [newTableId]: newTable,
      },
      exportedAt: Date.now(),
    };

    setWorkspace(updatedWs);
    setActiveTableId(newTableId);
    await repository.saveWorkspace(updatedWs);
    await syncToLocalFileIfConnected(updatedWs);
  };

  // Add new Folder
  const handleAddFolder = async (parentId: string | null = null, title = '새 폴더') => {
    const newFolderId = `folder-${Date.now().toString(36)}`;
    const newTreeItem: TreeItem = {
      id: newFolderId,
      parentId,
      title: `📁 ${title}`,
      type: 'folder',
      isExpanded: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const updatedTree = [...workspace.tree, newTreeItem];
    const updatedWs = {
      ...workspace,
      tree: updatedTree,
      exportedAt: Date.now(),
    };

    setWorkspace(updatedWs);
    await repository.saveTree(updatedTree);
    await syncToLocalFileIfConnected(updatedWs);
  };

  // Duplicate Table
  const handleDuplicateTable = async (tableId: string) => {
    const sourceTable = workspace.tables[tableId];
    if (!sourceTable) return;

    const newTableId = `table-${Date.now().toString(36)}`;
    const newTableTitle = `${sourceTable.title} (복사본)`;

    const duplicatedTable: TableDocument = {
      ...sourceTable,
      id: newTableId,
      title: newTableTitle,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      rows: sourceTable.rows.map((r, idx) => ({
        ...r,
        id: `row-dup-${Date.now()}-${idx}`,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })),
    };

    const sourceTreeItem = workspace.tree.find((t) => t.id === tableId);
    const newTreeItem: TreeItem = {
      id: newTableId,
      parentId: sourceTreeItem?.parentId || null,
      title: newTableTitle,
      type: 'table',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const updatedWs: WorkspaceData = {
      ...workspace,
      tree: [...workspace.tree, newTreeItem],
      tables: {
        ...workspace.tables,
        [newTableId]: duplicatedTable,
      },
      exportedAt: Date.now(),
    };

    setWorkspace(updatedWs);
    setActiveTableId(newTableId);
    await repository.saveWorkspace(updatedWs);
    await syncToLocalFileIfConnected(updatedWs);
  };

  // Delete Tree Item (Recursive)
  const handleDeleteTreeItem = async (itemId: string) => {
    const findDescendantIds = (rootId: string): string[] => {
      const children = workspace.tree.filter((t) => t.parentId === rootId);
      let ids = [rootId];
      children.forEach((c) => {
        ids = [...ids, ...findDescendantIds(c.id)];
      });
      return ids;
    };

    const idsToDelete = findDescendantIds(itemId);
    const updatedTree = workspace.tree.filter((t) => !idsToDelete.includes(t.id));

    const updatedTables = { ...workspace.tables };
    idsToDelete.forEach((id) => {
      delete updatedTables[id];
    });

    const updatedWs: WorkspaceData = {
      ...workspace,
      tree: updatedTree,
      tables: updatedTables,
      exportedAt: Date.now(),
    };

    setWorkspace(updatedWs);
    if (activeTableId && idsToDelete.includes(activeTableId)) {
      const remainingTableIds = Object.keys(updatedTables);
      setActiveTableId(remainingTableIds[0] || null);
    }

    await repository.saveWorkspace(updatedWs);
    await syncToLocalFileIfConnected(updatedWs);
  };

  // Import CSV/JSON File as a New Table
  const handleImportCsvToNewTable = async (
    fileName: string,
    columns: TableColumn[],
    rows: TableRow[]
  ) => {
    const newTableId = `table-csv-${Date.now().toString(36)}`;
    const newTitle = `📊 ${fileName}`;

    const newTable: TableDocument = {
      id: newTableId,
      title: newTitle,
      description: `CSV/외부 데이터에서 가져온 테이블입니다. (${rows.length}개 행)`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      columns,
      rows,
    };

    const newTreeItem: TreeItem = {
      id: newTableId,
      parentId: null,
      title: newTitle,
      type: 'table',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const updatedWs: WorkspaceData = {
      ...workspace,
      tree: [...workspace.tree, newTreeItem],
      tables: {
        ...workspace.tables,
        [newTableId]: newTable,
      },
      exportedAt: Date.now(),
    };

    setWorkspace(updatedWs);
    setActiveTableId(newTableId);
    await repository.saveWorkspace(updatedWs);
    await syncToLocalFileIfConnected(updatedWs);
  };

  // Append Imported Rows into Current Active Table
  const handleAppendRowsToCurrentTable = async (newRows: TableRow[]) => {
    if (!activeTable) return;
    const updatedTable: TableDocument = {
      ...activeTable,
      rows: [...activeTable.rows, ...newRows],
      updatedAt: Date.now(),
    };
    await handleUpdateTable(updatedTable);
  };

  // Save Row from TipTap Rich Modal
  const handleSaveRowFromEditor = async (updatedRow: TableRow) => {
    if (!activeTable) return;
    const { updatedTable } = applyAutoUpdateDateToRow(
      activeTable,
      updatedRow.id,
      updatedRow.data,
      editingTargetColId || undefined,
      { richContent: updatedRow.richContent, stickers: updatedRow.stickers }
    );
    await handleUpdateTable(updatedTable);
  };

  // Merge Portable JSON Data
  const handleMergeWorkspace = async (
    importedData: WorkspaceData,
    mode: 'merge' | 'replace' | 'keep_both'
  ) => {
    const result = await repository.mergeWorkspace(importedData, mode);
    setWorkspace(result);
    const firstTableId = Object.keys(result.tables)[0] || null;
    if (firstTableId) setActiveTableId(firstTableId);
    await syncToLocalFileIfConnected(result);
  };

  // Local File Connect Handler
  const handleConnectLocalFile = async () => {
    try {
      const res = await localFileService.openLocalFile();
      if (res) {
        setConnectedFileName(res.fileName);
        setWorkspace(res.data);
        const firstTableId = Object.keys(res.data.tables)[0] || null;
        if (firstTableId) setActiveTableId(firstTableId);
        await repository.saveWorkspace(res.data);
      }
    } catch (err) {
      console.error('Failed to open local file:', err);
    }
  };

  const handleLinkNewLocalFile = async () => {
    try {
      const fileName = await localFileService.linkNewLocalFile(workspace);
      if (fileName) {
        setConnectedFileName(fileName);
      }
    } catch (err) {
      console.error('Failed to link new local file:', err);
    }
  };

  const handleDisconnectLocalFile = () => {
    localFileService.disconnect();
    setConnectedFileName(null);
  };

  const handleManualSaveLocalFile = async () => {
    if (localFileService.hasConnectedFile()) {
      setIsLocalFileSaving(true);
      try {
        await localFileService.saveToConnectedFile(workspace);
      } finally {
        setIsLocalFileSaving(false);
      }
    }
  };

  if (isLoading) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-stone-50 dark:bg-stone-950 text-stone-800 dark:text-stone-200">
        <div className="w-12 h-12 rounded-2xl bg-amber-400 flex items-center justify-center text-2xl animate-bounce shadow-md">
          🐝
        </div>
        <p className="mt-4 text-xs font-semibold text-stone-600 dark:text-stone-400">
          WonBee 워크스페이스 로딩 중...
        </p>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex overflow-hidden bg-stone-50/40 dark:bg-stone-950 text-stone-900 dark:text-stone-100 font-sans">
      {/* 1. Left Sidebar: Infinite Depth Tree */}
      <InfiniteTreeSidebar
        tree={workspace.tree}
        activeTableId={activeTableId}
        onSelectTable={handleSelectActiveTable}
        onUpdateTree={handleUpdateTree}
        onAddTable={handleAddTable}
        onAddFolder={handleAddFolder}
        onDeleteTreeItem={handleDeleteTreeItem}
        onDuplicateTable={handleDuplicateTable}
        useServer={useServer}
        onOpenServerSettings={() => setIsServerSettingsOpen(true)}
        onOpenDataPortability={() => setIsDataPortabilityOpen(true)}
      />

      {/* 2. Main Center Area with Zoom Scale Transform */}
      <main className="flex-1 h-screen flex flex-col min-w-0 relative overflow-hidden">
        {/* Top Minimal Application Bar */}
        <header className="h-12 border-b border-stone-200/80 dark:border-[#333333] bg-white/90 dark:bg-[#1e1e1e] backdrop-blur-md px-4 sm:px-6 flex items-center justify-between flex-shrink-0 select-none z-20">
          {/* Breadcrumb Navigation & File Menu */}
          <div className="flex items-center gap-3 text-xs text-stone-500">
            <span className="font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1">
              <WonBeeMascot />
              WonBee
            </span>
            <ChevronRight className="w-3.5 h-3.5 text-stone-400" />
            <span className="font-medium text-stone-800 dark:text-[#f0f0f0] truncate max-w-xs">
              {activeTable?.title || '테이블을 선택하세요'}
            </span>

            <div className="h-4 w-px bg-stone-300 dark:bg-[#383838] mx-1" />

            {/* Consolidated File Menu Dropdown (Includes Universal Import & Local File Sync) */}
            <FileMenuDropdown
              activeTable={activeTable}
              workspace={workspace}
              onOpenUniversalImport={() => setIsUniversalImportOpen(true)}
              onOpenDataPortability={() => setIsDataPortabilityOpen(true)}
              onAddNewTable={() => handleAddTable(null)}
              onAddNewFolder={() => handleAddFolder(null)}
              onImportCsvToNewTable={handleImportCsvToNewTable}
              onImportJsonWorkspace={(newWs) => handleMergeWorkspace(newWs, 'replace')}
              connectedFileName={connectedFileName}
              isFsSupported={isFsSupported}
              onConnectLocalFile={handleConnectLocalFile}
              onLinkNewLocalFile={handleLinkNewLocalFile}
              onDisconnectLocalFile={handleDisconnectLocalFile}
              onManualSaveLocalFile={handleManualSaveLocalFile}
              isLocalFileSaving={isLocalFileSaving}
              onEnvUpdated={() => {
                const currentEnv = envService.getEnv();
                if (currentEnv.theme) setIsDarkMode(currentEnv.theme === 'dark');
                if (currentEnv.zoomLevel) setZoomLevel(currentEnv.zoomLevel);
              }}
            />
          </div>

          {/* Top Right Action Items */}
          <div className="flex items-center gap-2">
            {/* Server Settings Button */}
            <button
              onClick={() => setIsServerSettingsOpen(true)}
              className="px-2.5 py-1 bg-stone-100 dark:bg-[#282828] hover:bg-stone-200 dark:hover:bg-[#333333] text-stone-700 dark:text-[#e0e0e0] border border-stone-200 dark:border-[#383838] rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors"
            >
              <Database className="w-3.5 h-3.5 text-blue-500" />
              {useServer ? 'Server API' : 'IndexedDB'}
            </button>

            {/* Dark / Light Theme Toggle */}
            <button
              onClick={() => {
                const nextMode = !isDarkMode;
                setIsDarkMode(nextMode);
                envService.updateEnv({ theme: nextMode ? 'dark' : 'light' });
              }}
              className="px-2.5 py-1 rounded-lg bg-stone-100 dark:bg-[#282828] hover:bg-stone-200 dark:hover:bg-[#333333] text-stone-700 dark:text-[#e0e0e0] border border-stone-200 dark:border-[#383838] transition-all flex items-center gap-1.5 text-xs font-semibold"
              title={isDarkMode ? '밝고 깨끗한 라이트 모드로 전환' : '모던 다크 모드로 전환'}
            >
              {isDarkMode ? (
                <>
                  <Sun className="w-3.5 h-3.5 text-amber-400" />
                  <span>다크 모드</span>
                </>
              ) : (
                <>
                  <Moon className="w-3.5 h-3.5 text-stone-500" />
                  <span>라이트 모드</span>
                </>
              )}
            </button>
          </div>
        </header>

        {/* Scalable Workspace Canvas (Zoom In / Out Container) */}
        <div className="flex-1 w-full h-[calc(100vh-48px)] overflow-auto relative">
          <div
            style={{
              transform: `scale(${zoomLevel / 100})`,
              transformOrigin: 'top left',
              width: `${(100 / zoomLevel) * 100}%`,
              height: `${(100 / zoomLevel) * 100}%`,
            }}
            className="transition-transform duration-150 ease-out"
          >
            {activeTable ? (
              <DataTableViewer
                table={activeTable}
                onUpdateTable={handleUpdateTable}
                onOpenRowEditor={(row, colId) => {
                  setEditingRow(row);
                  setEditingTargetColId(colId || null);
                }}
                onOpenRowDetail={(row, idx) => {
                  setSelectedDetailRow(row);
                  setSelectedDetailRowIndex(idx);
                }}
                onImportCsvToNewTable={handleImportCsvToNewTable}
              />
            ) : (
              <div className="h-full flex flex-col items-center justify-center p-8 text-center text-stone-400">
                <TableIcon className="w-12 h-12 stroke-1 mb-2 text-stone-300 dark:text-stone-600" />
                <h3 className="font-semibold text-stone-600 dark:text-stone-300">선택된 테이블이 없습니다</h3>
                <p className="text-xs text-stone-400 mt-1 max-w-sm">
                  좌측 워크스페이스 트리에서 테이블을 선택하거나 새 테이블을 추가해주세요.
                </p>
                <button
                  onClick={() => handleAddTable(null)}
                  className="mt-4 px-4 py-2 bg-amber-400 hover:bg-amber-500 text-stone-950 font-semibold rounded-lg text-xs flex items-center gap-1.5 shadow-sm transition-all"
                >
                  <Plus className="w-3.5 h-3.5" />
                  첫 테이블 만들기
                </button>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* 3. Modern Slide-Over Row Detail Drawer (Right Side) */}
      <ModernRowDetailViewer
        isOpen={!!selectedDetailRow}
        onClose={() => setSelectedDetailRow(null)}
        row={selectedDetailRow}
        currentIndex={selectedDetailRowIndex}
        totalRows={activeTable?.rows.length || 0}
        columns={activeTable?.columns || []}
        tableName={activeTable?.title || '테이블'}
        onOpenRichEditor={(row, colId) => {
          setEditingRow(row);
          setEditingTargetColId(colId || null);
        }}
        onUpdateRow={(updated) => {
          if (!activeTable) return;
          const { updatedTable, updatedRow } = applyAutoUpdateDateToRow(
            activeTable,
            updated.id,
            updated.data,
            undefined,
            { richContent: updated.richContent, stickers: updated.stickers }
          );
          handleUpdateTable(updatedTable);
          setSelectedDetailRow(updatedRow);
        }}
        onNavigate={(newIdx) => {
          if (!activeTable) return;
          if (newIdx >= 0 && newIdx < activeTable.rows.length) {
            setSelectedDetailRowIndex(newIdx);
            setSelectedDetailRow(activeTable.rows[newIdx]);
          }
        }}
        onDeleteRow={(rowId) => {
          if (!activeTable) return;
          const remainingRows = activeTable.rows.filter((r) => r.id !== rowId);
          setSelectedDetailRow(null);
          handleUpdateTable({
            ...activeTable,
            rows: remainingRows,
            updatedAt: Date.now(),
          });
        }}
      />

      {/* 4. TipTap Rich Text Editor Modal (Dynamically loaded on-demand) */}
      {editingRow && (
        <React.Suspense fallback={null}>
          <RichEditorModal
            isOpen={!!editingRow}
            onClose={() => {
              setEditingRow(null);
              setEditingTargetColId(null);
            }}
            row={editingRow}
            columns={activeTable?.columns || []}
            tableName={activeTable?.title || '테이블'}
            initialTargetId={editingTargetColId}
            onSaveRow={handleSaveRowFromEditor}
          />
        </React.Suspense>
      )}

      {/* 5. Bottom Right Floating Action Button (FAB) for Zoom */}
      <ZoomControls zoom={zoomLevel} onChangeZoom={handleZoomChange} />

      {/* 6. Data Portability Modal (Portable JSON Merge) */}
      <DataPortabilityModal
        isOpen={isDataPortabilityOpen}
        onClose={() => setIsDataPortabilityOpen(false)}
        currentWorkspace={workspace}
        onMergeWorkspace={handleMergeWorkspace}
        onLocalFileConnected={(fileName, data) => {
          setConnectedFileName(fileName);
          setWorkspace(data);
          const firstTableId = Object.keys(data.tables)[0] || null;
          if (firstTableId) setActiveTableId(firstTableId);
        }}
      />

      {/* 7. Text / TSV / Raw Data Paste Modal */}
      <TextPasteModal
        isOpen={isTextPasteOpen}
        onClose={() => setIsTextPasteOpen(false)}
        onImportNewTable={handleImportCsvToNewTable}
      />

      {/* 8. Server Mode Settings Modal */}
      <ServerSettingsModal
        isOpen={isServerSettingsOpen}
        onClose={() => setIsServerSettingsOpen(false)}
        useServer={useServer}
        serverUrl={serverUrl}
        onToggleUseServer={(newUseServer, newUrl) => {
          setUseServer(newUseServer);
          if (newUrl) setServerUrl(newUrl);
        }}
        onRefreshData={loadWorkspaceData}
      />

      {/* 9. Universal Import Modal (TXT / CSV / TSV / JSON / Excel Clipboard) */}
      <UniversalImportModal
        isOpen={isUniversalImportOpen}
        onClose={() => setIsUniversalImportOpen(false)}
        activeTable={activeTable}
        onImportNewTable={handleImportCsvToNewTable}
        onAppendRowsToCurrentTable={handleAppendRowsToCurrentTable}
        onRestoreWorkspace={(newWs) => handleMergeWorkspace(newWs, 'replace')}
        onRestoreUserEnv={(newEnv) => {
          if (newEnv.theme) {
            setIsDarkMode(newEnv.theme === 'dark');
          }
          if (newEnv.zoomLevel) {
            setZoomLevel(newEnv.zoomLevel);
          }
          if (newEnv.activeTableId && workspace.tables[newEnv.activeTableId]) {
            setActiveTableId(newEnv.activeTableId);
          }
        }}
      />
    </div>
  );
}
