import React, { useState, useEffect } from 'react';
import { TableColumn, TableRow } from '../../types';
import {
  FileText,
  ClipboardPaste,
  Sparkles,
  Check,
  AlertCircle,
  X,
  Table as TableIcon,
} from 'lucide-react';

interface TextPasteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportNewTable: (tableName: string, columns: TableColumn[], rows: TableRow[]) => void;
  defaultTableName?: string;
}

export const TextPasteModal: React.FC<TextPasteModalProps> = ({
  isOpen,
  onClose,
  onImportNewTable,
  defaultTableName = '텍스트 붙여넣기 테이블',
}) => {
  const [pastedText, setPastedText] = useState('');
  const [tableName, setTableName] = useState(defaultTableName);
  const [delimiter, setDelimiter] = useState<'auto' | 'tab' | 'comma' | 'pipe' | 'space'>('auto');
  const [hasHeader, setHasHeader] = useState(true);
  const [previewColumns, setPreviewColumns] = useState<TableColumn[]>([]);
  const [previewRows, setPreviewRows] = useState<TableRow[]>([]);
  const [detectedDelimiterName, setDetectedDelimiterName] = useState<string>('자동 감지');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setTableName(defaultTableName);
    }
  }, [isOpen, defaultTableName]);

  // Parse whenever pastedText, delimiter, or hasHeader changes
  useEffect(() => {
    if (!pastedText.trim()) {
      setPreviewColumns([]);
      setPreviewRows([]);
      setErrorMsg(null);
      return;
    }

    try {
      const lines = pastedText
        .split(/\r\n|\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0);

      if (lines.length === 0) {
        setPreviewColumns([]);
        setPreviewRows([]);
        return;
      }

      // Determine delimiter
      let activeDelimiter = '\t';
      let delName = '탭(Tab) 구분자';

      if (delimiter === 'auto') {
        const firstFewLines = lines.slice(0, 5).join('\n');
        const tabCount = (firstFewLines.match(/\t/g) || []).length;
        const commaCount = (firstFewLines.match(/,/g) || []).length;
        const pipeCount = (firstFewLines.match(/\|/g) || []).length;

        if (tabCount >= commaCount && tabCount >= pipeCount && tabCount > 0) {
          activeDelimiter = '\t';
          delName = '탭(Tab - 엑셀/노션 복사)';
        } else if (commaCount >= pipeCount && commaCount > 0) {
          activeDelimiter = ',';
          delName = '쉼표(CSV Comma)';
        } else if (pipeCount > 0) {
          activeDelimiter = '|';
          delName = '파이프(Markdown |)';
        } else {
          activeDelimiter = '\t';
          delName = '공백/기본 탭';
        }
      } else if (delimiter === 'tab') {
        activeDelimiter = '\t';
        delName = '탭(Tab)';
      } else if (delimiter === 'comma') {
        activeDelimiter = ',';
        delName = '쉼표(Comma)';
      } else if (delimiter === 'pipe') {
        activeDelimiter = '|';
        delName = '파이프(|)';
      } else if (delimiter === 'space') {
        activeDelimiter = ' ';
        delName = '공백(Space)';
      }

      setDetectedDelimiterName(delName);

      // Parse lines with delimiter & quotes support
      const parseLine = (line: string): string[] => {
        if (activeDelimiter === '|') {
          // Markdown table format cleanup: | Col1 | Col2 |
          const trimmed = line.replace(/^\||\|$/g, '');
          return trimmed.split('|').map((s) => s.trim());
        }

        if (activeDelimiter === ' ') {
          return line.split(/\s+/).filter(Boolean);
        }

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
          } else if (char === activeDelimiter && !insideQuote) {
            result.push(current.trim());
            current = '';
          } else {
            current += char;
          }
        }
        result.push(current.trim());
        return result;
      };

      // Filter out markdown divider rows like |---|---|
      const validLines = lines.filter((l) => !l.match(/^\|?(\s*:?-+:?\s*\|?)+$/));
      if (validLines.length === 0) return;

      let headers: string[] = [];
      let dataLines: string[] = [];

      if (hasHeader) {
        headers = parseLine(validLines[0]);
        dataLines = validLines.slice(1);
      } else {
        const firstTokenCount = parseLine(validLines[0]).length;
        headers = Array.from({ length: firstTokenCount }, (_, i) => `열 ${i + 1}`);
        dataLines = validLines;
      }

      // Max column count among all lines
      let maxCols = headers.length;
      dataLines.forEach((l) => {
        const cnt = parseLine(l).length;
        if (cnt > maxCols) maxCols = cnt;
      });

      // Fill in headers if some lines have more columns
      while (headers.length < maxCols) {
        headers.push(`열 ${headers.length + 1}`);
      }

      const cols: TableColumn[] = headers.map((name, idx) => ({
        id: `col-${idx}-${Date.now().toString(36)}`,
        name: name.replace(/^["']|["']$/g, '').trim() || `열 ${idx + 1}`,
        type: idx === 0 ? 'text' : idx === 1 ? 'status' : 'text',
        width: idx === 0 ? 200 : 160,
        isPrimaryKey: idx === 0,
      }));

      const rows: TableRow[] = dataLines.map((line, rIdx) => {
        const cells = parseLine(line);
        const data: Record<string, any> = {};
        cols.forEach((col, cIdx) => {
          data[col.id] = cells[cIdx] ? cells[cIdx].replace(/^["']|["']$/g, '').trim() : '';
        });
        return {
          id: `row-paste-${rIdx}-${Date.now().toString(36)}`,
          data,
          richContent: '',
          stickers: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
      });

      setPreviewColumns(cols);
      setPreviewRows(rows);
      setErrorMsg(null);
    } catch (err: any) {
      setErrorMsg(err.message || '텍스트 파싱 중 오류가 발생했습니다.');
    }
  }, [pastedText, delimiter, hasHeader]);

  // Clipboard read action from button
  const handlePasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setPastedText(text);
      }
    } catch (err) {
      setErrorMsg('클립보드 접근 권한이 없거나 브라우저에서 차단되었습니다. 텍스트 영역에 직접 Ctrl+V로 붙여넣어주세요.');
    }
  };

  // Execute Table Creation
  const handleCreateTable = () => {
    if (previewColumns.length === 0) {
      setErrorMsg('생성할 데이터 컬럼이 없습니다. 텍스트를 입력해주세요.');
      return;
    }
    const finalName = tableName.trim() || '텍스트 가져온 테이블';
    onImportNewTable(finalName, previewColumns, previewRows);
    onClose();
    setPastedText('');
  };

  // Sample data insertion
  const handleLoadSample = () => {
    const sample = `프로젝트명\t담당자\t진행상태\t마감일\t메모
WonBee 미니멀 워크스페이스\t원비🐝\t진행중\t2026-09-01\t싱글 HTML 빌드 완성
텍스트 붙여넣기 기능\t개발팀\t완료됨\t2026-08-30\t엑셀/노션/메모장 텍스트 즉시 테이블화
OneNote 스티커 메모\t디자인팀\t검토중\t2026-09-05\t포스트잇 드래그 앤 드롭 지원`;
    setPastedText(sample);
    setTableName('🐝 꿀벌 프로젝트 텍스트 데이터');
  };

  if (!isOpen) return null;

  return (
    <div
      id="text-paste-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/60 backdrop-blur-sm animate-in fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-[#1f1f1f] rounded-2xl shadow-2xl border border-stone-200 dark:border-[#383838] w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-200 dark:border-[#333333] bg-stone-50/50 dark:bg-[#1a1a1a]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-purple-500/20 text-purple-600 dark:text-purple-400 flex items-center justify-center font-bold">
              <ClipboardPaste className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-stone-900 dark:text-[#f0f0f0]">
                텍스트 붙여넣기로 테이블 생성
              </h2>
              <p className="text-xs text-stone-500 dark:text-[#999999]">
                엑셀, 구글 시트, 노션, 메모장(TXT), TSV, 마크다운 표 등 복사한 텍스트를 바로 표로 변환합니다.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-stone-400 hover:text-stone-600 dark:hover:text-[#ffffff]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-4 overflow-y-auto flex-1 text-xs">
          {/* Table Name & Sample Button */}
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex-1 min-w-[240px]">
              <label className="block text-xs font-semibold text-stone-700 dark:text-[#cccccc] mb-1">
                생성될 테이블 이름
              </label>
              <input
                type="text"
                value={tableName}
                onChange={(e) => setTableName(e.target.value)}
                placeholder="예: 2026 프로젝트 데이터"
                className="w-full px-3 py-2 bg-white dark:bg-[#282828] border border-stone-200 dark:border-[#3a3a3a] rounded-lg text-xs text-stone-800 dark:text-[#f0f0f0] outline-none focus:border-amber-500"
              />
            </div>
            <div className="flex items-end gap-2">
              <button
                type="button"
                onClick={handlePasteFromClipboard}
                className="px-3 py-2 bg-purple-600 hover:bg-purple-500 text-white font-semibold rounded-lg flex items-center gap-1.5 shadow-2xs transition-colors"
                title="클립보드 내용 바로 붙여넣기"
              >
                <ClipboardPaste className="w-3.5 h-3.5" />
                클립보드 붙여넣기
              </button>
              <button
                type="button"
                onClick={handleLoadSample}
                className="px-3 py-2 bg-stone-100 dark:bg-[#2a2a2a] hover:bg-stone-200 dark:hover:bg-[#333333] text-stone-700 dark:text-[#dddddd] font-medium rounded-lg flex items-center gap-1.5 transition-colors border border-stone-200 dark:border-[#383838]"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                예제 텍스트 넣기
              </button>
            </div>
          </div>

          {/* Text Area */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-stone-700 dark:text-[#cccccc] flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-amber-500" />
                텍스트 내용 (붙여넣기)
              </label>
              {detectedDelimiterName && pastedText && (
                <span className="text-[11px] font-mono text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/40 px-2 py-0.5 rounded-md border border-purple-200 dark:border-purple-900/60">
                  {detectedDelimiterName}
                </span>
              )}
            </div>
            <textarea
              value={pastedText}
              onChange={(e) => setPastedText(e.target.value)}
              placeholder="여기에 복사한 텍스트를 붙여넣으세요 (Ctrl+V)&#10;예시:&#10;항목명&#9;카테고리&#9;상태&#10;원비 앱&#9;프로젝트&#9;완료됨&#10;스티커 에디터&#9;위젯&#9;진행중"
              rows={6}
              className="w-full bg-white dark:bg-[#181818] border border-stone-200 dark:border-[#383838] rounded-xl p-3 font-mono text-[11px] text-stone-800 dark:text-[#e0e0e0] outline-none focus:border-purple-500 leading-relaxed resize-none shadow-inner"
            />
          </div>

          {/* Parsing Options */}
          <div className="flex items-center justify-between gap-4 p-3 bg-stone-50 dark:bg-[#252525] rounded-xl border border-stone-200/80 dark:border-[#383838] flex-wrap">
            {/* Delimiter Selection */}
            <div className="flex items-center gap-2">
              <span className="font-semibold text-stone-700 dark:text-[#cccccc]">구분 기호:</span>
              <select
                value={delimiter}
                onChange={(e) => setDelimiter(e.target.value as any)}
                className="px-2.5 py-1 bg-white dark:bg-[#1c1c1c] border border-stone-200 dark:border-[#3e3e3e] rounded-lg text-xs text-stone-800 dark:text-[#e0e0e0] outline-none focus:border-amber-500"
              >
                <option value="auto">자동 감지 (Auto)</option>
                <option value="tab">탭 (Tab - 엑셀/노션)</option>
                <option value="comma">쉼표 (Comma - CSV)</option>
                <option value="pipe">파이프 (| - 마크다운)</option>
                <option value="space">공백 (Space)</option>
              </select>
            </div>

            {/* Header Checkbox */}
            <label className="flex items-center gap-2 cursor-pointer select-none text-stone-700 dark:text-[#cccccc]">
              <input
                type="checkbox"
                checked={hasHeader}
                onChange={(e) => setHasHeader(e.target.checked)}
                className="accent-purple-500 rounded"
              />
              <span className="font-medium">첫 번째 줄을 열(Column) 이름으로 사용</span>
            </label>
          </div>

          {/* Error Message */}
          {errorMsg && (
            <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-600 dark:text-rose-400 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Table Preview */}
          {previewColumns.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs font-semibold text-stone-800 dark:text-[#dddddd]">
                <span className="flex items-center gap-1.5">
                  <TableIcon className="w-3.5 h-3.5 text-emerald-500" />
                  미리보기 ({previewColumns.length}개 열 / {previewRows.length}개 행)
                </span>
                <span className="text-[11px] text-stone-400">
                  생성 시 새로운 데이터 테이블로 등록됩니다.
                </span>
              </div>

              <div className="border border-stone-200 dark:border-[#383838] rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                <table className="w-full text-left border-collapse text-[11px]">
                  <thead className="bg-stone-100 dark:bg-[#282828] text-stone-700 dark:text-[#cccccc] sticky top-0 font-semibold border-b border-stone-200 dark:border-[#383838]">
                    <tr>
                      <th className="p-2 w-10 text-center text-stone-400">#</th>
                      {previewColumns.map((col) => (
                        <th key={col.id} className="p-2 truncate max-w-[150px] border-r border-stone-200 dark:border-[#333333] last:border-r-0">
                          {col.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100 dark:divide-[#2e2e2e] bg-white dark:bg-[#1b1b1b] text-stone-800 dark:text-[#cccccc]">
                    {previewRows.slice(0, 10).map((row, idx) => (
                      <tr key={row.id} className="hover:bg-stone-50 dark:hover:bg-[#242424]">
                        <td className="p-2 text-center text-stone-400 font-mono text-[10px]">{idx + 1}</td>
                        {previewColumns.map((col) => (
                          <td key={col.id} className="p-2 truncate max-w-[150px] border-r border-stone-100 dark:border-[#2a2a2a] last:border-r-0 font-sans">
                            {row.data[col.id] || '-'}
                          </td>
                        ))}
                      </tr>
                    ))}
                    {previewRows.length > 10 && (
                      <tr>
                        <td colSpan={previewColumns.length + 1} className="p-2 text-center text-stone-400 bg-stone-50 dark:bg-[#202020] text-[10px]">
                          ... 외 {previewRows.length - 10}개 행 더 있음
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-stone-200 dark:border-[#333333] bg-stone-50/50 dark:bg-[#1a1a1a] flex items-center justify-between">
          <div className="text-[11px] text-stone-500 dark:text-[#888888]">
            {previewRows.length > 0 ? `총 ${previewRows.length}개의 데이터 행이 추가됩니다.` : '텍스트를 붙여넣으면 미리보기가 표시됩니다.'}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3.5 py-1.5 bg-stone-200 dark:bg-[#2e2e2e] hover:bg-stone-300 dark:hover:bg-[#383838] text-stone-700 dark:text-[#dddddd] font-medium rounded-lg text-xs transition-colors"
            >
              취소
            </button>
            <button
              onClick={handleCreateTable}
              disabled={previewColumns.length === 0}
              className="px-4 py-1.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white font-bold rounded-lg text-xs flex items-center gap-1.5 shadow-sm transition-all"
            >
              <Check className="w-4 h-4" />
              테이블 생성하기
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
