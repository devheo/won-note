import React, { useState, useRef, useEffect } from 'react';
import { TableDocument, WorkspaceData, TableColumn, TableRow } from '../../types';
import { parseDelimitedText } from '../../utils/csvParser';
import { envService } from '../../services/storage/envService';
import {
  FileText,
  FileSpreadsheet,
  FileJson,
  Upload,
  Download,
  Layers,
  Plus,
  FolderPlus,
  ChevronDown,
  Database,
  Check,
  Sparkles,
  Link,
  Unlink,
  Save,
  Settings2,
  HardDrive,
  RefreshCw,
} from 'lucide-react';

interface FileMenuDropdownProps {
  activeTable: TableDocument | null;
  workspace: WorkspaceData;
  onOpenUniversalImport: () => void;
  onOpenDataPortability: () => void;
  onAddNewTable: () => void;
  onAddNewFolder: () => void;
  onImportCsvToNewTable: (fileName: string, columns: TableColumn[], rows: TableRow[]) => void;
  onImportJsonWorkspace: (data: WorkspaceData) => void;
  // Local File Connection (user_data.json)
  connectedFileName: string | null;
  isFsSupported: boolean;
  onConnectLocalFile: () => Promise<void>;
  onLinkNewLocalFile: () => Promise<void>;
  onDisconnectLocalFile: () => void;
  onManualSaveLocalFile: () => Promise<void>;
  isLocalFileSaving: boolean;
  onEnvUpdated?: () => void;
}

export const FileMenuDropdown: React.FC<FileMenuDropdownProps> = ({
  activeTable,
  workspace,
  onOpenUniversalImport,
  onOpenDataPortability,
  onAddNewTable,
  onAddNewFolder,
  onImportCsvToNewTable,
  onImportJsonWorkspace,
  connectedFileName,
  isFsSupported,
  onConnectLocalFile,
  onLinkNewLocalFile,
  onDisconnectLocalFile,
  onManualSaveLocalFile,
  isLocalFileSaving,
  onEnvUpdated,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const envFileInputRef = useRef<HTMLInputElement | null>(null);
  const jsonInputRef = useRef<HTMLInputElement | null>(null);

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      window.addEventListener('mousedown', handleClickOutside);
    }
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  // 1. Export Current Table as CSV
  const handleExportCsv = () => {
    if (!activeTable) {
      showToast('내보낼 테이블이 선택되지 않았습니다.');
      return;
    }

    const headers = activeTable.columns.map((c) => `"${c.name.replace(/"/g, '""')}"`).join(',');
    const rows = activeTable.rows.map((row) =>
      activeTable.columns
        .map((col) => {
          const val = row.data[col.id];
          if (val === undefined || val === null) return '""';
          return `"${String(val).replace(/"/g, '""')}"`;
        })
        .join(',')
    );

    const csvContent = '\uFEFF' + [headers, ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${activeTable.title.replace(/[^a-zA-Z0-9가-힣_-]/g, '_')}_export.csv`;
    link.click();
    URL.revokeObjectURL(url);
    showToast('CSV 파일이 성공적으로 다운로드되었습니다.');
    setIsOpen(false);
  };

  // 2. Export user_data.json (Entire Workspace Data)
  const handleExportUserDataJson = () => {
    const jsonStr = JSON.stringify(workspace, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'user_data.json';
    link.click();
    URL.revokeObjectURL(url);
    showToast('user_data.json(워크스페이스 데이터)이 다운로드되었습니다.');
    setIsOpen(false);
  };

  // 3. Export user_env.json (Environment Settings)
  const handleExportUserEnvJson = () => {
    envService.exportUserEnvFile();
    showToast('user_env.json(환경 설정값)이 다운로드되었습니다.');
    setIsOpen(false);
  };

  // 4. Import user_env.json
  const handleImportUserEnv = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await envService.importUserEnvFile(file);
      showToast('user_env.json 환경값이 성공적으로 복원되었습니다.');
      onEnvUpdated?.();
    } catch (err: any) {
      showToast(err.message || '환경설정 불러오기에 실패했습니다.');
    }
    e.target.value = '';
    setIsOpen(false);
  };

  // 5. Import user_data.json
  const handleImportUserData = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const parsed = JSON.parse(evt.target?.result as string);
        if (parsed.tree && parsed.tables) {
          onImportJsonWorkspace(parsed as WorkspaceData);
          showToast('user_data.json 워크스페이스가 성공적으로 적용되었습니다.');
        } else if (parsed.id && parsed.columns && parsed.rows) {
          onImportCsvToNewTable(parsed.title || '가져온 JSON 테이블', parsed.columns, parsed.rows);
          showToast('단일 테이블 JSON이 성공적으로 임포트되었습니다.');
        } else {
          showToast('유효한 user_data.json 형식이 아닙니다.');
        }
      } catch {
        showToast('JSON 파일을 읽는데 실패했습니다.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
    setIsOpen(false);
  };

  return (
    <div className="relative inline-block" ref={menuRef}>
      {/* File Menu Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
          isOpen
            ? 'bg-amber-500 text-stone-950 shadow-sm'
            : 'bg-stone-100 dark:bg-[#282828] hover:bg-stone-200 dark:hover:bg-[#333333] text-stone-700 dark:text-[#e0e0e0] border border-stone-200 dark:border-[#383838]'
        }`}
      >
        <FileSpreadsheet className="w-3.5 h-3.5 text-amber-500" />
        <span>파일</span>
        {connectedFileName && (
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" title="로컬 파일 연동 중" />
        )}
        <ChevronDown className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Hidden File Inputs */}
      <input
        type="file"
        ref={envFileInputRef}
        onChange={handleImportUserEnv}
        accept=".json"
        className="hidden"
      />
      <input
        type="file"
        ref={jsonInputRef}
        onChange={handleImportUserData}
        accept=".json"
        className="hidden"
      />

      {/* Dropdown Menu Window */}
      {isOpen && (
        <div className="absolute left-0 mt-1.5 w-72 rounded-xl bg-white dark:bg-[#222222] border border-stone-200 dark:border-[#383838] shadow-2xl p-1.5 z-50 text-xs text-stone-700 dark:text-[#cccccc] animate-in fade-in slide-in-from-top-1 duration-150 mat-shadow-3">
          {/* Section 0: Local File Sync (user_data.json) */}
          <div className="px-2.5 py-1.5 mb-1 rounded-lg bg-stone-50 dark:bg-[#1a1a1a] border border-stone-200/80 dark:border-[#333333]">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-bold text-stone-500 dark:text-stone-400 uppercase tracking-wider flex items-center gap-1">
                <HardDrive className="w-3 h-3 text-amber-500" />
                로컬 파일 연동 (user_data.json)
              </span>
              {connectedFileName ? (
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  연결됨
                </span>
              ) : (
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-stone-200/80 dark:bg-stone-800 text-stone-500 font-medium">
                  미연동
                </span>
              )}
            </div>

            {connectedFileName ? (
              <div className="space-y-1.5">
                <div className="text-[11px] font-mono text-stone-800 dark:text-stone-200 truncate bg-white dark:bg-[#252525] px-2 py-1 rounded border border-stone-200 dark:border-[#383838]">
                  📄 {connectedFileName}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={async () => {
                      await onManualSaveLocalFile();
                      showToast('로컬 파일에 저장되었습니다.');
                    }}
                    disabled={isLocalFileSaving}
                    className="flex-1 px-2 py-1 rounded bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold flex items-center justify-center gap-1 text-[11px] transition-colors"
                  >
                    {isLocalFileSaving ? (
                      <RefreshCw className="w-3 h-3 animate-spin" />
                    ) : (
                      <Save className="w-3 h-3" />
                    )}
                    <span>지금 저장</span>
                  </button>
                  <button
                    onClick={() => {
                      onDisconnectLocalFile();
                      showToast('로컬 파일 연동이 해제되었습니다.');
                    }}
                    className="px-2 py-1 rounded bg-stone-200 dark:bg-stone-800 hover:bg-rose-100 dark:hover:bg-rose-950/40 text-stone-600 dark:text-stone-400 hover:text-rose-600 dark:hover:text-rose-400 text-[11px] transition-colors"
                    title="연동 해제"
                  >
                    <Unlink className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                <button
                  onClick={async () => {
                    await onConnectLocalFile();
                    setIsOpen(false);
                  }}
                  className="w-full px-2 py-1.5 rounded-md bg-stone-100 dark:bg-[#262626] hover:bg-amber-50 dark:hover:bg-amber-950/40 text-stone-800 dark:text-stone-200 hover:text-amber-600 dark:hover:text-amber-400 font-semibold flex items-center justify-center gap-1.5 transition-colors text-[11px]"
                >
                  <Link className="w-3 h-3 text-amber-500" />
                  <span>내 컴퓨터 user_data.json 파일 열기/연결</span>
                </button>
                <button
                  onClick={async () => {
                    await onLinkNewLocalFile();
                    setIsOpen(false);
                  }}
                  className="w-full px-2 py-1 rounded text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200 text-[10px] text-center transition-colors"
                >
                  새 파일로 생성 및 연동하기
                </button>
              </div>
            )}
          </div>

          {/* Section 1: Creation */}
          <div className="px-2.5 py-1 text-[10px] font-bold text-stone-400 dark:text-[#888888] uppercase tracking-wider">
            새로 만들기
          </div>
          <button
            onClick={() => {
              onAddNewTable();
              setIsOpen(false);
            }}
            className="w-full px-2.5 py-1.5 rounded-lg text-left hover:bg-stone-100 dark:hover:bg-[#2e2e2e] flex items-center justify-between transition-colors"
          >
            <span className="flex items-center gap-2">
              <Plus className="w-3.5 h-3.5 text-amber-500" />
              새 데이터 테이블
            </span>
          </button>
          <button
            onClick={() => {
              onAddNewFolder();
              setIsOpen(false);
            }}
            className="w-full px-2.5 py-1.5 rounded-lg text-left hover:bg-stone-100 dark:hover:bg-[#2e2e2e] flex items-center gap-2 transition-colors"
          >
            <FolderPlus className="w-3.5 h-3.5 text-blue-500" />
            새 폴더
          </button>

          <div className="my-1 border-t border-stone-200 dark:border-[#333333]" />

          {/* Section 2: Unified Import */}
          <div className="px-2.5 py-1 text-[10px] font-bold text-stone-400 dark:text-[#888888] uppercase tracking-wider flex items-center justify-between">
            <span>데이터 가져오기 (통합)</span>
            <Upload className="w-3 h-3 text-stone-400" />
          </div>

          <button
            onClick={() => {
              onOpenUniversalImport();
              setIsOpen(false);
            }}
            className="w-full px-2.5 py-2 rounded-lg text-left bg-amber-50/80 dark:bg-amber-950/30 hover:bg-amber-100 dark:hover:bg-amber-950/50 text-amber-900 dark:text-amber-300 font-bold flex items-center justify-between transition-colors border border-amber-300/60 dark:border-amber-800/60"
          >
            <span className="flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              통합 데이터 가져오기
            </span>
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-200/70 dark:bg-amber-900/60 text-amber-900 dark:text-amber-200">
              TXT/CSV/JSON/엑셀
            </span>
          </button>

          <button
            onClick={() => jsonInputRef.current?.click()}
            className="w-full px-2.5 py-1.5 rounded-lg text-left hover:bg-stone-100 dark:hover:bg-[#2e2e2e] flex items-center gap-2 transition-colors"
          >
            <FileJson className="w-3.5 h-3.5 text-emerald-500" />
            <span>user_data.json 파일 불러오기</span>
          </button>

          <button
            onClick={() => envFileInputRef.current?.click()}
            className="w-full px-2.5 py-1.5 rounded-lg text-left hover:bg-stone-100 dark:hover:bg-[#2e2e2e] flex items-center gap-2 transition-colors"
          >
            <Settings2 className="w-3.5 h-3.5 text-blue-500" />
            <span>user_env.json 환경값 복원하기</span>
          </button>

          <div className="my-1 border-t border-stone-200 dark:border-[#333333]" />

          {/* Section 3: Data Export */}
          <div className="px-2.5 py-1 text-[10px] font-bold text-stone-400 dark:text-[#888888] uppercase tracking-wider flex items-center justify-between">
            <span>내보내기 & 백업 (Export)</span>
            <Download className="w-3 h-3 text-stone-400" />
          </div>

          <button
            onClick={handleExportUserDataJson}
            className="w-full px-2.5 py-1.5 rounded-lg text-left hover:bg-stone-100 dark:hover:bg-[#2e2e2e] flex items-center justify-between text-stone-800 dark:text-[#f0f0f0] font-semibold transition-colors"
          >
            <span className="flex items-center gap-2">
              <Database className="w-3.5 h-3.5 text-amber-500" />
              user_data.json 백업
            </span>
            <span className="text-[10px] text-stone-400">트리 & 테이블</span>
          </button>

          <button
            onClick={handleExportUserEnvJson}
            className="w-full px-2.5 py-1.5 rounded-lg text-left hover:bg-stone-100 dark:hover:bg-[#2e2e2e] flex items-center justify-between text-stone-800 dark:text-[#f0f0f0] font-semibold transition-colors"
          >
            <span className="flex items-center gap-2">
              <Settings2 className="w-3.5 h-3.5 text-blue-500" />
              user_env.json 저장
            </span>
            <span className="text-[10px] text-stone-400">환경값 / 테마</span>
          </button>

          <button
            onClick={handleExportCsv}
            disabled={!activeTable}
            className="w-full px-2.5 py-1.5 rounded-lg text-left hover:bg-stone-100 dark:hover:bg-[#2e2e2e] disabled:opacity-40 flex items-center gap-2 transition-colors"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500" />
            현재 테이블 CSV 다운로드
          </button>
        </div>
      )}

      {/* Floating Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-stone-900 dark:bg-[#111111] text-stone-100 border border-amber-500/50 rounded-xl shadow-2xl text-xs font-semibold flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2 mat-shadow-3">
          <Sparkles className="w-4 h-4 text-amber-400" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
};
