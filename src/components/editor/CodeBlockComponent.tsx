import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { NodeViewWrapper, NodeViewContent, ReactNodeViewProps } from '@tiptap/react';
import { TextSelection } from '@tiptap/pm/state';
import {
  Copy,
  Check,
  Sparkles,
  FileCode,
  Zap,
  Moon,
  Sun,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Maximize2,
  Minimize2,
  Plus,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import { formatJavaOrGeneralCode, detectLanguage } from '../../utils/codeHighlighter';

const COMMON_LANGUAGES = [
  { value: 'auto', label: '⚡ 자동 언어 감지' },
  { value: 'c', label: 'C / Pro*C' },
  { value: 'cpp', label: 'C++' },
  { value: 'sql', label: 'SQL' },
  { value: 'java', label: 'Java' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'python', label: 'Python' },
  { value: 'bash', label: 'Bash / Shell' },
  { value: 'json', label: 'JSON' },
  { value: 'html', label: 'HTML / XML' },
  { value: 'css', label: 'CSS' },
  { value: 'csharp', label: 'C#' },
  { value: 'plaintext', label: '일반 텍스트' },
];

const getAppTheme = (): 'dark' | 'light' => {
  if (typeof document !== 'undefined') {
    return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
  }
  return 'light';
};

export const CodeBlockComponent: React.FC<ReactNodeViewProps> = ({
  node,
  updateAttributes,
  editor,
  getPos,
}) => {
  const [copied, setCopied] = useState(false);
  const [codeTheme, setCodeTheme] = useState<'dark' | 'light'>(() => {
    try {
      const explicit = localStorage.getItem('wonbee_code_theme_explicit');
      if (explicit === 'light' || explicit === 'dark') return explicit;
    } catch (_) {}
    return getAppTheme();
  });

  // Size & Layout attributes
  const currentWidth = (node?.attrs?.width as string) || '100%';
  const currentHeight = (node?.attrs?.height as string) || null;
  const currentAlign = (node?.attrs?.align as 'left' | 'center' | 'right') || 'left';

  // Interactive Resizing state
  const [isResizing, setIsResizing] = useState(false);
  const [resizingWidth, setResizingWidth] = useState<string | null>(null);
  const [resizingHeight, setResizingHeight] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const startDragRef = useRef<{
    startX: number;
    startY: number;
    startWidthPx: number;
    startHeightPx: number;
    parentWidthPx: number;
    direction: 'both' | 'horizontal' | 'vertical';
  } | null>(null);

  // Quick insertion of a blank paragraph before the code block
  const handleInsertParagraphBefore = useCallback((e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (!editor || typeof getPos !== 'function') return;
    try {
      const pos = getPos();
      if (typeof pos !== 'number') return;
      const { state, dispatch } = editor.view;
      const tr = state.tr.insert(pos, state.schema.nodes.paragraph.create());
      const resolved = tr.doc.resolve(pos + 1);
      tr.setSelection(TextSelection.near(resolved));
      dispatch(tr.scrollIntoView());
      editor.view.focus();
    } catch (err) {
      console.error('Failed to insert paragraph before code block:', err);
    }
  }, [editor, getPos]);

  // Quick insertion of a blank paragraph after the code block
  const handleInsertParagraphAfter = useCallback((e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (!editor || typeof getPos !== 'function') return;
    try {
      const pos = getPos();
      if (typeof pos !== 'number') return;
      const targetPos = pos + node.nodeSize;
      const { state, dispatch } = editor.view;
      const tr = state.tr.insert(targetPos, state.schema.nodes.paragraph.create());
      const resolved = tr.doc.resolve(targetPos + 1);
      tr.setSelection(TextSelection.near(resolved));
      dispatch(tr.scrollIntoView());
      editor.view.focus();
    } catch (err) {
      console.error('Failed to insert paragraph after code block:', err);
    }
  }, [editor, getPos, node.nodeSize]);

  // Keyboard shortcut inside the code block: Ctrl+Enter (below) or Ctrl+Shift+Enter (above)
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      handleInsertParagraphAfter();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      handleInsertParagraphBefore();
      return;
    }
  }, [handleInsertParagraphAfter, handleInsertParagraphBefore]);

  const handleResizeStart = useCallback((e: React.MouseEvent, direction: 'both' | 'horizontal' | 'vertical') => {
    e.preventDefault();
    e.stopPropagation();
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const parentRect = containerRef.current.parentElement?.getBoundingClientRect() || rect;

    startDragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startWidthPx: rect.width,
      startHeightPx: rect.height,
      parentWidthPx: parentRect.width || 800,
      direction,
    };
    setIsResizing(true);
  }, []);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!startDragRef.current) return;
      const { startX, startY, startWidthPx, startHeightPx, parentWidthPx, direction } = startDragRef.current;

      if (direction === 'both' || direction === 'horizontal') {
        const deltaX = e.clientX - startX;
        const newWidthPx = Math.max(220, Math.min(parentWidthPx, startWidthPx + deltaX));
        const pct = Math.round((newWidthPx / parentWidthPx) * 100);
        setResizingWidth(`${pct}%`);
      }

      if (direction === 'both' || direction === 'vertical') {
        const deltaY = e.clientY - startY;
        const newHeightPx = Math.max(120, Math.min(1400, startHeightPx + deltaY));
        setResizingHeight(`${newHeightPx}px`);
      }
    };

    const handleMouseUp = () => {
      if (resizingWidth || resizingHeight) {
        const updates: Record<string, any> = {};
        if (resizingWidth) updates.width = resizingWidth;
        if (resizingHeight) updates.height = resizingHeight;
        updateAttributes(updates);
      }
      setIsResizing(false);
      setResizingWidth(null);
      setResizingHeight(null);
      startDragRef.current = null;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, resizingWidth, resizingHeight, updateAttributes]);

  useEffect(() => {
    const updateThemeFromApp = () => {
      try {
        const explicit = localStorage.getItem('wonbee_code_theme_explicit');
        if (explicit === 'light' || explicit === 'dark') {
          setCodeTheme(explicit);
          return;
        }
      } catch (_) {}
      setCodeTheme(getAppTheme());
    };

    const observer = new MutationObserver(() => {
      updateThemeFromApp();
    });
    if (typeof document !== 'undefined') {
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class'],
      });
    }

    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'wonbee_theme') {
        updateThemeFromApp();
      } else if (e.key === 'wonbee_code_theme_explicit' && (e.newValue === 'light' || e.newValue === 'dark')) {
        setCodeTheme(e.newValue);
      }
    };

    const handleCustom = () => {
      updateThemeFromApp();
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener('wonbee_code_theme_change', handleCustom);
    window.addEventListener('wonbee_theme_change', handleCustom);

    return () => {
      observer.disconnect();
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('wonbee_code_theme_change', handleCustom);
      window.removeEventListener('wonbee_theme_change', handleCustom);
    };
  }, []);

  const toggleTheme = () => {
    const nextTheme = codeTheme === 'dark' ? 'light' : 'dark';
    setCodeTheme(nextTheme);
    try {
      localStorage.setItem('wonbee_code_theme_explicit', nextTheme);
      window.dispatchEvent(new Event('wonbee_code_theme_change'));
    } catch (_) {}
  };

  const rawLangAttr = (node?.attrs?.language as string) || 'auto';
  const rawLang = (rawLangAttr === 'markup' || rawLangAttr === 'xml') ? 'html' : rawLangAttr;

  // Automatically detect language from code content when in 'auto' mode
  const detectedInfo = useMemo(() => {
    const text = node?.textContent || '';
    if (!text.trim()) return { language: 'plaintext', isCode: false };
    const detected = detectLanguage(text);
    if (detected.isCode) {
      return {
        language: detected.language,
        isCode: true,
      };
    }
    const sample = text.length > 32000 ? text.slice(0, 32000) : text;
    const hasJavaPattern = /\b(?:package\s+[a-zA-Z0-9_.]+|import\s+java|public\s+class|class\s+\w+|public\s+static\s+void|System\.out|private\s+|protected\s+|@Override|public\s+static\s+final)\b/.test(sample);
    if (hasJavaPattern) {
      return { language: 'java', isCode: true };
    }
    const hasSqlPattern = /\b(?:SELECT\s+|INSERT\s+INTO|UPDATE\s+|DELETE\s+FROM|CREATE\s+TABLE)\b/i.test(sample);
    if (hasSqlPattern) {
      return { language: 'sql', isCode: true };
    }
    return {
      language: 'plaintext',
      isCode: false,
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

  const effectiveWidth = resizingWidth || currentWidth;
  const effectiveHeight = resizingHeight || currentHeight;

  // Alignment classes for non-100% widths
  let alignClasses = '';
  if (effectiveWidth !== '100%') {
    if (currentAlign === 'center') {
      alignClasses = 'mx-auto';
    } else if (currentAlign === 'right') {
      alignClasses = 'ml-auto mr-0';
    } else {
      alignClasses = 'mr-auto ml-0';
    }
  }

  return (
    <NodeViewWrapper
      ref={containerRef}
      data-code-theme={isDark ? 'dark' : 'light'}
      style={{
        width: effectiveWidth,
        maxWidth: '100%',
      }}
      className={`relative my-4 rounded-xl border overflow-hidden group transition-all duration-150 ${alignClasses} ${
        isDark
          ? 'code-theme-dark bg-[#181a1f] border-[#2d3139] shadow-lg text-[#f1f5f9]'
          : 'code-theme-light bg-[#f8fafc] border-stone-300 shadow-xs text-[#0f172a]'
      }`}
    >
      {/* Quick insert line before code block */}
      <div
        contentEditable={false}
        onClick={handleInsertParagraphBefore}
        title="코드 블록 위에 빈 본문 줄(단락) 삽입하여 텍스트/데이터 입력 (단축키: Ctrl+Shift+Enter)"
        className="w-full h-4 flex items-center justify-center opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity cursor-pointer z-10 select-none bg-amber-500/10 hover:bg-amber-500/20 border-b border-amber-500/30"
      >
        <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1">
          <Plus className="w-3 h-3" />
          <span>코드 블록 위에 빈 줄 삽입</span>
        </span>
      </div>

      {/* Code Header Bar */}
      <div
        contentEditable={false}
        className={`flex flex-wrap items-center justify-between gap-1.5 px-3 py-1.5 border-b text-xs select-none transition-colors duration-150 ${
          isDark
            ? 'bg-[#21252b] border-[#2d3139] text-[#abb2bf]'
            : 'bg-stone-100/90 border-stone-200 text-stone-700'
        }`}
      >
        <div className="flex flex-wrap items-center gap-2">
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
            <span className={`hidden md:inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded font-medium ${
              isDark
                ? 'bg-amber-400/15 text-amber-400'
                : 'bg-amber-500/10 text-amber-700'
            }`}>
              <Zap className="w-3 h-3" />
              {detectedLabel}
            </span>
          )}

          {/* Width Presets (Preventing forced max-size) */}
          <div className="flex items-center gap-1 ml-1 border-l pl-2 border-stone-300 dark:border-stone-700">
            <span className="text-[10px] text-stone-400 font-medium hidden sm:inline">너비:</span>
            {[
              { label: 'Auto', val: 'auto', title: '내용 크기에 맞춤 (여백 최소화)' },
              { label: '50%', val: '50%', title: '50% 너비' },
              { label: '75%', val: '75%', title: '75% 너비' },
              { label: '100%', val: '100%', title: '최대 전체 너비 (100%)' },
            ].map((p) => {
              const isSelected = effectiveWidth === p.val || (p.val === '100%' && !effectiveWidth);
              return (
                <button
                  key={p.val}
                  type="button"
                  onClick={() => updateAttributes({ width: p.val })}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-mono border transition-colors ${
                    isSelected
                      ? 'bg-amber-500 text-stone-950 font-bold border-amber-600 shadow-2xs'
                      : isDark
                      ? 'bg-[#282c34] hover:bg-[#353b45] text-stone-300 border-[#3e4451]'
                      : 'bg-white hover:bg-stone-50 text-stone-600 border-stone-300'
                  }`}
                  title={p.title}
                >
                  {p.label}
                </button>
              );
            })}
          </div>

          {/* Alignment controls when not 100% width */}
          {effectiveWidth !== '100%' && (
            <div className="flex items-center gap-0.5 border-l pl-1.5 border-stone-300 dark:border-stone-700">
              <button
                type="button"
                onClick={() => updateAttributes({ align: 'left' })}
                className={`p-1 rounded border text-[10px] transition-colors ${
                  currentAlign === 'left'
                    ? 'bg-amber-500/20 text-amber-500 border-amber-500/50 font-bold'
                    : 'text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 border-transparent'
                }`}
                title="좌측 정렬"
              >
                <AlignLeft className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => updateAttributes({ align: 'center' })}
                className={`p-1 rounded border text-[10px] transition-colors ${
                  currentAlign === 'center'
                    ? 'bg-amber-500/20 text-amber-500 border-amber-500/50 font-bold'
                    : 'text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 border-transparent'
                }`}
                title="가운데 정렬"
              >
                <AlignCenter className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => updateAttributes({ align: 'right' })}
                className={`p-1 rounded border text-[10px] transition-colors ${
                  currentAlign === 'right'
                    ? 'bg-amber-500/20 text-amber-500 border-amber-500/50 font-bold'
                    : 'text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 border-transparent'
                }`}
                title="우측 정렬"
              >
                <AlignRight className="w-3 h-3" />
              </button>
            </div>
          )}

          {/* Height Toggle (Auto vs Scroll limit) */}
          <button
            type="button"
            onClick={() => {
              if (effectiveHeight) {
                updateAttributes({ height: null });
              } else {
                updateAttributes({ height: '320px' });
              }
            }}
            className={`px-1.5 py-0.5 rounded text-[10px] font-mono border transition-colors ${
              effectiveHeight
                ? 'bg-amber-500/20 text-amber-500 border-amber-500/40 font-bold'
                : isDark
                ? 'bg-[#282c34] hover:bg-[#353b45] text-stone-400 border-[#3e4451]'
                : 'bg-white hover:bg-stone-50 text-stone-600 border-stone-200'
            }`}
            title={effectiveHeight ? '높이 제한 해제 (전체 표시)' : '스크롤 고정 높이 (320px) 적용'}
          >
            {effectiveHeight ? '↕ 320px고정' : '↕ 높이자동'}
          </button>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Quick Insert Paragraph Before/After Buttons */}
          <div className="flex items-center gap-1 border-r pr-1.5 border-stone-300 dark:border-stone-700">
            <button
              type="button"
              onClick={handleInsertParagraphBefore}
              title="코드 블록 위에 빈 본문 줄(단락) 삽입하여 텍스트/데이터 입력 (단축키: Ctrl+Shift+Enter)"
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded border transition-colors text-[10px] font-medium shadow-2xs ${
                isDark
                  ? 'bg-[#282c34] hover:bg-[#353b45] text-amber-400 hover:text-amber-300 border-[#3e4451]'
                  : 'bg-white hover:bg-amber-50 text-amber-800 border-amber-300'
              }`}
            >
              <ArrowUp className="w-3 h-3 text-amber-500" />
              <span className="hidden sm:inline">위 줄</span>
            </button>
            <button
              type="button"
              onClick={handleInsertParagraphAfter}
              title="코드 블록 아래에 빈 본문 줄(단락) 삽입하여 텍스트/데이터 입력 (단축키: Ctrl+Enter)"
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded border transition-colors text-[10px] font-medium shadow-2xs ${
                isDark
                  ? 'bg-[#282c34] hover:bg-[#353b45] text-amber-400 hover:text-amber-300 border-[#3e4451]'
                  : 'bg-white hover:bg-amber-50 text-amber-800 border-amber-300'
              }`}
            >
              <ArrowDown className="w-3 h-3 text-amber-500" />
              <span className="hidden sm:inline">아래 줄</span>
            </button>
          </div>

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
        onKeyDown={handleKeyDown}
        style={{
          maxHeight: effectiveHeight || undefined,
          height: effectiveHeight || undefined,
        }}
        className={`p-4 m-0 overflow-x-auto overflow-y-auto font-mono text-xs leading-relaxed transition-colors duration-150 ${
          isDark
            ? 'bg-[#181a1f] text-[#f1f5f9]'
            : 'bg-[#f8fafc] text-[#0f172a]'
        }`}
      >
        <NodeViewContent as={'code' as any} className={`language-${effectiveLang} block whitespace-pre`} />
      </pre>

      {/* Quick insert line after code block */}
      <div
        contentEditable={false}
        onClick={handleInsertParagraphAfter}
        title="코드 블록 아래에 빈 본문 줄(단락) 삽입하여 텍스트/데이터 입력 (단축키: Ctrl+Enter)"
        className="w-full h-4 flex items-center justify-center opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity cursor-pointer z-10 select-none bg-amber-500/10 hover:bg-amber-500/20 border-t border-amber-500/30"
      >
        <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1">
          <Plus className="w-3 h-3" />
          <span>코드 블록 아래에 빈 줄 삽입</span>
        </span>
      </div>

      {/* Interactive Corner Resize Handle (Width & Height) */}
      <div
        contentEditable={false}
        onMouseDown={(e) => handleResizeStart(e, 'both')}
        title="드래그하여 코드 블럭 크기(너비·높이) 조절 (최대크기 방지)"
        className="absolute bottom-0 right-0 w-5 h-5 cursor-nwse-resize opacity-40 hover:opacity-100 flex items-center justify-center text-stone-400 hover:text-amber-500 transition-opacity select-none z-10"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
          <circle cx="8" cy="8" r="1.2" />
          <circle cx="8" cy="4.5" r="1.2" />
          <circle cx="4.5" cy="8" r="1.2" />
          <circle cx="8" cy="1" r="1.2" />
          <circle cx="4.5" cy="4.5" r="1.2" />
          <circle cx="1" cy="8" r="1.2" />
        </svg>
      </div>

      {/* Live Badge while dragging */}
      {isResizing && (
        <div className="absolute bottom-2 right-6 px-2 py-0.5 rounded bg-amber-500 text-stone-950 font-mono font-bold text-[10px] shadow-md pointer-events-none z-20">
          {resizingWidth || currentWidth} {resizingHeight ? `× ${resizingHeight}` : ''}
        </div>
      )}
    </NodeViewWrapper>
  );
};
