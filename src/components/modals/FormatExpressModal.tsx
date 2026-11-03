import React, { useState, useMemo, useCallback } from 'react';
import {
  X,
  Code,
  Copy,
  Check,
  Trash2,
  Sparkles,
  ClipboardPaste,
  Download,
  FileCode,
  Database,
  Terminal,
  FileText,
  Wand2,
} from 'lucide-react';
import {
  autoFormatExpress,
  cleanLogNoise,
  unescapeText,
  formatJson,
  formatXml,
  formatSql,
  extractAndFormatEmbeddedQuery,
} from '../../utils/formatExpress';

interface FormatExpressModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApplyToActiveEditor?: (formattedText: string) => void;
}

const SAMPLE_RAW_LOG = `[2026-10-22 17:30:00.123] INFO [main] com.wonbee.service.QueryService - Executing query:
{\\"status\\": \\"success\\", \\"data\\": {\\"userId\\": 1024, \\"query\\": \\"SELECT id, title, content FROM notes WHERE status = 'active' AND user_id = 1024 ORDER BY created_at DESC\\", \\"tags\\": [\\"work\\", \\"note\\"]}, \\"unicode\\": \\"\\\\uC6D0\\\\uBE44\\\\u261D\\\\uFE0F\\"}
`;

export const FormatExpressModal: React.FC<FormatExpressModalProps> = ({
  isOpen,
  onClose,
  onApplyToActiveEditor,
}) => {
  const [rawInput, setRawInput] = useState<string>(SAMPLE_RAW_LOG);
  const [activeAction, setActiveAction] = useState<
    'auto' | 'log' | 'unescape' | 'json' | 'xml' | 'sql' | 'extract'
  >('auto');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  // Compute formatted result in real-time
  const result = useMemo(() => {
    if (!rawInput.trim()) {
      return { formatted: '', detectedType: 'None', stats: { chars: 0, lines: 0 } };
    }

    let formatted = '';
    let detectedType = 'Plain Text';

    switch (activeAction) {
      case 'log':
        formatted = cleanLogNoise(rawInput);
        detectedType = 'Log Prefixes Removed';
        break;
      case 'unescape':
        formatted = unescapeText(rawInput);
        detectedType = 'Unescaped String';
        break;
      case 'json':
        formatted = formatJson(rawInput);
        detectedType = 'JSON Pretty Print';
        break;
      case 'xml':
        formatted = formatXml(rawInput);
        detectedType = 'XML / HTML Formatted';
        break;
      case 'sql':
        formatted = formatSql(rawInput);
        detectedType = 'SQL Formatted';
        break;
      case 'extract':
        formatted = extractAndFormatEmbeddedQuery(rawInput);
        detectedType = 'Embedded String Extracted';
        break;
      case 'auto':
      default: {
        const auto = autoFormatExpress(rawInput);
        formatted = auto.formatted;
        detectedType = auto.detectedType;
        break;
      }
    }

    const lines = formatted.split('\n').length;
    const chars = formatted.length;

    return {
      formatted,
      detectedType,
      stats: { chars, lines },
    };
  }, [rawInput, activeAction]);

  const handlePasteClipboard = useCallback(async () => {
    try {
      if (navigator.clipboard && typeof navigator.clipboard.readText === 'function') {
        const text = await navigator.clipboard.readText();
        if (text) {
          setRawInput(text);
          showToast('✓ 클립보드 데이터를 입력창에 가져왔습니다.');
          return;
        }
      }
      showToast('💡 [Ctrl+V] 단축키를 눌러 입력창에 붙여넣어 주세요.');
    } catch (_) {
      showToast('💡 [Ctrl+V] 단축키를 눌러 입력창에 붙여넣어 주세요.');
    }
  }, []);

  const handleCopyResult = useCallback(async () => {
    if (!result.formatted) return;
    try {
      await navigator.clipboard.writeText(result.formatted);
      showToast('✓ 정제된 결과가 클립보드에 복사되었습니다.');
    } catch (_) {
      try {
        const textarea = document.createElement('textarea');
        textarea.value = result.formatted;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        showToast('✓ 정제된 결과가 클립보드에 복사되었습니다.');
      } catch (__) {
        showToast('⚠ 복사 실패');
      }
    }
  }, [result.formatted]);

  const handleDownloadFile = () => {
    if (!result.formatted) return;
    const ext =
      result.detectedType === 'JSON' ? 'json' :
      result.detectedType.includes('XML') ? 'xml' :
      result.detectedType === 'SQL' ? 'sql' : 'txt';

    const blob = new Blob([result.formatted], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `format_express_cleaned.${ext}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast(`✓ 정제 결과 파일 (format_express_cleaned.${ext}) 다운로드 완료`);
  };

  const handleClear = () => {
    setRawInput('');
    showToast('입력창이 초기화되었습니다.');
  };

  if (!isOpen) return null;

  return (
    <div
      id="format-express-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/60 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        id="format-express-modal-container"
        className="bg-white dark:bg-stone-900 rounded-2xl shadow-2xl border border-stone-200 dark:border-stone-800 w-full max-w-6xl h-[90vh] max-h-[94vh] flex flex-col overflow-hidden text-stone-900 dark:text-stone-100 animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Toast Notification */}
        {toastMessage && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 bg-stone-900/90 dark:bg-stone-100 text-white dark:text-stone-900 px-4 py-2 rounded-xl text-xs font-semibold shadow-xl flex items-center gap-2 backdrop-blur-sm animate-in fade-in zoom-in-95 pointer-events-none">
            <Check className="w-4 h-4 text-emerald-400 dark:text-emerald-600" />
            <span>{toastMessage}</span>
          </div>
        )}

        {/* Header Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3.5 border-b border-stone-200 dark:border-stone-800 bg-stone-50/80 dark:bg-stone-900/80 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/15 dark:bg-emerald-400/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <Code className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2">
                Format Express
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-nowrap">
            <button
              type="button"
              onClick={handlePasteClipboard}
              className="px-3 py-1.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 hover:bg-stone-100 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-200 text-xs font-semibold flex items-center gap-1.5 transition-colors shrink-0"
            >
              <ClipboardPaste className="w-3.5 h-3.5 text-amber-500" />
              <span>클립보드 붙여넣기</span>
            </button>

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
              onClick={handleDownloadFile}
              disabled={!result.formatted}
              className="px-3 py-1.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 hover:bg-stone-100 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-200 text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-40 shrink-0"
            >
              <Download className="w-3.5 h-3.5 text-sky-500" />
              <span>파일 다운로드</span>
            </button>

            <button
              type="button"
              onClick={handleCopyResult}
              disabled={!result.formatted}
              className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-bold text-xs flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer shrink-0"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>결과 복사</span>
            </button>

            {onApplyToActiveEditor && (
              <button
                type="button"
                onClick={() => {
                  if (result.formatted) {
                    onApplyToActiveEditor(result.formatted);
                    showToast('✓ 에디터에 정제된 결과를 전송했습니다.');
                  }
                }}
                className="px-4 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer shrink-0"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>에디터로 전달</span>
              </button>
            )}

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

        {/* Processing Mode Toolbar */}
        <div className="px-6 py-2 bg-stone-100/70 dark:bg-[#181818] border-b border-stone-200 dark:border-stone-800 flex items-center gap-1.5 overflow-x-auto text-xs shrink-0">
          <span className="text-stone-500 dark:text-stone-400 font-semibold mr-1 flex items-center gap-1 shrink-0">
            <Wand2 className="w-3.5 h-3.5 text-emerald-500" />
            <span>정제 모드:</span>
          </span>

          {[
            { id: 'auto' as const, label: '✨ 스마트 자동 정제', desc: '타입 자동 감지 & 노이즈 제거' },
            { id: 'log' as const, label: '🧹 로그 노이즈 제거', desc: '타임스탬프/로그 레벨 헤더 삭제' },
            { id: 'unescape' as const, label: '🔓 이스케이프 복원', desc: '\\n, \\t, \\", \\uXXXX Unescape' },
            { id: 'json' as const, label: 'JSON Pretty Print', desc: 'JSON 객체/배열 정렬' },
            { id: 'xml' as const, label: 'XML / HTML 정렬', desc: '태그 들여쓰기' },
            { id: 'sql' as const, label: 'SQL 쿼리 포맷', desc: '대문자 키워드 & 줄바꿈' },
            { id: 'extract' as const, label: 'Java/C 쿼리 추출', desc: '문자열 내 쿼리 추출' },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveAction(item.id)}
              title={item.desc}
              className={`px-3 py-1 rounded-xl font-medium transition-all whitespace-nowrap border shrink-0 ${
                activeAction === item.id
                  ? 'bg-emerald-600 border-emerald-500 text-white font-bold shadow-2xs'
                  : 'bg-white dark:bg-stone-800 border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-700'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Split Screen Body (2-Column Layout) */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-stone-200 dark:divide-stone-800 overflow-hidden bg-stone-50/40 dark:bg-[#141414]/40">
          {/* Left Column: Raw Input Area */}
          <div className="flex flex-col h-full p-4 overflow-hidden">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-stone-200/80 dark:border-stone-800 text-xs font-semibold text-stone-600 dark:text-stone-300">
              <span className="flex items-center gap-1.5">
                <FileCode className="w-4 h-4 text-emerald-500" />
                <span>원본 데이터 (Raw Log / Minified / Escaped)</span>
              </span>
              <span className="font-mono text-[11px] text-stone-400">
                {rawInput.length.toLocaleString()} 글자 · {rawInput ? rawInput.split('\n').length : 0} 줄
              </span>
            </div>

            <textarea
              value={rawInput}
              onChange={(e) => setRawInput(e.target.value)}
              placeholder="로그 파일, 이스케이프된 JSON/SQL, minified 문자열을 붙여넣으세요..."
              className="flex-1 w-full p-4 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-[#1c1c1c] text-stone-900 dark:text-stone-100 font-mono text-xs leading-relaxed focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 focus:outline-hidden transition-all resize-none custom-scrollbar"
              spellCheck={false}
            />
          </div>

          {/* Right Column: Cleaned Result Viewer */}
          <div className="flex flex-col h-full p-4 overflow-hidden">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-stone-200/80 dark:border-stone-800 text-xs font-semibold text-stone-600 dark:text-stone-300">
              <span className="flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-emerald-500" />
                <span>Format Express 결과</span>
              </span>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-mono text-[10px] font-bold">
                  {result.detectedType}
                </span>
                <span className="font-mono text-[11px] text-stone-400">
                  {result.stats.chars.toLocaleString()} 글자 · {result.stats.lines} 줄
                </span>
              </div>
            </div>

            <div className="flex-1 w-full rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-[#1c1c1c] overflow-y-auto p-4 font-mono text-xs leading-relaxed custom-scrollbar relative">
              {result.formatted ? (
                <pre className="m-0 p-0 bg-transparent text-stone-800 dark:text-[#f1f5f9] font-mono text-xs leading-relaxed whitespace-pre">
                  {result.formatted}
                </pre>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-stone-400">
                  <Code className="w-8 h-8 mb-2 opacity-30" />
                  <p className="text-xs">왼쪽 입력창에 원본을 넣으면 실시간으로 정제 및 정렬됩니다.</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-stone-200 dark:border-stone-800 bg-stone-50/80 dark:bg-stone-900/80 flex items-center justify-between text-xs text-stone-500 shrink-0">
          <span></span>
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
