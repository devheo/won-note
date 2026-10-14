import React, { useState, useMemo, useCallback } from 'react';
import {
  X,
  Code2,
  Copy,
  Check,
  Trash2,
  Sparkles,
  AlertCircle,
  FileCode,
} from 'lucide-react';

interface PrettyJsonModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SAMPLE_JSON = `{
  "workspace": "WonBee",
  "version": "1.0.0",
  "features": [
    "DataTable",
    "KanbanBoard",
    "RichEditor",
    "PrettyJson"
  ],
  "settings": {
    "theme": "dark",
    "zoom": 100,
    "autoSave": true
  },
  "metadata": {
    "createdAt": 1776000000000,
    "author": "WonBee Developer"
  }
}`;

export const PrettyJsonModal: React.FC<PrettyJsonModalProps> = ({ isOpen, onClose }) => {
  const [rawInput, setRawInput] = useState<string>(SAMPLE_JSON);
  const [indentSize, setIndentSize] = useState<number>(2);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  // Real-time JSON parsing and formatting using useMemo
  const formattingResult = useMemo(() => {
    if (!rawInput.trim()) {
      return { isValid: true, formatted: '', error: null, stats: { chars: 0, lines: 0 } };
    }
    try {
      const parsed = JSON.parse(rawInput);
      const formatted = JSON.stringify(parsed, null, indentSize);
      const lines = formatted.split('\n').length;
      const chars = formatted.length;
      return {
        isValid: true,
        formatted,
        error: null,
        stats: { chars, lines },
      };
    } catch (err: any) {
      return {
        isValid: false,
        formatted: '',
        error: err?.message || 'Invalid JSON syntax',
        stats: { chars: rawInput.length, lines: rawInput.split('\n').length },
      };
    }
  }, [rawInput, indentSize]);

  const handleCopy = useCallback(async () => {
    if (!formattingResult.isValid || !formattingResult.formatted) return;
    const textToCopy = formattingResult.formatted;
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(textToCopy);
        showToast('✓ Pretty JSON 결과가 클립보드에 복사되었습니다.');
        return;
      }
      throw new Error('Clipboard API unavailable');
    } catch (err) {
      console.warn('Clipboard writeText failed, trying execCommand fallback:', err);
      try {
        const textarea = document.createElement('textarea');
        textarea.value = textToCopy;
        textarea.style.position = 'fixed';
        textarea.style.top = '0';
        textarea.style.left = '0';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        const successful = document.execCommand('copy');
        document.body.removeChild(textarea);
        if (successful) {
          showToast('✓ Pretty JSON 결과가 클립보드에 복사되었습니다.');
        } else {
          showToast('⚠ 복사 실패 (브라우저 보안 제한)');
        }
      } catch (fallbackErr) {
        console.error('Fallback copy failed:', fallbackErr);
        showToast('⚠ 클립보드 복사 실패');
      }
    }
  }, [formattingResult]);

  const handleClear = () => {
    setRawInput('');
    showToast('입력창이 초기화되었습니다.');
  };

  if (!isOpen) return null;

  return (
    <div
      id="pretty-json-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/60 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        id="pretty-json-modal-container"
        className="bg-white dark:bg-stone-900 rounded-2xl shadow-2xl border border-stone-200 dark:border-stone-800 w-full max-w-5xl h-[88vh] max-h-[92vh] flex flex-col overflow-hidden text-stone-900 dark:text-stone-100 animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Toast Notification */}
        {toastMessage && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 bg-stone-900/90 dark:bg-stone-100 text-white dark:text-stone-900 px-4 py-2 rounded-xl text-xs font-semibold shadow-xl flex items-center gap-2 backdrop-blur-sm animate-in fade-in zoom-in-95 pointer-events-none">
            <Check className="w-4 h-4 text-emerald-400 dark:text-emerald-600" />
            <span>{toastMessage}</span>
          </div>
        )}

        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-stone-200 dark:border-stone-800 bg-stone-50/70 dark:bg-stone-900/70 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 dark:bg-amber-400/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <Code2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2">
                Pretty JSON 뷰어 및 포매터
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 font-mono font-medium">
                  실시간 파서
                </span>
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-nowrap">
            {/* Indentation selector */}
            <div className="flex items-center gap-1.5 bg-stone-100 dark:bg-stone-800 p-1 rounded-xl text-xs shrink-0">
              <span className="text-stone-500 dark:text-stone-400 font-medium px-1.5">들여쓰기:</span>
              <button
                type="button"
                onClick={() => setIndentSize(2)}
                className={`px-2.5 py-1 rounded-lg font-mono font-bold transition-colors ${
                  indentSize === 2
                    ? 'bg-amber-500 text-stone-950 shadow-xs'
                    : 'text-stone-600 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-700'
                }`}
              >
                2 Spaces
              </button>
              <button
                type="button"
                onClick={() => setIndentSize(4)}
                className={`px-2.5 py-1 rounded-lg font-mono font-bold transition-colors ${
                  indentSize === 4
                    ? 'bg-amber-500 text-stone-950 shadow-xs'
                    : 'text-stone-600 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-700'
                }`}
              >
                4 Spaces
              </button>
            </div>

            <button
              type="button"
              onClick={handleClear}
              className="px-3 py-1.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 hover:bg-stone-100 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-200 text-xs font-semibold flex items-center gap-1.5 transition-colors shrink-0"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-500" />
              <span>지우기</span>
            </button>

            <button
              type="button"
              onClick={handleCopy}
              disabled={!formattingResult.isValid || !formattingResult.formatted}
              className="px-4 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-stone-950 font-bold text-xs flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer shrink-0"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>결과 복사</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors ml-1 shrink-0"
              title="닫기 (ESC)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Split Screen Body (2-Column Layout) */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-stone-200 dark:divide-stone-800 overflow-hidden bg-stone-50/40 dark:bg-[#141414]/40">
          {/* Left Column: Raw JSON Input */}
          <div className="flex flex-col h-full p-4 overflow-hidden">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-stone-200/80 dark:border-stone-800 text-xs font-semibold text-stone-600 dark:text-stone-300">
              <span className="flex items-center gap-1.5">
                <FileCode className="w-4 h-4 text-amber-500" />
                <span>Raw JSON 입력 (소스)</span>
              </span>
              <span className="font-mono text-[11px] text-stone-400">
                {formattingResult.stats.chars.toLocaleString()} 글자 · {formattingResult.stats.lines} 줄
              </span>
            </div>

            <textarea
              value={rawInput}
              onChange={(e) => setRawInput(e.target.value)}
              placeholder="여기에 정렬할 JSON 문자열을 입력하거나 붙여넣으세요..."
              className="flex-1 w-full p-4 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-[#1c1c1c] text-stone-900 dark:text-stone-100 font-mono text-xs leading-relaxed focus:ring-2 focus:ring-amber-500 focus:border-amber-500 focus:outline-hidden transition-all resize-none custom-scrollbar"
              spellCheck={false}
            />
          </div>

          {/* Right Column: Pretty JSON Result / Error Viewer */}
          <div className="flex flex-col h-full p-4 overflow-hidden">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-stone-200/80 dark:border-stone-800 text-xs font-semibold text-stone-600 dark:text-stone-300">
              <span className="flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-emerald-500" />
                <span>Pretty JSON 결과 뷰어</span>
              </span>
              {formattingResult.isValid ? (
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-mono text-[10px] font-bold">
                  ✓ 유효한 JSON
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 font-mono text-[10px] font-bold">
                  ⚠ 구문 에러 감지됨
                </span>
              )}
            </div>

            <div className="flex-1 w-full rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-[#1c1c1c] overflow-y-auto p-4 font-mono text-xs leading-relaxed custom-scrollbar relative">
              {!formattingResult.isValid ? (
                <div className="h-full flex flex-col items-center justify-center p-6 text-center">
                  <div className="w-12 h-12 rounded-full bg-rose-500/10 text-rose-500 flex items-center justify-center mb-3">
                    <AlertCircle className="w-6 h-6" />
                  </div>
                  <h4 className="text-sm font-bold text-rose-600 dark:text-rose-400 mb-1">
                    JSON 구문 에러 (Syntax Error)
                  </h4>
                  <p className="text-xs text-stone-500 dark:text-stone-400 font-mono bg-rose-500/5 p-3 rounded-lg border border-rose-500/20 max-w-md break-all">
                    {formattingResult.error}
                  </p>
                  <p className="text-[11px] text-stone-400 mt-3">
                    괄호, 따옴표, 쉼표 등의 누락 여부를 확인해주세요.
                  </p>
                </div>
              ) : formattingResult.formatted ? (
                <pre className="m-0 p-0 bg-transparent text-stone-800 dark:text-[#f1f5f9] font-mono text-xs leading-relaxed whitespace-pre">
                  {formattingResult.formatted}
                </pre>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-stone-400">
                  <Code2 className="w-8 h-8 mb-2 opacity-30" />
                  <p className="text-xs">왼쪽 입력창에 JSON을 입력하면 실시간으로 정렬됩니다.</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-stone-200 dark:border-stone-800 bg-stone-50/70 dark:bg-stone-900/70 flex items-center justify-between text-xs text-stone-500 shrink-0">
          <span>💡 <strong>팁:</strong> 실시간 파싱 엔진이 대용량 JSON 데이터도 메모리 부하 없이 빠르게 포매팅합니다.</span>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-1.5 rounded-xl bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 font-bold text-xs transition-colors cursor-pointer"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
};
