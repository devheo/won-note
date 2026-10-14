import React, { useState, useMemo, useCallback, useRef } from 'react';
import {
  X,
  RefreshCw,
  Copy,
  Check,
  Trash2,
  Sparkles,
  AlertCircle,
  FileText,
  Upload,
  Download,
} from 'lucide-react';

interface EncodingConverterModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SUPPORTED_ENCODINGS = [
  { label: 'EUC-KR / CP949 (한글 완성형)', value: 'euc-kr' },
  { label: 'UTF-8 (유니코드)', value: 'utf-8' },
  { label: 'ISO-8859-1 (Latin1)', value: 'iso-8859-1' },
  { label: 'UTF-16LE (유니코드 16-bit)', value: 'utf-16le' },
  { label: 'Windows-1252 (Western)', value: 'windows-1252' },
];

const INITIAL_SAMPLE = '안녕하세요! WonBee 인코딩 변환기입니다.\nEUC-KR 및 CP949로 작성된 레거시 텍스트나 파일을 깨짐 없이 UTF-8로 변환하세요.';

function getValidEncodingLabel(label: string): string {
  const l = (label || 'utf-8').toLowerCase().trim();
  if (l === 'cp949' || l === 'windows-949' || l === 'ksc5601') return 'euc-kr';
  return l;
}

export const EncodingConverterModal: React.FC<EncodingConverterModalProps> = ({ isOpen, onClose }) => {
  const [rawText, setRawText] = useState<string>(INITIAL_SAMPLE);
  const [rawArrayBuffer, setRawArrayBuffer] = useState<ArrayBuffer | null>(null);
  const [sourceEncoding, setSourceEncoding] = useState<string>('euc-kr');
  const [targetEncoding, setTargetEncoding] = useState<string>('utf-8');
  const [fileName, setFileName] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  // Safe real-time conversion using useMemo with [rawArrayBuffer, rawText, sourceEncoding] dependency array
  const convertedResult = useMemo(() => {
    try {
      let text = '';
      if (rawArrayBuffer) {
        const normLang = getValidEncodingLabel(sourceEncoding);
        const decoder = new TextDecoder(normLang, { fatal: false });
        text = decoder.decode(rawArrayBuffer);
      } else {
        text = rawText || '';
      }

      const lines = text ? text.split('\n').length : 0;
      const chars = text ? text.length : 0;

      return {
        isValid: true,
        text,
        error: null,
        stats: { chars, lines },
      };
    } catch (err: any) {
      console.warn('Encoding conversion error:', err);
      return {
        isValid: false,
        text: '',
        error: err?.message || '지원하지 않거나 잘못된 인코딩 형식입니다.',
        stats: { chars: 0, lines: 0 },
      };
    }
  }, [rawArrayBuffer, rawText, sourceEncoding]);

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setRawText(e.target.value);
    setRawArrayBuffer(null);
    setFileName(null);
  };

  const handleProcessFile = (file: File) => {
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const buffer = e.target?.result as ArrayBuffer;
      if (buffer) {
        setRawArrayBuffer(buffer);
        setRawText('');
        showToast(`✓ 파일(${file.name})이 로드되었습니다.`);
      }
    };
    reader.onerror = () => {
      showToast('⚠ 파일 읽기 실패');
    };
    reader.readAsArrayBuffer(file);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleProcessFile(file);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleProcessFile(file);
    }
  };

  const handleCopy = useCallback(async () => {
    if (!convertedResult.isValid || !convertedResult.text) return;
    const textToCopy = convertedResult.text;
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(textToCopy);
        showToast('✓ 변환된 결과가 클립보드에 복사되었습니다.');
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
          showToast('✓ 변환된 결과가 클립보드에 복사되었습니다.');
        } else {
          showToast('⚠ 복사 실패 (브라우저 보안 제한)');
        }
      } catch (fallbackErr) {
        console.error('Fallback copy failed:', fallbackErr);
        showToast('⚠ 클립보드 복사 실패');
      }
    }
  }, [convertedResult]);

  const handleDownload = () => {
    if (!convertedResult.isValid || !convertedResult.text) return;
    try {
      const blob = new Blob([convertedResult.text], { type: `text/plain;charset=${targetEncoding}` });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName ? `converted_${fileName}` : `converted_text_${Date.now()}.txt`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('✓ 파일이 다운로드되었습니다.');
    } catch (err) {
      console.error('Download failed:', err);
      showToast('⚠ 파일 다운로드 실패');
    }
  };

  const handleClear = () => {
    setRawText('');
    setRawArrayBuffer(null);
    setFileName(null);
    showToast('입력창이 초기화되었습니다.');
  };

  if (!isOpen) return null;

  return (
    <div
      id="encoding-converter-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/60 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        id="encoding-converter-modal-container"
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
              <RefreshCw className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2">
                인코딩 변환기 (Encoding Converter)
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 font-mono font-medium">
                  EUC-KR ⇄ UTF-8
                </span>
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0 flex-nowrap">
            {/* Source Encoding Selector */}
            <div className="flex items-center gap-1.5 bg-stone-100 dark:bg-stone-800 px-2.5 py-1 rounded-xl text-xs">
              <span className="text-stone-500 dark:text-stone-400 font-medium">원본 인코딩:</span>
              <select
                value={sourceEncoding}
                onChange={(e) => setSourceEncoding(e.target.value)}
                className="bg-transparent font-medium text-stone-800 dark:text-stone-200 outline-none cursor-pointer"
              >
                {SUPPORTED_ENCODINGS.map((enc) => (
                  <option key={enc.value} value={enc.value} className="bg-white dark:bg-stone-800">
                    {enc.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Target Encoding Selector */}
            <div className="flex items-center gap-1.5 bg-stone-100 dark:bg-stone-800 px-2.5 py-1 rounded-xl text-xs">
              <span className="text-stone-500 dark:text-stone-400 font-medium">대상 인코딩:</span>
              <select
                value={targetEncoding}
                onChange={(e) => setTargetEncoding(e.target.value)}
                className="bg-transparent font-medium text-stone-800 dark:text-stone-200 outline-none cursor-pointer"
              >
                {SUPPORTED_ENCODINGS.map((enc) => (
                  <option key={enc.value} value={enc.value} className="bg-white dark:bg-stone-800">
                    {enc.label}
                  </option>
                ))}
              </select>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.csv,.log,.dat"
              className="hidden"
              onChange={handleFileUpload}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-3 py-1.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 hover:bg-stone-100 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-200 text-xs font-semibold flex items-center gap-1.5 transition-colors shrink-0"
              title="파일 업로드 (.txt, .csv, .log)"
            >
              <Upload className="w-3.5 h-3.5 text-amber-500" />
              <span>파일 업로드</span>
            </button>

            <button
              type="button"
              onClick={handleDownload}
              disabled={!convertedResult.isValid || !convertedResult.text}
              className="px-3 py-1.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 hover:bg-stone-100 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-200 text-xs font-semibold flex items-center gap-1.5 transition-colors shrink-0 disabled:opacity-40"
              title="변환된 텍스트 다운로드 (.txt)"
            >
              <Download className="w-3.5 h-3.5 text-sky-500" />
              <span>다운로드</span>
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
              onClick={handleCopy}
              disabled={!convertedResult.isValid || !convertedResult.text}
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

        {/* Split Screen Body (2-Column Layout with Drag & Drop) */}
        <div
          className={`flex-1 grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-stone-200 dark:divide-stone-800 overflow-hidden relative transition-colors ${
            isDragging ? 'bg-amber-500/10' : 'bg-stone-50/40 dark:bg-[#141414]/40'
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {isDragging && (
            <div className="absolute inset-0 z-40 bg-amber-500/15 backdrop-blur-[2px] border-2 border-dashed border-amber-500 rounded-2xl flex flex-col items-center justify-center pointer-events-none">
              <Upload className="w-10 h-10 text-amber-500 animate-bounce mb-2" />
              <div className="text-sm font-bold text-stone-900 dark:text-stone-100">
                인코딩 변환할 파일을 여기에 놓으세요
              </div>
            </div>
          )}

          {/* Left Column: Raw Input */}
          <div className="flex flex-col h-full p-4 overflow-hidden">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-stone-200/80 dark:border-stone-800 text-xs font-semibold text-stone-600 dark:text-stone-300">
              <span className="flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-amber-500" />
                <span>원본 입력 (Raw 텍스트 또는 파일)</span>
                {fileName && (
                  <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-600 text-[10px] font-mono">
                    {fileName}
                  </span>
                )}
              </span>
              <span className="font-mono text-[11px] text-stone-400">
                {rawArrayBuffer ? `${(rawArrayBuffer.byteLength / 1024).toFixed(1)} KB (Binary)` : `${rawText.length.toLocaleString()} 글자`}
              </span>
            </div>

            {rawArrayBuffer ? (
              <div className="flex-1 w-full p-4 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-[#1c1c1c] flex flex-col items-center justify-center text-center">
                <FileText className="w-12 h-12 text-amber-500 mb-2 opacity-80" />
                <div className="text-sm font-bold text-stone-800 dark:text-stone-200 mb-1">
                  업로드된 파일 바이트 로드 완료
                </div>
                <div className="text-xs text-stone-400 font-mono mb-4">
                  {fileName} ({(rawArrayBuffer.byteLength / 1024).toFixed(1)} KB)
                </div>
                <button
                  type="button"
                  onClick={() => setRawArrayBuffer(null)}
                  className="px-3 py-1.5 rounded-lg border border-stone-300 dark:border-stone-600 text-xs font-semibold text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
                >
                  텍스트 직접 입력 모드로 전환
                </button>
              </div>
            ) : (
              <textarea
                value={rawText}
                onChange={handleTextChange}
                placeholder="여기에 인코딩이 깨진 텍스트를 붙여넣거나 파일을 드래그 & 드롭하세요..."
                className="flex-1 w-full p-4 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-[#1c1c1c] text-stone-900 dark:text-stone-100 font-mono text-xs leading-relaxed focus:ring-2 focus:ring-amber-500 focus:border-amber-500 focus:outline-hidden transition-all resize-none custom-scrollbar"
                spellCheck={false}
              />
            )}
          </div>

          {/* Right Column: Converted Output Preview */}
          <div className="flex flex-col h-full p-4 overflow-hidden">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-stone-200/80 dark:border-stone-800 text-xs font-semibold text-stone-600 dark:text-stone-300">
              <span className="flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-emerald-500" />
                <span>변환된 텍스트 프리뷰 ({targetEncoding.toUpperCase()})</span>
              </span>
              {convertedResult.isValid ? (
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-mono text-[10px] font-bold">
                  ✓ 디코딩 완료
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 font-mono text-[10px] font-bold">
                  ⚠ 인코딩 에러
                </span>
              )}
            </div>

            <div className="flex-1 w-full rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-[#1c1c1c] overflow-y-auto p-4 font-mono text-xs leading-relaxed custom-scrollbar relative">
              {!convertedResult.isValid ? (
                <div className="h-full flex flex-col items-center justify-center p-6 text-center">
                  <div className="w-12 h-12 rounded-full bg-rose-500/10 text-rose-500 flex items-center justify-center mb-3">
                    <AlertCircle className="w-6 h-6" />
                  </div>
                  <h4 className="text-sm font-bold text-rose-600 dark:text-rose-400 mb-1">
                    인코딩 디코딩 에러
                  </h4>
                  <p className="text-xs text-stone-500 dark:text-stone-400 font-mono bg-rose-500/5 p-3 rounded-lg border border-rose-500/20 max-w-md break-all">
                    {convertedResult.error}
                  </p>
                </div>
              ) : convertedResult.text ? (
                <pre className="m-0 p-0 bg-transparent text-stone-800 dark:text-[#f1f5f9] font-mono text-xs leading-relaxed whitespace-pre-wrap break-all">
                  {convertedResult.text}
                </pre>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-stone-400">
                  <RefreshCw className="w-8 h-8 mb-2 opacity-30 animate-spin" />
                  <p className="text-xs">변환할 텍스트나 파일을 입력해주세요.</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-stone-200 dark:border-stone-800 bg-stone-50/70 dark:bg-stone-900/70 flex items-center justify-between text-xs text-stone-500 shrink-0">
          <span>💡 <strong>팁:</strong> EUC-KR / CP949로 인코딩된 레거시 텍스트나 로그 파일을 드래그 & 드롭하여 즉시 UTF-8로 변환하세요.</span>
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
