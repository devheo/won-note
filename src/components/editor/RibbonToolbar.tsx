import React, { memo, useRef } from 'react';
import {
  Type,
  Plus,
  Grid,
  Sparkles,
  ClipboardPaste,
  Undo2,
  Redo2,
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Heading1,
  Heading2,
  Heading3,
  Palette,
  Highlighter,
  RemoveFormatting,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Outdent,
  Indent,
  List,
  ListOrdered,
  CheckSquare,
  Quote,
  Minus,
  Table as TableIcon,
  Code,
  Image as ImageIcon,
  Video,
  ChevronDown,
  Link2,
  StickyNote,
  Combine,
  Split,
  Rows,
  Columns,
  Trash2,
} from 'lucide-react';
import { TableColumn } from '../../types';

interface RibbonToolbarProps {
  editor: any;
  activeRibbonTab: 'home' | 'insert' | 'format';
  setActiveRibbonTab: (tab: 'home' | 'insert' | 'format') => void;
  activeTopDialog: string | null;
  setActiveTopDialog: (dialog: any) => void;
  savedSelectionRef: React.MutableRefObject<{ from: number; to: number } | null>;
  setFontFamily: (font: string) => void;
  setFontSize: (size: string) => void;
  handleIndent: () => void;
  handleOutdent: () => void;
  handleAutoHighlightSelection: () => void;
  handleInsertSticker: (color: 'amber' | 'yellow' | 'green' | 'blue' | 'rose' | 'purple') => void;
  handlePasteMarkdownFromClipboard: () => void;
  handleImageUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleMdFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  openTableDialog: () => void;
  openImageDialog: () => void;
  openVideoDialog: () => void;
  openLinkDialog: () => void;
  setCodeDialogTab: (tab: 'templates' | 'md_paste' | 'tools') => void;
  setIsAiAgentDrawerOpen: (open: boolean) => void;
  handleFormatExpress?: () => void;
  columnMap: Map<string, TableColumn>;
  columns: TableColumn[];
}

export const RibbonToolbar: React.FC<RibbonToolbarProps> = memo(({
  editor,
  activeRibbonTab,
  setActiveRibbonTab,
  activeTopDialog,
  setActiveTopDialog,
  savedSelectionRef,
  setFontFamily,
  setFontSize,
  handleIndent,
  handleOutdent,
  handleAutoHighlightSelection,
  handleInsertSticker,
  handlePasteMarkdownFromClipboard,
  handleImageUpload,
  handleMdFileUpload,
  openTableDialog,
  openImageDialog,
  openVideoDialog,
  openLinkDialog,
  setCodeDialogTab,
  setIsAiAgentDrawerOpen,
  handleFormatExpress,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const mdFileInputRef = useRef<HTMLInputElement | null>(null);

  if (!editor) return null;

  return (
    <div className="border-b border-stone-200 dark:border-stone-800 bg-stone-50/80 dark:bg-[#1a1a1a] select-none shrink-0">
      {/* Top Ribbon Tab Headers */}
      <div className="px-4 pt-1.5 flex items-center justify-between border-b border-stone-200/90 dark:border-stone-800/90">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setActiveRibbonTab('home')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-t-lg transition-all border-t border-x flex items-center gap-1.5 ${
              activeRibbonTab === 'home'
                ? 'bg-white dark:bg-stone-900 text-amber-600 dark:text-amber-400 border-stone-200 dark:border-stone-800 -mb-[1px] shadow-xs'
                : 'border-transparent text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800/60'
            }`}
          >
            <Type className="w-3.5 h-3.5" />
            <span>홈</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveRibbonTab('insert')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-t-lg transition-all border-t border-x flex items-center gap-1.5 ${
              activeRibbonTab === 'insert'
                ? 'bg-white dark:bg-stone-900 text-amber-600 dark:text-amber-400 border-stone-200 dark:border-stone-800 -mb-[1px] shadow-xs'
                : 'border-transparent text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800/60'
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>삽입</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveRibbonTab('format')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-t-lg transition-all border-t border-x flex items-center gap-1.5 ${
              activeRibbonTab === 'format'
                ? 'bg-white dark:bg-stone-900 text-amber-600 dark:text-amber-400 border-stone-200 dark:border-stone-800 -mb-[1px] shadow-xs'
                : 'border-transparent text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800/60'
            }`}
          >
            <Grid className="w-3.5 h-3.5" />
            <span>서식</span>
            {editor.isActive('table') && (
              <span className="flex items-center gap-1 text-[10px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-950/80 px-1.5 py-0.2 rounded-full ring-1 ring-amber-400/40">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                표
              </span>
            )}
          </button>
        </div>

        {/* Quick Action Buttons on Top Right (Undo, Redo, Paste MD, AI Agent) */}
        <div className="flex items-center gap-1.5 pb-1">
          <button
            type="button"
            onClick={() => setIsAiAgentDrawerOpen(true)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-400 text-stone-950 transition-colors shadow-2xs"
            title="WonBee AI 에이전트 (양식 변환, 맞춤법/문체 린팅, Diff 비교, 다이어그램, RAG)"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>AI 에이전트</span>
          </button>

          <button
            type="button"
            onClick={handlePasteMarkdownFromClipboard}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-500/10 text-amber-800 dark:text-amber-300 border border-amber-300/80 dark:border-amber-700/80 hover:bg-amber-500/20 transition-colors shadow-2xs"
            title="클립보드에 복사된 마크다운(.md) 파일/텍스트를 에디터에 즉시 하이라이팅 서식으로 붙여넣어 적용합니다."
          >
            <ClipboardPaste className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
            <span>MD 붙여넣기</span>
          </button>

          <div className="w-[1px] h-3.5 bg-stone-200 dark:bg-stone-700 mx-0.5" />

          <button
            type="button"
            onClick={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().undo()}
            className="p-1.5 rounded hover:bg-stone-200 dark:hover:bg-stone-800 text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
            title="실행 취소 (Ctrl+Z)"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().redo()}
            className="p-1.5 rounded hover:bg-stone-200 dark:hover:bg-stone-800 text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
            title="다시 실행 (Ctrl+Y)"
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Ribbon Tab Content Panel */}
      <div className="px-4 py-2 bg-white dark:bg-stone-900 flex items-center justify-between gap-3 overflow-x-auto no-scrollbar">
        {/* TAB 1: 홈 (Home) - Typography, Colors, Alignment, Lists */}
        {activeRibbonTab === 'home' && (
          <div className="flex items-center gap-1 shrink-0 flex-nowrap text-xs">
            {/* Font Family Selector */}
            <select
              value={editor.getAttributes('textStyle').fontFamily || 'default'}
              onChange={(e) => setFontFamily(e.target.value)}
              className="h-7 px-2 text-xs rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-200 focus:outline-hidden focus:ring-1 focus:ring-amber-500 max-w-[105px]"
              title="글꼴 (Font Family)"
            >
              <option value="default">기본 글꼴</option>
              <option value="Pretendard, -apple-system, sans-serif">Pretendard</option>
              <option value="'Malgun Gothic', '맑은 고딕', sans-serif">맑은 고딕</option>
              <option value="'Nanum Gothic', '나눔고딕', sans-serif">나눔고딕</option>
              <option value="'Nanum Myeongjo', '나눔명조', serif">나눔명조</option>
              <option value="'Noto Sans KR', sans-serif">Noto Sans</option>
              <option value="sans-serif">고딕 (Sans)</option>
              <option value="serif">명조 (Serif)</option>
              <option value="ui-monospace, monospace">코딩 (Monospace)</option>
            </select>

            {/* Font Size Selector */}
            <select
              value={editor.getAttributes('textStyle').fontSize || 'default'}
              onChange={(e) => setFontSize(e.target.value)}
              className="h-7 px-1.5 text-xs rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-200 focus:outline-hidden focus:ring-1 focus:ring-amber-500 w-[68px]"
              title="글자 크기 (Font Size)"
            >
              <option value="default">크기</option>
              <option value="12px">12px</option>
              <option value="14px">14px</option>
              <option value="16px">16px</option>
              <option value="18px">18px</option>
              <option value="20px">20px</option>
              <option value="24px">24px</option>
              <option value="28px">28px</option>
              <option value="32px">32px</option>
            </select>

            <div className="w-[1px] h-4 bg-stone-200 dark:bg-stone-800 mx-0.5" />

            {/* Font Styling: Bold, Italic, Underline, Strikethrough */}
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => editor.chain().focus().toggleBold().run()}
                className={`p-1.5 rounded hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors ${
                  editor.isActive('bold') ? 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400 font-bold' : 'text-stone-600 dark:text-stone-300'
                }`}
                title="굵게 (Ctrl+B)"
              >
                <Bold className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => editor.chain().focus().toggleItalic().run()}
                className={`p-1.5 rounded hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors ${
                  editor.isActive('italic') ? 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400 font-bold' : 'text-stone-600 dark:text-stone-300'
                }`}
                title="기울임 (Ctrl+I)"
              >
                <Italic className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => editor.chain().focus().toggleUnderline().run()}
                className={`p-1.5 rounded hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors ${
                  editor.isActive('underline') ? 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400 font-bold' : 'text-stone-600 dark:text-stone-300'
                }`}
                title="밑줄 (Ctrl+U)"
              >
                <UnderlineIcon className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => editor.chain().focus().toggleStrike().run()}
                className={`p-1.5 rounded hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors ${
                  editor.isActive('strike') ? 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400 font-bold' : 'text-stone-600 dark:text-stone-300'
                }`}
                title="취소선"
              >
                <Strikethrough className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="w-[1px] h-4 bg-stone-200 dark:bg-stone-800 mx-1" />

            {/* Headings */}
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => editor.chain().focus().setParagraph().run()}
                className={`px-1.5 py-1 rounded text-xs hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors font-medium ${
                  editor.isActive('paragraph') && !editor.isActive('heading') ? 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400 font-bold' : 'text-stone-600 dark:text-stone-300'
                }`}
                title="본문"
              >
                본문
              </button>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
                className={`p-1.5 rounded hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors ${
                  editor.isActive('heading', { level: 1 }) ? 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400 font-bold' : 'text-stone-600 dark:text-stone-300'
                }`}
                title="제목 1 (H1)"
              >
                <Heading1 className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                className={`p-1.5 rounded hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors ${
                  editor.isActive('heading', { level: 2 }) ? 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400 font-bold' : 'text-stone-600 dark:text-stone-300'
                }`}
                title="제목 2 (H2)"
              >
                <Heading2 className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
                className={`p-1.5 rounded hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors ${
                  editor.isActive('heading', { level: 3 }) ? 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400 font-bold' : 'text-stone-600 dark:text-stone-300'
                }`}
                title="제목 3 (H3)"
              >
                <Heading3 className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="w-[1px] h-4 bg-stone-200 dark:bg-stone-800 mx-1" />

            {/* Colors & Clear Formatting */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  if (editor && !editor.state.selection.empty) {
                    savedSelectionRef.current = {
                      from: editor.state.selection.from,
                      to: editor.state.selection.to,
                    };
                  }
                }}
                onClick={() => {
                  if (editor && !editor.state.selection.empty) {
                    savedSelectionRef.current = {
                      from: editor.state.selection.from,
                      to: editor.state.selection.to,
                    };
                  }
                  setActiveTopDialog(activeTopDialog === 'textColor' ? null : 'textColor');
                }}
                className={`px-2 py-1 rounded transition-colors flex items-center gap-1 text-xs ${
                  activeTopDialog === 'textColor'
                    ? 'bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-400 font-semibold'
                    : 'hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-600 dark:text-stone-300'
                }`}
                title="글꼴 색상 선택 (최상단 대화상자)"
              >
                <Palette className="w-3.5 h-3.5 text-indigo-500" />
                <span>글자색</span>
              </button>

              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  if (editor && !editor.state.selection.empty) {
                    savedSelectionRef.current = {
                      from: editor.state.selection.from,
                      to: editor.state.selection.to,
                    };
                  }
                }}
                onClick={() => {
                  if (editor && !editor.state.selection.empty) {
                    savedSelectionRef.current = {
                      from: editor.state.selection.from,
                      to: editor.state.selection.to,
                    };
                  }
                  setActiveTopDialog(activeTopDialog === 'highlight' ? null : 'highlight');
                }}
                className={`px-2 py-1 rounded transition-colors flex items-center gap-1 text-xs ${
                  activeTopDialog === 'highlight' || editor.isActive('highlight')
                    ? 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400 font-semibold'
                    : 'hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-600 dark:text-stone-300'
                }`}
                title="형광펜 / 텍스트 배경색 (최상단 대화상자)"
              >
                <Highlighter className="w-3.5 h-3.5 text-amber-500" />
                <span>형광펜</span>
              </button>

              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}
                className="p-1.5 rounded hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200 transition-colors"
                title="모든 서식 지우기 (일반 텍스트로 초기화)"
              >
                <RemoveFormatting className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="w-[1px] h-4 bg-stone-200 dark:bg-stone-800 mx-1" />

            {/* Alignment */}
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => editor.chain().focus().setTextAlign('left').run()}
                className={`p-1.5 rounded hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors ${
                  editor.isActive({ textAlign: 'left' }) ? 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400 font-bold' : 'text-stone-600 dark:text-stone-300'
                }`}
                title="왼쪽 정렬"
              >
                <AlignLeft className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => editor.chain().focus().setTextAlign('center').run()}
                className={`p-1.5 rounded hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors ${
                  editor.isActive({ textAlign: 'center' }) ? 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400 font-bold' : 'text-stone-600 dark:text-stone-300'
                }`}
                title="가운데 정렬"
              >
                <AlignCenter className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => editor.chain().focus().setTextAlign('right').run()}
                className={`p-1.5 rounded hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors ${
                  editor.isActive({ textAlign: 'right' }) ? 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400 font-bold' : 'text-stone-600 dark:text-stone-300'
                }`}
                title="오른쪽 정렬"
              >
                <AlignRight className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => editor.chain().focus().setTextAlign('justify').run()}
                className={`p-1.5 rounded hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors ${
                  editor.isActive({ textAlign: 'justify' }) ? 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400 font-bold' : 'text-stone-600 dark:text-stone-300'
                }`}
                title="양쪽 정렬"
              >
                <AlignJustify className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="w-[1px] h-4 bg-stone-200 dark:bg-stone-800 mx-1" />

            {/* Lists & Quotes & Indent */}
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={handleOutdent}
                className="p-1.5 rounded hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-600 dark:text-stone-300 transition-colors"
                title="내어쓰기 (Shift+Tab)"
              >
                <Outdent className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={handleIndent}
                className="p-1.5 rounded hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-600 dark:text-stone-300 transition-colors"
                title="들여쓰기 (Tab)"
              >
                <Indent className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => editor.chain().focus().toggleBulletList().run()}
                className={`p-1.5 rounded hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors ${
                  editor.isActive('bulletList') ? 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400 font-bold' : 'text-stone-600 dark:text-stone-300'
                }`}
                title="글머리 기호 목록"
              >
                <List className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => editor.chain().focus().toggleOrderedList().run()}
                className={`p-1.5 rounded hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors ${
                  editor.isActive('orderedList') ? 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400 font-bold' : 'text-stone-600 dark:text-stone-300'
                }`}
                title="번호 매기기 목록"
              >
                <ListOrdered className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => editor.chain().focus().toggleTaskList().run()}
                className={`p-1.5 rounded hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors ${
                  editor.isActive('taskList') ? 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400 font-bold' : 'text-stone-600 dark:text-stone-300'
                }`}
                title="체크리스트 / 할 일 목록"
              >
                <CheckSquare className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => editor.chain().focus().toggleBlockquote().run()}
                className={`p-1.5 rounded hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors ${
                  editor.isActive('blockquote') ? 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400 font-bold' : 'text-stone-600 dark:text-stone-300'
                }`}
                title="인용구"
              >
                <Quote className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => editor.chain().focus().setHorizontalRule().run()}
                className="p-1.5 rounded hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-600 dark:text-stone-300 transition-colors"
                title="가로 구분선 삽입"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>

              <div className="w-[1px] h-4 bg-stone-200 dark:bg-stone-800 mx-0.5" />

              {/* Quick Access to Table & Code from Home Tab */}
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={openTableDialog}
                className="px-2 py-1 rounded hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-600 dark:text-stone-300 transition-colors flex items-center gap-1 text-xs"
                title="새 표 삽입 (Excel 스타일 매트릭스 대화상자)"
              >
                <TableIcon className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                <span className="hidden sm:inline">표</span>
              </button>

              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  if (editor && !editor.state.selection.empty) {
                    handleAutoHighlightSelection();
                  } else {
                    setActiveTopDialog('code');
                  }
                }}
                className={`px-2 py-1 rounded transition-colors flex items-center gap-1 text-xs ${
                  editor.isActive('codeBlock') || activeTopDialog === 'code'
                    ? 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400 font-semibold'
                    : 'hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-600 dark:text-stone-300'
                }`}
                title={editor && !editor.state.selection.empty ? '선택 데이터 자동 감지 코드 블록 변환' : '코드 & MD 대화상자 열기'}
              >
                <Code className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                <span className="hidden sm:inline">코드</span>
              </button>
            </div>
          </div>
        )}

        {/* TAB 2: 삽입 (Insert) - Table, Image, Code & MD, Sticky Notes, Link */}
        {activeRibbonTab === 'insert' && (
          <div className="flex items-center gap-1 shrink-0 flex-nowrap text-xs">
            <button
              type="button"
              onClick={openTableDialog}
              className={`px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors border ${
                editor.isActive('table') || activeTopDialog === 'table'
                  ? 'bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700 font-semibold'
                  : 'bg-white dark:bg-stone-800 hover:bg-stone-100 dark:hover:bg-stone-700/80 text-stone-700 dark:text-stone-200 border-stone-200 dark:border-stone-700'
              }`}
              title="엑셀 스타일 새 표 삽입 (최상단 대화상자)"
            >
              <TableIcon className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              <span className="font-medium">새 표 삽입</span>
            </button>

            <button
              type="button"
              onClick={openImageDialog}
              className={`px-2.5 py-1.5 rounded-lg border flex items-center gap-1.5 transition-colors ${
                activeTopDialog === 'image'
                  ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700 font-semibold'
                  : 'bg-white dark:bg-stone-800 hover:bg-stone-100 dark:hover:bg-stone-700/80 text-stone-700 dark:text-stone-200 border-stone-200 dark:border-stone-700'
              }`}
              title="이미지 파일 삽입 (파일 업로드 또는 웹 URL)"
            >
              <ImageIcon className="w-3.5 h-3.5 text-emerald-500" />
              <span className="font-medium">이미지</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageUpload}
            />

            <button
              type="button"
              onClick={openVideoDialog}
              className={`px-2.5 py-1.5 rounded-lg border flex items-center gap-1.5 transition-colors ${
                activeTopDialog === 'video'
                  ? 'bg-rose-100 dark:bg-rose-950/80 text-rose-800 dark:text-rose-300 border-rose-300 dark:border-rose-700 font-semibold'
                  : 'bg-white dark:bg-stone-800 hover:bg-stone-100 dark:hover:bg-stone-700/80 text-stone-700 dark:text-stone-200 border-stone-200 dark:border-stone-700'
              }`}
              title="동영상 삽입 (YouTube 링크 또는 웹 동영상 URL)"
            >
              <Video className="w-3.5 h-3.5 text-rose-500" />
              <span className="font-medium">동영상</span>
            </button>

            <div className="w-[1px] h-4 bg-stone-200 dark:bg-stone-800 mx-1" />

            <div className="relative inline-flex items-center">
              <button
                type="button"
                onClick={() => {
                  if (editor && !editor.state.selection.empty) {
                    handleAutoHighlightSelection();
                  } else {
                    setCodeDialogTab('templates');
                    setActiveTopDialog(activeTopDialog === 'code' ? null : 'code');
                  }
                }}
                className={`px-2.5 py-1.5 rounded-l-lg flex items-center gap-1.5 transition-colors border-y border-l ${
                  editor.isActive('codeBlock') || activeTopDialog === 'code'
                    ? 'bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700 font-semibold'
                    : 'bg-white dark:bg-stone-800 hover:bg-stone-100 dark:hover:bg-stone-700/80 text-stone-700 dark:text-stone-200 border-stone-200 dark:border-stone-700'
                }`}
                title={editor && !editor.state.selection.empty ? '선택 영역 자동 감지 코드 블록으로 변환' : '코드 템플릿 & MD 붙여넣기 통합 대화상자 열기'}
              >
                <Code className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                <span className="font-medium">코드 & MD</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setCodeDialogTab('md_paste');
                  setActiveTopDialog(activeTopDialog === 'code' ? null : 'code');
                }}
                className="px-1.5 py-1.5 rounded-r-lg border-y border-r transition-colors flex items-center justify-center bg-white dark:bg-stone-800 hover:bg-stone-100 dark:hover:bg-stone-700/80 text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200 border-stone-200 dark:border-stone-700"
                title="마크다운(.md) 붙여넣기 탭으로 즉시 열기"
              >
                <ChevronDown className="w-3 h-3" />
              </button>
            </div>
            <input
              ref={mdFileInputRef}
              type="file"
              accept=".md,.markdown,.csv,.tsv,.txt,.log"
              className="hidden"
              onChange={handleMdFileUpload}
            />

            <button
              type="button"
              onClick={openLinkDialog}
              className={`px-2 py-1.5 rounded-lg border flex items-center gap-1 transition-colors ${
                editor.isActive('link') || activeTopDialog === 'link'
                  ? 'bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700 font-semibold'
                  : 'bg-white dark:bg-stone-800 hover:bg-stone-100 dark:hover:bg-stone-700/80 text-stone-700 dark:text-stone-200 border-stone-200 dark:border-stone-700'
              }`}
              title="링크 삽입 / 편집 (최상단 대화상자)"
            >
              <Link2 className="w-3.5 h-3.5 text-sky-500" />
              <span>링크</span>
            </button>

            <div className="w-[1px] h-4 bg-stone-200 dark:bg-stone-800 mx-1" />

            <div className="flex items-center gap-1.5 bg-amber-50 dark:bg-amber-950/40 px-2 py-1 rounded-lg border border-amber-200/60 dark:border-amber-900/40">
              <span className="text-[11px] font-bold text-amber-800 dark:text-amber-300 flex items-center gap-1">
                <StickyNote className="w-3 h-3" />
                스티커:
              </span>
              <div className="flex items-center gap-1">
                {(['amber', 'yellow', 'green', 'blue', 'rose', 'purple'] as const).map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => handleInsertSticker(color)}
                    className={`w-4 h-4 rounded-full border border-black/10 hover:scale-125 transition-transform ${
                      color === 'amber' ? 'bg-amber-400' :
                      color === 'yellow' ? 'bg-yellow-300' :
                      color === 'green' ? 'bg-emerald-400' :
                      color === 'blue' ? 'bg-sky-400' :
                      color === 'rose' ? 'bg-rose-400' : 'bg-purple-400'
                    }`}
                    title={`${color} 스티커 추가`}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: 서식 (Format) - Table Borders, Cell Styles, Rows & Columns, Merge/Split */}
        {activeRibbonTab === 'format' && (
          <div className="flex items-center gap-1.5 shrink-0 flex-nowrap text-xs">
            <button
              type="button"
              onClick={() => setActiveTopDialog(activeTopDialog === 'border' ? null : 'border')}
              className={`px-2.5 py-1.5 rounded-lg border flex items-center gap-1.5 transition-colors font-medium shadow-2xs ${
                activeTopDialog === 'border'
                  ? 'bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700'
                  : 'bg-white dark:bg-stone-800 hover:bg-stone-100 dark:hover:bg-stone-700/80 text-stone-700 dark:text-stone-200 border-stone-200 dark:border-stone-700'
              }`}
              title="표 테두리 설정 (모든 테두리, 바깥쪽, 굵은 테두리, 가로줄, 테두리 없음, 색상)"
            >
              <Grid className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              <span>표 테두리</span>
            </button>

            <div className="flex items-center gap-1 px-2 py-1 bg-stone-100/70 dark:bg-stone-800/60 rounded-lg border border-stone-200/60 dark:border-stone-700/60">
              <span className="text-[10px] font-medium text-stone-500 dark:text-stone-400 mr-0.5">셀 색:</span>
              {[
                { color: '', label: '기본(없음)' },
                { color: '#fef3c7', label: '연노랑' },
                { color: '#d1fae5', label: '연초록' },
                { color: '#dbeafe', label: '연파랑' },
                { color: '#ede9fe', label: '연보라' },
                { color: '#ffe4e6', label: '연분홍' },
              ].map((c) => (
                <button
                  key={c.color || 'default'}
                  type="button"
                  disabled={!editor.isActive('table')}
                  onClick={() => editor.chain().focus().setCellAttribute('backgroundColor', c.color || null).run()}
                  className="w-5 h-5 rounded border border-stone-300 dark:border-[#555555] hover:scale-110 transition-transform flex items-center justify-center text-[9px] disabled:opacity-30 disabled:hover:scale-100"
                  style={{ backgroundColor: c.color || 'transparent' }}
                  title={c.label}
                >
                  {!c.color && '✕'}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-0.5">
              <button
                type="button"
                disabled={!editor.isActive('table')}
                onClick={() => editor.chain().focus().mergeCells().run()}
                className="px-2 py-1 rounded bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-300 disabled:opacity-30 transition-colors flex items-center gap-1 font-medium"
                title="선택한 셀 병합"
              >
                <Combine className="w-3.5 h-3.5 text-indigo-500" />
                <span>병합</span>
              </button>
              <button
                type="button"
                disabled={!editor.isActive('table')}
                onClick={() => editor.chain().focus().splitCell().run()}
                className="px-2 py-1 rounded bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-300 disabled:opacity-30 transition-colors flex items-center gap-1 font-medium"
                title="셀 분할"
              >
                <Split className="w-3.5 h-3.5 text-sky-500" />
                <span>분할</span>
              </button>
            </div>

            <div className="w-[1px] h-4 bg-stone-200 dark:bg-stone-800 mx-1" />

            <div className="flex items-center gap-0.5">
              <button
                type="button"
                disabled={!editor.isActive('table')}
                onClick={() => editor.chain().focus().addRowBefore().run()}
                className="p-1.5 rounded hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-600 dark:text-stone-300 disabled:opacity-30 transition-colors"
                title="위에 행 추가"
              >
                <Rows className="w-3.5 h-3.5 text-blue-500" />
              </button>
              <button
                type="button"
                disabled={!editor.isActive('table')}
                onClick={() => editor.chain().focus().addRowAfter().run()}
                className="p-1.5 rounded hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-600 dark:text-stone-300 disabled:opacity-30 transition-colors"
                title="아래에 행 추가"
              >
                <Rows className="w-3.5 h-3.5 text-blue-500 rotate-180" />
              </button>
              <button
                type="button"
                disabled={!editor.isActive('table')}
                onClick={() => editor.chain().focus().deleteRow().run()}
                className="p-1.5 rounded hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-500 disabled:opacity-30 transition-colors"
                title="선택한 행 삭제"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>

              <div className="w-[1px] h-3 bg-stone-200 dark:bg-stone-800 mx-0.5" />

              <button
                type="button"
                disabled={!editor.isActive('table')}
                onClick={() => editor.chain().focus().addColumnBefore().run()}
                className="p-1.5 rounded hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-600 dark:text-stone-300 disabled:opacity-30 transition-colors"
                title="왼쪽에 열 추가"
              >
                <Columns className="w-3.5 h-3.5 text-amber-500" />
              </button>
              <button
                type="button"
                disabled={!editor.isActive('table')}
                onClick={() => editor.chain().focus().addColumnAfter().run()}
                className="p-1.5 rounded hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-600 dark:text-stone-300 disabled:opacity-30 transition-colors"
                title="오른쪽에 열 추가"
              >
                <Columns className="w-3.5 h-3.5 text-amber-500 rotate-180" />
              </button>
              <button
                type="button"
                disabled={!editor.isActive('table')}
                onClick={() => editor.chain().focus().deleteColumn().run()}
                className="p-1.5 rounded hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-500 disabled:opacity-30 transition-colors"
                title="선택한 열 삭제"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="w-[1px] h-4 bg-stone-200 dark:bg-stone-800 mx-1" />

            <button
              type="button"
              disabled={!editor.isActive('table')}
              onClick={() => editor.chain().focus().deleteTable().run()}
              className="px-2 py-1 rounded hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600 dark:text-rose-400 disabled:opacity-30 font-medium transition-colors flex items-center gap-1"
              title="표 전체 삭제"
            >
              <Trash2 className="w-3 h-3" />
              <span>표 삭제</span>
            </button>

            {!editor.isActive('table') && (
              <span className="text-[11px] text-stone-400 dark:text-stone-500 ml-2 hidden sm:inline">
                (본문의 표를 클릭하면 셀/테두리 서식 도구가 즉시 활성화됩니다)
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

RibbonToolbar.displayName = 'RibbonToolbar';
