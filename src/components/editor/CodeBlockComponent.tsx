import React, { useMemo } from 'react';
import { NodeViewWrapper, NodeViewContent, ReactNodeViewProps } from '@tiptap/react';
import { Copy, Check, Sparkles, FileCode, Zap } from 'lucide-react';
import { formatJavaOrGeneralCode, detectLanguage } from '../../utils/codeHighlighter';

const COMMON_LANGUAGES = [
  { value: 'auto', label: '⚡ 자동 언어 감지' },
  { value: 'sql', label: 'SQL' },
  { value: 'java', label: 'Java' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'python', label: 'Python' },
  { value: 'json', label: 'JSON' },
  { value: 'html', label: 'HTML / XML' },
  { value: 'css', label: 'CSS' },
  { value: 'bash', label: 'Bash / Shell' },
  { value: 'csharp', label: 'C#' },
  { value: 'cpp', label: 'C / C++' },
  { value: 'plaintext', label: '일반 텍스트' },
];

export const CodeBlockComponent: React.FC<ReactNodeViewProps> = ({
  node,
  updateAttributes,
}) => {
  const [copied, setCopied] = React.useState(false);
  const rawLang = (node?.attrs?.language as string) || 'auto';

  // Automatically detect language from code content when in 'auto' mode
  const detectedInfo = useMemo(() => {
    const text = node?.textContent || '';
    if (!text.trim()) return { language: 'sql', isCode: false };
    const detected = detectLanguage(text);
    return {
      language: detected.isCode ? detected.language : 'sql',
      isCode: detected.isCode,
    };
  }, [node?.textContent]);

  const effectiveLang = rawLang === 'auto' ? detectedInfo.language : rawLang;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(node?.textContent || '');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy code', err);
    }
  };

  const handleFormatCode = () => {
    const raw = node?.textContent || '';
    if (!raw) return;
    const formatted = formatJavaOrGeneralCode(raw);
    navigator.clipboard.writeText(formatted);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const detectedLabel =
    COMMON_LANGUAGES.find((l) => l.value === effectiveLang)?.label || effectiveLang.toUpperCase();

  return (
    <NodeViewWrapper className="relative my-4 rounded-xl border border-stone-200 dark:border-stone-800 bg-slate-50/80 dark:bg-[#1e1e1e] shadow-xs dark:shadow-lg overflow-hidden group">
      {/* Code Header Bar */}
      <div
        contentEditable={false}
        className="flex items-center justify-between px-3.5 py-1.5 bg-stone-100/90 dark:bg-[#252526] border-b border-stone-200 dark:border-stone-800 text-xs text-stone-700 dark:text-stone-300 select-none"
      >
        <div className="flex items-center gap-2">
          {/* macOS window dot decor */}
          <div className="flex items-center gap-1.5 mr-1">
            <div className="w-2.5 h-2.5 rounded-full bg-[#ff5f56]" />
            <div className="w-2.5 h-2.5 rounded-full bg-[#ffbd2e]" />
            <div className="w-2.5 h-2.5 rounded-full bg-[#27c93f]" />
          </div>

          <FileCode className="w-3.5 h-3.5 text-amber-500" />

          {/* Language Selector */}
          <select
            value={rawLang}
            onChange={(e) => updateAttributes({ language: e.target.value })}
            className="bg-white dark:bg-[#2d2d2d] text-stone-800 dark:text-stone-200 border border-stone-300 dark:border-stone-600 rounded px-2 py-0.5 text-xs font-sans font-medium focus:outline-none focus:border-amber-500 cursor-pointer shadow-2xs"
          >
            {COMMON_LANGUAGES.map((l) => (
              <option key={l.value} value={l.value}>
                {l.value === 'auto'
                  ? `⚡ 자동 감지 (${detectedLabel})`
                  : l.label}
              </option>
            ))}
          </select>

          {rawLang === 'auto' && (
            <span className="hidden sm:inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded bg-amber-500/10 dark:bg-amber-400/10 text-amber-700 dark:text-amber-400 font-medium">
              <Zap className="w-3 h-3" />
              {detectedLabel} 인식됨
            </span>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleFormatCode}
            title="정렬된 코드 클립보드 복사 (들여쓰기 보존)"
            className="flex items-center gap-1 px-2 py-0.5 rounded bg-white hover:bg-stone-50 dark:bg-[#333333] dark:hover:bg-stone-700 text-stone-600 hover:text-stone-900 dark:text-stone-300 dark:hover:text-white border border-stone-200 dark:border-stone-700 transition-colors text-[11px] shadow-2xs"
          >
            <Sparkles className="w-3 h-3 text-amber-500" />
            <span className="hidden sm:inline">포맷 복사</span>
          </button>

          <button
            type="button"
            onClick={handleCopy}
            title="코드 복사"
            className="flex items-center gap-1 px-2 py-0.5 rounded bg-white hover:bg-stone-50 dark:bg-[#333333] dark:hover:bg-stone-700 text-stone-600 hover:text-stone-900 dark:text-stone-300 dark:hover:text-white border border-stone-200 dark:border-stone-700 transition-colors text-[11px] shadow-2xs"
          >
            {copied ? (
              <>
                <Check className="w-3 h-3 text-emerald-500" />
                <span className="text-emerald-600 dark:text-emerald-400 font-medium">복사됨</span>
              </>
            ) : (
              <>
                <Copy className="w-3 h-3 text-stone-500 dark:text-stone-400" />
                <span>복사</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Code Editor Area */}
      <pre className="p-4 m-0 overflow-x-auto font-mono text-xs leading-relaxed text-stone-900 dark:text-[#d4d4d4] bg-slate-50/60 dark:bg-[#1e1e1e]">
        <NodeViewContent as={'code' as any} className={`language-${effectiveLang} block whitespace-pre`} />
      </pre>
    </NodeViewWrapper>
  );
};
