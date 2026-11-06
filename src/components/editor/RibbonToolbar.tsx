import React, { memo, useEffect, useRef, useState } from 'react';
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
  CheckSquare,
  ListOrdered,
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
  ClipboardCopy,
  Scissors,
  Paintbrush,
  Subscript,
  Superscript,
  Tag,
  Search,
  Pencil,
  Eraser,
  Highlighter as HighlighterIcon,
  Presentation,
  FileSpreadsheet,
  FileText,
  FileDown,
} from 'lucide-react';
import { TableColumn } from '../../types';
import { DOMSerializer } from '@tiptap/pm/model';
import { DrawingStylePicker } from './DrawingStylePicker';
import { FontSizePixelControl, InsertShapeControls, ListToolbarControls, ShapeSizeControls, TableBorderToolbarControl } from './DocumentToolbarControls';

interface RibbonToolbarProps {
  editor: any;
  activeRibbonTab: 'home' | 'insert' | 'draw';
  setActiveRibbonTab: (tab: 'home' | 'insert' | 'draw') => void;
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
  handleInsertFiles: (files: File[]) => void;
  openTableDialog: () => void;
  openImageDialog: () => void;
  openVideoDialog: () => void;
  openLinkDialog: () => void;
  setCodeDialogTab: (tab: 'templates' | 'md_paste' | 'tools') => void;
  setIsAiAgentDrawerOpen: (open: boolean) => void;
  handleFormatExpress?: () => void;
  columnMap: Map<string, TableColumn>;
  columns: TableColumn[];
  onNotify?: (message: string) => void;
  onInsertDrawing?: () => void;
  drawingTool?: 'select' | 'pen' | 'highlighter' | 'eraser';
  setDrawingTool?: (tool: 'select' | 'pen' | 'highlighter' | 'eraser') => void;
  drawingColor?: string;
  setDrawingColor?: (color: string) => void;
  drawingWidth?: number;
  setDrawingWidth?: (width: number) => void;
}

const INLINE_FORMAT_MARKS = ['bold', 'italic', 'underline', 'strike', 'textStyle', 'color', 'highlight', 'subscript', 'superscript', 'oneNoteTag'];
const ONE_NOTE_TAGS = [
  { id: 'todo', label: '할 일', icon: '☐' },
  { id: 'important', label: '중요', icon: '★' },
  { id: 'question', label: '질문', icon: '?' },
  { id: 'idea', label: '아이디어', icon: '💡' },
];

function cleanClipboardHtml(source: string): string {
  const document = new DOMParser().parseFromString(source, 'text/html');
  document.querySelectorAll('script,style,meta,link,iframe,object,embed,svg,math').forEach(element => element.remove());
  for (const element of Array.from(document.body.querySelectorAll('*'))) {
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim();
      if (name.startsWith('on') || name === 'srcdoc') element.removeAttribute(attribute.name);
      else if (name === 'style' && /(url\s*\(|expression\s*\()/i.test(value)) element.removeAttribute(attribute.name);
      else if (['href', 'src', 'xlink:href'].includes(name)) {
        const scheme = value.match(/^([a-z][a-z\d+.-]*):/i)?.[1]?.toLowerCase();
        const isImageData = name === 'src' && element.tagName === 'IMG' && /^data:image\//i.test(value);
        const allowed = name === 'href' ? ['http', 'https', 'mailto', 'tel'] : ['http', 'https', 'blob'];
        if (scheme && !allowed.includes(scheme) && !isImageData) element.removeAttribute(attribute.name);
      }
    }
  }
  return document.body.innerHTML;
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
  handleInsertFiles,
  openTableDialog,
  openImageDialog,
  openVideoDialog,
  openLinkDialog,
  setCodeDialogTab,
  setIsAiAgentDrawerOpen,
  handleFormatExpress,
  onNotify,
  onInsertDrawing,
  drawingTool = 'select',
  setDrawingTool,
  drawingColor = '#1f2937',
  setDrawingColor,
  drawingWidth = 3,
  setDrawingWidth,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const mdFileInputRef = useRef<HTMLInputElement | null>(null);
  const pptxFileInputRef = useRef<HTMLInputElement | null>(null);
  const excelFileInputRef = useRef<HTMLInputElement | null>(null);
  const pdfFileInputRef = useRef<HTMLInputElement | null>(null);
  const markdownFileInputRef = useRef<HTMLInputElement | null>(null);
  const docxFileInputRef = useRef<HTMLInputElement | null>(null);
  const formatSnapshotRef = useRef<{ marks: any[]; blockType: string; blockAttrs: Record<string, any> } | null>(null);
  const formatPainterArmedRef = useRef(false);
  const isApplyingFormatRef = useRef(false);
  const tagSearchIndexRef = useRef(0);
  const [isFormatPainterArmed, setIsFormatPainterArmed] = useState(false);
  const [lineHeight, setLineHeight] = useState('');
  useEffect(() => {
    if (!editor) return;
    const syncLineHeight = () => {
      const type = editor.isActive('heading') ? 'heading' : 'paragraph';
      setLineHeight(editor.getAttributes(type).lineHeight || '');
    };
    const applyCopiedFormat = () => {
      if (!formatPainterArmedRef.current || isApplyingFormatRef.current) { syncLineHeight(); return; }
      const { from, to, empty } = editor.state.selection;
      const snapshot = formatSnapshotRef.current;
      if (empty || !snapshot) { syncLineHeight(); return; }

      const transaction = editor.state.tr;
      for (const name of INLINE_FORMAT_MARKS) {
        const markType = editor.schema.marks[name];
        if (markType) transaction.removeMark(from, to, markType);
      }
      for (const mark of snapshot.marks) {
        const markType = editor.schema.marks[mark.type.name];
        if (markType) transaction.addMark(from, to, markType.create(mark.attrs));
      }

      isApplyingFormatRef.current = true;
      editor.view.dispatch(transaction);
      if (snapshot.blockType && Object.keys(snapshot.blockAttrs).length) {
        editor.commands.updateAttributes(snapshot.blockType, snapshot.blockAttrs);
      }
      isApplyingFormatRef.current = false;
      formatPainterArmedRef.current = false;
      formatSnapshotRef.current = null;
      setIsFormatPainterArmed(false);
      syncLineHeight();
      onNotify?.('선택한 글자에 서식을 적용했습니다.');
    };
    editor.on('selectionUpdate', applyCopiedFormat);
    return () => { editor.off('selectionUpdate', applyCopiedFormat); };
  }, [editor, onNotify]);

  const toggleFormatPainter = () => {
    if (formatPainterArmedRef.current) {
      formatPainterArmedRef.current = false;
      formatSnapshotRef.current = null;
      setIsFormatPainterArmed(false);
      return;
    }
    const selection = editor.state.selection;
    const sourceMarks = selection.empty
      ? selection.$from.marks()
      : (editor.state.doc.nodeAt(selection.from)?.marks || selection.$from.marks());
    const marks = sourceMarks.filter((mark: any) => INLINE_FORMAT_MARKS.includes(mark.type.name));
    const sourceBlock = selection.$from.parent;
    const blockType = ['paragraph', 'heading'].includes(sourceBlock.type.name) ? sourceBlock.type.name : '';
    const blockAttrs: Record<string, any> = {};
    if (blockType) {
      blockAttrs.textAlign = sourceBlock.attrs.textAlign || null;
      blockAttrs.lineHeight = sourceBlock.attrs.lineHeight || null;
    }
    if (!marks.length && !blockAttrs.textAlign && !blockAttrs.lineHeight) {
      onNotify?.('서식을 복사할 글자나 서식이 있는 위치에 커서를 놓아주세요.');
      return;
    }
    formatSnapshotRef.current = { marks, blockType, blockAttrs };
    formatPainterArmedRef.current = true;
    setIsFormatPainterArmed(true);
    onNotify?.('서식을 복사했습니다. 적용할 글자 범위를 선택하세요.');
  };

  const applyOneNoteTag = (tag: string) => {
    if (!tag) return;
    editor.chain().focus().setMark('oneNoteTag', { tag }).run();
    onNotify?.('선택 영역에 태그를 추가했습니다.');
  };

  const findNextOneNoteTag = () => {
    const matches: Array<{ from: number; to: number; tag: string }> = [];
    editor.state.doc.descendants((node: any, pos: number) => {
      if (!node.isText) return;
      const mark = node.marks.find((candidate: any) => candidate.type.name === 'oneNoteTag');
      if (!mark) return;
      const previous = matches[matches.length - 1];
      const to = pos + node.nodeSize;
      if (previous && previous.to === pos && previous.tag === mark.attrs.tag) previous.to = to;
      else matches.push({ from: pos, to, tag: mark.attrs.tag });
    });
    if (!matches.length) {
      tagSearchIndexRef.current = 0;
      onNotify?.('이 문서에 태그가 없습니다.');
      return;
    }
    const match = matches[tagSearchIndexRef.current % matches.length];
    tagSearchIndexRef.current += 1;
    editor.chain().focus().setTextSelection({ from: match.from, to: match.to }).scrollIntoView().run();
    const label = ONE_NOTE_TAGS.find(item => item.id === match.tag)?.label || '태그';
    onNotify?.(`${label} 태그 ${tagSearchIndexRef.current}/${matches.length}`);
  };

  const copySelection = async (cut = false) => {
    const { from, to, empty } = editor.state.selection;
    if (empty) {
      onNotify?.(cut ? '잘라낼 내용을 먼저 선택해주세요.' : '복사할 내용을 먼저 선택해주세요.');
      return;
    }
    const text = editor.state.doc.textBetween(from, to, '\n');
    try {
      if (navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
        const wrapper = document.createElement('div');
        wrapper.appendChild(DOMSerializer.fromSchema(editor.schema).serializeFragment(editor.state.selection.content().content));
        await navigator.clipboard.write([new ClipboardItem({
          'text/html': new Blob([wrapper.innerHTML], { type: 'text/html' }),
          'text/plain': new Blob([text], { type: 'text/plain' }),
        })]);
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        editor.view.focus();
        document.execCommand(cut ? 'cut' : 'copy');
        return;
      }
      if (cut) editor.chain().focus().setTextSelection({ from, to }).deleteSelection().run();
      onNotify?.(cut ? '선택한 내용을 잘라냈습니다.' : '선택한 내용을 복사했습니다.');
    } catch {
      try {
        await navigator.clipboard.writeText(text);
        if (cut) editor.chain().focus().setTextSelection({ from, to }).deleteSelection().run();
        onNotify?.(cut ? '선택한 내용을 잘라냈습니다.' : '서식 없이 내용을 복사했습니다.');
      } catch {
        onNotify?.('클립보드 접근 권한을 확인해주세요.');
      }
    }
  };

  const pasteFromClipboard = async () => {
    try {
      if (navigator.clipboard?.read) {
        const items = await navigator.clipboard.read();
        for (const item of items) {
          if (item.types.includes('text/html')) {
            const html = cleanClipboardHtml(await (await item.getType('text/html')).text());
            if (html.trim()) {
              editor.chain().focus().insertContent(html).run();
              return;
            }
          }
          if (item.types.includes('text/plain')) {
            const text = await (await item.getType('text/plain')).text();
            if (text) {
              editor.chain().focus().insertContent(text).run();
              return;
            }
          }
        }
      } else {
        const text = await navigator.clipboard.readText();
        if (text) editor.chain().focus().insertContent(text).run();
      }
    } catch {
      try {
        const text = await navigator.clipboard.readText();
        if (text) editor.chain().focus().insertContent(text).run();
        else onNotify?.('붙여넣을 내용이 없습니다.');
      } catch {
        onNotify?.('붙여넣기 권한을 허용하거나 Ctrl+V를 사용해주세요.');
      }
    }
  };

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
            onClick={() => setActiveRibbonTab('draw')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-t-lg transition-all border-t border-x flex items-center gap-1.5 ${
              activeRibbonTab === 'draw'
                ? 'bg-white dark:bg-stone-900 text-amber-600 dark:text-amber-400 border-stone-200 dark:border-stone-800 -mb-[1px] shadow-xs'
                : 'border-transparent text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800/60'
            }`}
          >
            <Pencil className="w-3.5 h-3.5" />
            <span>그리기</span>
            {editor.isActive('table') && (
              <span className="flex items-center gap-1 text-[10px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-950/80 px-1.5 py-0.2 rounded-full ring-1 ring-amber-400/40">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                표
              </span>
            )}
          </button>
        </div>

        {/* 빠른 실행: AI, 마크다운 붙여넣기, 실행 취소/다시 실행 */}
        <div className="flex items-center gap-1.5 pb-1">
          <button
            type="button"
            onClick={() => setIsAiAgentDrawerOpen(true)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-400 text-stone-950 transition-colors shadow-2xs"
            title="원비 AI 도우미 (양식 변환, 맞춤법·문체 검사, 내용 비교, 다이어그램)"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>AI 에이전트</span>
          </button>

          <button
            type="button"
            onClick={handlePasteMarkdownFromClipboard}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-500/10 text-amber-800 dark:text-amber-300 border border-amber-300/80 dark:border-amber-700/80 hover:bg-amber-500/20 transition-colors shadow-2xs"
            title="클립보드의 마크다운 파일이나 텍스트를 서식과 함께 붙여넣습니다."
          >
            <ClipboardPaste className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
            <span>마크다운 붙여넣기</span>
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
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => void pasteFromClipboard()}
                className="p-1.5 rounded text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800"
                title="클립보드에서 서식과 함께 붙여넣기"
                aria-label="붙여넣기"
              >
                <ClipboardPaste className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => void copySelection(true)}
                className="p-1.5 rounded text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800"
                title="선택한 내용 잘라내기"
                aria-label="잘라내기"
              >
                <Scissors className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => void copySelection(false)}
                className="p-1.5 rounded text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800"
                title="선택한 내용 복사"
                aria-label="복사"
              >
                <ClipboardCopy className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="w-[1px] h-4 bg-stone-200 dark:bg-stone-800 mx-0.5" />

            {/* Font Family Selector */}
            <select
              value={editor.getAttributes('textStyle').fontFamily || 'default'}
              onChange={(e) => setFontFamily(e.target.value)}
              className="h-7 px-2 text-xs rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-200 focus:outline-hidden focus:ring-1 focus:ring-amber-500 max-w-[105px]"
              title="글꼴"
            >
              <option value="default">기본 글꼴</option>
              <option value="Pretendard, -apple-system, sans-serif">Pretendard</option>
              <option value="'Malgun Gothic', '맑은 고딕', sans-serif">맑은 고딕</option>
              <option value="'Nanum Gothic', '나눔고딕', sans-serif">나눔고딕</option>
              <option value="'Nanum Myeongjo', '나눔명조', serif">나눔명조</option>
              <option value="'Noto Sans KR', sans-serif">본고딕</option>
              <option value="sans-serif">고딕</option>
              <option value="serif">명조</option>
              <option value="ui-monospace, monospace">고정폭 글꼴</option>
            </select>

            <FontSizePixelControl editor={editor} onApply={setFontSize} />

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
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => editor.chain().focus().toggleMark('subscript').run()}
                className={`p-1.5 rounded hover:bg-stone-100 dark:hover:bg-stone-800 ${editor.isActive('subscript') ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400' : 'text-stone-600 dark:text-stone-300'}`}
                title="아래첨자"
                aria-label="아래첨자"
              >
                <Subscript className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => editor.chain().focus().toggleMark('superscript').run()}
                className={`p-1.5 rounded hover:bg-stone-100 dark:hover:bg-stone-800 ${editor.isActive('superscript') ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400' : 'text-stone-600 dark:text-stone-300'}`}
                title="위첨자"
                aria-label="위첨자"
              >
                <Superscript className="w-3.5 h-3.5" />
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
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={toggleFormatPainter}
                className={`p-1.5 rounded transition-colors ${isFormatPainterArmed ? 'bg-indigo-100 text-indigo-700 ring-1 ring-indigo-300 dark:bg-indigo-950 dark:text-indigo-300' : 'text-stone-500 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800'}`}
                title={isFormatPainterArmed ? '서식 복사 취소' : '서식 복사: 원본 위치에서 누른 뒤 적용할 글자 범위를 선택하세요'}
                aria-label="서식 복사"
              >
                <Paintbrush className="w-3.5 h-3.5" />
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

            <select
              value={lineHeight}
              onChange={(event) => {
                const value = event.target.value;
                setLineHeight(value);
                const nodeType = editor.isActive('heading') ? 'heading' : 'paragraph';
                editor.chain().focus().updateAttributes(nodeType, { lineHeight: value || null }).run();
              }}
              className="h-7 w-[92px] rounded-lg border border-stone-200 bg-white px-1.5 text-xs text-stone-700 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200"
              title="줄 간격"
              aria-label="줄 간격"
            >
              <option value="">줄 간격</option>
              <option value="1">좁게</option>
              <option value="1.15">보통</option>
              <option value="1.5">넓게</option>
              <option value="2">두 배</option>
            </select>

            <div className="w-[1px] h-4 bg-stone-200 dark:bg-stone-800 mx-1" />

            {/* Lists & Quotes & Indent */}
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => editor.chain().focus().toggleBulletList().run()}
                className={`p-1.5 rounded hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors ${
                  editor.isActive('bulletList') ? 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400 font-bold' : 'text-stone-600 dark:text-stone-300'
                }`}
                title="기본 글머리 기호 목록"
              >
                •
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
              <ListToolbarControls editor={editor} onIndent={handleIndent} onOutdent={handleOutdent} />
              <TableBorderToolbarControl editor={editor} />
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

              <select
                defaultValue=""
                onChange={(event) => {
                  applyOneNoteTag(event.target.value);
                  event.target.value = '';
                }}
                className="h-7 w-[92px] rounded-lg border border-stone-200 bg-white px-1.5 text-xs text-stone-700 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200"
                title="선택한 글자에 태그 추가"
                aria-label="태그 추가"
              >
                <option value="">태그 추가</option>
                {ONE_NOTE_TAGS.map(item => <option key={item.id} value={item.id}>{item.icon} {item.label}</option>)}
              </select>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={findNextOneNoteTag}
                className="px-2 py-1.5 rounded-lg flex items-center gap-1 text-xs text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800"
                title="문서에서 다음 태그 위치 찾기"
                aria-label="태그 찾기"
              >
                <Search className="w-3.5 h-3.5" />
                <span>태그 찾기</span>
              </button>

              <div className="w-[1px] h-4 bg-stone-200 dark:bg-stone-800 mx-0.5" />

              {/* Quick Access to Table & Code from Home Tab */}
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={openTableDialog}
                className="px-2 py-1 rounded hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-600 dark:text-stone-300 transition-colors flex items-center gap-1 text-xs"
                title="스프레드시트 방식의 표 삽입"
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
                title={editor && !editor.state.selection.empty ? '선택 데이터를 코드 블록으로 변환' : '코드·마크다운 도구 열기'}
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
            <button type="button" onClick={onInsertDrawing} disabled={!editor || !onInsertDrawing} className="px-2.5 py-1.5 rounded-lg border flex items-center gap-1.5 transition-colors border-stone-200 bg-white text-stone-700 hover:bg-stone-100 disabled:opacity-50 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700" title="문서에 자유롭게 그릴 수 있는 캔버스 삽입">
              <Pencil className="h-3.5 w-3.5 text-indigo-600" /><span>그리기</span>
            </button>
            <InsertShapeControls editor={editor} />
            <ShapeSizeControls editor={editor} />
            <input ref={pptxFileInputRef} type="file" accept=".pptx,.ppt,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.ms-powerpoint" className="hidden" onChange={event => { void handleInsertFiles(Array.from(event.currentTarget.files || [])); event.currentTarget.value = ''; }} />
            <input ref={markdownFileInputRef} type="file" accept=".md,.markdown,text/markdown" className="hidden" onChange={event => { void handleInsertFiles(Array.from(event.currentTarget.files || [])); event.currentTarget.value = ''; }} />
            <input ref={docxFileInputRef} type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="hidden" onChange={event => { void handleInsertFiles(Array.from(event.currentTarget.files || [])); event.currentTarget.value = ''; }} />
            <input ref={excelFileInputRef} type="file" accept=".xlsx,.xls,.csv,.tsv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv,text/tab-separated-values" className="hidden" onChange={event => { void handleInsertFiles(Array.from(event.currentTarget.files || [])); event.currentTarget.value = ''; }} />
            <input ref={pdfFileInputRef} type="file" accept=".pdf,application/pdf" className="hidden" onChange={event => { void handleInsertFiles(Array.from(event.currentTarget.files || [])); event.currentTarget.value = ''; }} />
            {([
              { label: 'PPT', title: 'PPTX 슬라이드 내용을 문서에 삽입', icon: <Presentation className="h-3.5 w-3.5 text-orange-600" />, ref: pptxFileInputRef },
              { label: 'MD', title: '마크다운 파일 내용을 서식으로 삽입', icon: <FileText className="h-3.5 w-3.5 text-sky-600" />, ref: markdownFileInputRef },
              { label: 'DOCX', title: 'Word 문서의 본문과 표를 삽입', icon: <FileText className="h-3.5 w-3.5 text-blue-700" />, ref: docxFileInputRef },
              { label: 'Excel', title: 'Excel 시트를 편집 가능한 표로 삽입', icon: <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />, ref: excelFileInputRef },
              { label: 'PDF', title: 'PDF 페이지와 텍스트를 문서에 삽입', icon: <FileDown className="h-3.5 w-3.5 text-rose-600" />, ref: pdfFileInputRef },
            ] as const).map(item => (
              <button key={item.label} type="button" onClick={() => item.ref.current?.click()} className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-stone-700 transition-colors hover:bg-stone-100 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700" title={item.title}>
                {item.icon}<span className="font-medium">{item.label}</span>
              </button>
            ))}
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
              title="이미지 파일 또는 웹 주소 삽입"
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
              title="유튜브 링크 또는 동영상 웹 주소 삽입"
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
                title={editor && !editor.state.selection.empty ? '선택 영역을 코드 블록으로 변환' : '코드 서식과 마크다운 붙여넣기 도구 열기'}
              >
                <Code className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                <span className="font-medium">코드·마크다운</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setCodeDialogTab('md_paste');
                  setActiveTopDialog(activeTopDialog === 'code' ? null : 'code');
                }}
                className="px-1.5 py-1.5 rounded-r-lg border-y border-r transition-colors flex items-center justify-center bg-white dark:bg-stone-800 hover:bg-stone-100 dark:hover:bg-stone-700/80 text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200 border-stone-200 dark:border-stone-700"
                title="마크다운 붙여넣기 도구 열기"
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
        {activeRibbonTab === 'draw' && (
          <div className="flex items-center gap-1.5 shrink-0 flex-nowrap text-xs">
            <span className="mr-1 text-[10px] font-semibold text-stone-500">펜</span>
            {([['pen', <Pencil size={14}/>, '펜'], ['highlighter', <HighlighterIcon size={14}/>, '형광펜'], ['eraser', <Eraser size={14}/>, '지우개'], ['select', <Type size={14}/>, '선택·이동']] as const).map(([mode, icon, label]) => <button key={mode} type="button" onMouseDown={event => event.preventDefault()} onClick={() => { if (mode !== 'select') onInsertDrawing?.(); setDrawingTool?.(mode); }} className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-2 ${drawingTool === mode ? 'border-indigo-300 bg-indigo-100 font-semibold text-indigo-800 dark:border-indigo-800 dark:bg-indigo-950/70 dark:text-indigo-200' : 'border-stone-200 text-stone-700 hover:bg-stone-100 dark:border-stone-700 dark:text-stone-200 dark:hover:bg-stone-800'}`}>{icon}<span>{label}</span></button>)}
            <DrawingStylePicker color={drawingColor} width={drawingWidth} onColorChange={color => setDrawingColor?.(color)} onWidthChange={nextWidth => setDrawingWidth?.(nextWidth)}/>
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
