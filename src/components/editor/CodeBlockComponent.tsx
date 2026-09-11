import React, { useMemo, useState, useEffect } from 'react';
import { NodeViewWrapper, NodeViewContent, ReactNodeViewProps } from '@tiptap/react';
import { Copy, Check, Sparkles, FileCode, Zap, Moon, Sun } from 'lucide-react';
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
  const [copied, setCopied] = useState(false);
  // Default to 'dark' for maximum developer contrast and vibrant syntax highlighting
  const [codeTheme, setCodeTheme] = useState<'dark' | 'light'>(() => {
    try {
      const saved = localStorage.getItem('wonbee_code_theme');
      if (saved === 'light' || saved === 'dark') return saved;
    } catch (_) {}
    return 'dark';
  });

  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'wonbee_code_theme' && (e.newValue === 'light' || e.newValue === 'dark')) {
        setCodeTheme(e.newValue);
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const toggleTheme = () => {
    const nextTheme = codeTheme === 'dark' ? 'light' : 'dark';
    setCodeTheme(nextTheme);
    try {
      localStorage.setItem('wonbee_code_theme', nextTheme);
      window.dispatchEvent(new Event('wonbee_code_theme_change'));
    } catch (_) {}
  };

  const rawLang = (node?.attrs?.language as string) || 'auto';

  // Automatically detect language from code content when in 'auto' mode
  const detectedInfo = useMemo(() => {
    const text = node?.textContent || '';
    if (!text.trim()) return { language: 'java', isCode: false };
    const detected = detectLanguage(text);
    const sample = text.length > 32000 ? text.slice(0, 32000) : text;
    const hasJavaPattern = /\b(?:package\s+[a-zA-Z0-9_.]+|import\s+java|public\s+class|class\s+\w+|public\s+static\s+void|System\.out|private\s+|protected\s+|@Override|public\s+static\s+final)\b/.test(sample);
    const lang = detected.isCode ? detected.language : (hasJavaPattern ? 'java' : 'java');
    return {
      language: lang,
      isCode: detected.isCode || hasJavaPattern,
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

  const isDark = codeTheme === 'dark';

  return (
    <NodeViewWrapper
      data-code-theme={isDark ? 'dark' : 'light'}
      className={`relative my-4 rounded-xl border overflow-hidden group transition-colors duration-150 ${
        isDark
          ? 'code-theme-dark bg-[#181a1f] border-[#2d3139] shadow-lg text-[#f1f5f9]'
          : 'bg-[#f8fafc] border-stone-300 shadow-xs text-[#0f172a]'
      }`}
    >
      {/* Code Header Bar */}
      <div
        contentEditable={false}
        className={`flex items-center justify-between px-3.5 py-1.5 border-b text-xs select-none transition-colors duration-150 ${
          isDark
            ? 'bg-[#21252b] border-[#2d3139] text-[#abb2bf]'
            : 'bg-stone-100/90 border-stone-200 text-stone-700'
        }`}
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
            className={`rounded px-2 py-0.5 text-xs font-sans font-medium focus:outline-none focus:border-amber-500 cursor-pointer shadow-2xs transition-colors ${
              isDark
                ? 'bg-[#282c34] text-[#d4d4d4] border-[#3e4451]'
                : 'bg-white text-stone-800 border-stone-300'
            }`}
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
            <span className={`hidden sm:inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded font-medium ${
              isDark
                ? 'bg-amber-400/15 text-amber-400'
                : 'bg-amber-500/10 text-amber-700'
            }`}>
              <Zap className="w-3 h-3" />
              {detectedLabel}
            </span>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1.5">
          {/* Theme Toggle Button */}
          <button
            type="button"
            onClick={toggleTheme}
            title={isDark ? '라이트 테마로 전환' : '다크 IDE 모드로 전환'}
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
            onClick={handleFormatCode}
            title="정렬된 코드 클립보드 복사 (들여쓰기 보존)"
            className={`flex items-center gap-1 px-2 py-0.5 rounded border transition-colors text-[11px] shadow-2xs ${
              isDark
                ? 'bg-[#282c34] hover:bg-[#353b45] text-[#abb2bf] hover:text-white border-[#3e4451]'
                : 'bg-white hover:bg-stone-50 text-stone-600 hover:text-stone-900 border-stone-200'
            }`}
          >
            <Sparkles className="w-3 h-3 text-amber-500" />
            <span className="hidden sm:inline">포맷 복사</span>
          </button>

          <button
            type="button"
            onClick={handleCopy}
            title="코드 복사"
            className={`flex items-center gap-1 px-2 py-0.5 rounded border transition-colors text-[11px] shadow-2xs ${
              isDark
                ? 'bg-[#282c34] hover:bg-[#353b45] text-[#abb2bf] hover:text-white border-[#3e4451]'
                : 'bg-white hover:bg-stone-50 text-stone-600 hover:text-stone-900 border-stone-200'
            }`}
          >
            {copied ? (
              <>
                <Check className="w-3 h-3 text-emerald-500" />
                <span className="text-emerald-500 font-medium">복사됨</span>
              </>
            ) : (
              <>
                <Copy className="w-3 h-3 text-stone-400" />
                <span>복사</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Code Editor Area */}
      <pre
        className={`p-4 m-0 overflow-x-auto font-mono text-xs leading-relaxed transition-colors duration-150 ${
          isDark
            ? 'bg-[#181a1f] text-[#f1f5f9]'
            : 'bg-[#f8fafc] text-[#0f172a]'
        }`}
      >
        <NodeViewContent as={'code' as any} className={`language-${effectiveLang} block whitespace-pre`} />
      </pre>
    </NodeViewWrapper>
  );
};
