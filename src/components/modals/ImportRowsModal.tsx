import React, { useState, useEffect, useRef } from 'react';
import { TableColumn, TableRow, ColumnType } from '../../types';
import { parseDelimitedText } from '../../utils/csvParser';
import { cleanTextValue } from '../../utils/textSanitizer';
import {
  Upload,
  FileSpreadsheet,
  FileText,
  ClipboardPaste,
  Check,
  AlertCircle,
  X,
  Plus,
  ArrowRight,
  RefreshCw,
  Layers,
  Sparkles,
  HelpCircle,
} from 'lucide-react';

interface ImportRowsModalProps {
  isOpen: boolean;
  onClose: () => void;
  tableName: string;
  existingColumns: TableColumn[];
  onImportRows: (
    newRows: TableRow[],
    updatedColumns?: TableColumn[],
    position?: 'bottom' | 'top' | 'replace'
  ) => void;
}

export const ImportRowsModal: React.FC<ImportRowsModalProps> = ({
  isOpen,
  onClose,
  tableName,
  existingColumns,
  onImportRows,
}) => {
  const [activeTab, setActiveTab] = useState<'file' | 'text'>('file');
  const [rawText, setRawText] = useState<string>('');
  const [loadedFileName, setLoadedFileName] = useState<string | null>(null);
  const [delimiter, setDelimiter] = useState<'auto' | 'tab' | 'comma' | 'pipe' | 'semicolon' | 'space'>('auto');
  const [hasHeader, setHasHeader] = useState(true);
  const [insertPosition, setInsertPosition] = useState<'bottom' | 'top' | 'replace'>('bottom');
  
  // Parsed results
  const [parsedFileCols, setParsedFileCols] = useState<TableColumn[]>([]);
  const [parsedRawRows, setParsedRawRows] = useState<TableRow[]>([]);
  const [detectedDelimiterName, setDetectedDelimiterName] = useState<string>('자동 감지');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Column mapping: fileColId -> existingColId | '__NEW__' | '__IGNORE__'
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // Reset state when opened
  useEffect(() => {
    if (isOpen) {
      setErrorMsg(null);
    }
  }, [isOpen]);

  // Parse rawText whenever it changes or delimiter/header settings change
  useEffect(() => {
    if (!rawText.trim()) {
      setParsedFileCols([]);
      setParsedRawRows([]);
      setColumnMapping({});
      setDetectedDelimiterName('자동 감지');
      return;
    }

    try {
      const result = parseDelimitedText(rawText, {
        forcedDelimiter: delimiter,
        hasHeader,
      });

      setDetectedDelimiterName(result.delimiterName);
      setParsedFileCols(result.columns);
      setParsedRawRows(result.rows);
      setErrorMsg(null);

      // Auto Map Columns: Match by exact or normalized name, or fallback by index
      const newMapping: Record<string, string> = {};
      result.columns.forEach((fCol, idx) => {
        const fNameClean = fCol.name.trim().toLowerCase().replace(/\s+/g, '');
        
        // 1. Exact or cleaned name match
        const exactMatch = existingColumns.find(
          (eCol) => eCol.name.trim().toLowerCase().replace(/\s+/g, '') === fNameClean
        );

        if (exactMatch) {
          newMapping[fCol.id] = exactMatch.id;
        } else if (idx < existingColumns.length) {
          // 2. Index-based match
          newMapping[fCol.id] = existingColumns[idx].id;
        } else {
          // 3. New Column fallback
          newMapping[fCol.id] = '__NEW__';
        }
      });

      setColumnMapping(newMapping);
    } catch (err: any) {
      setErrorMsg(err.message || '파일 파싱 중 오류가 발생했습니다.');
    }
  }, [rawText, delimiter, hasHeader, existingColumns]);

  if (!isOpen) return null;

  // File loading helper
  const processFile = (file: File) => {
    setErrorMsg(null);
    setLoadedFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      setRawText(content || '');
    };
    reader.onerror = () => {
      setErrorMsg('파일을 읽는 도중 오류가 발생했습니다.');
    };
    reader.readAsText(file);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handlePasteClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setRawText(text);
        setLoadedFileName('클립보드 붙여넣기');
      }
    } catch (err) {
      setErrorMsg('클립보드 읽기 권한이 없습니다. 텍스트 영역에 직접 Ctrl+V로 붙여넣어주세요.');
    }
  };

  // Sample data loading
  const handleLoadSample = (type: 'csv' | 'txt') => {
    if (type === 'csv') {
      const sampleCsv = `담당자,업무내용,진행상태,마감일
홍길동,신규 프로젝트 기획안 검토,진행중,2026-09-10
이순신,서버 클러스터 부하 테스트,완료,2026-09-02
강감찬,사용자 인터페이스 반응형 QA,대기,2026-09-15`;
      setRawText(sampleCsv);
      setLoadedFileName('샘플_업무목록.csv');
    } else {
      const sampleTxt = `담당자\t업무내용\t진행상태\t마감일
원비\t텍스트/CSV 행 가져오기 기능 개발\t완료됨\t2026-08-31
디자인\t모던 팝업 디테일러 다크모드 개선\t검토중\t2026-09-05`;
      setRawText(sampleTxt);
      setLoadedFileName('샘플_메모목록.txt');
    }
  };

  // Execute Import
  const handleExecuteImport = () => {
    if (parsedRawRows.length === 0) {
      setErrorMsg('가져올 행 데이터가 없습니다.');
      return;
    }

    // 1. Identify which file columns become brand new columns in the table
    const newColumnsToAdd: TableColumn[] = [];
    const mappingEntries = Object.entries(columnMapping);

    mappingEntries.forEach(([fileColId, targetChoice]) => {
      if (targetChoice === '__NEW__') {
        const fileCol = parsedFileCols.find((c) => c.id === fileColId);
        if (fileCol) {
          const newColId = `col-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
          newColumnsToAdd.push({
            id: newColId,
            name: fileCol.name,
            type: fileCol.type || 'text',
            width: 180,
            options: fileCol.options,
          });
        }
      }
    });

    const updatedColumns = newColumnsToAdd.length > 0 ? [...existingColumns, ...newColumnsToAdd] : undefined;

    // 2. Build mapped TableRow array
    const now = Date.now();
    const finalRows: TableRow[] = parsedRawRows.map((rawRow, rIdx) => {
      const rowData: Record<string, any> = {};

      // Map values
      parsedFileCols.forEach((fileCol, fIdx) => {
        const targetChoice = columnMapping[fileCol.id];
        if (!targetChoice || targetChoice === '__IGNORE__') {
          return;
        }

        let targetColId = targetChoice;
        if (targetChoice === '__NEW__') {
          const foundNew = newColumnsToAdd.find((c) => c.name === fileCol.name);
          if (foundNew) {
            targetColId = foundNew.id;
          }
        }

        const rawVal = rawRow.data[fileCol.id];
        if (rawVal !== undefined && rawVal !== null) {
          rowData[targetColId] = cleanTextValue(rawVal);
        }
      });

      return {
        id: `row-imp-${now.toString(36)}-${rIdx}-${Math.random().toString(36).slice(2, 6)}`,
        data: rowData,
        createdAt: now - (parsedRawRows.length - rIdx) * 100,
        updatedAt: now,
      };
    });

    onImportRows(finalRows, updatedColumns, insertPosition);
    onClose();
  };

  return (
    <div
      id="import-rows-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        id="import-rows-modal-container"
        className="bg-white dark:bg-[#1e1e1e] rounded-2xl shadow-2xl border border-stone-200 dark:border-[#383838] w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-150 text-xs"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-200 dark:border-[#333333] bg-stone-50/80 dark:bg-[#252525]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 dark:bg-emerald-400/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
              <Upload className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">
                  {tableName}
                </span>
                <span className="text-[10px] bg-stone-200 dark:bg-[#333333] text-stone-600 dark:text-[#aaaaaa] px-1.5 py-0.5 rounded font-mono">
                  행 데이터 가져오기 (Import)
                </span>
              </div>
              <h2 className="text-base font-bold text-stone-900 dark:text-[#f5f5f5]">
                CSV / TXT 파일에서 행 가져오기
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-400 hover:text-stone-600 dark:hover:text-[#ffffff] hover:bg-stone-200/60 dark:hover:bg-[#333333] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1 custom-scrollbar">
          {/* Error Message */}
          {errorMsg && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl text-rose-700 dark:text-rose-300 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Mode Tabs */}
          <div className="flex items-center justify-between gap-2 border-b border-stone-200 dark:border-[#333333] pb-2">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setActiveTab('file')}
                className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition-colors ${
                  activeTab === 'file'
                    ? 'bg-emerald-500 text-stone-950'
                    : 'text-stone-600 dark:text-[#aaaaaa] hover:bg-stone-100 dark:hover:bg-[#2e2e2e]'
                }`}
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>CSV / TXT 파일 업로드</span>
              </button>
              <button
                onClick={() => setActiveTab('text')}
                className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition-colors ${
                  activeTab === 'text'
                    ? 'bg-emerald-500 text-stone-950'
                    : 'text-stone-600 dark:text-[#aaaaaa] hover:bg-stone-100 dark:hover:bg-[#2e2e2e]'
                }`}
              >
                <ClipboardPaste className="w-3.5 h-3.5" />
                <span>텍스트 직접 붙여넣기</span>
              </button>
            </div>

            {/* Quick Sample Buttons */}
            <div className="flex items-center gap-1.5 text-[11px]">
              <span className="text-stone-400">샘플:</span>
              <button
                onClick={() => handleLoadSample('csv')}
                className="px-2 py-1 bg-stone-100 dark:bg-[#2e2e2e] hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-stone-700 dark:text-[#cccccc] hover:text-emerald-600 rounded border border-stone-200 dark:border-[#3a3a3a] transition-colors"
              >
                CSV 샘플
              </button>
              <button
                onClick={() => handleLoadSample('txt')}
                className="px-2 py-1 bg-stone-100 dark:bg-[#2e2e2e] hover:bg-blue-50 dark:hover:bg-blue-950/40 text-stone-700 dark:text-[#cccccc] hover:text-blue-600 rounded border border-stone-200 dark:border-[#3a3a3a] transition-colors"
              >
                TXT 샘플
              </button>
            </div>
          </div>

          {/* 1. File Upload Drop Zone */}
          {activeTab === 'file' && (
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`p-6 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
                isDragOver
                  ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20'
                  : rawText
                  ? 'border-emerald-400/80 bg-stone-50/60 dark:bg-[#252525]/60'
                  : 'border-stone-300 dark:border-[#444444] hover:border-emerald-500 bg-stone-50/30 dark:bg-[#202020]'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.txt,.tsv,.tab,.prn,.dat"
                onChange={handleFileInputChange}
                className="hidden"
              />
              <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 dark:bg-emerald-400/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-2">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <div className="font-semibold text-stone-800 dark:text-[#eeeeee]">
                {loadedFileName ? (
                  <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 justify-center">
                    <Check className="w-4 h-4" />
                    선택된 파일: {loadedFileName} ({parsedRawRows.length}개 행 감지됨)
                  </span>
                ) : (
                  'CSV 또는 TXT 파일을 여기로 드래그하거나 클릭하여 선택'
                )}
              </div>
              <p className="text-[11px] text-stone-500 dark:text-[#888888] mt-1">
                지원 형식: .csv, .txt, .tsv (엑셀, 구글 시트, 메모장 데이터)
              </p>
            </div>
          )}

          {/* 2. Direct Text Paste Area */}
          {activeTab === 'text' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="font-semibold text-stone-700 dark:text-[#cccccc]">
                  복사한 CSV / 탭(Tab) 구분 텍스트 붙여넣기
                </label>
                <button
                  type="button"
                  onClick={handlePasteClipboard}
                  className="px-2.5 py-1 bg-stone-100 dark:bg-[#282828] hover:bg-stone-200 dark:hover:bg-[#333333] text-stone-700 dark:text-[#cccccc] rounded-lg font-medium flex items-center gap-1.5 transition-colors border border-stone-200 dark:border-[#383838]"
                >
                  <ClipboardPaste className="w-3.5 h-3.5 text-emerald-500" />
                  <span>클립보드에서 붙여넣기</span>
                </button>
              </div>
              <textarea
                value={rawText}
                onChange={(e) => {
                  setRawText(e.target.value);
                  setLoadedFileName('직접 입력한 텍스트');
                }}
                rows={5}
                placeholder="엑셀이나 메모장에서 복사한 표/텍스트를 여기에 붙여넣으세요 (Ctrl+V)..."
                className="w-full p-3 font-mono text-[11px] bg-white dark:bg-[#242424] border border-stone-200 dark:border-[#383838] rounded-xl outline-none focus:border-emerald-500 custom-scrollbar text-stone-800 dark:text-[#e0e0e0]"
              />
            </div>
          )}

          {/* 3. Parsing & Delimiter Options */}
          {rawText.trim() && (
            <div className="p-3 bg-stone-50 dark:bg-[#252525] rounded-xl border border-stone-200 dark:border-[#333333] space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2 text-xs font-semibold text-stone-700 dark:text-[#dddddd]">
                <span>구분자 및 가져오기 옵션</span>
                <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-mono">
                  감지됨: {detectedDelimiterName} (총 {parsedRawRows.length}개 행)
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Delimiter Selection */}
                <div>
                  <label className="block text-[11px] text-stone-500 dark:text-[#999999] mb-1">
                    구분 기호 (Delimiter)
                  </label>
                  <select
                    value={delimiter}
                    onChange={(e: any) => setDelimiter(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white dark:bg-[#1a1a1a] border border-stone-200 dark:border-[#3a3a3a] rounded-lg text-xs outline-none focus:border-emerald-500 text-stone-800 dark:text-[#e0e0e0]"
                  >
                    <option value="auto">자동 감지 (Auto)</option>
                    <option value="comma">쉼표 (, CSV)</option>
                    <option value="tab">탭 (\t TSV / 엑셀)</option>
                    <option value="pipe">파이프 (| 마크다운)</option>
                    <option value="semicolon">세미콜론 (;)</option>
                    <option value="space">공백 (Space)</option>
                  </select>
                </div>

                {/* Has Header Checkbox */}
                <div className="flex items-center mt-4">
                  <label className="flex items-center gap-2 cursor-pointer select-none text-stone-700 dark:text-[#cccccc]">
                    <input
                      type="checkbox"
                      checked={hasHeader}
                      onChange={(e) => setHasHeader(e.target.checked)}
                      className="rounded border-stone-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    <span>첫 줄을 열 이름으로 사용</span>
                  </label>
                </div>

                {/* Insert Position */}
                <div>
                  <label className="block text-[11px] text-stone-500 dark:text-[#999999] mb-1">
                    행 추가 위치
                  </label>
                  <select
                    value={insertPosition}
                    onChange={(e: any) => setInsertPosition(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white dark:bg-[#1a1a1a] border border-stone-200 dark:border-[#3a3a3a] rounded-lg text-xs outline-none focus:border-emerald-500 text-stone-800 dark:text-[#e0e0e0]"
                  >
                    <option value="bottom">기존 데이터 맨 아래에 추가</option>
                    <option value="top">기존 데이터 맨 위에 추가</option>
                    <option value="replace">기존 행을 모두 지우고 교체</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* 4. Column Mapping Matrix */}
          {parsedFileCols.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-stone-800 dark:text-[#eeeeee] flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-amber-500" />
                  <span>열(Column) 매핑 설정</span>
                  <span className="text-[10px] text-stone-400 font-normal">
                    (파일의 열을 기존 테이블의 열과 연결합니다)
                  </span>
                </h3>
              </div>

              <div className="border border-stone-200 dark:border-[#333333] rounded-xl overflow-hidden bg-white dark:bg-[#202020]">
                <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-stone-100/70 dark:bg-[#282828] font-bold text-stone-600 dark:text-[#aaaaaa] text-[11px] border-b border-stone-200 dark:border-[#333333]">
                  <div className="col-span-5">파일/텍스트 열</div>
                  <div className="col-span-2 text-center">연결</div>
                  <div className="col-span-5">테이블 대상 열</div>
                </div>

                <div className="divide-y divide-stone-100 dark:divide-[#2e2e2e] max-h-48 overflow-y-auto custom-scrollbar">
                  {parsedFileCols.map((fCol, idx) => {
                    const mappedTarget = columnMapping[fCol.id] || '__NEW__';
                    const sampleVal = parsedRawRows[0]?.data[fCol.id] || '(값 없음)';

                    return (
                      <div
                        key={fCol.id}
                        className="grid grid-cols-12 gap-2 px-3 py-2 items-center hover:bg-stone-50 dark:hover:bg-[#262626] transition-colors"
                      >
                        {/* File Column */}
                        <div className="col-span-5">
                          <div className="font-semibold text-stone-800 dark:text-[#eeeeee] truncate">
                            {fCol.name}
                          </div>
                          <div className="text-[10px] text-stone-400 truncate">
                            샘플: {String(sampleVal)}
                          </div>
                        </div>

                        {/* Arrow */}
                        <div className="col-span-2 flex justify-center text-stone-400">
                          <ArrowRight className="w-3.5 h-3.5" />
                        </div>

                        {/* Target Selection */}
                        <div className="col-span-5">
                          <select
                            value={mappedTarget}
                            onChange={(e) => {
                              const val = e.target.value;
                              setColumnMapping((prev) => ({
                                ...prev,
                                [fCol.id]: val,
                              }));
                            }}
                            className={`w-full px-2 py-1 rounded-lg border text-xs outline-none ${
                              mappedTarget === '__IGNORE__'
                                ? 'bg-stone-100 dark:bg-[#1a1a1a] text-stone-400 border-stone-200 dark:border-[#333333]'
                                : mappedTarget === '__NEW__'
                                ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800 font-semibold'
                                : 'bg-white dark:bg-[#1a1a1a] text-stone-800 dark:text-[#f0f0f0] border-stone-200 dark:border-[#3a3a3a] font-medium'
                            }`}
                          >
                            <optgroup label="기존 테이블 열 매핑">
                              {existingColumns.map((eCol) => (
                                <option key={eCol.id} value={eCol.id}>
                                  {eCol.name} ({eCol.type})
                                </option>
                              ))}
                            </optgroup>
                            <optgroup label="특수 옵션">
                              <option value="__NEW__">✨ 새 열로 테이블에 추가</option>
                              <option value="__IGNORE__">❌ 가져오기 제외 (건너뛰기)</option>
                            </optgroup>
                          </select>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* 5. Live Data Preview (First 4 rows) */}
          {parsedRawRows.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-stone-800 dark:text-[#eeeeee]">
                  미리보기 ({Math.min(parsedRawRows.length, 5)} / {parsedRawRows.length}개 행)
                </span>
                <span className="text-[11px] text-stone-500">
                  {insertPosition === 'replace'
                    ? '⚠️ 기존 데이터가 모두 교체됩니다.'
                    : insertPosition === 'top'
                    ? '맨 위에 삽입됩니다.'
                    : '맨 아래에 덧붙여집니다.'}
                </span>
              </div>

              <div className="border border-stone-200 dark:border-[#333333] rounded-xl overflow-x-auto custom-scrollbar max-h-40">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-stone-100/80 dark:bg-[#252525] border-b border-stone-200 dark:border-[#333333] text-[11px]">
                      <th className="px-3 py-1.5 text-stone-400 font-normal w-10">#</th>
                      {parsedFileCols
                        .filter((c) => columnMapping[c.id] !== '__IGNORE__')
                        .map((c) => (
                          <th key={c.id} className="px-3 py-1.5 font-bold text-stone-700 dark:text-[#dddddd]">
                            {c.name}
                          </th>
                        ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100 dark:divide-[#2d2d2d] font-mono text-[11px]">
                    {parsedRawRows.slice(0, 5).map((row, rIdx) => (
                      <tr key={row.id} className="hover:bg-stone-50 dark:hover:bg-[#222222]">
                        <td className="px-3 py-1 text-stone-400">{rIdx + 1}</td>
                        {parsedFileCols
                          .filter((c) => columnMapping[c.id] !== '__IGNORE__')
                          .map((c) => (
                            <td key={c.id} className="px-3 py-1 text-stone-700 dark:text-[#cccccc] truncate max-w-[200px]">
                              {String(row.data[c.id] || '')}
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

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-6 py-3.5 border-t border-stone-200 dark:border-[#333333] bg-stone-50/80 dark:bg-[#222222]">
          <div className="text-stone-500 dark:text-[#888888] text-[11px]">
            {parsedRawRows.length > 0 ? (
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                총 {parsedRawRows.length}개 행을 {tableName}에 추가할 준비가 되었습니다.
              </span>
            ) : (
              '파일을 업로드하거나 텍스트를 입력해주세요.'
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-stone-100 dark:bg-[#2e2e2e] hover:bg-stone-200 dark:hover:bg-[#3a3a3a] text-stone-700 dark:text-[#cccccc] font-medium rounded-xl transition-colors"
            >
              취소
            </button>
            <button
              type="button"
              disabled={parsedRawRows.length === 0}
              onClick={handleExecuteImport}
              className={`px-5 py-2 rounded-xl font-bold flex items-center gap-2 transition-all shadow-sm ${
                parsedRawRows.length > 0
                  ? 'bg-emerald-500 hover:bg-emerald-400 text-stone-950 active:scale-98'
                  : 'bg-stone-300 dark:bg-[#333333] text-stone-500 cursor-not-allowed'
              }`}
            >
              <Check className="w-4 h-4" />
              <span>{parsedRawRows.length}개 행 가져오기 실행</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
