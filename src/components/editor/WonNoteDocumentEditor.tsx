import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Editor, mergeAttributes, Node } from '@tiptap/core';
import { EditorContent, ReactNodeViewRenderer, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCaret from '@tiptap/extension-collaboration-caret';
import { WebsocketProvider } from 'y-websocket';
import * as Y from 'yjs';
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
import FontFamily from '@tiptap/extension-font-family';
import Color from '@tiptap/extension-color';
import Link from '@tiptap/extension-link';
import HorizontalRule from '@tiptap/extension-horizontal-rule';
import { CommentExtension } from './CommentExtension';
import { useYjsComments } from './useYjsComments';
import { NOTE_FONT_FAMILIES, NOTE_FONT_SIZES } from '../../constants/editor';
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
  MessageSquare,
  X,
  Check,
  Clock3,
  LoaderCircle,
} from 'lucide-react';
import { WonNoteDocument } from '../../types';
import { ImageComponent } from './ImageComponent';
import { registerNoteEditor } from '../../services/noteEditorBridge';
import { usePersistedYDoc } from '../../hooks/usePersistedYDoc';
import { useDocumentHistory } from '../../hooks/useDocumentHistory';
import { DocumentHistoryPanel } from './DocumentHistoryPanel';
import { selectCommentAnchorAt } from '../../utils/commentSelection';
import { useStatusBar } from '../common/GlobalStatusBar';

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

const PdfPage = Node.create({
  name: 'pdfPage',
  group: 'block',
  content: 'block+',
  defining: true,
  addAttributes() {
    return {
      page: { default: null, parseHTML: element => element.getAttribute('data-pdf-page'), renderHTML: attrs => attrs.page ? { 'data-pdf-page': attrs.page } : {} },
      total: { default: null, parseHTML: element => element.getAttribute('data-pdf-total'), renderHTML: attrs => attrs.total ? { 'data-pdf-total': attrs.total } : {} },
    };
  },
  parseHTML() { return [{ tag: 'div[data-pdf-page]' }]; },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes(HTMLAttributes, { class: 'pdf-page-content' }), 0]; },
});

const CustomTextStyle = TextStyle.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      fontSize: {
        default: null,
        parseHTML: element => element.style.fontSize?.replace(/["']+/g, '') || null,
        renderHTML: attributes => attributes.fontSize ? { style: `font-size: ${attributes.fontSize};` } : {},
      },
    };
  },
});

interface WonNoteDocumentEditorProps {
  document: WonNoteDocument;
  onUpdateDocument: (updatedDocument: WonNoteDocument) => void;
  zoomLevel?: number;
  useServerMode?: boolean;
}

export const WonNoteDocumentEditor: React.FC<WonNoteDocumentEditorProps> = ({ document, onUpdateDocument, zoomLevel = 100, useServerMode = false }) => {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const pageBadgeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const documentRef = useRef(document);
  const updateRef = useRef(onUpdateDocument);
  const updateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingEditorRef = useRef<Editor | null>(null);
  const { updateMetrics } = useStatusBar();
  documentRef.current = document;
  updateRef.current = onUpdateDocument;
  const lowlight = useMemo(() => createLowlight(common), []);

  const [linkInputUrl, setLinkInputUrl] = useState('');
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [pdfPageIndicator, setPdfPageIndicator] = useState<{ current: string; total: number; visible: boolean } | null>(null);
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
  const [isCommentPanelOpen, setIsCommentPanelOpen] = useState(false);
  const [commentComposer, setCommentComposer] = useState<{ x: number; y: number } | null>(null);
  const [commentDraft, setCommentDraft] = useState('');
  const [editorContextMenu, setEditorContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [providerSyncRevision, setProviderSyncRevision] = useState(0);
  const [isEditorContentReady, setIsEditorContentReady] = useState(false);
  const [showDocumentLoader, setShowDocumentLoader] = useState(false);
  const [collaborationState, setCollaborationState] = useState(useServerMode ? (import.meta.env.VITE_YJS_WS_URL ? '연결 중' : '로컬 저장 · Yjs 서버 미설정') : '이 기기에 저장됨');
  const collaborationUrl = useServerMode ? import.meta.env.VITE_YJS_WS_URL : undefined;
  const collaboration = useMemo(() => {
    const ydoc = new Y.Doc();
    const provider = collaborationUrl ? new WebsocketProvider(collaborationUrl, `wonnote-document-${document.id}`, ydoc) : null;
    return { ydoc, provider };
  }, [collaborationUrl, document.id]);
  const ydocReady = usePersistedYDoc(collaboration.ydoc, `document:${document.id}`);

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
      StarterKit.configure({ codeBlock: false, horizontalRule: false, link: false, underline: false, undoRedo: collaboration ? false : undefined }),
      ...[
        Collaboration.configure({ document: collaboration.ydoc, field: 'prosemirror' }),
        CommentExtension.configure({ onCommentClick: setActiveCommentId }),
        ...(collaboration.provider ? [CollaborationCaret.configure({ provider: collaboration.provider, user: { name: '사용자', color: '#4f46e5' } })] : []),
      ],
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
      CustomTextStyle,
      FontFamily,
      Color,
      Link.configure({ openOnClick: false }),
      HorizontalRule,
      PdfPage,
    ],
    content: undefined,
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
  }, [document.id, ydocReady]);

  useEffect(() => {
    if (!editor) return;
    let frameId = 0;
    const refreshStatusBar = () => {
      if (frameId) return;
      frameId = window.requestAnimationFrame(() => {
        frameId = 0;
        if (editor.isDestroyed) return;
        const { state } = editor;
        const { from, to, empty } = state.selection;
        const beforeCursor = state.doc.textBetween(0, from, '\n');
        const lastLineBreak = beforeCursor.lastIndexOf('\n');
        const line = beforeCursor.split('\n').length;
        const col = lastLineBreak < 0 ? beforeCursor.length + 1 : beforeCursor.length - lastLineBreak;
        const selectedText = empty ? '' : state.doc.textBetween(from, to, '\n');
        const fullText = state.doc.textBetween(0, state.doc.content.size, '\n');
        const encoder = new TextEncoder();
        updateMetrics({
          line,
          col,
          selectedChars: selectedText.length,
          selectedBytes: encoder.encode(selectedText).length,
          totalBytes: encoder.encode(editor.getHTML()).length,
          totalChars: fullText.length,
          totalLines: fullText ? fullText.split('\n').length : 1,
          tableName: document.title || '원노트',
          lastModifiedAt: document.updatedAt || Date.now(),
          viewModeName: '원노트',
        });
      });
    };
    editor.on('selectionUpdate', refreshStatusBar);
    editor.on('update', refreshStatusBar);
    refreshStatusBar();
    return () => {
      editor.off('selectionUpdate', refreshStatusBar);
      editor.off('update', refreshStatusBar);
      if (frameId) window.cancelAnimationFrame(frameId);
    };
  }, [editor, document.id, document.title, document.updatedAt, updateMetrics]);

  const commentsReady = Boolean(editor && ydocReady && isEditorContentReady && (!collaboration.provider || collaboration.provider.synced));
  const { comments, addComment, resolveComment, deleteComment, focusComment } = useYjsComments(editor, collaboration.ydoc, commentsReady);
  const history = useDocumentHistory(`document:${document.id}`, document.title, document.content, useServerMode);

  useEffect(() => {
    if (comments.length > 0) setIsCommentPanelOpen(true);
  }, [comments.length]);
  useEffect(() => {
    if (activeCommentId) focusComment(activeCommentId);
  }, [activeCommentId, focusComment]);

  const openCommentAt = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!editor || !collaboration) return;
    const position = editor.view.posAtCoords({ left: event.clientX, top: event.clientY });
    if (position) selectCommentAnchorAt(editor.view, position.pos);
    setEditorContextMenu({ x: event.clientX, y: event.clientY });
  };

  const submitComment = () => {
    if (!commentDraft.trim()) return;
    try {
      const id = addComment('사용자', commentDraft);
      if (id) setActiveCommentId(id);
      setCommentDraft('');
      setCommentComposer(null);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : '댓글을 추가하지 못했습니다.');
    }
  };

  useEffect(() => {
    if (!collaboration.provider) {
      setCollaborationState(useServerMode ? '로컬 저장 · Yjs 서버 미설정' : '이 기기에 저장됨');
      return;
    }
    const onStatus = ({ status }: { status: string }) => setCollaborationState(status === 'connected' ? '실시간 연결됨' : '로컬 저장 · 서버 연결 중');
    const onSync = () => setProviderSyncRevision(value => value + 1);
    collaboration.provider.on('status', onStatus);
    collaboration.provider.on('sync', onSync);
    if (collaboration.provider.synced) onSync();
    return () => {
      collaboration.provider?.off('status', onStatus);
      collaboration.provider?.off('sync', onSync);
      collaboration.provider?.destroy();
      collaboration.ydoc.destroy();
    };
  }, [collaboration, useServerMode]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!editor || !container) return;
    const refreshIndicator = (duringScroll = false) => {
      const pages = Array.from(editor.view.dom.querySelectorAll<HTMLElement>('[data-pdf-page]'));
      if (!pages.length) { setPdfPageIndicator(null); return; }
      const containerRect = container.getBoundingClientRect();
      const visibleTop = Math.max(containerRect.top, 0);
      const visibleBottom = Math.min(containerRect.bottom, window.innerHeight);
      const anchorY = visibleTop + Math.max(0, visibleBottom - visibleTop) * 0.42;
      const current = pages.find(page => {
        const rect = page.getBoundingClientRect();
        return rect.top <= anchorY && rect.bottom > anchorY;
      }) || pages.reduce((nearest, page) => {
        const center = (page.getBoundingClientRect().top + page.getBoundingClientRect().bottom) / 2;
        const nearestCenter = (nearest.getBoundingClientRect().top + nearest.getBoundingClientRect().bottom) / 2;
        return Math.abs(center - anchorY) < Math.abs(nearestCenter - anchorY) ? page : nearest;
      }, pages[0]);
      setPdfPageIndicator({ current: current.dataset.pdfPage || String(pages.indexOf(current) + 1), total: Number(current.dataset.pdfTotal) || pages.length, visible: duringScroll });
      if (duringScroll) {
        if (pageBadgeTimerRef.current) clearTimeout(pageBadgeTimerRef.current);
        pageBadgeTimerRef.current = setTimeout(() => setPdfPageIndicator(value => value ? { ...value, visible: false } : null), 1800);
      }
    };
    const onScroll = () => refreshIndicator(true);
    const observer = new MutationObserver(() => refreshIndicator());
    observer.observe(editor.view.dom, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-pdf-page'] });
    container.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('scroll', onScroll, { capture: true, passive: true });
    refreshIndicator();
    return () => {
      container.removeEventListener('scroll', onScroll);
      window.removeEventListener('scroll', onScroll, true);
      observer.disconnect();
      if (pageBadgeTimerRef.current) clearTimeout(pageBadgeTimerRef.current);
    };
  }, [editor, document.id]);

  useEffect(() => editor ? registerNoteEditor(document.id, editor) : undefined, [editor, document.id]);

  useEffect(() => {
    if (!editor || editor.isDestroyed || !ydocReady || (collaboration.provider && !collaboration.provider.synced)) return;
    // Yjs is the source of truth in both offline and server modes. Initial content
    // is seeded only into an empty CRDT document; stale React props must not replace it.
    if (collaboration.ydoc.getXmlFragment('prosemirror').length > 0) {
      setIsEditorContentReady(true);
      return;
    }
    const incoming = document.content || '<p></p>';
    if (editor.isFocused || editor.getHTML() === incoming) {
      setIsEditorContentReady(true);
      return;
    }

    // ProseMirror React node views may synchronously flush React while setContent
    // dispatches a transaction. Run it after the current React commit completes.
    const frame = window.requestAnimationFrame(() => {
      if (editor.isDestroyed || editor.isFocused || editor.getHTML() === incoming) return;
      try {
        editor.commands.setContent(incoming, { emitUpdate: false });
      } catch (error) {
        if (!editor.isDestroyed) console.warn('[WonNote] Could not sync page content into the editor:', error);
      } finally {
        setIsEditorContentReady(true);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [editor, document.id, document.content, ydocReady, collaboration, providerSyncRevision]);

  const isDocumentReady = Boolean(editor && ydocReady && isEditorContentReady && (!collaboration.provider || collaboration.provider.synced));
  const loadingMessage = !ydocReady
    ? '이 기기에 저장된 문서를 복원하고 있습니다'
    : collaboration.provider && !collaboration.provider.synced
      ? '사내 서버의 최신 변경사항을 확인하고 있습니다'
      : '편집기를 준비하고 있습니다';

  useEffect(() => {
    if (isDocumentReady) {
      setShowDocumentLoader(false);
      return;
    }
    const timer = window.setTimeout(() => setShowDocumentLoader(true), 250);
    return () => window.clearTimeout(timer);
  }, [isDocumentReady, document.id]);

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

  if (!isDocumentReady || !editor) {
    if (!showDocumentLoader) return null;
    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center gap-4 bg-[#fffdf8] px-6 text-center dark:bg-[#171717]" role="status" aria-live="polite" aria-label="문서 로딩 중">
        <div className="relative flex h-20 w-20 items-center justify-center">
          <div className="absolute inset-0 rounded-full border-[5px] border-stone-200 dark:border-stone-700" />
          <div className="absolute inset-0 animate-spin rounded-full border-[5px] border-transparent border-t-amber-500" />
          <LoaderCircle className="h-8 w-8 text-amber-500" strokeWidth={2.2} />
        </div>
        <div><p className="text-sm font-semibold text-stone-800 dark:text-stone-100">문서를 불러오고 있습니다</p><p className="mt-1 text-xs text-stone-500 dark:text-stone-400">{loadingMessage}</p></div>
      </div>
    );
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-[#fffdf8] dark:bg-[#171717]">
      {/* Enhanced Rich Toolbar matching RichEditorModal */}
      <div id="won-note-editor-toolbar" className="flex min-w-0 flex-nowrap items-center gap-1 overflow-x-auto whitespace-nowrap border-b border-stone-200 bg-white px-4 py-2 text-xs shrink-0 dark:border-stone-800 dark:bg-stone-900 [&>*]:shrink-0" style={{ scrollbarWidth: 'none' }}>
        {/* Text Styling */}
        <select
          aria-label="글꼴"
          title="글꼴"
          value={editor.getAttributes('textStyle').fontFamily || 'default'}
          onMouseDown={event => event.stopPropagation()}
          onChange={event => {
            const family = event.target.value;
            if (family === 'default') editor.chain().focus().unsetFontFamily().run();
            else editor.chain().focus().setFontFamily(family).run();
          }}
          className="h-8 max-w-36 rounded-lg border border-stone-200 bg-white px-2 text-xs text-stone-700 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200"
        >
          {NOTE_FONT_FAMILIES.map(font => <option key={font.value} value={font.value}>{font.label}</option>)}
        </select>
        <select
          aria-label="글자 크기"
          title="글자 크기"
          value={editor.getAttributes('textStyle').fontSize || 'default'}
          onMouseDown={event => event.stopPropagation()}
          onChange={event => editor.chain().focus().setMark('textStyle', { fontSize: event.target.value === 'default' ? null : event.target.value }).run()}
          className="h-8 w-20 rounded-lg border border-stone-200 bg-white px-2 text-xs text-stone-700 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200"
        >
          <option value="default">크기</option>
          {NOTE_FONT_SIZES.map(size => <option key={size} value={`${size}px`}>{size}px</option>)}
        </select>
        <span className="mx-1 h-5 w-px bg-stone-200 dark:bg-stone-700" />
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
        {collaboration && <button type="button" title="댓글 패널" aria-label={`댓글 패널, ${comments.length}개`} onClick={() => setIsCommentPanelOpen(value => !value)} className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1.5 transition-colors ${isCommentPanelOpen ? 'border-indigo-300 bg-indigo-100 text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-300' : 'border-stone-200 text-stone-600 hover:bg-stone-100 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800'}`}><MessageSquare size={14} /><span>댓글</span><span className={`min-w-5 rounded-full px-1.5 text-center text-[10px] font-bold leading-5 ${comments.length ? 'bg-indigo-600 text-white' : 'bg-stone-200 text-stone-600 dark:bg-stone-700 dark:text-stone-300'}`}>{comments.length}</span></button>}
        {collaboration && <span className="ml-auto text-[11px] text-stone-500">{collaborationState || '연결 중'}</span>}

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
      <div ref={scrollContainerRef} className="relative flex-1 overflow-auto" onBlur={flushEditorUpdate} onContextMenu={event => {
        event.preventDefault();
        event.stopPropagation();
        openCommentAt(event);
      }}>
        <div className="mx-auto min-h-full w-full max-w-[1440px] px-5 pb-12 pt-5">
          <div style={{ zoom: `${zoomLevel}%` }} className="transition-[zoom] duration-150">
            <EditorContent editor={editor} />
          </div>
        </div>
      </div>
      {editorContextMenu && <div className="fixed z-[12000] min-w-52 rounded-xl border border-stone-200 bg-white p-1.5 text-xs shadow-2xl dark:border-stone-700 dark:bg-stone-900" style={{ left: Math.max(8, Math.min(editorContextMenu.x, window.innerWidth - 230)), top: Math.max(8, Math.min(editorContextMenu.y, window.innerHeight - 110)) }} onMouseDown={event => event.preventDefault()}>
        <button type="button" onClick={() => { setCommentDraft(''); setCommentComposer(editorContextMenu); setIsCommentPanelOpen(true); setEditorContextMenu(null); }} className="flex w-full items-center gap-2 rounded-lg bg-indigo-50 px-3 py-2 text-left font-semibold text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:text-indigo-300 dark:hover:bg-indigo-950/70"><MessageSquare size={14} />여기에 댓글 추가</button>
        <button type="button" onClick={() => { flushEditorUpdate(); void history.recordNow(editor?.getHTML() || document.content); setEditorContextMenu(null); history.setIsOpen(true); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-stone-100 dark:hover:bg-stone-800"><Clock3 size={14} className="text-stone-500" />문서 이력 보기</button>
      </div>}
      {collaboration && <aside aria-label="문서 댓글" className={`absolute inset-y-0 right-0 z-40 flex w-[min(22rem,92vw)] flex-col border-l border-stone-200 bg-white shadow-2xl transition-transform duration-200 dark:border-stone-700 dark:bg-stone-900 ${isCommentPanelOpen ? 'translate-x-0' : 'translate-x-full pointer-events-none'}`}>
        <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3 dark:border-stone-700">
          <div><h2 className="text-sm font-bold text-stone-800 dark:text-stone-100">댓글</h2><p className="text-[11px] text-stone-500">이 문서 · {comments.length}개</p></div>
          <button type="button" aria-label="댓글 패널 닫기" onClick={() => setIsCommentPanelOpen(false)} className="rounded-md p-1.5 text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"><X size={16} /></button>
        </div>
        <div className="flex-1 space-y-2 overflow-y-auto p-3">
          {comments.map(comment => <article key={comment.id} className={`rounded-xl border p-3 text-xs ${activeCommentId === comment.id ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-950/30' : 'border-stone-200 dark:border-stone-700'}`}>
            <button type="button" onClick={() => { setActiveCommentId(comment.id); focusComment(comment.id); }} className="w-full text-left">
              <div className="flex items-center justify-between gap-2"><span className="font-semibold text-stone-800 dark:text-stone-100">{comment.author}</span><span className="text-[10px] text-stone-400">{new Date(comment.createdAt).toLocaleString()}</span></div>
              <p className="my-2 whitespace-pre-wrap break-words text-stone-700 dark:text-stone-300">{comment.text}</p>
              <span className={`text-[10px] ${comment.resolved ? 'text-emerald-600' : 'text-indigo-600 dark:text-indigo-300'}`}>{comment.resolved ? '해결됨' : '위치로 이동'}</span>
            </button>
            <div className="mt-2 flex gap-3 border-t border-stone-200 pt-2 dark:border-stone-700"><button type="button" onClick={() => resolveComment(comment.id, !comment.resolved)} className="inline-flex items-center gap-1 text-indigo-700 dark:text-indigo-300"><Check size={12} />{comment.resolved ? '다시 열기' : '해결'}</button><button type="button" onClick={() => deleteComment(comment.id)} className="text-rose-600">삭제</button></div>
          </article>)}
          {comments.length === 0 && <p className="rounded-lg bg-stone-50 p-3 text-xs leading-5 text-stone-500 dark:bg-stone-800">편집 영역에서 마우스 오른쪽 버튼을 누르면 현재 위치에 댓글을 남길 수 있습니다.</p>}
        </div>
      </aside>}
      {collaboration && commentComposer && <div className="fixed z-[12000] w-[min(20rem,calc(100vw-1.5rem))] rounded-xl border border-indigo-200 bg-white p-3 shadow-2xl dark:border-indigo-900 dark:bg-stone-900" style={{ left: Math.max(12, Math.min(commentComposer.x, window.innerWidth - 340)), top: Math.max(12, Math.min(commentComposer.y, window.innerHeight - 180)) }}>
        <div className="mb-2 flex items-center justify-between"><span className="text-xs font-bold text-stone-700 dark:text-stone-200">현재 위치에 댓글</span><button type="button" aria-label="댓글 작성 닫기" onClick={() => setCommentComposer(null)} className="text-stone-400"><X size={14} /></button></div>
        <textarea autoFocus value={commentDraft} onChange={event => setCommentDraft(event.target.value)} onKeyDown={event => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') submitComment(); if (event.key === 'Escape') setCommentComposer(null); }} placeholder="댓글을 입력하세요" className="min-h-20 w-full resize-y rounded-lg border border-stone-200 bg-white p-2 text-xs outline-none focus:border-indigo-400 dark:border-stone-700 dark:bg-stone-950" />
        <div className="mt-2 flex justify-end gap-2"><button type="button" onClick={() => setCommentComposer(null)} className="rounded-lg px-3 py-1.5 text-xs text-stone-500">취소</button><button type="button" onClick={submitComment} disabled={!commentDraft.trim()} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40">댓글 등록</button></div>
      </div>}
      {history.isOpen && <DocumentHistoryPanel {...history.panelProps} currentContent={editor?.getHTML() || document.content} onClose={() => history.setIsOpen(false)} onRestore={content => {
        void history.recordNow(editor?.getHTML() || document.content);
        editor?.commands.setContent(content);
        history.setIsOpen(false);
      }} />}
      {pdfPageIndicator && createPortal(
        <div className={`pointer-events-none fixed right-3 top-1/2 z-[11010] -translate-y-1/2 rounded-full bg-stone-900/90 px-3 py-1.5 text-xs font-semibold tabular-nums text-white shadow-lg ring-1 ring-white/30 backdrop-blur-sm transition-opacity duration-200 ${pdfPageIndicator.visible ? 'opacity-100' : 'opacity-0'}`}>
          {pdfPageIndicator.current} / {pdfPageIndicator.total}
        </div>,
        globalThis.document.body,
      )}
    </div>
  );
};
