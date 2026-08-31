import React, { useState } from 'react';
import {
  detectLanguage,
  highlightCode,
  extractRawCode,
  SupportedLanguage,
} from '../../utils/codeHighlighter';
import { Check, Copy, Terminal, Code2, Database } from 'lucide-react';

interface CodeBlockViewerProps {
  code: string;
  language?: SupportedLanguage;
  maxHeight?: string;
  showLineNumbers?: boolean;
  className?: string;
  compact?: boolean;
}

export const CodeBlockViewer: React.FC<CodeBlockViewerProps> = ({
  code,
  language: explicitLanguage,
  maxHeight = 'max-h-80',
  showLineNumbers = true,
  className = '',
  compact = false,
}) => {
  const [copied, setCopied] = useState(false);

  const rawCode = extractRawCode(code);
  const detected = detectLanguage(rawCode);
  const lang = explicitLanguage || (detected.isCode ? detected.language : 'sql');

  const highlightedHtml = highlightCode(rawCode, lang);
  const lineCount = rawCode.split('\n').length;

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(rawCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy code', err);
    }
  };

  const getLangIcon = () => {
    if (lang === 'sql') return <Database className="w-3.5 h-3.5 text-amber-400" />;
    if (lang === 'bash') return <Terminal className="w-3.5 h-3.5 text-emerald-400" />;
    return <Code2 className="w-3.5 h-3.5 text-indigo-400" />;
  };

  return (
    <div
      className={`rounded-xl overflow-hidden bg-[#16181d] border border-[#2d3139] shadow-lg flex flex-col my-1 text-left font-mono ${className}`}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header with language tag and Copy button */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#1f232b] border-b border-[#2d3139] text-xs select-none">
        <div className="flex items-center gap-1.5">
          {getLangIcon()}
          <span className="font-bold text-[11px] text-stone-300 uppercase tracking-wider">
            {lang === 'sql' ? 'SQL Query' : lang}
          </span>
          <span className="text-[10px] text-stone-500">({lineCount}줄)</span>
        </div>

        <button
          type="button"
          onClick={handleCopy}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all shadow-sm ${
            copied
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
              : 'bg-stone-800 hover:bg-amber-500 hover:text-stone-950 text-stone-300 border border-stone-700 hover:border-amber-400'
          }`}
          title="코드 클립보드에 복사"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 text-emerald-400" />
              <span>복사됨!</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              <span>코드 복사</span>
            </>
          )}
        </button>
      </div>

      {/* Code Body */}
      <div className={`p-3 overflow-x-auto custom-scrollbar ${maxHeight} text-xs leading-relaxed`}>
        <div className="flex">
          {/* Line Numbers */}
          {showLineNumbers && lineCount > 1 && (
            <div className="select-none pr-3 mr-3 border-r border-[#2d3139] text-[#555d6e] text-right font-mono text-[11px] leading-relaxed">
              {Array.from({ length: lineCount }).map((_, i) => (
                <div key={i}>{i + 1}</div>
              ))}
            </div>
          )}

          {/* Highlighted Code */}
          <pre className="m-0 p-0 bg-transparent overflow-visible text-[#e2e8f0] font-mono text-[11.5px] leading-relaxed flex-1">
            <code
              className={`language-${lang}`}
              dangerouslySetInnerHTML={{ __html: highlightedHtml }}
            />
          </pre>
        </div>
      </div>
    </div>
  );
};
