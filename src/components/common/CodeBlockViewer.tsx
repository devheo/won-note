import React, { useState, useEffect } from 'react';
import {
  detectLanguage,
  highlightCode,
  extractRawCode,
  SupportedLanguage,
} from '../../utils/codeHighlighter';
import { Check, Copy, Terminal, Code2, Database, Moon, Sun } from 'lucide-react';

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
  const [codeTheme, setCodeTheme] = useState<'dark' | 'light'>(() => {
    try {
      const saved = localStorage.getItem('wonbee_code_theme');
      if (saved === 'light' || saved === 'dark') return saved;
    } catch (_) {}
    return 'dark'; // Default to high-contrast Dark IDE theme
  });

  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'wonbee_code_theme' && (e.newValue === 'light' || e.newValue === 'dark')) {
        setCodeTheme(e.newValue);
      }
    };
    const handleCustom = () => {
      try {
        const saved = localStorage.getItem('wonbee_code_theme');
        if (saved === 'light' || saved === 'dark') setCodeTheme(saved);
      } catch (_) {}
    };
    window.addEventListener('storage', handleStorage);
    window.addEventListener('wonbee_code_theme_change', handleCustom);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('wonbee_code_theme_change', handleCustom);
    };
  }, []);

  const toggleTheme = (e: React.MouseEvent) => {
    e.stopPropagation();
    const nextTheme = codeTheme === 'dark' ? 'light' : 'dark';
    setCodeTheme(nextTheme);
    try {
      localStorage.setItem('wonbee_code_theme', nextTheme);
      window.dispatchEvent(new Event('wonbee_code_theme_change'));
    } catch (_) {}
  };

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
    return <Code2 className="w-3.5 h-3.5 text-sky-400" />;
  };

  const isDark = codeTheme === 'dark';

  return (
    <div
      data-code-theme={isDark ? 'dark' : 'light'}
      className={`rounded-xl overflow-hidden border flex flex-col my-1 text-left font-mono transition-colors duration-150 ${
        isDark
          ? 'code-theme-dark bg-[#16181d] border-[#2d3139] shadow-md text-[#f1f5f9]'
          : 'bg-[#f8fafc] border-stone-300 shadow-xs text-[#0f172a]'
      } ${className}`}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header with language tag, theme toggle, and Copy button */}
      <div
        className={`flex items-center justify-between px-3 py-1.5 border-b text-xs select-none transition-colors duration-150 ${
          isDark
            ? 'bg-[#1f232b] border-[#2d3139] text-[#cbd5e1]'
            : 'bg-stone-100/90 border-stone-200 text-stone-700'
        }`}
      >
        <div className="flex items-center gap-1.5">
          {getLangIcon()}
          <span className="font-bold text-[11px] uppercase tracking-wider">
            {lang === 'sql' ? 'SQL Query' : lang}
          </span>
          <span className={`text-[10px] ${isDark ? 'text-stone-400' : 'text-stone-500'}`}>
            ({lineCount}줄)
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Quick theme toggle */}
          <button
            type="button"
            onClick={toggleTheme}
            title={isDark ? '라이트 테마로 보기' : '다크 IDE 모드로 보기'}
            className={`flex items-center gap-1 px-2 py-0.5 rounded border transition-colors text-[11px] font-medium shadow-2xs ${
              isDark
                ? 'bg-[#282c34] hover:bg-[#353b45] text-amber-400 border-[#3e4451]'
                : 'bg-white hover:bg-stone-50 text-stone-700 border-stone-200'
            }`}
          >
            {isDark ? (
              <>
                <Sun className="w-3 h-3 text-amber-400" />
                <span className="hidden sm:inline">라이트</span>
              </>
            ) : (
              <>
                <Moon className="w-3 h-3 text-indigo-500" />
                <span className="hidden sm:inline">다크 IDE</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleCopy}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all shadow-xs border ${
              copied
                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                : isDark
                ? 'bg-[#282c34] hover:bg-amber-500 hover:text-stone-950 text-stone-300 border-[#3e4451] hover:border-amber-400'
                : 'bg-white hover:bg-stone-50 text-stone-700 border-stone-200 hover:border-stone-300'
            }`}
            title="코드 클립보드에 복사"
          >
            {copied ? (
              <>
                <Check className="w-3 h-3 text-emerald-500" />
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
      </div>

      {/* Code Body */}
      <div className={`p-3 overflow-x-auto custom-scrollbar ${maxHeight} text-xs leading-relaxed`}>
        <div className="flex">
          {/* Line Numbers */}
          {showLineNumbers && lineCount > 1 && (
            <div
              className={`select-none pr-3 mr-3 border-r text-right font-mono text-[11px] leading-relaxed ${
                isDark
                  ? 'border-[#2d3139] text-[#64748b]'
                  : 'border-stone-200 text-stone-400'
              }`}
            >
              {Array.from({ length: lineCount }).map((_, i) => (
                <div key={i}>{i + 1}</div>
              ))}
            </div>
          )}

          {/* Highlighted Code */}
          <pre
            className={`m-0 p-0 bg-transparent overflow-visible font-mono text-[11.5px] leading-relaxed flex-1 transition-colors duration-150 ${
              isDark ? 'text-[#f1f5f9]' : 'text-[#0f172a]'
            }`}
          >
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
