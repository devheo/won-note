import React, { useState, useRef, useEffect } from 'react';
import { TableDocument, WorkspaceData, TableColumn, TableRow } from '../../types';
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
  ClipboardPaste,
} from 'lucide-react';

interface FileMenuDropdownProps {
  activeTable: TableDocument | null;
  workspace: WorkspaceData;
  onOpenDataPortability: () => void;
  onOpenTextPaste: () => void;
  onAddNewTable: () => void;
  onAddNewFolder: () => void;
  onImportCsvToNewTable: (fileName: string, columns: TableColumn[], rows: TableRow[]) => void;
  onImportJsonWorkspace: (data: WorkspaceData) => void;
}

export const FileMenuDropdown: React.FC<FileMenuDropdownProps> = ({
  activeTable,
  workspace,
  onOpenDataPortability,
  onOpenTextPaste,
  onAddNewTable,
  onAddNewFolder,
  onImportCsvToNewTable,
  onImportJsonWorkspace,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const csvInputRef = useRef<HTMLInputElement | null>(null);
  const jsonInputRef = useRef<HTMLInputElement | null>(null);
  const txtInputRef = useRef<HTMLInputElement | null>(null);

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

  // 2. Export Current Table as JSON
  const handleExportTableJson = () => {
    if (!activeTable) {
      showToast('내보낼 테이블이 선택되지 않았습니다.');
      return;
    }
    const jsonStr = JSON.stringify(activeTable, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${activeTable.title.replace(/[^a-zA-Z0-9가-힣_-]/g, '_')}_table.json`;
    link.click();
    URL.revokeObjectURL(url);
    showToast('테이블 JSON 파일이 다운로드되었습니다.');
    setIsOpen(false);
  };

  // 3. Export Entire Workspace Backup JSON
  const handleExportWorkspaceJson = () => {
    const jsonStr = JSON.stringify(workspace, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `wonbee_workspace_backup_${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    showToast('전체 워크스페이스 백업 파일이 다운로드되었습니다.');
    setIsOpen(false);
  };

  // 4. Import CSV
  const handleCsvFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const text = evt.target?.result as string;
        const lines = text
          .split(/\r\n|\n/)
          .map((l) => l.trim())
          .filter((l) => l.length > 0);

        if (lines.length === 0) {
          showToast('빈 CSV 파일입니다.');
          return;
        }

        const parseCsvLine = (line: string): string[] => {
          const result: string[] = [];
          let current = '';
          let insideQuote = false;

          for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"' || char === "'") {
              if (insideQuote && line[i + 1] === char) {
                current += char;
                i++;
              } else {
                insideQuote = !insideQuote;
              }
            } else if ((char === ',' || char === '\t') && !insideQuote) {
              result.push(current.trim());
              current = '';
            } else {
              current += char;
            }
          }
          result.push(current.trim());
          return result;
        };

        const headerTokens = parseCsvLine(lines[0]);
        const columns: TableColumn[] = headerTokens.map((name, idx) => ({
          id: `col-${idx}-${Date.now().toString(36)}`,
          name: name.replace(/^["']|["']$/g, '').trim() || `컬럼 ${idx + 1}`,
          type: idx === 0 ? 'text' : idx === 1 ? 'status' : 'text',
          width: idx === 0 ? 200 : 160,
          isPrimaryKey: idx === 0,
        }));

        const rows: TableRow[] = lines.slice(1).map((line, rIdx) => {
          const cells = parseCsvLine(line);
          const data: Record<string, any> = {};
          columns.forEach((col, cIdx) => {
            data[col.id] = cells[cIdx] ? cells[cIdx].replace(/^["']|["']$/g, '').trim() : '';
          });
          return {
            id: `row-csv-${rIdx}-${Date.now().toString(36)}`,
            data,
            richContent: '',
            stickers: [],
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };
        });

        const cleanName = file.name.replace(/\.[^/.]+$/, '');
        onImportCsvToNewTable(cleanName, columns, rows);
        showToast(`'${cleanName}' CSV 테이블이 생성되었습니다!`);
      } catch (err) {
        showToast('CSV 파싱에 실패했습니다.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
    setIsOpen(false);
  };

  // 5. Import JSON File
  const handleJsonFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const parsed = JSON.parse(evt.target?.result as string);
        if (parsed.version && parsed.tree && parsed.tables) {
          onImportJsonWorkspace(parsed as WorkspaceData);
          showToast('JSON 워크스페이스가 성공적으로 적용되었습니다.');
        } else if (parsed.id && parsed.columns && parsed.rows) {
          // Single table JSON
          onImportCsvToNewTable(parsed.title || '가져온 JSON 테이블', parsed.columns, parsed.rows);
          showToast('단일 테이블 JSON이 성공적으로 임포트되었습니다.');
        } else {
          showToast('올바른 WonBee JSON 형식이 아닙니다.');
        }
      } catch (err) {
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
        <ChevronDown className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Hidden File Inputs */}
      <input
        type="file"
        ref={csvInputRef}
        onChange={handleCsvFileUpload}
        accept=".csv"
        className="hidden"
      />
      <input
        type="file"
        ref={jsonInputRef}
        onChange={handleJsonFileUpload}
        accept=".json"
        className="hidden"
      />
      <input
        type="file"
        ref={txtInputRef}
        onChange={handleCsvFileUpload}
        accept=".txt,.tsv"
        className="hidden"
      />

      {/* Dropdown Menu Window */}
      {isOpen && (
        <div className="absolute left-0 mt-1.5 w-64 rounded-xl bg-white dark:bg-[#222222] border border-stone-200 dark:border-[#383838] shadow-2xl p-1.5 z-50 text-xs text-stone-700 dark:text-[#cccccc] animate-in fade-in slide-in-from-top-1 duration-150 mat-shadow-3">
          {/* Section 1: New Creation */}
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
            <span className="text-[10px] text-stone-400 dark:text-[#777777]">Ctrl+N</span>
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

          {/* Section 2: Data Import */}
          <div className="px-2.5 py-1 text-[10px] font-bold text-stone-400 dark:text-[#888888] uppercase tracking-wider flex items-center justify-between">
            <span>가져오기 (Import)</span>
            <Upload className="w-3 h-3 text-stone-400" />
          </div>

          <button
            onClick={() => csvInputRef.current?.click()}
            className="w-full px-2.5 py-1.5 rounded-lg text-left hover:bg-stone-100 dark:hover:bg-[#2e2e2e] flex items-center gap-2 transition-colors"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500" />
            CSV 파일 가져오기 (.csv)
          </button>

          <button
            onClick={() => jsonInputRef.current?.click()}
            className="w-full px-2.5 py-1.5 rounded-lg text-left hover:bg-stone-100 dark:hover:bg-[#2e2e2e] flex items-center gap-2 transition-colors"
          >
            <FileJson className="w-3.5 h-3.5 text-amber-500" />
            JSON 파일 가져오기 (.json)
          </button>

          <button
            onClick={() => {
              onOpenTextPaste();
              setIsOpen(false);
            }}
            className="w-full px-2.5 py-1.5 rounded-lg text-left hover:bg-stone-100 dark:hover:bg-[#2e2e2e] flex items-center justify-between text-purple-700 dark:text-purple-300 font-medium transition-colors"
          >
            <span className="flex items-center gap-2">
              <ClipboardPaste className="w-3.5 h-3.5 text-purple-500" />
              텍스트 붙여넣기 (TXT / TSV / 엑셀)
            </span>
            <span className="text-[10px] px-1 py-0.2 rounded bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 font-semibold">
              직접 입력
            </span>
          </button>

          <button
            onClick={() => txtInputRef.current?.click()}
            className="w-full px-2.5 py-1.5 rounded-lg text-left hover:bg-stone-100 dark:hover:bg-[#2e2e2e] flex items-center gap-2 transition-colors"
          >
            <FileText className="w-3.5 h-3.5 text-stone-500 dark:text-stone-400" />
            TXT / TSV 파일 가져오기 (.txt)
          </button>

          <button
            onClick={() => {
              onOpenDataPortability();
              setIsOpen(false);
            }}
            className="w-full px-2.5 py-1.5 rounded-lg text-left bg-amber-50/60 dark:bg-amber-950/20 hover:bg-amber-100 dark:hover:bg-amber-950/40 text-amber-800 dark:text-amber-300 font-semibold flex items-center gap-2 transition-colors"
          >
            <Layers className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
            데이터 병합 마법사 (JSON)
          </button>

          <div className="my-1 border-t border-stone-200 dark:border-[#333333]" />

          {/* Section 3: Data Export */}
          <div className="px-2.5 py-1 text-[10px] font-bold text-stone-400 dark:text-[#888888] uppercase tracking-wider flex items-center justify-between">
            <span>내보내기 (Export)</span>
            <Download className="w-3 h-3 text-stone-400" />
          </div>

          <button
            onClick={handleExportCsv}
            disabled={!activeTable}
            className="w-full px-2.5 py-1.5 rounded-lg text-left hover:bg-stone-100 dark:hover:bg-[#2e2e2e] disabled:opacity-40 flex items-center gap-2 transition-colors"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500" />
            현재 테이블 CSV 다운로드
          </button>

          <button
            onClick={handleExportTableJson}
            disabled={!activeTable}
            className="w-full px-2.5 py-1.5 rounded-lg text-left hover:bg-stone-100 dark:hover:bg-[#2e2e2e] disabled:opacity-40 flex items-center gap-2 transition-colors"
          >
            <FileJson className="w-3.5 h-3.5 text-amber-500" />
            현재 테이블 JSON 다운로드
          </button>

          <button
            onClick={handleExportWorkspaceJson}
            className="w-full px-2.5 py-1.5 rounded-lg text-left hover:bg-stone-100 dark:hover:bg-[#2e2e2e] flex items-center gap-2 text-stone-800 dark:text-[#f0f0f0] font-semibold transition-colors"
          >
            <Database className="w-3.5 h-3.5 text-blue-500" />
            전체 워크스페이스 백업 (.json)
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
