import React, { memo } from 'react';
import {
  Table as TableIcon,
  X,
  Code,
  ClipboardPaste,
  FileText,
  Sparkles,
  Cpu,
  Database,
  FileCode,
  Terminal,
  Edit3,
  FileDown,
  Download,
  Eye,
  ImageIcon,
  Upload,
  Link2,
  Video,
  AlertTriangle,
  Grid,
  Check,
} from 'lucide-react';
import { TableGridPicker } from './TableGridPicker';
import { convertTextDataToEditorContent } from '../../utils/csvParser';
import { isLikelyMarkdown, markdownToHtml } from '../../utils/markdownHelper';
import { escapeHtml } from '../../utils/codeHighlighter';

interface TopDialogsProps {
  activeTopDialog: string | null;
  setActiveTopDialog: (dialog: any) => void;
  editor: any;
  tableDialogRows: number;
  setTableDialogRows: React.Dispatch<React.SetStateAction<number>>;
  tableDialogCols: number;
  setTableDialogCols: React.Dispatch<React.SetStateAction<number>>;
  tableDialogHeaderRow: boolean;
  setTableDialogHeaderRow: (val: boolean) => void;
  handleInsertNewTable: (rows: number, cols: number, headerRow: boolean) => void;

  codeDialogTab: 'templates' | 'md_paste' | 'tools';
  setCodeDialogTab: (tab: 'templates' | 'md_paste' | 'tools') => void;
  mdPasteInputText: string;
  setMdPasteInputText: (text: string) => void;
  mdPasteActiveTab: 'input' | 'preview';
  setMdPasteActiveTab: (tab: 'input' | 'preview') => void;
  dataPasteFormat: 'auto' | 'csv' | 'md' | 'txt';
  setDataPasteFormat: (fmt: 'auto' | 'csv' | 'md' | 'txt') => void;
  dataPasteDelimiter: 'auto' | 'tab' | 'comma' | 'pipe' | 'semicolon' | 'space';
  setDataPasteDelimiter: (del: 'auto' | 'tab' | 'comma' | 'pipe' | 'semicolon' | 'space') => void;
  dataPasteHasHeader: boolean;
  setDataPasteHasHeader: (val: boolean) => void;
  dataPasteOutputType: 'table' | 'md_table' | 'code_block' | 'plain';
  setDataPasteOutputType: (out: 'table' | 'md_table' | 'code_block' | 'plain') => void;
  dataPasteTableWidth: string;
  setDataPasteTableWidth: (w: string) => void;
  handleApplyMarkdownPaste: () => void;
  handleAutoHighlightSelection: () => void;

  handleInsertCBlock: () => void;
  handleInsertSqlBlock: () => void;
  handleInsertJavaBlock: () => void;
  handleInsertPythonBlock: () => void;
  handleInsertBashBlock: () => void;
  handlePasteCodeFromClipboard: () => void;
  handleFormatCodeInEditor: () => void;
  handlePasteMarkdownFromClipboard: () => void;
  handleCopyAsMarkdown: () => void;
  handleInsertMarkdownTemplate: (tpl: any) => void;
  handleDownloadMarkdownTemplate: (tpl: any) => void;
  MARKDOWN_LANGUAGE_TEMPLATES: any[];

  imageDialogTab: 'upload' | 'url';
  setImageDialogTab: (tab: 'upload' | 'url') => void;
  imageDialogUrl: string;
  setImageDialogUrl: (url: string) => void;
  imageDialogAlt: string;
  setImageDialogAlt: (alt: string) => void;
  imageDialogWidth: '100%' | '75%' | '50%' | '30%';
  setImageDialogWidth: (width: '100%' | '75%' | '50%' | '30%') => void;
  handleInsertImageSubmit: () => void;
  handleImageUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;

  linkDialogUrl: string;
  setLinkDialogUrl: (url: string) => void;
  linkDialogText: string;
  setLinkDialogText: (text: string) => void;
  linkDialogNewTab: boolean;
  setLinkDialogNewTab: (newTab: boolean) => void;
  handleInsertLinkSubmit: () => void;

  videoDialogUrl: string;
  setVideoDialogUrl: (url: string) => void;
  handleInsertVideoSubmit: () => void;

  showExitConfirm: boolean;
  setShowExitConfirm: (show: boolean) => void;
  handleSaveAndClose: () => void;
  handleDiscardAndClose: () => void;

  savedSelectionRef: React.MutableRefObject<{ from: number; to: number } | null>;
  setToastMessage: (msg: string | null) => void;
}

export const TopDialogs: React.FC<TopDialogsProps> = memo(({
  activeTopDialog,
  setActiveTopDialog,
  editor,
  tableDialogRows,
  setTableDialogRows,
  tableDialogCols,
  setTableDialogCols,
  tableDialogHeaderRow,
  setTableDialogHeaderRow,
  handleInsertNewTable,
  codeDialogTab,
  setCodeDialogTab,
  mdPasteInputText,
  setMdPasteInputText,
  mdPasteActiveTab,
  setMdPasteActiveTab,
  dataPasteFormat,
  setDataPasteFormat,
  dataPasteDelimiter,
  setDataPasteDelimiter,
  dataPasteHasHeader,
  setDataPasteHasHeader,
  dataPasteOutputType,
  setDataPasteOutputType,
  dataPasteTableWidth,
  setDataPasteTableWidth,
  handleApplyMarkdownPaste,
  handleAutoHighlightSelection,
  handleInsertCBlock,
  handleInsertSqlBlock,
  handleInsertJavaBlock,
  handleInsertPythonBlock,
  handleInsertBashBlock,
  handlePasteCodeFromClipboard,
  handleFormatCodeInEditor,
  handlePasteMarkdownFromClipboard,
  handleCopyAsMarkdown,
  handleInsertMarkdownTemplate,
  handleDownloadMarkdownTemplate,
  MARKDOWN_LANGUAGE_TEMPLATES,
  imageDialogTab,
  setImageDialogTab,
  imageDialogUrl,
  setImageDialogUrl,
  imageDialogAlt,
  setImageDialogAlt,
  imageDialogWidth,
  setImageDialogWidth,
  handleInsertImageSubmit,
  handleImageUpload,
  linkDialogUrl,
  setLinkDialogUrl,
  linkDialogText,
  setLinkDialogText,
  linkDialogNewTab,
  setLinkDialogNewTab,
  handleInsertLinkSubmit,
  videoDialogUrl,
  setVideoDialogUrl,
  handleInsertVideoSubmit,
  showExitConfirm,
  setShowExitConfirm,
  handleSaveAndClose,
  handleDiscardAndClose,
  savedSelectionRef,
  setToastMessage,
}) => {
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const mdFileInputRef = React.useRef<HTMLInputElement | null>(null);

  if (!activeTopDialog && !showExitConfirm) return null;

  return (
    <div
      id="rich-editor-top-dialog-backdrop"
      className="absolute inset-0 z-50 flex items-start justify-center pt-8 md:pt-14 pb-8 px-4 bg-stone-950/45 backdrop-blur-[2px] animate-in fade-in duration-150 overflow-y-auto"
      onClick={() => {
        setActiveTopDialog(null);
        setShowExitConfirm(false);
      }}
    >
      <div
        id="rich-editor-top-dialog"
        className="bg-white dark:bg-[#1e1e1e] rounded-2xl border border-stone-200 dark:border-[#383838] shadow-2xl w-full max-w-md md:max-w-lg animate-in zoom-in-95 duration-150 overflow-hidden text-stone-900 dark:text-stone-100 my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* DIALOG 1: 새 표 삽입 (Table Dialog) */}
        {activeTopDialog === 'table' && (
          <div className="p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-stone-100 dark:border-stone-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                  <TableIcon className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2">
                    새 표 삽입
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 font-mono font-medium">Excel 스타일</span>
                  </h3>
                  <p className="text-[11px] text-stone-500 dark:text-stone-400">
                    원하는 행과 열 크기를 지정하여 스프레드시트형 표를 삽입합니다
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveTopDialog(null)}
                className="p-1.5 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Matrix Grid Picker */}
            <div>
              <div className="text-[11px] font-semibold text-stone-700 dark:text-stone-300 mb-2 flex items-center justify-between">
                <span>1. 마우스 드래그로 빠른 선택</span>
                <span className="text-[10px] text-stone-400 font-mono">최대 10×10</span>
              </div>
              <div className="flex justify-center p-3 bg-stone-50 dark:bg-[#141414] rounded-xl border border-stone-200/70 dark:border-stone-800">
                <TableGridPicker
                  onInsert={(rows, cols) => {
                    handleInsertNewTable(rows, cols, tableDialogHeaderRow);
                  }}
                />
              </div>
            </div>

            {/* Manual Inputs */}
            <div>
              <div className="text-[11px] font-semibold text-stone-700 dark:text-stone-300 mb-2">
                2. 행 및 열 크기 직접 입력
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-stone-50 dark:bg-[#141414] rounded-xl border border-stone-200/70 dark:border-stone-800 flex items-center justify-between">
                  <span className="text-xs font-medium text-stone-600 dark:text-stone-300">열 (Columns)</span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setTableDialogCols((c) => Math.max(1, c - 1))}
                      className="w-7 h-7 rounded-lg bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 flex items-center justify-center hover:bg-stone-100 dark:hover:bg-stone-700 text-stone-600 dark:text-stone-300 transition-colors text-xs font-bold"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      min={1}
                      max={12}
                      value={tableDialogCols}
                      onChange={(e) => setTableDialogCols(Math.max(1, Math.min(12, parseInt(e.target.value) || 1)))}
                      className="w-10 text-center font-mono font-bold text-sm bg-transparent border-b border-amber-500 focus:outline-hidden"
                    />
                    <button
                      type="button"
                      onClick={() => setTableDialogCols((c) => Math.min(12, c + 1))}
                      className="w-7 h-7 rounded-lg bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 flex items-center justify-center hover:bg-stone-100 dark:hover:bg-stone-700 text-stone-600 dark:text-stone-300 transition-colors text-xs font-bold"
                    >
                      +
                    </button>
                  </div>
                </div>

                <div className="p-3 bg-stone-50 dark:bg-[#141414] rounded-xl border border-stone-200/70 dark:border-stone-800 flex items-center justify-between">
                  <span className="text-xs font-medium text-stone-600 dark:text-stone-300">행 (Rows)</span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setTableDialogRows((r) => Math.max(1, r - 1))}
                      className="w-7 h-7 rounded-lg bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 flex items-center justify-center hover:bg-stone-100 dark:hover:bg-stone-700 text-stone-600 dark:text-stone-300 transition-colors text-xs font-bold"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      min={1}
                      max={30}
                      value={tableDialogRows}
                      onChange={(e) => setTableDialogRows(Math.max(1, Math.min(30, parseInt(e.target.value) || 1)))}
                      className="w-10 text-center font-mono font-bold text-sm bg-transparent border-b border-amber-500 focus:outline-hidden"
                    />
                    <button
                      type="button"
                      onClick={() => setTableDialogRows((r) => Math.min(30, r + 1))}
                      className="w-7 h-7 rounded-lg bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 flex items-center justify-center hover:bg-stone-100 dark:hover:bg-stone-700 text-stone-600 dark:text-stone-300 transition-colors text-xs font-bold"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Presets */}
            <div>
              <div className="text-[11px] font-semibold text-stone-700 dark:text-stone-300 mb-1.5">
                3. 추천 규격 프리셋
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { label: '2×2 (4분할)', rows: 2, cols: 2 },
                  { label: '3×3 (기본 표)', rows: 3, cols: 3 },
                  { label: '4×3 (요약 표)', rows: 3, cols: 4 },
                  { label: '5×4 (상세 목록)', rows: 4, cols: 5 },
                  { label: '2열 비교표', rows: 4, cols: 2 },
                ].map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => {
                      setTableDialogRows(preset.rows);
                      setTableDialogCols(preset.cols);
                    }}
                    className={`px-2.5 py-1 rounded-lg text-xs border transition-colors ${
                      tableDialogRows === preset.rows && tableDialogCols === preset.cols
                        ? 'bg-amber-100 dark:bg-amber-950/60 border-amber-400 text-amber-800 dark:text-amber-300 font-semibold'
                        : 'bg-stone-50 dark:bg-[#252525] border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-700'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Options */}
            <div className="pt-2 border-t border-stone-100 dark:border-stone-800">
              <label className="flex items-center gap-2 cursor-pointer text-xs text-stone-700 dark:text-stone-300 select-none">
                <input
                  type="checkbox"
                  checked={tableDialogHeaderRow}
                  onChange={(e) => setTableDialogHeaderRow(e.target.checked)}
                  className="rounded border-stone-300 text-amber-500 focus:ring-amber-500 w-4 h-4"
                />
                <span>첫 번째 행을 제목 헤더(Header)로 강조</span>
              </label>
            </div>

            {/* Footer */}
            <div className="pt-3 border-t border-stone-100 dark:border-stone-800 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setActiveTopDialog(null)}
                className="px-4 py-2 rounded-xl border border-stone-200 dark:border-stone-700 text-xs font-medium text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => handleInsertNewTable(tableDialogRows, tableDialogCols, tableDialogHeaderRow)}
                className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-bold transition-colors shadow-sm flex items-center gap-1.5"
              >
                <TableIcon className="w-3.5 h-3.5" />
                <span>{tableDialogCols}열 × {tableDialogRows}행 표 삽입하기</span>
              </button>
            </div>
          </div>
        )}

        {/* DIALOG 2: 코드 & MD 통합 대화상자 */}
        {(activeTopDialog === 'code' || activeTopDialog === 'md_paste') && (() => {
          const currentTab = activeTopDialog === 'md_paste' ? 'md_paste' : codeDialogTab;
          return (
            <div className="p-5 space-y-4 max-h-[85vh] overflow-y-auto">
              <div className="flex items-center justify-between pb-3 border-b border-stone-100 dark:border-stone-800">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                    <Code className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2">
                      코드 & 마크다운(MD) 통합 도구
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 font-mono font-medium">C · SQL · Java · MD</span>
                    </h3>
                    <p className="text-[11px] text-stone-500 dark:text-stone-400">
                      언어별 코드 블록 삽입, 마크다운 붙여넣기/미리보기 및 파일 가져오기를 한곳에서 처리합니다
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTopDialog(null)}
                  className="p-1.5 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Navigation Tabs */}
              <div className="flex rounded-xl bg-stone-100 dark:bg-[#141414] p-1 gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setCodeDialogTab('templates');
                    if (activeTopDialog === 'md_paste') setActiveTopDialog('code');
                  }}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5 ${
                    currentTab === 'templates'
                      ? 'bg-white dark:bg-[#282828] text-amber-700 dark:text-amber-400 shadow-xs'
                      : 'text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200'
                  }`}
                >
                  <Code className="w-3.5 h-3.5" />
                  <span>주요 언어 템플릿</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCodeDialogTab('md_paste');
                    if (activeTopDialog === 'md_paste') setActiveTopDialog('code');
                  }}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5 ${
                    currentTab === 'md_paste'
                      ? 'bg-white dark:bg-[#282828] text-amber-700 dark:text-amber-400 shadow-xs'
                      : 'text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200'
                  }`}
                >
                  <ClipboardPaste className="w-3.5 h-3.5 text-amber-500" />
                  <span>MD·엑셀(CSV)·TXT 파일</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCodeDialogTab('tools');
                    if (activeTopDialog === 'md_paste') setActiveTopDialog('code');
                  }}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5 ${
                    currentTab === 'tools'
                      ? 'bg-white dark:bg-[#282828] text-amber-700 dark:text-amber-400 shadow-xs'
                      : 'text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5 text-sky-500" />
                  <span>문서 & 파일 도구</span>
                </button>
              </div>

              {/* TAB 1: Templates */}
              {currentTab === 'templates' && (
                <div className="space-y-4">
                  {editor && !editor.state.selection.empty && (
                    <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center justify-between gap-3 animate-in fade-in">
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                          <span>선택된 텍스트가 있습니다</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          handleAutoHighlightSelection();
                          setActiveTopDialog(null);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-bold whitespace-nowrap shadow-xs transition-colors"
                      >
                        자동 하이라이팅 적용
                      </button>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        handleInsertCBlock();
                        setActiveTopDialog(null);
                      }}
                      className="p-2.5 rounded-xl border border-stone-200 dark:border-stone-700/80 bg-stone-50 dark:bg-[#222222] hover:bg-stone-100 dark:hover:bg-[#2a2a2a] text-left transition-colors flex items-center gap-2.5"
                    >
                      <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
                        <Cpu className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-stone-800 dark:text-stone-200">C / Pro*C</div>
                        <div className="text-[10px] text-stone-400">전문 처리 & 메모리 복사</div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        handleInsertSqlBlock();
                        setActiveTopDialog(null);
                      }}
                      className="p-2.5 rounded-xl border border-stone-200 dark:border-stone-700/80 bg-stone-50 dark:bg-[#222222] hover:bg-stone-100 dark:hover:bg-[#2a2a2a] text-left transition-colors flex items-center gap-2.5"
                    >
                      <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                        <Database className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-stone-800 dark:text-stone-200">SQL 쿼리</div>
                        <div className="text-[10px] text-stone-400">SELECT / JOIN / DDL</div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        handleInsertJavaBlock();
                        setActiveTopDialog(null);
                      }}
                      className="p-2.5 rounded-xl border border-stone-200 dark:border-stone-700/80 bg-stone-50 dark:bg-[#222222] hover:bg-stone-100 dark:hover:bg-[#2a2a2a] text-left transition-colors flex items-center gap-2.5"
                    >
                      <div className="p-1.5 rounded-lg bg-orange-500/10 text-orange-600 dark:text-orange-400">
                        <FileCode className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-stone-800 dark:text-stone-200">Java 클래스</div>
                        <div className="text-[10px] text-stone-400">Spring 서비스 & 엔티티</div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        handleInsertPythonBlock();
                        setActiveTopDialog(null);
                      }}
                      className="p-2.5 rounded-xl border border-stone-200 dark:border-stone-700/80 bg-stone-50 dark:bg-[#222222] hover:bg-stone-100 dark:hover:bg-[#2a2a2a] text-left transition-colors flex items-center gap-2.5"
                    >
                      <div className="p-1.5 rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400">
                        <Code className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-stone-800 dark:text-stone-200">Python</div>
                        <div className="text-[10px] text-stone-400">데이터 처리 & 파이프라인</div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        handleInsertBashBlock();
                        setActiveTopDialog(null);
                      }}
                      className="p-2.5 rounded-xl border border-stone-200 dark:border-stone-700/80 bg-stone-50 dark:bg-[#222222] hover:bg-stone-100 dark:hover:bg-[#2a2a2a] text-left transition-colors flex items-center gap-2.5"
                    >
                      <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                        <Terminal className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-stone-800 dark:text-stone-200">Bash / Shell</div>
                        <div className="text-[10px] text-stone-400">명령어 & 쉘 스크립트</div>
                      </div>
                    </button>
                  </div>
                </div>
              )}

              {/* TAB 2: MD Paste */}
              {currentTab === 'md_paste' && (() => {
                const parsedData = mdPasteInputText.trim()
                  ? convertTextDataToEditorContent(mdPasteInputText, {
                      format: dataPasteFormat,
                      delimiter: dataPasteDelimiter,
                      hasHeader: dataPasteHasHeader,
                      outputType: dataPasteOutputType,
                      tableWidth: dataPasteTableWidth,
                    })
                  : null;

                return (
                  <div className="space-y-3.5">
                    {mdPasteActiveTab === 'input' && (
                      <textarea
                        value={mdPasteInputText}
                        onChange={(e) => setMdPasteInputText(e.target.value)}
                        placeholder="마크다운(.md) 또는 엑셀/CSV 파일을 드래그&드랍 하세요."
                        className="w-full h-44 p-3 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-[#141414] text-xs font-mono focus:outline-none focus:ring-1 focus:ring-amber-500"
                      />
                    )}

                    {mdPasteActiveTab === 'preview' && (
                      <div className="w-full h-44 p-3 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-[#141414] overflow-y-auto prose dark:prose-invert max-w-none text-xs">
                        {parsedData ? (
                          <div dangerouslySetInnerHTML={{ __html: parsedData.html }} />
                        ) : (
                          <div className="text-stone-400">입력된 내용이 없습니다.</div>
                        )}
                      </div>
                    )}

                    <div className="flex justify-end gap-2 pt-2 border-t border-stone-100 dark:border-stone-800">
                      <button
                        type="button"
                        onClick={() => setActiveTopDialog(null)}
                        className="px-4 py-1.5 rounded-xl border border-stone-200 dark:border-stone-700 text-xs font-medium text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
                      >
                        취소
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          handleApplyMarkdownPaste();
                          setActiveTopDialog(null);
                        }}
                        className="px-4 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-bold transition-colors shadow-xs"
                      >
                        에디터에 서식 적용하기
                      </button>
                    </div>
                  </div>
                );
              })()}

              {/* TAB 3: Tools */}
              {currentTab === 'tools' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        handlePasteCodeFromClipboard();
                        setActiveTopDialog(null);
                      }}
                      className="p-2 rounded-xl border border-stone-200 dark:border-stone-700 hover:bg-stone-50 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-300 text-xs flex items-center gap-2 transition-colors"
                    >
                      <ClipboardPaste className="w-3.5 h-3.5 text-indigo-500" />
                      <span>클립보드 코드 붙여넣기</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        handleFormatCodeInEditor();
                        setActiveTopDialog(null);
                      }}
                      className="p-2 rounded-xl border border-stone-200 dark:border-stone-700 hover:bg-stone-50 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-300 text-xs flex items-center gap-2 transition-colors"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                      <span>들여쓰기 자동 정렬</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* DIALOG 3: 이미지 삽입 */}
        {activeTopDialog === 'image' && (
          <div className="p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-stone-100 dark:border-stone-800">
              <div className="flex items-center gap-2">
                <ImageIcon className="w-5 h-5 text-emerald-500" />
                <h3 className="text-sm font-bold">이미지 삽입</h3>
              </div>
              <button type="button" onClick={() => setActiveTopDialog(null)} className="p-1 rounded hover:bg-stone-100 dark:hover:bg-stone-800">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-stone-600 dark:text-stone-400 block mb-1">이미지 URL</label>
                <input
                  type="text"
                  value={imageDialogUrl}
                  onChange={(e) => setImageDialogUrl(e.target.value)}
                  placeholder="https://example.com/image.png"
                  className="w-full p-2.5 rounded-xl border border-stone-200 dark:border-stone-700 text-xs bg-stone-50 dark:bg-stone-800 focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-stone-600 dark:text-stone-400 block mb-1">대체 텍스트 (Alt)</label>
                <input
                  type="text"
                  value={imageDialogAlt}
                  onChange={(e) => setImageDialogAlt(e.target.value)}
                  placeholder="이미지 설명 입력"
                  className="w-full p-2.5 rounded-xl border border-stone-200 dark:border-stone-700 text-xs bg-stone-50 dark:bg-stone-800 focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-stone-100 dark:border-stone-800">
              <button
                type="button"
                onClick={() => setActiveTopDialog(null)}
                className="px-4 py-2 rounded-xl border border-stone-200 dark:border-stone-700 text-xs font-medium"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleInsertImageSubmit}
                className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white text-xs font-bold shadow-sm"
              >
                이미지 삽입하기
              </button>
            </div>
          </div>
        )}

        {/* DIALOG 4: 링크 삽입 */}
        {activeTopDialog === 'link' && (
          <div className="p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-stone-100 dark:border-stone-800">
              <div className="flex items-center gap-2">
                <Link2 className="w-5 h-5 text-sky-500" />
                <h3 className="text-sm font-bold">하이퍼링크 삽입</h3>
              </div>
              <button type="button" onClick={() => setActiveTopDialog(null)} className="p-1 rounded hover:bg-stone-100 dark:hover:bg-stone-800">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-stone-600 dark:text-stone-400 block mb-1">웹주소 (URL)</label>
                <input
                  type="text"
                  value={linkDialogUrl}
                  onChange={(e) => setLinkDialogUrl(e.target.value)}
                  placeholder="https://example.com"
                  className="w-full p-2.5 rounded-xl border border-stone-200 dark:border-stone-700 text-xs bg-stone-50 dark:bg-stone-800 focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-stone-600 dark:text-stone-400 block mb-1">표시할 텍스트</label>
                <input
                  type="text"
                  value={linkDialogText}
                  onChange={(e) => setLinkDialogText(e.target.value)}
                  placeholder="링크 문구 입력"
                  className="w-full p-2.5 rounded-xl border border-stone-200 dark:border-stone-700 text-xs bg-stone-50 dark:bg-stone-800 focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
              </div>

              <label className="flex items-center gap-2 cursor-pointer text-xs text-stone-700 dark:text-stone-300">
                <input
                  type="checkbox"
                  checked={linkDialogNewTab}
                  onChange={(e) => setLinkDialogNewTab(e.target.checked)}
                  className="rounded border-stone-300 text-amber-500 focus:ring-amber-500"
                />
                <span>새 탭에서 열기</span>
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-stone-100 dark:border-stone-800">
              <button
                type="button"
                onClick={() => setActiveTopDialog(null)}
                className="px-4 py-2 rounded-xl border border-stone-200 dark:border-stone-700 text-xs font-medium"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleInsertLinkSubmit}
                className="px-5 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-white text-xs font-bold shadow-sm"
              >
                링크 적용하기
              </button>
            </div>
          </div>
        )}

        {/* DIALOG 5: 동영상 삽입 */}
        {activeTopDialog === 'video' && (
          <div className="p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-stone-100 dark:border-stone-800">
              <div className="flex items-center gap-2">
                <Video className="w-5 h-5 text-rose-500" />
                <h3 className="text-sm font-bold">동영상 삽입</h3>
              </div>
              <button type="button" onClick={() => setActiveTopDialog(null)} className="p-1.5 rounded hover:bg-stone-100 dark:hover:bg-stone-800">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="text-xs font-medium text-stone-600 dark:text-stone-400 block mb-1">YouTube 또는 동영상 URL</label>
              <input
                type="text"
                value={videoDialogUrl}
                onChange={(e) => setVideoDialogUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
                className="w-full p-2.5 rounded-xl border border-stone-200 dark:border-stone-700 text-xs bg-stone-50 dark:bg-stone-800 focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-stone-100 dark:border-stone-800">
              <button
                type="button"
                onClick={() => setActiveTopDialog(null)}
                className="px-4 py-2 rounded-xl border border-stone-200 dark:border-stone-700 text-xs font-medium"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleInsertVideoSubmit}
                className="px-5 py-2 rounded-xl bg-rose-500 hover:bg-rose-400 text-white text-xs font-bold shadow-sm"
              >
                동영상 삽입하기
              </button>
            </div>
          </div>
        )}

        {/* DIALOG 6: 종료 확인 팝업 */}
        {showExitConfirm && (
          <div className="p-5 space-y-4">
            <div className="flex items-center gap-2.5 text-rose-600 dark:text-rose-400">
              <AlertTriangle className="w-5 h-5" />
              <h3 className="text-sm font-bold">변경사항 저장 확인</h3>
            </div>
            <p className="text-xs text-stone-600 dark:text-stone-300">
              작성 중인 내용에 저장되지 않은 변경사항이 있습니다. 저장하고 창을 닫으시겠습니까?
            </p>
            <div className="flex justify-end gap-2 pt-3 border-t border-stone-100 dark:border-stone-800">
              <button
                type="button"
                onClick={() => setShowExitConfirm(false)}
                className="px-3 py-1.5 rounded-xl border border-stone-200 dark:border-stone-700 text-xs font-medium"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleDiscardAndClose}
                className="px-3 py-1.5 rounded-xl bg-stone-200 dark:bg-stone-800 text-stone-700 dark:text-stone-300 text-xs font-medium"
              >
                저장 안 함
              </button>
              <button
                type="button"
                onClick={handleSaveAndClose}
                className="px-4 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-bold shadow-sm"
              >
                저장 후 닫기
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});
