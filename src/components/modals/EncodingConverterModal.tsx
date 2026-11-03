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
  Wand2,
  Link,
} from 'lucide-react';

interface EncodingConverterModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SUPPORTED_ENCODINGS = [
  { label: '🔍 자동 감지(Auto Detect)', value: 'auto' },
  { label: 'EUC-KR/CP949', value: 'euc-kr' },
  { label: 'UTF-8(유니코드)', value: 'utf-8' },
  { label: 'Shift_JIS(일본어)', value: 'shift_jis' },
  { label: 'GBK/GB18030(중국어 간체)', value: 'gbk' },
  { label: 'Big5(중국어 번체)', value: 'big5' },
  { label: 'ISO-8859-1(Latin1)', value: 'iso-8859-1' },
  { label: 'UTF-16LE', value: 'utf-16le' },
  { label: 'UTF-16BE', value: 'utf-16be' },
];

const INITIAL_SAMPLE =
  '/**\n * 컴포넌트속성 : 이벤트\n * 컴포넌트명  : screen\n * 이벤트명 : on_load\n * 설명 : 화면 Load시 발생하는 이벤트 화면 초기화 작업을 수행한다.\n */';

function getValidEncodingLabel(label: string): string {
  const l = (label || 'utf-8').toLowerCase().trim();
  if (l === 'cp949' || l === 'euc-kr' || l === 'windows-949' || l === 'ksc5601') {
    return 'windows-949';
  }
  if (l === 'ascii' || l === 'us-ascii') return 'utf-8';
  return l;
}

export const EncodingConverterModal: React.FC<EncodingConverterModalProps> = ({ isOpen, onClose }) => {
  // Mode: 'encoding' (Character encoding converter) vs 'url' (URL Encoder/Decoder)
  const [converterMode, setConverterMode] = useState<'encoding' | 'url'>('encoding');

  const [rawText, setRawText] = useState<string>(INITIAL_SAMPLE);
  const [rawArrayBuffer, setRawArrayBuffer] = useState<ArrayBuffer | null>(null);
  const [sourceEncoding, setSourceEncoding] = useState<string>('auto');
  const [targetEncoding, setTargetEncoding] = useState<string>('utf-8');
  const [fileName, setFileName] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  // URL Encoder / Decoder computed result
  const urlResult = useMemo(() => {
    const text = rawText || '';
    let encoded = '';
    let decoded = '';
    try {
      encoded = encodeURIComponent(text);
    } catch {
      encoded = '';
    }
    try {
      decoded = decodeURIComponent(text);
    } catch {
      decoded = '(유효하지 않은 URL 인코딩 문자열이거나 디코딩할 수 없는 형식입니다)';
    }
    return { encoded, decoded };
  }, [rawText]);

  // Character Encoding conversion result (useMemo)
  const convertedResult = useMemo(() => {
    try {
      let bytes: Uint8Array;

      if (rawArrayBuffer) {
        bytes = new Uint8Array(rawArrayBuffer);
      } else {
        const str = rawText || '';
        try {
          const byteString = unescape(encodeURIComponent(str));
          bytes = new Uint8Array(byteString.length);
          for (let i = 0; i < byteString.length; i++) {
            bytes[i] = byteString.charCodeAt(i) & 0xff;
          }
        } catch {
          bytes = new Uint8Array(str.length);
          for (let i = 0; i < str.length; i++) {
            bytes[i] = str.charCodeAt(i) & 0xff;
          }
        }
      }

      let activeEncoding = sourceEncoding;
      let detectedLabel = '';
      let confidence = 0;

      if (sourceEncoding === 'auto') {
        const hasNonAscii = bytes.some((b) => b > 0x7f);

        if (!hasNonAscii) {
          activeEncoding = 'utf-8';
          detectedLabel = 'ASCII / UTF-8';
          confidence = 100;
        } else {
          let isUtf8 = true;
          let i = 0;
          const len = Math.min(bytes.length, 20000);

          while (i < len) {
            const b = bytes[i];
            if (b > 0x7f) {
              if ((b & 0xe0) === 0xc0) {
                if (i + 1 >= len || (bytes[i + 1] & 0xc0) !== 0x80) { isUtf8 = false; break; }
                i += 2;
              } else if ((b & 0xf0) === 0xe0) {
                if (i + 2 >= len || (bytes[i + 1] & 0xc0) !== 0x80 || (bytes[i + 2] & 0xc0) !== 0x80) { isUtf8 = false; break; }
                i += 3;
              } else if ((b & 0xf8) === 0xf0) {
                if (i + 3 >= len || (bytes[i + 1] & 0xc0) !== 0x80 || (bytes[i + 2] & 0xc0) !== 0x80 || (bytes[i + 3] & 0xc0) !== 0x80) { isUtf8 = false; break; }
                i += 4;
              } else {
                isUtf8 = false;
                break;
              }
            } else {
              i++;
            }
          }

          if (isUtf8) {
            activeEncoding = 'utf-8';
            detectedLabel = 'UTF-8';
            confidence = 95;
          } else {
            activeEncoding = 'windows-949';
            detectedLabel = 'EUC-KR / CP949';
            confidence = 90;
          }
        }
      }

      const normLang = getValidEncodingLabel(activeEncoding);
      const decoder = new TextDecoder(normLang, { fatal: false });
      const text = decoder.decode(bytes);

      const lines = text ? text.split('\n').length : 0;
      const chars = text ? text.length : 0;

      return {
        isValid: true,
        text,
        error: null,
        detectedLabel,
        confidence,
        effectiveEncoding: normLang,
        stats: { chars, lines },
      };
    } catch (err: any) {
      console.warn('Encoding conversion error:', err);
      return {
        isValid: false,
        text: '',
        error: err?.message || '지원하지 않거나 잘못된 인코딩 형식입니다.',
        detectedLabel: '',
        confidence: 0,
        effectiveEncoding: 'utf-8',
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

  const handleCopy = useCallback(async (textToCopy: string) => {
    if (!textToCopy) return;
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(textToCopy);
        showToast('✓ 결과가 클립보드에 복사되었습니다.');
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
          showToast('✓ 결과가 클립보드에 복사되었습니다.');
        } else {
          showToast('⚠ 복사 실패 (브라우저 보안 제한)');
        }
      } catch (fallbackErr) {
        console.error('Fallback copy failed:', fallbackErr);
        showToast('⚠ 클립보드 복사 실패');
      }
    }
  }, []);

  const handleDownload = () => {
    if (converterMode === 'url') {
      handleCopy(urlResult.encoded);
      return;
    }
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
        className="bg-white dark:bg-stone-900 rounded-2xl shadow-2xl border border-stone-200 dark:border-stone-800 w-full max-w-5xl h-[88vh] max-h-[92vh] flex flex-col overflow-hidden text-stone-900 dark:text-stone-100 animate-in zoom-in-95 duration-150 relative"
        onClick={(e) => e.stopPropagation()}
      >
        {toastMessage && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 bg-stone-900/90 dark:bg-stone-100 text-white dark:text-stone-900 px-4 py-2 rounded-xl text-xs font-semibold shadow-xl flex items-center gap-2 backdrop-blur-sm animate-in fade-in zoom-in-95 pointer-events-none">
            <Check className="w-4 h-4 text-emerald-400 dark:text-emerald-600" />
            <span>{toastMessage}</span>
          </div>
        )}

        {/* Header */}
{/* 1. 최상단 메인 헤더 & 액션 버튼 (항상 우측 고정) */}
        <div className="flex items-center justify-between gap-3 px-6 py-3 border-b border-stone-200 dark:border-stone-800 bg-stone-50/90 dark:bg-stone-900/90 shrink-0">
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 dark:bg-amber-400/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
              {converterMode === 'encoding' ? <RefreshCw className="w-4 h-4" /> : <Link className="w-4 h-4" />}
            </div>
            <h2 className="text-sm font-bold text-stone-900 dark:text-stone-100 truncate">
              {converterMode === 'encoding' ? '인코딩 변환기 (Encoding Converter)' : 'URL 인코더 / 디코더 (URL Codec)'}
            </h2>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.csv,.log,.dat,.jsp,.java,.sql"
              className="hidden"
              onChange={handleFileUpload}
            />

            {converterMode === 'encoding' && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-3 py-1.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 hover:bg-stone-100 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-200 text-xs font-semibold flex items-center gap-1.5 transition-colors shrink-0 cursor-pointer shadow-2xs"
              >
                <Upload className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                <span>파일 업로드</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleClear}
              className="px-3 py-1.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 hover:bg-stone-100 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-200 text-xs font-semibold flex items-center gap-1.5 transition-colors shrink-0 cursor-pointer shadow-2xs"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-500 shrink-0" />
              <span>지우기</span>
            </button>

            <button
              type="button"
              onClick={() => handleCopy(converterMode === 'url' ? urlResult.encoded : convertedResult.text)}
              disabled={converterMode === 'encoding' && (!convertedResult.isValid || !convertedResult.text)}
              className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-stone-950 font-bold text-xs flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer shrink-0"
            >
              <Copy className="w-3.5 h-3.5 shrink-0" />
              <span>결과 복사</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors ml-1 shrink-0 cursor-pointer"
            >
              <X className="w-4 h-4 shrink-0" />
            </button>
          </div>
        </div>

        {/* 2. 서브 헤더 (모드 탭 & 인코딩 선택 옵션 - 하단 분리) */}
        <div className="flex items-center justify-between gap-3 px-6 py-2 border-b border-stone-200/80 dark:border-stone-800/80 bg-stone-100/60 dark:bg-stone-900/50 shrink-0 overflow-x-auto whitespace-nowrap custom-scrollbar">
          <div className="flex items-center bg-stone-200/70 dark:bg-stone-800 p-0.5 rounded-xl text-xs font-semibold shrink-0">
            <button
              type="button"
              onClick={() => setConverterMode('encoding')}
              className={`px-3 py-1 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 shrink-0 ${
                converterMode === 'encoding'
                  ? 'bg-white dark:bg-stone-700 text-stone-900 dark:text-white shadow-2xs font-bold'
                  : 'text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200'
              }`}
            >
              <RefreshCw className="w-3.5 h-3.5 shrink-0" />
              <span>인코딩 변환기</span>
            </button>
            <button
              type="button"
              onClick={() => setConverterMode('url')}
              className={`px-3 py-1 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 shrink-0 ${
                converterMode === 'url'
                  ? 'bg-white dark:bg-stone-700 text-stone-900 dark:text-white shadow-2xs font-bold'
                  : 'text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200'
              }`}
            >
              <Link className="w-3.5 h-3.5 shrink-0" />
              <span>URL 인코더/디코더</span>
            </button>
          </div>

          {converterMode === 'encoding' && (
            <div className="flex items-center gap-2 shrink-0">
              <div className="flex items-center gap-1.5 bg-white dark:bg-stone-800/90 border border-stone-200/80 dark:border-stone-700/80 px-2.5 py-1 rounded-xl text-xs shrink-0 shadow-2xs">
                <span className="text-stone-500 dark:text-stone-400 font-medium">원본:</span>
                <select
                  value={sourceEncoding}
                  onChange={(e) => setSourceEncoding(e.target.value)}
                  className="bg-transparent font-semibold text-stone-800 dark:text-stone-200 outline-none cursor-pointer"
                >
                  {SUPPORTED_ENCODINGS.map((enc) => (
                    <option key={enc.value} value={enc.value} className="bg-white dark:bg-stone-800">
                      {enc.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-1.5 bg-white dark:bg-stone-800/90 border border-stone-200/80 dark:border-stone-700/80 px-2.5 py-1 rounded-xl text-xs shrink-0 shadow-2xs">
                <span className="text-stone-500 dark:text-stone-400 font-medium">대상:</span>
                <select
                  value={targetEncoding}
                  onChange={(e) => setTargetEncoding(e.target.value)}
                  className="bg-transparent font-semibold text-stone-800 dark:text-stone-200 outline-none cursor-pointer"
                >
                  {SUPPORTED_ENCODINGS.filter((e) => e.value !== 'auto').map((enc) => (
                    <option key={enc.value} value={enc.value} className="bg-white dark:bg-stone-800">
                      {enc.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>        {/* Body */}
        {converterMode === 'encoding' ? (
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

            {/* Left Column */}
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
                  {rawArrayBuffer
                    ? `${(rawArrayBuffer.byteLength / 1024).toFixed(1)} KB (Binary)`
                    : `${rawText.length.toLocaleString()} 글자`}
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
                    className="px-3 py-1.5 rounded-lg border border-stone-300 dark:border-stone-600 text-xs font-semibold text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors cursor-pointer"
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

            {/* Right Column */}
            <div className="flex flex-col h-full p-4 overflow-hidden">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-stone-200/80 dark:border-stone-800 text-xs font-semibold text-stone-600 dark:text-stone-300">
                <span className="flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-emerald-500" />
                  <span>변환된 텍스트 프리뷰 ({targetEncoding.toUpperCase()})</span>
                </span>
                <div className="flex items-center gap-2">
                  {sourceEncoding === 'auto' && convertedResult.detectedLabel && (
                    <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 font-mono text-[10px] font-bold">
                      <Wand2 className="w-3 h-3" />
                      감지: {convertedResult.detectedLabel} ({convertedResult.confidence}%)
                    </span>
                  )}
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
                  <pre className="m-0 p-0 bg-transparent text-stone-800 dark:text-[#f1f5f9] font-mono text-xs leading-relaxed whitespace-pre-wrap break-all select-text">
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
        ) : (
          /* URL Encoder / Decoder Body */
          <div className="flex-1 grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-stone-200 dark:divide-stone-800 overflow-hidden bg-stone-50/40 dark:bg-[#141414]/40 p-4 gap-4">
            {/* Left: Input Text */}
            <div className="flex flex-col h-full overflow-hidden">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-stone-200/80 dark:border-stone-800 text-xs font-semibold text-stone-600 dark:text-stone-300">
                <span className="flex items-center gap-1.5">
                  <Link className="w-4 h-4 text-amber-500" />
                  <span>URL 원본 입력 (Text / Encoded URL)</span>
                </span>
                <span className="font-mono text-[11px] text-stone-400">
                  {rawText.length.toLocaleString()} 글자
                </span>
              </div>
              <textarea
                value={rawText}
                onChange={handleTextChange}
                placeholder="인코딩할 텍스트나 디코딩할 URL 인코딩 문자열(%ED%95%9C...)을 입력하세요..."
                className="flex-1 w-full p-4 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-[#1c1c1c] text-stone-900 dark:text-stone-100 font-mono text-xs leading-relaxed focus:ring-2 focus:ring-amber-500 focus:border-amber-500 focus:outline-hidden transition-all resize-none custom-scrollbar"
                spellCheck={false}
              />
            </div>

            {/* Right: Encoded & Decoded Results */}
            <div className="flex flex-col h-full overflow-y-auto custom-scrollbar space-y-4">
              {/* Encoded Box */}
              <div className="flex flex-col flex-1 bg-white dark:bg-[#1c1c1c] rounded-xl border border-stone-200 dark:border-stone-700 p-4">
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-stone-200 dark:border-stone-800 text-xs font-semibold text-stone-600 dark:text-stone-300">
                  <span className="flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-amber-500" />
                    <span>URL 인코딩 결과 (encodeURIComponent)</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopy(urlResult.encoded)}
                    className="px-2.5 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/25 text-amber-800 dark:text-amber-300 text-[11px] font-bold transition-colors cursor-pointer"
                  >
                    복사
                  </button>
                </div>
                <div className="flex-1 font-mono text-xs text-stone-800 dark:text-stone-200 whitespace-pre-wrap break-all select-text overflow-auto max-h-36 custom-scrollbar p-1">
                  {urlResult.encoded || '(비어있음)'}
                </div>
              </div>

              {/* Decoded Box */}
              <div className="flex flex-col flex-1 bg-white dark:bg-[#1c1c1c] rounded-xl border border-stone-200 dark:border-stone-700 p-4">
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-stone-200 dark:border-stone-800 text-xs font-semibold text-stone-600 dark:text-stone-300">
                  <span className="flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-emerald-500" />
                    <span>URL 디코딩 결과 (decodeURIComponent)</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopy(urlResult.decoded)}
                    className="px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/25 text-emerald-800 dark:text-emerald-300 text-[11px] font-bold transition-colors cursor-pointer"
                  >
                    복사
                  </button>
                </div>
                <div className="flex-1 font-mono text-xs text-stone-800 dark:text-stone-200 whitespace-pre-wrap break-all select-text overflow-auto max-h-36 custom-scrollbar p-1">
                  {urlResult.decoded || '(비어있음)'}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-6 py-3 border-t border-stone-200 dark:border-stone-800 bg-stone-50/70 dark:bg-stone-900/70 flex items-center justify-between text-xs text-stone-500 shrink-0">
          <span>
            {converterMode === 'encoding' ? (
              <>💡 <strong>팁:</strong> 깨진 레거시 파일은 <strong>'파일 업로드'</strong>로 업로드하면 원본 바이트 그대로 디코딩됩니다.</>
            ) : (
              <>💡 <strong>팁:</strong> URL 파라미터나 특수문자가 포함된 문자열을 실시간으로 인코딩 및 디코딩할 수 있습니다.</>
            )}
          </span>
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
