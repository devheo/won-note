import React, { useState, useRef } from 'react';
import { TableDocument, WorkspaceData, TableColumn, TableRow, UserEnvData } from '../../types';
import { parseDelimitedText } from '../../utils/csvParser';
import {
  Upload,
  FileSpreadsheet,
  FileJson,
  FileText,
  CheckCircle,
  AlertCircle,
  X,
  Sparkles,
  ArrowRight,
  Database,
  Plus,
  Rows,
  Layers,
  ClipboardPaste,
} from 'lucide-react';

interface UniversalImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeTable: TableDocument | null;
  onImportNewTable: (title: string, columns: TableColumn[], rows: TableRow[]) => void;
  onAppendRowsToCurrentTable?: (rows: TableRow[]) => void;
  onRestoreWorkspace?: (workspace: WorkspaceData) => void;
  onRestoreUserEnv?: (env: UserEnvData) => void;
}

type DetectedType =
  | 'workspace_json'
  | 'table_json'
  | 'records_json'
  | 'user_env_json'
  | 'delimited_text'
  | 'unknown';

export const UniversalImportModal: React.FC<UniversalImportModalProps> = ({
  isOpen,
  onClose,
  activeTable,
  onImportNewTable,
  onAppendRowsToCurrentTable,
  onRestoreWorkspace,
  onRestoreUserEnv,
}) => {
  const [activeTab, setActiveTab] = useState<'file' | 'paste'>('file');
  const [dragOver, setDragOver] = useState(false);
  const [rawText, setRawText] = useState('');
  const [fileName, setFileName] = useState('');
  const [detectedType, setDetectedType] = useState<DetectedType>('unknown');
  const [detectedSummary, setDetectedSummary] = useState<string>('');
  const [previewColumns, setPreviewColumns] = useState<TableColumn[]>([]);
  const [previewRows, setPreviewRows] = useState<TableRow[]>([]);
  const [parsedWorkspace, setParsedWorkspace] = useState<WorkspaceData | null>(null);
  const [parsedUserEnv, setParsedUserEnv] = useState<UserEnvData | null>(null);
  const [importTarget, setImportTarget] = useState<'new_table' | 'append_current'>('new_table');
  const [customTableName, setCustomTableName] = useState('');
  const [hasHeader, setHasHeader] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  const analyzeContent = (text: string, sourceName = '') => {
    setErrorMessage(null);
    const trimmed = (text || '').trim();
    if (!trimmed) {
      setDetectedType('unknown');
      setDetectedSummary('');
      setPreviewColumns([]);
      setPreviewRows([]);
      return;
    }

    // 1. Try JSON Analysis
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        const json = JSON.parse(trimmed);

        // Case A: Entire Workspace (user_data.json)
        if (json && json.tree && json.tables) {
          setDetectedType('workspace_json');
          setParsedWorkspace(json as WorkspaceData);
          const tableCount = Object.keys(json.tables).length;
          setDetectedSummary(`WonBee 전체 워크스페이스 데이터 (user_data.json) • ${tableCount}개 테이블`);
          setCustomTableName(sourceName.replace(/\.[^/.]+$/, '') || '워크스페이스 백업');
          return;
        }

        // Case B: User Environment (user_env.json)
        if (json && (json.columnWidths || json.theme || json.zoomLevel)) {
          setDetectedType('user_env_json');
          setParsedUserEnv(json as UserEnvData);
          setDetectedSummary(`WonBee 환경 설정 파일 (user_env.json) • 테마, 열넓이 등`);
          return;
        }

        // Case C: Single Table JSON
        if (json && json.id && json.columns && json.rows) {
          setDetectedType('table_json');
          setPreviewColumns(json.columns);
          setPreviewRows(json.rows);
          setDetectedSummary(`단일 테이블 JSON • ${json.columns.length}개 열, ${json.rows.length}개 행`);
          setCustomTableName(json.title || sourceName.replace(/\.[^/.]+$/, '') || '가져온 JSON 테이블');
          return;
        }

        // Case D: Array of Objects [ { col1: 'a', col2: 123 }, ... ]
        if (Array.isArray(json) && json.length > 0 && typeof json[0] === 'object') {
          setDetectedType('records_json');
          const keys = Array.from(
            new Set(json.flatMap((obj) => Object.keys(obj || {})))
          );
          const columns: TableColumn[] = keys.map((key, idx) => ({
            id: `col-${idx}-${key}`,
            name: key,
            type: typeof json[0][key] === 'number' ? 'number' : 'text',
            width: 160,
            isPrimaryKey: idx === 0,
          }));

          const rows: TableRow[] = json.map((item, rIdx) => {
            const rowData: Record<string, any> = {};
            columns.forEach((col) => {
              rowData[col.id] = item[col.name];
            });
            return {
              id: `row-json-${Date.now()}-${rIdx}`,
              data: rowData,
              createdAt: Date.now(),
              updatedAt: Date.now(),
            };
          });

          setPreviewColumns(columns);
          setPreviewRows(rows);
          setDetectedSummary(`JSON 레코드 배열 • ${columns.length}개 열, ${rows.length}개 행`);
          setCustomTableName(sourceName.replace(/\.[^/.]+$/, '') || '가져온 데이터');
          return;
        }
      } catch (err) {
        // Not JSON, continue to CSV/Delimited analysis
      }
    }

    // 2. Delimited Text / CSV / TSV / Markdown pipe table analysis
    try {
      const parsed = parseDelimitedText(trimmed, {
        forcedDelimiter: 'auto',
        hasHeader: hasHeader,
      });

      if (parsed.columns && parsed.columns.length > 0) {
        setDetectedType('delimited_text');
        setPreviewColumns(parsed.columns);
        setPreviewRows(parsed.rows);
        setDetectedSummary(
          `텍스트/표 데이터 감지됨 • ${parsed.columns.length}개 열, ${parsed.rows.length}개 행`
        );
        setCustomTableName(sourceName.replace(/\.[^/.]+$/, '') || '가져온 테이블');
        return;
      }
    } catch (err) {
      // ignore
    }

    setDetectedType('unknown');
    setErrorMessage('지원되는 형식(CSV, TSV, TXT, JSON, 엑셀 표)을 찾을 수 없습니다.');
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const processFile = (file: File) => {
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = (e.target?.result as string) || '';
      setRawText(content);
      analyzeContent(content, file.name);
    };
    reader.readAsText(file);
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setRawText(val);
    analyzeContent(val, '직접 입력한 데이터');
  };

  const executeImport = () => {
    if (detectedType === 'workspace_json' && parsedWorkspace) {
      if (onRestoreWorkspace) {
        onRestoreWorkspace(parsedWorkspace);
      }
      onClose();
      return;
    }

    if (detectedType === 'user_env_json' && parsedUserEnv) {
      if (onRestoreUserEnv) {
        onRestoreUserEnv(parsedUserEnv);
      }
      onClose();
      return;
    }

    if (previewColumns.length === 0 || previewRows.length === 0) {
      setErrorMessage('가져올 유효한 데이터가 없습니다.');
      return;
    }

    if (importTarget === 'append_current' && activeTable && onAppendRowsToCurrentTable) {
      // Map preview rows to current active table's columns by matching column names
      const mappedRows: TableRow[] = previewRows.map((pRow, idx) => {
        const newData: Record<string, any> = {};
        activeTable.columns.forEach((curCol) => {
          // Find matching preview column by name (case-insensitive)
          const matchedPCol = previewColumns.find(
            (pc) => pc.name.trim().toLowerCase() === curCol.name.trim().toLowerCase()
          );
          if (matchedPCol && pRow.data[matchedPCol.id] !== undefined) {
            newData[curCol.id] = pRow.data[matchedPCol.id];
          } else {
            // If positional fallback
            const colIndex = activeTable.columns.indexOf(curCol);
            const fallbackPCol = previewColumns[colIndex];
            if (fallbackPCol && pRow.data[fallbackPCol.id] !== undefined) {
              newData[curCol.id] = pRow.data[fallbackPCol.id];
            }
          }
        });

        return {
          id: `row-appended-${Date.now()}-${idx}`,
          data: newData,
          richContent: pRow.richContent,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
      });

      onAppendRowsToCurrentTable(mappedRows);
    } else {
      // Create new table
      const title = customTableName.trim() || '새 가져온 테이블';
      onImportNewTable(title, previewColumns, previewRows);
    }

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white dark:bg-[#1e1e1e] border border-stone-200 dark:border-[#333333] rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-stone-200 dark:border-[#2d2d2d] flex items-center justify-between bg-stone-50/70 dark:bg-[#252525]/80">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-400 text-stone-950 flex items-center justify-center shadow-xs font-bold text-base">
              🐝
            </div>
            <div>
              <h2 className="text-sm font-bold text-stone-900 dark:text-[#f0f0f0]">
                통합 파일 & 데이터 가져오기
              </h2>
              <p className="text-[11px] text-stone-500 dark:text-[#999999]">
                CSV, TXT, TSV, JSON, 엑셀 클립보드 등 무엇이든 던져주시면 자동으로 감지하여 완벽하게 처리합니다.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 dark:hover:text-[#ffffff] hover:bg-stone-200/60 dark:hover:bg-[#333333] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="px-6 pt-3 pb-1 border-b border-stone-200 dark:border-[#2d2d2d] flex items-center gap-2">
          <button
            onClick={() => setActiveTab('file')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
              activeTab === 'file'
                ? 'bg-amber-500 text-stone-950 shadow-xs'
                : 'text-stone-600 dark:text-[#aaaaaa] hover:bg-stone-100 dark:hover:bg-[#2a2a2a]'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            파일 드래그 또는 선택 (CSV, TXT, JSON)
          </button>
          <button
            onClick={() => setActiveTab('paste')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
              activeTab === 'paste'
                ? 'bg-amber-500 text-stone-950 shadow-xs'
                : 'text-stone-600 dark:text-[#aaaaaa] hover:bg-stone-100 dark:hover:bg-[#2a2a2a]'
            }`}
          >
            <ClipboardPaste className="w-3.5 h-3.5" />
            직접 붙여넣기 (텍스트 / 엑셀 복사본)
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {activeTab === 'file' ? (
            <div>
              {/* Dropzone */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleFileDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-2 ${
                  dragOver
                    ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/30 scale-[0.99]'
                    : 'border-stone-300 dark:border-[#404040] hover:border-amber-400 bg-stone-50/50 dark:bg-[#1a1a1a]/60'
                }`}
              >
                <div className="w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center mb-1">
                  <Upload className="w-6 h-6" />
                </div>
                <div className="text-xs font-bold text-stone-800 dark:text-[#f0f0f0]">
                  여기로 파일을 끌어다 놓거나 클릭하여 선택하세요
                </div>
                <div className="text-[11px] text-stone-400 dark:text-[#888888]">
                  지원 형식: <strong>.csv, .txt, .tsv, .json</strong> (user_data.json, user_env.json 포함)
                </div>
                {fileName && (
                  <div className="mt-2 px-3 py-1 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 text-xs font-semibold flex items-center gap-1.5">
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                    선택된 파일: {fileName}
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.txt,.tsv,.json"
                  className="hidden"
                  onChange={handleFileInputChange}
                />
              </div>
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-stone-700 dark:text-[#cccccc]">
                  데이터 직접 붙여넣기 (Ctrl+V)
                </label>
                <label className="flex items-center gap-1.5 text-xs text-stone-500 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hasHeader}
                    onChange={(e) => {
                      setHasHeader(e.target.checked);
                      if (rawText) analyzeContent(rawText, '직접 입력');
                    }}
                    className="rounded accent-amber-500"
                  />
                  <span>첫 행을 열 이름(Header)으로 사용</span>
                </label>
              </div>
              <textarea
                value={rawText}
                onChange={handleTextChange}
                rows={6}
                placeholder="엑셀에서 복사한 셀 데이터나 CSV/TSV/JSON 문자열을 그대로 붙여넣으세요..."
                className="w-full px-3 py-2 text-xs font-mono rounded-xl bg-stone-50 dark:bg-[#181818] border border-stone-200 dark:border-[#333333] text-stone-800 dark:text-[#f0f0f0] outline-none focus:border-amber-500 resize-none"
              />
            </div>
          )}

          {/* Detection Result Banner */}
          {detectedSummary && (
            <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 flex items-start gap-2.5">
              <Sparkles className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
              <div className="text-xs">
                <div className="font-bold text-amber-900 dark:text-amber-300">
                  자동 감지 성공: {detectedSummary}
                </div>
                <div className="text-[11px] text-amber-700/80 dark:text-amber-400/80 mt-0.5">
                  데이터 구조가 정상적으로 확인되었습니다. 아래에서 적용 옵션을 선택하세요.
                </div>
              </div>
            </div>
          )}

          {/* Error Banner */}
          {errorMessage && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 mt-0.5 flex-shrink-0" />
              <div className="text-xs text-rose-800 dark:text-rose-300 font-medium">
                {errorMessage}
              </div>
            </div>
          )}

          {/* Import Options (for tabular / delimited / record data) */}
          {(detectedType === 'delimited_text' ||
            detectedType === 'table_json' ||
            detectedType === 'records_json') && (
            <div className="space-y-3 pt-2 border-t border-stone-200 dark:border-[#2d2d2d]">
              <div className="text-xs font-bold text-stone-700 dark:text-[#dddddd]">
                적용 대상 선택
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label
                  onClick={() => setImportTarget('new_table')}
                  className={`p-3 rounded-xl border text-xs cursor-pointer transition-all flex items-center gap-2.5 ${
                    importTarget === 'new_table'
                      ? 'border-amber-500 bg-amber-50/70 dark:bg-amber-950/40 text-stone-900 dark:text-[#ffffff] font-bold'
                      : 'border-stone-200 dark:border-[#333333] hover:bg-stone-50 dark:hover:bg-[#252525] text-stone-600 dark:text-[#aaaaaa]'
                  }`}
                >
                  <Plus className="w-4 h-4 text-amber-500" />
                  <div>
                    <div>새 테이블로 생성</div>
                    <div className="text-[10px] opacity-70 font-normal">좌측 트리에 새 테이블이 추가됩니다</div>
                  </div>
                </label>

                <label
                  onClick={() => {
                    if (activeTable) setImportTarget('append_current');
                  }}
                  className={`p-3 rounded-xl border text-xs cursor-pointer transition-all flex items-center gap-2.5 ${
                    !activeTable ? 'opacity-40 cursor-not-allowed' : ''
                  } ${
                    importTarget === 'append_current'
                      ? 'border-amber-500 bg-amber-50/70 dark:bg-amber-950/40 text-stone-900 dark:text-[#ffffff] font-bold'
                      : 'border-stone-200 dark:border-[#333333] hover:bg-stone-50 dark:hover:bg-[#252525] text-stone-600 dark:text-[#aaaaaa]'
                  }`}
                >
                  <Rows className="w-4 h-4 text-blue-500" />
                  <div>
                    <div>현재 테이블에 행으로 추가</div>
                    <div className="text-[10px] opacity-70 font-normal">
                      {activeTable ? `'${activeTable.title}' 하단에 추가` : '선택된 테이블 없음'}
                    </div>
                  </div>
                </label>
              </div>

              {importTarget === 'new_table' && (
                <div>
                  <label className="text-xs font-semibold text-stone-600 dark:text-[#aaaaaa] block mb-1">
                    생성될 테이블 제목
                  </label>
                  <input
                    type="text"
                    value={customTableName}
                    onChange={(e) => setCustomTableName(e.target.value)}
                    placeholder="테이블 제목을 입력하세요"
                    className="w-full px-3 py-1.5 text-xs rounded-lg bg-stone-50 dark:bg-[#181818] border border-stone-200 dark:border-[#333333] text-stone-800 dark:text-[#f0f0f0] outline-none focus:border-amber-500"
                  />
                </div>
              )}

              {/* Data Preview Table */}
              {previewColumns.length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-stone-600 dark:text-[#aaaaaa] mb-1 flex items-center justify-between">
                    <span>데이터 미리보기 (상위 3개 행)</span>
                    <span className="text-[10px] text-stone-400">
                      총 {previewColumns.length}개 열 • {previewRows.length}개 행
                    </span>
                  </div>
                  <div className="border border-stone-200 dark:border-[#333333] rounded-lg overflow-x-auto max-h-32 text-xs">
                    <table className="w-full border-collapse">
                      <thead className="bg-stone-100 dark:bg-[#252525] sticky top-0">
                        <tr>
                          {previewColumns.map((col) => (
                            <th
                              key={col.id}
                              className="px-2.5 py-1 text-left font-bold text-stone-700 dark:text-[#dddddd] border-b border-stone-200 dark:border-[#333333] truncate max-w-[140px]"
                            >
                              {col.name}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-200 dark:divide-[#2d2d2d]">
                        {previewRows.slice(0, 3).map((row, idx) => (
                          <tr key={idx} className="hover:bg-stone-50 dark:hover:bg-[#222222]">
                            {previewColumns.map((col) => (
                              <td
                                key={col.id}
                                className="px-2.5 py-1 text-stone-600 dark:text-[#cccccc] truncate max-w-[140px]"
                              >
                                {String(row.data[col.id] ?? '')}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-stone-200 dark:border-[#2d2d2d] bg-stone-50/70 dark:bg-[#222222] flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs text-stone-600 dark:text-[#aaaaaa] hover:bg-stone-200/60 dark:hover:bg-[#333333] rounded-lg transition-colors font-medium"
          >
            취소
          </button>
          <button
            onClick={executeImport}
            disabled={detectedType === 'unknown'}
            className="px-5 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-stone-950 font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-sm transition-all"
          >
            <CheckCircle className="w-4 h-4" />
            <span>가져오기 완료</span>
          </button>
        </div>
      </div>
    </div>
  );
};
