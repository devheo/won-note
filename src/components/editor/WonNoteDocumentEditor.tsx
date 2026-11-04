import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Editor } from '@tiptap/core';
import { EditorContent, ReactNodeViewRenderer, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { createLowlight, common } from 'lowlight';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Underline from '@tiptap/extension-underline';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import TextAlign from '@tiptap/extension-text-align';
import Highlight from '@tiptap/extension-highlight';
import { TextStyle } from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import Link from '@tiptap/extension-link';
import HorizontalRule from '@tiptap/extension-horizontal-rule';
import {
  Bold,
  Code,
  Heading1,
  Heading2,
  Heading3,
  ImagePlus,
  Italic,
  List,
  ListChecks,
  ListOrdered,
  Quote,
  Table2,
  Underline as UnderlineIcon,
  Strikethrough,
  Highlighter,
  Minus,
  Link as LinkIcon,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Palette,
  Trash2,
} from 'lucide-react';
import { WonNoteDocument } from '../../types';
import { ImageComponent } from './ImageComponent';
import { registerNoteEditor } from '../../services/noteEditorBridge';

const WonNoteImage = Image.extend({
  inline: true,
  group: 'inline',
  draggable: true,
  addAttributes() {
    return {
      ...this.parent?.(),
      src: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-asset-src') || element.getAttribute('src'),
        renderHTML: (attributes) => typeof attributes.src === 'string' && attributes.src.startsWith('asset://')
          ? { 'data-asset-src': attributes.src }
          : { src: attributes.src },
      },
      width: {
        default: 'auto',
        parseHTML: (element) => element.getAttribute('data-width') || element.getAttribute('width') || element.style.width || 'auto',
        renderHTML: (attributes) => attributes.width && attributes.width !== 'auto'
          ? { width: attributes.width, 'data-width': attributes.width, style: `width: ${attributes.width}; max-width: 100%;` }
          : {},
      },
      layout: {
        default: 'inline',
        parseHTML: (element) => element.getAttribute('data-layout') || 'inline',
        renderHTML: (attributes) => ({ 'data-layout': attributes.layout || 'inline' }),
      },
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(ImageComponent);
  },
});

interface WonNoteDocumentEditorProps {
  document: WonNoteDocument;
  onUpdateDocument: (updatedDocument: WonNoteDocument) => void;
}

export const WonNoteDocumentEditor: React.FC<WonNoteDocumentEditorProps> = ({ document, onUpdateDocument }) => {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const documentRef = useRef(document);
  const updateRef = useRef(onUpdateDocument);
  const updateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingEditorRef = useRef<Editor | null>(null);
  documentRef.current = document;
  updateRef.current = onUpdateDocument;
  const lowlight = useMemo(() => createLowlight(common), []);

  const [linkInputUrl, setLinkInputUrl] = useState('');
  const [showLinkInput, setShowLinkInput] = useState(false);

  const flushEditorUpdate = () => {
    if (updateTimerRef.current) {
      clearTimeout(updateTimerRef.current);
      updateTimerRef.current = null;
    }
    const pendingEditor = pendingEditorRef.current;
    pendingEditorRef.current = null;
    if (!pendingEditor || pendingEditor.isDestroyed) return;
    updateRef.current({
      ...documentRef.current,
      content: pendingEditor.getHTML(),
      updatedAt: Date.now(),
    });
  };

  useEffect(() => () => flushEditorUpdate(), []);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ codeBlock: false, horizontalRule: false }),
      CodeBlockLowlight.configure({ lowlight }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Underline,
      WonNoteImage.configure({ allowBase64: true }),
      Placeholder.configure({ placeholder: '생각을 자유롭게 적어보세요…' }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Highlight.configure({ multicolor: true }),
      TextStyle,
      Color,
      Link.configure({ openOnClick: false }),
      HorizontalRule,
    ],
    content: document.content || '<p></p>',
    editorProps: {
      attributes: {
        class: 'prose won-note-prose focus:outline-none min-h-[calc(100vh-220px)] px-8 py-7 text-stone-800 dark:text-stone-100 max-w-none',
      },
    },
    onUpdate: ({ editor: activeEditor }) => {
      // Keep each keystroke inside ProseMirror; serialize and lift content to
      // React state only after typing pauses briefly.
      pendingEditorRef.current = activeEditor;
      if (updateTimerRef.current) clearTimeout(updateTimerRef.current);
      updateTimerRef.current = setTimeout(flushEditorUpdate, 250);
    },
  }, [document.id]);

  useEffect(() => editor ? registerNoteEditor(document.id, editor) : undefined, [editor, document.id]);

  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const incoming = document.content || '<p></p>';
    try {
      if (!editor.isFocused && editor.getHTML() !== incoming) {
        editor.commands.setContent(incoming, { emitUpdate: false });
      }
    } catch (error) {
      if (!editor.isDestroyed) console.warn('[WonNote] Could not sync page content into the editor:', error);
    }
  }, [editor, document.id, document.content]);

  const addImage = async (file?: File) => {
    if (!file || !editor) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') editor.chain().focus().setImage({ src: reader.result, alt: file.name }).run();
    };
    reader.readAsDataURL(file);
  };

  const handleSetLink = () => {
    if (!editor) return;
    if (!linkInputUrl.trim()) {
      editor.chain().focus().unsetLink().run();
    } else {
      editor.chain().focus().setLink({ href: linkInputUrl.trim() }).run();
    }
    setShowLinkInput(false);
    setLinkInputUrl('');
  };

  const tool = (label: string, icon: React.ReactNode, action: () => void, active = false) => (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={action}
      className={`rounded-lg p-2 transition-colors cursor-pointer ${
        active
          ? 'bg-amber-500 text-stone-950 font-bold shadow-2xs'
          : 'text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800'
      }`}
    >
      {icon}
    </button>
  );

  if (!editor) return null;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[#fffdf8] dark:bg-[#171717]">
      {/* Enhanced Rich Toolbar matching RichEditorModal */}
      <div className="flex flex-wrap items-center gap-1 border-b border-stone-200 bg-white px-4 py-2 dark:border-stone-800 dark:bg-stone-900 text-xs shrink-0">
        {/* Text Styling */}
        {tool('굵게', <Bold size={15} />, () => editor.chain().focus().toggleBold().run(), editor.isActive('bold'))}
        {tool('기울임', <Italic size={15} />, () => editor.chain().focus().toggleItalic().run(), editor.isActive('italic'))}
        {tool('밑줄', <UnderlineIcon size={15} />, () => editor.chain().focus().toggleUnderline().run(), editor.isActive('underline'))}
        {tool('취소선', <Strikethrough size={15} />, () => editor.chain().focus().toggleStrike().run(), editor.isActive('strike'))}
        {tool('인라인 코드', <Code size={15} />, () => editor.chain().focus().toggleCode().run(), editor.isActive('code'))}

        <span className="mx-1 h-5 w-px bg-stone-200 dark:bg-stone-700" />

        {/* Headings */}
        {tool('제목 1', <Heading1 size={15} />, () => editor.chain().focus().toggleHeading({ level: 1 }).run(), editor.isActive('heading', { level: 1 }))}
        {tool('제목 2', <Heading2 size={15} />, () => editor.chain().focus().toggleHeading({ level: 2 }).run(), editor.isActive('heading', { level: 2 }))}
        {tool('제목 3', <Heading3 size={15} />, () => editor.chain().focus().toggleHeading({ level: 3 }).run(), editor.isActive('heading', { level: 3 }))}

        <span className="mx-1 h-5 w-px bg-stone-200 dark:bg-stone-700" />

        {/* Lists */}
        {tool('글머리 기호', <List size={15} />, () => editor.chain().focus().toggleBulletList().run(), editor.isActive('bulletList'))}
        {tool('번호 목록', <ListOrdered size={15} />, () => editor.chain().focus().toggleOrderedList().run(), editor.isActive('orderedList'))}
        {tool('체크리스트', <ListChecks size={15} />, () => editor.chain().focus().toggleTaskList().run(), editor.isActive('taskList'))}
        {tool('인용', <Quote size={15} />, () => editor.chain().focus().toggleBlockquote().run(), editor.isActive('blockquote'))}

        <span className="mx-1 h-5 w-px bg-stone-200 dark:bg-stone-700" />

        {/* Alignment */}
        {tool('왼쪽 정렬', <AlignLeft size={15} />, () => editor.chain().focus().setTextAlign('left').run(), editor.isActive({ textAlign: 'left' }))}
        {tool('가운데 정렬', <AlignCenter size={15} />, () => editor.chain().focus().setTextAlign('center').run(), editor.isActive({ textAlign: 'center' }))}
        {tool('오른쪽 정렬', <AlignRight size={15} />, () => editor.chain().focus().setTextAlign('right').run(), editor.isActive({ textAlign: 'right' }))}

        <span className="mx-1 h-5 w-px bg-stone-200 dark:bg-stone-700" />

        {/* Colors & Highlights */}
        <div className="flex items-center gap-1">
          <label className="flex items-center gap-1 cursor-pointer p-1.5 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-600 dark:text-stone-300" title="글자 색상">
            <Palette size={15} />
            <input
              type="color"
              onInput={(e) => editor.chain().focus().setColor((e.target as HTMLInputElement).value).run()}
              className="w-4 h-4 rounded border-0 cursor-pointer bg-transparent"
            />
          </label>
          {tool('형광펜', <Highlighter size={15} />, () => editor.chain().focus().toggleHighlight().run(), editor.isActive('highlight'))}
        </div>

        <span className="mx-1 h-5 w-px bg-stone-200 dark:bg-stone-700" />

        {/* Special Inserts: Link, Image, Table, Code Block, HR */}
        {tool('링크 삽입', <LinkIcon size={15} />, () => {
          const previousUrl = editor.getAttributes('link').href;
          setLinkInputUrl(previousUrl || '');
          setShowLinkInput(!showLinkInput);
        }, editor.isActive('link'))}
        {tool('이미지 삽입', <ImagePlus size={15} />, () => imageInputRef.current?.click())}
        {tool('표 삽입', <Table2 size={15} />, () => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run())}
        {tool('코드 블록', <Code size={15} />, () => editor.chain().focus().toggleCodeBlock().run(), editor.isActive('codeBlock'))}
        {tool('구분선', <Minus size={15} />, () => editor.chain().focus().setHorizontalRule().run())}

        <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={(event) => { void addImage(event.target.files?.[0]); event.currentTarget.value = ''; }} />
      </div>

      {/* Link Input Popover Bar */}
      {showLinkInput && (
        <div className="flex items-center gap-2 px-5 py-2 bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-900/50 text-xs shrink-0 animate-in fade-in">
          <span className="font-bold text-amber-800 dark:text-amber-300">URL 링크:</span>
          <input
            type="text"
            value={linkInputUrl}
            onChange={(e) => setLinkInputUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSetLink(); if (e.key === 'Escape') setShowLinkInput(false); }}
            placeholder="https://example.com"
            className="flex-1 px-3 py-1 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 font-mono text-xs outline-none focus:ring-2 focus:ring-amber-500"
            autoFocus
          />
          <button type="button" onClick={handleSetLink} className="px-3 py-1 bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold rounded-lg cursor-pointer">적용</button>
          <button type="button" onClick={() => { editor.chain().focus().unsetLink().run(); setShowLinkInput(false); }} className="px-2.5 py-1 bg-stone-200 dark:bg-stone-700 text-stone-700 dark:text-stone-300 rounded-lg cursor-pointer">링크 제거</button>
        </div>
      )}

      {/* Table Quick Bubble Toolbar if Table active */}
      {editor.isActive('table') && (
        <div className="flex items-center gap-1 px-4 py-1.5 bg-stone-100 dark:bg-[#222222] border-b border-stone-200 dark:border-stone-800 text-[11px] shrink-0 overflow-x-auto">
          <span className="font-bold text-amber-600 dark:text-amber-400 mr-2">표 도구:</span>
          <button type="button" onClick={() => editor.chain().focus().addRowBefore().run()} className="px-2 py-1 bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded hover:bg-amber-500/10 cursor-pointer">위 행 추가</button>
          <button type="button" onClick={() => editor.chain().focus().addRowAfter().run()} className="px-2 py-1 bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded hover:bg-amber-500/10 cursor-pointer">아래 행 추가</button>
          <button type="button" onClick={() => editor.chain().focus().addColumnBefore().run()} className="px-2 py-1 bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded hover:bg-amber-500/10 cursor-pointer">좌측 열 추가</button>
          <button type="button" onClick={() => editor.chain().focus().addColumnAfter().run()} className="px-2 py-1 bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded hover:bg-amber-500/10 cursor-pointer">우측 열 추가</button>
          <span className="mx-1 h-3 w-px bg-stone-300 dark:bg-stone-700" />
          <button type="button" onClick={() => editor.chain().focus().deleteRow().run()} className="px-2 py-1 bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/50 rounded hover:bg-rose-100 cursor-pointer">행 삭제</button>
          <button type="button" onClick={() => editor.chain().focus().deleteColumn().run()} className="px-2 py-1 bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/50 rounded hover:bg-rose-100 cursor-pointer">열 삭제</button>
          <button type="button" onClick={() => editor.chain().focus().deleteTable().run()} className="px-2 py-1 bg-rose-600 text-white rounded hover:bg-rose-500 cursor-pointer flex items-center gap-1 font-bold"><Trash2 size={12} /> 표 셀 도구</button>
        </div>
      )}

      {/* Editor Content Area */}
      <div className="flex-1 overflow-auto" onBlur={flushEditorUpdate}>
        <div className="mx-auto min-h-full w-full max-w-5xl px-5 pb-12 pt-5">
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  );
};
