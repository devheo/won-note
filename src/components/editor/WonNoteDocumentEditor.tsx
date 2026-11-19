import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Editor, Extension, mergeAttributes, Node } from '@tiptap/core';
import { EditorContent, ReactNodeViewRenderer, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCaret from '@tiptap/extension-collaboration-caret';
import { WebsocketProvider } from 'y-websocket';
import * as Y from 'yjs';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { DOMParser as ProseMirrorDOMParser } from '@tiptap/pm/model';
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
import { DrawingExtension } from './DrawingExtension';
import { CustomTable, ListMarkerAttributes, NoteTableBorderStyle, NoteTableCellBorders, NoteTableRowHeight, TextBlockIndent, WonBeeShape } from './DocumentEditorExtensions';
import { CodeHighlightInserter, FontSizePixelControl, InsertShapeControls, ListToolbarControls, ShapeSizeControls, TableBorderToolbarControl } from './DocumentToolbarControls';
import { DrawingOverlay } from './DrawingOverlay';
import { DrawingStylePicker } from './DrawingStylePicker';
import { useYjsComments } from './useYjsComments';
import { NOTE_FONT_FAMILIES } from '../../constants/editor';
import { OneNoteTagMark, SubscriptMark, SuperscriptMark } from './OneNoteStyleExtensions';
import { Mark } from '@tiptap/core';

const TextBackgroundColorMark = Mark.create({
  name: 'textBackgroundColor',
  addAttributes() { return { color: { default: '#fff176', parseHTML: element => (element as HTMLElement).style.backgroundColor || null, renderHTML: attrs => ({ style: `background-color: ${attrs.color}` }) } }; },
  parseHTML() { return [{ tag: 'span[style*="background-color"]' }]; },
  renderHTML({ HTMLAttributes }) { return ['span', mergeAttributes(HTMLAttributes), 0]; },
});
const TextForegroundColorMark = Mark.create({
  name: 'textForegroundColor',
  addAttributes() { return { color: { default: '#292524', parseHTML: element => (element as HTMLElement).style.color || null, renderHTML: attrs => ({ style: `color: ${attrs.color}` }) } }; },
  parseHTML() { return [{ tag: 'span[style*="color"]' }]; },
  renderHTML({ HTMLAttributes }) { return ['span', mergeAttributes(HTMLAttributes), 0]; },
});
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
  Pencil,
  Eraser,
  Undo2,
  Redo2,
  Presentation,
  FileSpreadsheet,
  FileText,
  FileDown,
  Subscript as SubscriptIcon,
  Superscript as SuperscriptIcon,
  RemoveFormatting,
  Video,
  Scissors,
  Copy,
  ClipboardPaste,
  Combine,
  Split,
  Rows,
  Columns,
} from 'lucide-react';
import { WonNoteDocument } from '../../types';
import { ImageComponent } from './ImageComponent';
import { CodeBlockComponent } from './CodeBlockComponent';
import { registerNoteEditor } from '../../services/noteEditorBridge';
import { usePersistedYDoc } from '../../hooks/usePersistedYDoc';
import { useDocumentHistory } from '../../hooks/useDocumentHistory';
import { DocumentHistoryPanel } from './DocumentHistoryPanel';
import { selectCommentAnchorAt } from '../../utils/commentSelection';
import { useStatusBar } from '../common/GlobalStatusBar';
import { isLikelyMarkdown, markdownToHtml } from '../../utils/markdownHelper';
import { convertTextDataToEditorContent } from '../../utils/csvParser';
import { escapeHtml } from '../../utils/codeHighlighter';
import { EditorEditTools } from './EditorEditTools';
import { changeTextBlockIndent } from '../../utils/editorIndent';

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

const TabKeyExtension = Extension.create({
  name: 'tabKeySupport',
  addKeyboardShortcuts() {
    return {
      Tab: () => {
        if (this.editor.isActive('codeBlock')) {
          this.editor.commands.insertContent('    ');
          return true;
        }
        if (this.editor.isActive('table')) {
          return false;
        }
        changeTextBlockIndent(this.editor, 24);
        return true; // Always consume Tab key within editor to prevent focus escaping to zoom/toolbar buttons
      },
      'Shift-Tab': () => {
        if (this.editor.isActive('table')) {
          return false;
        }
        changeTextBlockIndent(this.editor, -24);
        return true; // Always consume Shift-Tab key within editor to prevent focus escaping
      },
    };
  },
});

function handleEqualizeRowHeights(editor: any) {
  if (!editor || !editor.isActive('table')) return;
  const { state, view } = editor;
  const { doc, selection } = state;
  let tablePos: number | null = null;
  doc.descendants((node: any, pos: number) => {
    if (node.type.name === 'table' && tablePos === null) {
      if (pos <= selection.from && pos + node.nodeSize >= selection.to) {
        tablePos = pos;
      }
    }
  });
  if (tablePos === null) return;
  const tableNode = doc.nodeAt(tablePos);
  if (!tableNode) return;

  let tr = state.tr;
  tableNode.descendants((node: any, pos: number) => {
    if (node.type.name === 'tableRow') {
      const absPos = tablePos! + 1 + pos;
      tr = tr.setNodeMarkup(absPos, undefined, { ...node.attrs, rowHeight: 32 });
    }
  });
  view.dispatch(tr);
}

function handleEqualizeColumnWidths(editor: any) {
  if (!editor || !editor.isActive('table')) return;
  editor.chain().focus().unsetCellAttribute('colwidth').run();
}

function handleCut(editor: any) {
  if (!editor) return;
  try {
    const text = editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to, ' ');
    if (text) navigator.clipboard.writeText(text);
    editor.chain().focus().deleteSelection().run();
  } catch {
    document.execCommand('cut');
  }
}

function handleCopy(editor: any) {
  if (!editor) return;
  try {
    const text = editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to, ' ');
    if (text) navigator.clipboard.writeText(text);
  } catch {
    document.execCommand('copy');
  }
}

async function handlePaste(editor: any) {
  if (!editor) return;
  try {
    const text = await navigator.clipboard.readText();
    if (text) editor.chain().focus().insertContent(text).run();
  } catch {
    document.execCommand('paste');
  }
}

interface WonNoteDocumentEditorProps {
  document: WonNoteDocument;
  onUpdateDocument: (updatedDocument: WonNoteDocument) => void;
  zoomLevel?: number;
  useServerMode?: boolean;
  activeRibbonTab?: 'home' | 'edit' | 'insert' | 'draw';
}

export const WonNoteDocumentEditor: React.FC<WonNoteDocumentEditorProps> = ({ document, onUpdateDocument, zoomLevel = 100, useServerMode = false, activeRibbonTab = 'home' }) => {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const pptxInputRef = useRef<HTMLInputElement>(null);
  const markdownInputRef = useRef<HTMLInputElement>(null);
  const docxInputRef = useRef<HTMLInputElement>(null);
  const excelInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
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
  const [pdfPageIndicator, setPdfPageIndicator] = useState<{ current: string; total: number } | null>(null);
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
  const [isCommentPanelOpen, setIsCommentPanelOpen] = useState(false);
  const [commentComposer, setCommentComposer] = useState<{ x: number; y: number } | null>(null);
  const [commentDraft, setCommentDraft] = useState('');
  const [editorContextMenu, setEditorContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [providerSyncRevision, setProviderSyncRevision] = useState(0);
  const [isEditorContentReady, setIsEditorContentReady] = useState(false);
  const [showDocumentLoader, setShowDocumentLoader] = useState(false);
  const [insertMessage, setInsertMessage] = useState<string | null>(null);
  const [, setSelectionTick] = useState(0);
  const [collaborationState, setCollaborationState] = useState(useServerMode ? (import.meta.env.VITE_YJS_WS_URL ? '연결 중' : '로컬 저장 · Yjs 서버 미설정') : '이 기기에 저장됨');
  const [drawingTool, setDrawingTool] = useState<'select' | 'pen' | 'highlighter' | 'eraser'>('select');
  const [drawingColor, setDrawingColor] = useState('#1f2937');
  const [drawingWidth, setDrawingWidth] = useState(1);
  const [showHighlightPalette, setShowHighlightPalette] = useState(false);
  const [showTextColorPalette, setShowTextColorPalette] = useState(false);
  const [customTextColor, setCustomTextColor] = useState('#292524');
  const [customHighlightColor, setCustomHighlightColor] = useState('#fff176');
  const [palettePosition, setPalettePosition] = useState({ left: 16, top: 80 });
  const highlightColors = ['#fff176', '#ffe082', '#ffccbc', '#f8bbd0', '#e1bee7', '#c5cae9', '#bbdefb', '#b2dfdb', '#c8e6c9', '#dcedc8', '#eeeeee', '#ffffff'];
  const openColorPalette = (event: React.MouseEvent<HTMLButtonElement>, type: 'text' | 'background') => {
    const rect = event.currentTarget.getBoundingClientRect();
    setPalettePosition({ left: Math.max(8, Math.min(rect.left, window.innerWidth - 208)), top: Math.min(rect.bottom + 6, window.innerHeight - 170) });
    if (type === 'text') { setShowTextColorPalette(value => !value); setShowHighlightPalette(false); }
    else { setShowHighlightPalette(value => !value); setShowTextColorPalette(false); }
  };

  useEffect(() => {
    if (!editorContextMenu) return;

    const closeOnOutsideClick = (event: Event) => {
      const menu = window.document.getElementById('won-note-document-context-menu');
      if (menu?.contains(event.target as unknown as globalThis.Node)) return;
      setEditorContextMenu(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setEditorContextMenu(null);
    };

    window.document.addEventListener('pointerdown', closeOnOutsideClick, true);
    window.document.addEventListener('mousedown', closeOnOutsideClick, true);
    window.document.addEventListener('scroll', closeOnOutsideClick, true);
    window.addEventListener('contextmenu', closeOnOutsideClick, true);
    window.addEventListener('keydown', closeOnEscape, true);

    return () => {
      window.document.removeEventListener('pointerdown', closeOnOutsideClick, true);
      window.document.removeEventListener('mousedown', closeOnOutsideClick, true);
      window.document.removeEventListener('scroll', closeOnOutsideClick, true);
      window.removeEventListener('contextmenu', closeOnOutsideClick, true);
      window.removeEventListener('keydown', closeOnEscape, true);
    };
  }, [editorContextMenu]);

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
      CodeBlockLowlight.extend({
        draggable: true,
        selectable: true,
        addAttributes() {
          return {
            ...this.parent?.(),
            width: {
              default: '100%',
              parseHTML: (element: HTMLElement) => element.getAttribute('data-code-width') || element.style.width || '100%',
              renderHTML: (attributes: Record<string, unknown>) => attributes.width
                ? { 'data-code-width': String(attributes.width), style: attributes.width !== '100%' ? `width: ${attributes.width}; max-width: 100%;` : undefined }
                : {},
            },
            height: {
              default: null,
              parseHTML: (element: HTMLElement) => element.getAttribute('data-code-height') || element.style.height || null,
              renderHTML: (attributes: Record<string, unknown>) => attributes.height
                ? { 'data-code-height': String(attributes.height), style: `height: ${attributes.height}; max-height: ${attributes.height};` }
                : {},
            },
            align: {
              default: 'left',
              parseHTML: (element: HTMLElement) => element.getAttribute('data-code-align') || 'left',
              renderHTML: (attributes: Record<string, unknown>) => attributes.align ? { 'data-code-align': String(attributes.align) } : {},
            },
          };
        },
        addNodeView() {
          return ReactNodeViewRenderer(CodeBlockComponent);
        },
      }).configure({ lowlight, defaultLanguage: 'auto' }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Underline,
      WonNoteImage.configure({ allowBase64: true }),
      Placeholder.configure({ placeholder: '생각을 자유롭게 적어보세요…' }),
      CustomTable.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Highlight.configure({ multicolor: true }),
      CustomTextStyle,
      FontFamily,
      Color,
      SubscriptMark,
      SuperscriptMark,
      OneNoteTagMark,
      TextBackgroundColorMark,
      TextForegroundColorMark,
      Link.configure({ openOnClick: false }),
      HorizontalRule,
      PdfPage,
      DrawingExtension,
      ListMarkerAttributes,
      NoteTableBorderStyle,
      NoteTableCellBorders,
      NoteTableRowHeight,
      TextBlockIndent,
      WonBeeShape,
      TabKeyExtension,
    ],
    content: undefined,
    editorProps: {
      attributes: {
        class: 'prose won-note-prose focus:outline-none min-h-[calc(100vh-220px)] px-8 py-7 text-stone-800 dark:text-stone-100 max-w-none',
      },
      handlePaste: (view, event) => {
        const clipboard = event.clipboardData;
        if (!clipboard) return false;
        const files = Array.from(clipboard.files || []);
        const markdownFile = files.find(file => /\.(md|markdown)$/i.test(file.name) || /^(text\/(x-)?markdown)$/i.test(file.type));
        const insertMarkdown = (source: string) => {
          const markdown = source.replace(/^\uFEFF/, '').trim();
          if (!markdown) return false;
          const html = markdownToHtml(markdown);
          const container = window.document.createElement('div');
          container.innerHTML = html;
          const slice = ProseMirrorDOMParser.fromSchema(view.state.schema).parseSlice(container);
          view.dispatch(view.state.tr.replaceSelection(slice).scrollIntoView());
          view.focus();
          return true;
        };
        if (markdownFile) {
          event.preventDefault();
          const reader = new FileReader();
          reader.onload = () => {
            insertMarkdown(String(reader.result || ''));
          };
          reader.readAsText(markdownFile);
          return true;
        }
        // Some apps expose Markdown under its own MIME type and leave
        // text/plain empty (or put a rendered HTML flavor first).
        const markdownMime = clipboard.getData('text/markdown') || clipboard.getData('text/x-markdown');
        if (markdownMime.trim()) {
          event.preventDefault();
          return insertMarkdown(markdownMime);
        }
        const text = (clipboard.getData('text/plain') || '').replace(/^\uFEFF/, '');
        // Clipboard providers may include an HTML flavor alongside the raw
        // Markdown source. Prefer parsing the source so Markdown syntax is not
        // inserted as literal text when both flavors are present.
        if (text.trim() && isLikelyMarkdown(text)) {
          event.preventDefault();
          return insertMarkdown(text);
        }
        return false;
      },
    },
    onUpdate: ({ editor: activeEditor }) => {
      // Keep each keystroke inside ProseMirror; serialize and lift content to
      // React state only after typing pauses briefly.
      pendingEditorRef.current = activeEditor;
      if (updateTimerRef.current) clearTimeout(updateTimerRef.current);
      updateTimerRef.current = setTimeout(flushEditorUpdate, 400);
    },
  }, [document.id, ydocReady]);

  useEffect(() => {
    if (!editor) return;
    let frameId = 0;
    const refreshStatusBar = () => {
      setSelectionTick(t => t + 1);
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
    const refreshIndicator = () => {
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
      setPdfPageIndicator({ current: current.dataset.pdfPage || String(pages.indexOf(current) + 1), total: Number(current.dataset.pdfTotal) || pages.length });
    };
    const onScroll = () => refreshIndicator();
    const observer = new MutationObserver(() => refreshIndicator());
    observer.observe(editor.view.dom, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-pdf-page'] });
    container.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('scroll', onScroll, { capture: true, passive: true });
    refreshIndicator();
    return () => {
      container.removeEventListener('scroll', onScroll);
      window.removeEventListener('scroll', onScroll, true);
      observer.disconnect();
    };
  }, [editor, document.id]);

  useEffect(() => editor ? registerNoteEditor(document.id, editor, () => {
    if (updateTimerRef.current) clearTimeout(updateTimerRef.current);
    updateTimerRef.current = null;
    pendingEditorRef.current = null;
  }) : undefined, [editor, document.id]);

  useEffect(() => {
    if (!editor || editor.isDestroyed || !ydocReady) return;

    const incoming = document.content || '<p></p>';
    if (editor.isFocused) {
      setIsEditorContentReady(true);
      return;
    }
    if (editor.getHTML() === incoming) {
      setIsEditorContentReady(true);
      return;
    }

    // Yjs CRDT is the source of truth when a live WebSocket provider is active.
    // In standard HTTP REST / SQLite server mode (no live WS provider), update editor with remote content.
    const isLiveWsConnected = Boolean(collaboration.provider && collaboration.provider.synced);
    const yXmlLength = collaboration.ydoc.getXmlFragment('prosemirror').length;

    if (isLiveWsConnected && yXmlLength > 0) {
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

  const insertFiles = async (files: File[]) => {
    if (!editor || !files.length) return;
    let importedCount = 0;
    const warnings: string[] = [];
    const codeLanguages: Record<string, string> = {
      js: 'javascript', jsx: 'jsx', ts: 'typescript', tsx: 'tsx', py: 'python', sql: 'sql',
      html: 'html', css: 'css', yml: 'yaml', yaml: 'yaml', sh: 'bash', java: 'java',
    };
    for (const file of files) {
      const extension = file.name.split('.').pop()?.toLowerCase() || '';
      try {
        if (extension !== 'pdf' && file.size > 50 * 1024 * 1024) {
          warnings.push(`${file.name}: 50MB 이하의 파일을 선택해주세요.`);
          continue;
        }
        let html = '';
        if (extension === 'pptx') {
          setInsertMessage(`PowerPoint 내용을 읽는 중입니다: ${file.name}`);
          const result = await (await import('../../utils/pptxConversion')).importPptx(await file.arrayBuffer());
          html = result.html;
          warnings.push(...result.warnings);
        } else if (extension === 'xlsx') {
          setInsertMessage(`Excel 시트를 표로 변환 중입니다: ${file.name}`);
          const result = await (await import('../../utils/xlsxConversion')).xlsxToEditorHtml(await file.arrayBuffer(), progress => setInsertMessage(`Excel 가져오는 중 · 시트 ${progress.sheetIndex}/${progress.sheetCount} · ${progress.rowsProcessed}/${progress.totalRows}행: ${file.name}`));
          html = result.html;
          if (result.truncated) warnings.push(`${file.name}: 크기 제한으로 일부 시트/행/열을 생략했습니다.`);
        } else if (extension === 'docx') {
          setInsertMessage(`Word 문서 내용을 읽는 중입니다: ${file.name}`);
          const result = await (await import('../../utils/docxConversion')).docxToEditorHtml(await file.arrayBuffer());
          html = result.html;
          if (result.hasEmbeddedMedia) warnings.push(`${file.name}: 본문과 표를 가져왔으며, 문서에 포함된 이미지는 제외했습니다.`);
        } else if (extension === 'pdf' || file.type === 'application/pdf') {
          setInsertMessage(`PDF 페이지를 읽는 중입니다: ${file.name}`);
          const session = await (await import('../../utils/pdfConversion')).openPdfImport(await file.arrayBuffer());
          try {
            const result = await session.importPages({ mode: 'text-images', onProgress: ({ completed, total }) => setInsertMessage(`PDF 가져오는 중 ${completed}/${total}: ${file.name}`) });
            const pages = new DOMParser().parseFromString(result.html, 'text/html');
            html = Array.from(pages.querySelectorAll('[data-pdf-page]')).map(page => page.outerHTML).filter(Boolean).join('<hr>');
            warnings.push(...result.warnings);
          } finally {
            await session.close();
          }
        } else if (['md', 'markdown'].includes(extension) || file.type === 'text/markdown') {
          html = markdownToHtml((await file.text()).replace(/^\uFEFF/, ''));
        } else if (['csv', 'tsv'].includes(extension)) {
          const result = convertTextDataToEditorContent((await file.text()).replace(/^\uFEFF/, ''), { format: 'csv', delimiter: extension === 'tsv' ? 'tab' : 'auto', outputType: 'table', tableWidth: '100%' });
          html = result.html;
        } else if (extension === 'json') {
          const value = JSON.parse((await file.text()).replace(/^\uFEFF/, ''));
          html = `<pre><code class="language-json">${escapeHtml(JSON.stringify(value, null, 2))}</code></pre><p></p>`;
        } else if (extension === 'txt' || extension === 'text') {
          html = escapeHtml((await file.text()).replace(/^\uFEFF/, '')).split(/\r?\n/).map(line => `<p>${line || '<br>'}</p>`).join('');
        } else if (codeLanguages[extension]) {
          html = `<pre><code class="language-${codeLanguages[extension]}">${escapeHtml((await file.text()).replace(/^\uFEFF/, ''))}</code></pre><p></p>`;
        } else {
          const legacyOffice = ['ppt', 'xls'].includes(extension);
          warnings.push(`${file.name}: ${legacyOffice ? '구형 Office 형식입니다. PPTX, XLSX 또는 CSV로 변환해주세요.' : '지원하지 않는 파일 형식입니다.'}`);
          continue;
        }
        if (html.trim() && !editor.isDestroyed) {
          editor.chain().focus().insertContent(html).run();
          importedCount++;
        }
      } catch (error) {
        warnings.push(`${file.name}: ${error instanceof Error ? error.message : '파일을 읽지 못했습니다.'}`);
      }
    }
    const summary = [importedCount ? `${importedCount}개 파일의 내용을 노트에 삽입했습니다.` : '', ...warnings].filter(Boolean).join(' ');
    setInsertMessage(summary || '가져올 파일이 없습니다.');
    window.setTimeout(() => setInsertMessage(null), warnings.length ? 6000 : 3000);
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

  const ensureDrawingLayer = () => {
    if (!editor) return;
    let hasLayer = false;
    editor.state.doc.descendants(node => { if (node.type.name === 'drawingLayer') hasLayer = true; });
    if (!hasLayer) editor.chain().focus().insertContent({ type: 'drawingLayer', attrs: { strokes: [] } }).run();
  };

  const tool = (label: string, icon: React.ReactNode, action: () => void, active = false) => (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={() => {
        action();
        setSelectionTick(t => t + 1);
      }}
      className={`rounded-lg p-2 transition-colors cursor-pointer ${
        active
          ? 'bg-amber-500 text-stone-950 font-bold shadow-2xs'
          : 'text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800'
      }`}
    >
      {icon}
    </button>
  );

  const indentList = () => {
    if (editor.isActive('listItem')) (editor.chain().focus() as any).sinkListItem('listItem').run();
    else if (editor.isActive('taskItem')) (editor.chain().focus() as any).sinkListItem('taskItem').run();
    else changeTextBlockIndent(editor, 24);
  };
  const outdentList = () => {
    if (editor.isActive('listItem')) (editor.chain().focus() as any).liftListItem('listItem').run();
    else if (editor.isActive('taskItem')) (editor.chain().focus() as any).liftListItem('taskItem').run();
    else changeTextBlockIndent(editor, -24);
  };

  if (!isDocumentReady || !editor) {
    return (
      <div className="relative flex h-full min-h-0 flex-col items-center justify-center gap-4 bg-[#fffdf8] px-6 text-center dark:bg-[#171717] animate-in fade-in duration-100" role="status" aria-live="polite" aria-label="문서 로딩 중">
        {/* Top Animated Progress Bar */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-stone-200 dark:bg-stone-800 overflow-hidden z-50">
          <div className="h-full bg-amber-500 animate-pulse w-3/4 transition-all duration-300" />
        </div>
        <div className="relative flex h-20 w-20 items-center justify-center">
          <div className="absolute inset-0 rounded-full border-[5px] border-stone-200 dark:border-stone-700" />
          <div className="absolute inset-0 animate-spin rounded-full border-[5px] border-transparent border-t-amber-500" />
          <LoaderCircle className="h-8 w-8 text-amber-500" strokeWidth={2.2} />
        </div>
        <div>
          <p className="text-sm font-bold text-stone-800 dark:text-stone-100">문서를 불러오고 있습니다...</p>
          <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">{loadingMessage}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-[#fffdf8] dark:bg-[#171717]" onContextMenuCapture={event => {
      if ((event.target as HTMLElement).closest('#won-note-document-context-menu')) return;
      event.preventDefault();
      const position = editor.view.posAtCoords({ left: event.clientX, top: event.clientY });
      if (position && editor.state.selection.empty) editor.commands.setTextSelection(position.pos);
      setEditorContextMenu({ x: event.clientX, y: event.clientY });
    }}>
      {/* Enhanced Rich Toolbar matching RichEditorModal */}
      <div id="won-note-editor-toolbar" className="flex min-w-0 flex-nowrap items-center gap-0.5 overflow-x-auto whitespace-nowrap border-b border-stone-200 bg-white px-2 py-1.5 text-xs shrink-0 dark:border-stone-800 dark:bg-stone-900 [&>*]:shrink-0 [&_button]:p-1.5 [&_button_svg]:h-3.5 [&_button_svg]:w-3.5" style={{ scrollbarWidth: 'none' }}>
        {activeRibbonTab === 'home' && <>
        {/* Home: text style, paragraph and list tools */}
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
          className="h-7 max-w-28 rounded-lg border border-stone-200 bg-white px-1.5 text-[11px] text-stone-700 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200"
        >
          {NOTE_FONT_FAMILIES.map(font => <option key={font.value} value={font.value}>{font.label}</option>)}
        </select>
        <FontSizePixelControl editor={editor} onApply={size => editor.chain().focus().setMark('textStyle', { fontSize: size }).run()} />
        <span className="mx-1 h-5 w-px bg-stone-200 dark:bg-stone-700" />
        {tool('굵게', <Bold size={15} />, () => editor.chain().focus().toggleBold().run(), editor.isActive('bold'))}
        {tool('기울임', <Italic size={15} />, () => editor.chain().focus().toggleItalic().run(), editor.isActive('italic'))}
        {tool('밑줄', <UnderlineIcon size={15} />, () => editor.chain().focus().toggleUnderline().run(), editor.isActive('underline'))}
        {tool('취소선', <Strikethrough size={15} />, () => editor.chain().focus().toggleStrike().run(), editor.isActive('strike'))}
        {tool('인라인 코드', <Code size={15} />, () => editor.chain().focus().toggleCode().run(), editor.isActive('code'))}
        {tool('아래 첨자', <SubscriptIcon size={15} />, () => editor.chain().focus().toggleMark('subscript').run(), editor.isActive('subscript'))}
        {tool('위 첨자', <SuperscriptIcon size={15} />, () => editor.chain().focus().toggleMark('superscript').run(), editor.isActive('superscript'))}
        {tool('서식 지우기', <RemoveFormatting size={15} />, () => editor.chain().focus().unsetAllMarks().clearNodes().run())}
        <select
          aria-label="노트 태그"
          title="선택한 텍스트에 노트 태그 적용 또는 커서 위치에 태그 삽입"
          defaultValue=""
          onMouseDown={event => event.stopPropagation()}
          onChange={event => {
            const tag = event.target.value;
            if (tag) {
              const labels: Record<string, string> = {
                todo: '☐ 할 일', important: '★ 중요', question: '? 질문', idea: '💡 아이디어',
              };
              const label = labels[tag] || '★ 중요';
              const { empty } = editor.state.selection;
              if (empty) {
                editor.chain().focus().insertContent(`<span data-won-note-tag="${tag}" class="won-note-inline-tag px-1.5 py-0.5 rounded text-xs font-semibold">${label}</span> `).run();
              } else {
                editor.chain().focus().setMark('oneNoteTag', { tag }).run();
              }
            }
            event.target.value = '';
          }}
          className="h-7 rounded-lg border border-stone-200 bg-white px-2 text-[11px] font-medium text-stone-700 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200 cursor-pointer"
        >
          <option value="">태그</option>
          <option value="todo">☐ 할 일</option>
          <option value="important">★ 중요</option>
          <option value="question">? 질문</option>
          <option value="idea">💡 아이디어</option>
        </select>
        {tool('실행 취소', <Undo2 size={15}/>, () => editor.chain().focus().undo().run())}
        {tool('다시 실행', <Redo2 size={15}/>, () => editor.chain().focus().redo().run())}

        {/* Headings */}
        {tool('제목 1', <Heading1 size={15} />, () => editor.chain().focus().toggleHeading({ level: 1 }).run(), editor.isActive('heading', { level: 1 }))}
        {tool('제목 2', <Heading2 size={15} />, () => editor.chain().focus().toggleHeading({ level: 2 }).run(), editor.isActive('heading', { level: 2 }))}
        {tool('제목 3', <Heading3 size={15} />, () => editor.chain().focus().toggleHeading({ level: 3 }).run(), editor.isActive('heading', { level: 3 }))}

        <span className="mx-1 h-5 w-px bg-stone-200 dark:bg-stone-700" />

        {/* Lists */}
        {tool('글머리 기호', <List size={15} />, () => editor.chain().focus().toggleBulletList().run(), editor.isActive('bulletList'))}
        {tool('번호 목록', <ListOrdered size={15} />, () => editor.chain().focus().toggleOrderedList().run(), editor.isActive('orderedList'))}
        {tool('체크리스트', <ListChecks size={15} />, () => editor.chain().focus().toggleTaskList().run(), editor.isActive('taskList'))}
        <ListToolbarControls editor={editor} onIndent={indentList} onOutdent={outdentList} />
        <TableBorderToolbarControl editor={editor} />
        {tool('인용', <Quote size={15} />, () => editor.chain().focus().toggleBlockquote().run(), editor.isActive('blockquote'))}

        <span className="mx-1 h-5 w-px bg-stone-200 dark:bg-stone-700" />

        {/* Alignment */}
        {tool('왼쪽 정렬', <AlignLeft size={15} />, () => editor.chain().focus().setTextAlign('left').run(), editor.isActive({ textAlign: 'left' }))}
        {tool('가운데 정렬', <AlignCenter size={15} />, () => editor.chain().focus().setTextAlign('center').run(), editor.isActive({ textAlign: 'center' }))}
        {tool('오른쪽 정렬', <AlignRight size={15} />, () => editor.chain().focus().setTextAlign('right').run(), editor.isActive({ textAlign: 'right' }))}

        <span className="mx-1 h-5 w-px bg-stone-200 dark:bg-stone-700" />

        {/* Colors & Highlights */}
        <div className="flex items-center gap-1">
          <div className="relative">
            <button type="button" title="글자 색상" aria-label="글자 색상" onMouseDown={event => event.preventDefault()} onClick={event => openColorPalette(event, 'text')} className="flex items-center gap-1 rounded-lg p-1 text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800"><Palette size={14}/><span className="h-2 w-4 rounded-sm" style={{ backgroundColor: customTextColor }}/></button>
            {showTextColorPalette && <div style={{ left: palettePosition.left, top: palettePosition.top }} className="fixed z-[999999] w-48 rounded-xl border border-stone-200 bg-white p-2 shadow-2xl dark:border-stone-700 dark:bg-stone-900"><div className="mb-2 grid grid-cols-6 gap-1">{['#000000','#444444','#777777','#ffffff','#c62828','#ef5350','#e65100','#ff9800','#f9a825','#fdd835','#2e7d32','#66bb6a','#00838f','#26a69a','#1565c0','#42a5f5','#4527a0','#7e57c2'].map(color => <button key={color} type="button" aria-label={`글자색 ${color}`} title={color} onMouseDown={event => event.preventDefault()} onClick={() => { setCustomTextColor(color); editor.chain().focus().setMark('textForegroundColor', { color }).run(); setShowTextColorPalette(false); }} className="h-6 w-6 rounded border border-stone-300 dark:border-stone-600" style={{ backgroundColor: color }}/>)}</div><label className="flex cursor-pointer items-center justify-between rounded-lg border border-stone-200 px-2 py-1.5 text-[11px] text-stone-700 dark:border-stone-700 dark:text-stone-200">사용자 지정 색상<input type="color" aria-label="사용자 지정 글자색" value={customTextColor} onChange={event => { const color = event.target.value; setCustomTextColor(color); editor.chain().focus().setMark('textForegroundColor', { color }).run(); }} className="h-6 w-8 cursor-pointer border-0 bg-transparent"/></label></div>}
          </div>
          <div className="relative">
            <button type="button" title="글자 배경색" aria-label="글자 배경색" onMouseDown={event => event.preventDefault()} onClick={event => openColorPalette(event, 'background')} className="flex items-center gap-1 rounded-lg p-1 text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800"><Highlighter size={14}/><span className="h-2 w-4 rounded-sm" style={{ backgroundColor: customHighlightColor }}/></button>
            {showHighlightPalette && <div style={{ left: palettePosition.left, top: palettePosition.top }} className="fixed z-[999999] w-48 rounded-xl border border-stone-200 bg-white p-2 shadow-2xl dark:border-stone-700 dark:bg-stone-900"><div className="mb-2 grid grid-cols-6 gap-1">{highlightColors.map(color => <button key={color} type="button" aria-label={`배경색 ${color}`} title={color} onMouseDown={event => event.preventDefault()} onClick={() => { setCustomHighlightColor(color); editor.chain().focus().setMark('textBackgroundColor', { color }).run(); setShowHighlightPalette(false); }} className="h-6 w-6 rounded border border-stone-300 dark:border-stone-600" style={{ backgroundColor: color }}/>)}</div><label className="flex cursor-pointer items-center justify-between rounded-lg border border-stone-200 px-2 py-1.5 text-[11px] text-stone-700 dark:border-stone-700 dark:text-stone-200">사용자 지정 색상<input type="color" aria-label="사용자 지정 글자 배경색" value={customHighlightColor} onChange={event => { const color = event.target.value; setCustomHighlightColor(color); editor.chain().focus().setMark('textBackgroundColor', { color }).run(); }} className="h-6 w-8 cursor-pointer border-0 bg-transparent"/></label></div>}
          </div>
          {tool('형광펜', <Highlighter size={15} />, () => editor.chain().focus().toggleHighlight().run(), editor.isActive('highlight'))}
        </div>
        </>}

        {activeRibbonTab === 'insert' && <>
        <span className="mx-1 h-5 w-px bg-stone-200 dark:bg-stone-700" />
        <InsertShapeControls editor={editor} />
        <ShapeSizeControls editor={editor} />

        {/* Special Inserts: Link, Image, Table, Code Block, HR */}
        {tool('링크 삽입', <LinkIcon size={15} />, () => {
          const previousUrl = editor.getAttributes('link').href;
          setLinkInputUrl(previousUrl || '');
          setShowLinkInput(!showLinkInput);
        }, editor.isActive('link'))}
        {tool('이미지 삽입', <ImagePlus size={15} />, () => imageInputRef.current?.click())}
        {tool('이미지 URL 삽입', <ImagePlus size={15}/>, () => { const url = window.prompt('이미지 URL을 입력하세요.'); if (url?.trim()) editor.chain().focus().setImage({ src: url.trim(), alt: '이미지' }).run(); })}
        {tool('영상 삽입', <Video size={15}/>, () => { const url = window.prompt('영상 URL을 입력하세요. (YouTube 또는 MP4)'); if (url?.trim()) editor.chain().focus().insertContent(`<p><a href="${escapeHtml(url.trim())}">${escapeHtml(url.trim())}</a></p>`).run(); })}
        <input ref={pptxInputRef} type="file" accept=".pptx,.ppt,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.ms-powerpoint" className="hidden" onChange={event => { void insertFiles(Array.from(event.currentTarget.files || [])); event.currentTarget.value = ''; }} />
        <input ref={markdownInputRef} type="file" accept=".md,.markdown,text/markdown" className="hidden" onChange={event => { void insertFiles(Array.from(event.currentTarget.files || [])); event.currentTarget.value = ''; }} />
        <input ref={docxInputRef} type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="hidden" onChange={event => { void insertFiles(Array.from(event.currentTarget.files || [])); event.currentTarget.value = ''; }} />
        <input ref={excelInputRef} type="file" accept=".xlsx,.xls,.csv,.tsv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv,text/tab-separated-values" className="hidden" onChange={event => { void insertFiles(Array.from(event.currentTarget.files || [])); event.currentTarget.value = ''; }} />
        <input ref={pdfInputRef} type="file" accept=".pdf,application/pdf" className="hidden" onChange={event => { void insertFiles(Array.from(event.currentTarget.files || [])); event.currentTarget.value = ''; }} />
        {([
          { label: 'PPT', title: 'PPTX 슬라이드 내용을 노트에 삽입', icon: <Presentation size={15} />, ref: pptxInputRef },
          { label: 'MD', title: '마크다운 파일 내용을 서식으로 삽입', icon: <FileText size={15} />, ref: markdownInputRef },
          { label: 'DOCX', title: 'Word 문서의 본문과 표를 삽입', icon: <FileText size={15} />, ref: docxInputRef },
          { label: 'Excel', title: 'Excel 시트를 편집 가능한 표로 삽입', icon: <FileSpreadsheet size={15} />, ref: excelInputRef },
          { label: 'PDF', title: 'PDF 페이지와 텍스트를 노트에 삽입', icon: <FileDown size={15} />, ref: pdfInputRef },
        ] as const).map(item => <button key={item.label} type="button" title={item.title} aria-label={item.title} onClick={() => item.ref.current?.click()} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-stone-200 px-2.5 text-xs font-medium text-stone-700 transition-colors hover:bg-stone-100 dark:border-stone-700 dark:text-stone-200 dark:hover:bg-stone-800">{item.icon}<span>{item.label}</span></button>)}
        {tool('표 삽입', <Table2 size={15} />, () => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run())}
        {tool('코드 블록', <Code size={15} />, () => editor.chain().focus().toggleCodeBlock().run(), editor.isActive('codeBlock'))}
        <CodeHighlightInserter editor={editor} />
        {tool('구분선', <Minus size={15} />, () => editor.chain().focus().setHorizontalRule().run())}
        </>}

        {activeRibbonTab === 'draw' && <div className="flex items-center gap-1.5 text-xs">
          <span className="mr-1 font-semibold text-stone-500">도구</span>
          {([['pen', <Pencil size={15}/>, '펜'], ['highlighter', <Highlighter size={15}/>, '형광펜'], ['eraser', <Trash2 size={15}/>, '지우개'], ['select', <Check size={15}/>, '선택·이동']] as const).map(([mode, icon, label]) => <button key={mode} type="button" title={label} onMouseDown={event => event.preventDefault()} onClick={() => { if (mode !== 'select') ensureDrawingLayer(); setDrawingTool(mode); }} className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 ${drawingTool === mode ? 'border-indigo-300 bg-indigo-100 font-semibold text-indigo-800 dark:border-indigo-800 dark:bg-indigo-950/70 dark:text-indigo-200' : 'border-stone-200 text-stone-700 hover:bg-stone-100 dark:border-stone-700 dark:text-stone-200 dark:hover:bg-stone-800'}`}>{icon}<span>{label}</span></button>)}
          <span className="mx-1 h-5 w-px bg-stone-200 dark:bg-stone-700"/>
          <DrawingStylePicker color={drawingColor} width={drawingWidth} onColorChange={setDrawingColor} onWidthChange={setDrawingWidth}/>
          <span className="mx-1 h-5 w-px bg-stone-200 dark:bg-stone-700"/>
          <button type="button" title="실행 취소" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} className="rounded-lg border border-stone-200 p-2 hover:bg-stone-100 disabled:opacity-40 dark:border-stone-700 dark:hover:bg-stone-800"><Undo2 size={15}/></button>
          <button type="button" title="다시 실행" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} className="rounded-lg border border-stone-200 p-2 hover:bg-stone-100 disabled:opacity-40 dark:border-stone-700 dark:hover:bg-stone-800"><Redo2 size={15}/></button>
        </div>}
        {activeRibbonTab === 'edit' && <EditorEditTools editor={editor} onNotify={setInsertMessage} />}
        {collaboration && <button type="button" title="댓글 패널" aria-label={`댓글 패널, ${comments.length}개`} onClick={() => setIsCommentPanelOpen(value => !value)} className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1.5 transition-colors ${isCommentPanelOpen ? 'border-indigo-300 bg-indigo-100 text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-300' : 'border-stone-200 text-stone-600 hover:bg-stone-100 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800'}`}><MessageSquare size={14} /><span>댓글</span><span className={`min-w-5 rounded-full px-1.5 text-center text-[10px] font-bold leading-5 ${comments.length ? 'bg-indigo-600 text-white' : 'bg-stone-200 text-stone-600 dark:bg-stone-700 dark:text-stone-300'}`}>{comments.length}</span></button>}
        {collaboration && <span className="ml-auto text-[11px] text-stone-500">{collaborationState || '연결 중'}</span>}

        <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={(event) => { void addImage(event.target.files?.[0]); event.currentTarget.value = ''; }} />
      </div>
      {insertMessage && <div role="status" className="shrink-0 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">{insertMessage}</div>}

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
      <div ref={scrollContainerRef} className="relative flex-1 overflow-auto" onBlur={flushEditorUpdate}>
        <div className="relative mx-auto min-h-full w-full max-w-[1440px] px-5 pb-12 pt-5">
          <div style={{ zoom: `${zoomLevel}%`, ['--won-note-inverse-zoom' as any]: 100 / zoomLevel }} className="transition-[zoom] duration-150">
            <EditorContent editor={editor} />
            <DrawingOverlay editor={editor} tool={drawingTool} color={drawingColor} width={drawingWidth} onFinish={() => setDrawingTool('select')} />
          </div>
        </div>
      </div>
      {editorContextMenu && (
        <div
          id="won-note-document-context-menu"
          className="fixed z-[12000] min-w-64 rounded-2xl border border-stone-200 bg-white/95 p-2 text-xs shadow-2xl backdrop-blur-md dark:border-stone-700 dark:bg-stone-900/95 text-stone-700 dark:text-stone-200 animate-in fade-in zoom-in-95 duration-100"
          style={{
            left: Math.max(8, Math.min(editorContextMenu.x, window.innerWidth - 270)),
            top: Math.max(8, Math.min(editorContextMenu.y, window.innerHeight - 450)),
          }}
          onClickCapture={(event) => {
            const target = event.target as HTMLElement;
            if (!target.closest('button, input, select, [role="menuitem"]')) setEditorContextMenu(null);
          }}
        >
          <div className="flex flex-col gap-1.5 p-0.5">
            {/* 1. Excel-Style Floating Mini Formatting Toolbar at the top */}
            <div className="flex items-center gap-1 p-1.5 bg-stone-100 dark:bg-stone-800/80 rounded-xl border border-stone-200 dark:border-stone-700 text-stone-800 dark:text-stone-100 select-none">
              <select
                value={editor.getAttributes('textStyle').fontFamily || 'default'}
                onChange={(e) => {
                  const family = e.target.value;
                  editor.chain().focus();
                  if (family === 'default') editor.chain().unsetFontFamily().run();
                  else editor.chain().setFontFamily(family).run();
                }}
                className="h-6 max-w-[76px] text-[10px] rounded border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-900 px-1 font-sans cursor-pointer"
              >
                {NOTE_FONT_FAMILIES.map(font => <option key={font.value} value={font.value}>{font.label}</option>)}
              </select>

              <FontSizePixelControl editor={editor} onApply={size => { editor.chain().focus(); editor.chain().setMark('textStyle', { fontSize: size }).run(); }} />

              <div className="h-4 w-px bg-stone-300 dark:bg-stone-600 my-auto" />

              <button
                type="button"
                onClick={() => editor.chain().focus().toggleBold().run()}
                className={`p-1 rounded hover:bg-stone-200 dark:hover:bg-stone-700 cursor-pointer ${editor.isActive('bold') ? 'bg-amber-500 text-stone-950 font-bold' : ''}`}
                title="굵게"
              >
                <Bold size={13} />
              </button>
              <button
                type="button"
                onClick={() => editor.chain().focus().toggleItalic().run()}
                className={`p-1 rounded hover:bg-stone-200 dark:hover:bg-stone-700 cursor-pointer ${editor.isActive('italic') ? 'bg-amber-500 text-stone-950 font-bold' : ''}`}
                title="기울임"
              >
                <Italic size={13} />
              </button>

              <button
                type="button"
                onClick={() => editor.chain().focus().setTextAlign('center').run()}
                className={`p-1 rounded hover:bg-stone-200 dark:hover:bg-stone-700 cursor-pointer ${editor.isActive({ textAlign: 'center' }) ? 'bg-amber-500 text-stone-950 font-bold' : ''}`}
                title="가운데 정렬"
              >
                <AlignCenter size={13} />
              </button>

              <button
                type="button"
                onClick={(e) => openColorPalette(e, 'text')}
                className="p-1 rounded hover:bg-stone-200 dark:hover:bg-stone-700 flex items-center gap-0.5 cursor-pointer"
                title="글자 색상"
              >
                <Palette size={13} />
              </button>

              <button
                type="button"
                onClick={(e) => openColorPalette(e, 'background')}
                className="p-1 rounded hover:bg-stone-200 dark:hover:bg-stone-700 flex items-center gap-0.5 cursor-pointer"
                title="셀 배경색"
              >
                <Highlighter size={13} />
              </button>
            </div>

            {/* 2. Clipboard Operations (잘라내기, 복사하기, 붙여넣기) - Always shown */}
            <div className="py-0.5 space-y-0.5">
              <button
                type="button"
                onClick={() => { handleCut(editor); setEditorContextMenu(null); }}
                className="w-full px-3 py-1.5 text-left hover:bg-stone-100 dark:hover:bg-stone-800 rounded-lg flex items-center justify-between cursor-pointer text-xs font-medium"
              >
                <span className="flex items-center gap-2">
                  <Scissors size={14} className="text-stone-500" />
                  <span>잘라내기</span>
                </span>
                <span className="text-[10px] text-stone-400 font-mono">Ctrl+X</span>
              </button>

              <button
                type="button"
                onClick={() => { handleCopy(editor); setEditorContextMenu(null); }}
                className="w-full px-3 py-1.5 text-left hover:bg-stone-100 dark:hover:bg-stone-800 rounded-lg flex items-center justify-between cursor-pointer text-xs font-medium"
              >
                <span className="flex items-center gap-2">
                  <Copy size={14} className="text-stone-500" />
                  <span>복사하기</span>
                </span>
                <span className="text-[10px] text-stone-400 font-mono">Ctrl+C</span>
              </button>

              <button
                type="button"
                onClick={() => { void handlePaste(editor); setEditorContextMenu(null); }}
                className="w-full px-3 py-1.5 text-left hover:bg-stone-100 dark:hover:bg-stone-800 rounded-lg flex items-center justify-between cursor-pointer text-xs font-medium"
              >
                <span className="flex items-center gap-2">
                  <ClipboardPaste size={14} className="text-stone-500" />
                  <span>붙여넣기</span>
                </span>
                <span className="text-[10px] text-stone-400 font-mono">Ctrl+V</span>
              </button>
            </div>

            <div className="my-1 border-t border-stone-200 dark:border-stone-800" />

            {/* 3. Conditional: Table tools vs Paragraph styles */}
            {editor?.isActive('table') ? (
              <div className="py-0.5 space-y-0.5">
                <button
                  type="button"
                  onClick={() => { handleEqualizeRowHeights(editor); setEditorContextMenu(null); }}
                  className="w-full px-3 py-1.5 text-left hover:bg-stone-100 dark:hover:bg-stone-800 rounded-lg flex items-center gap-2.5 cursor-pointer text-xs font-medium"
                >
                  <Rows size={14} className="text-amber-500" />
                  <span>행 높이를 같게</span>
                </button>

                <button
                  type="button"
                  onClick={() => { handleEqualizeColumnWidths(editor); setEditorContextMenu(null); }}
                  className="w-full px-3 py-1.5 text-left hover:bg-stone-100 dark:hover:bg-stone-800 rounded-lg flex items-center gap-2.5 cursor-pointer text-xs font-medium"
                >
                  <Columns size={14} className="text-amber-500" />
                  <span>열 너비를 같게</span>
                </button>

                <button
                  type="button"
                  onClick={() => { editor?.chain().focus().mergeCells().run(); setEditorContextMenu(null); }}
                  className="w-full px-3 py-1.5 text-left hover:bg-stone-100 dark:hover:bg-stone-800 rounded-lg flex items-center gap-2.5 cursor-pointer text-xs font-medium"
                >
                  <Combine size={14} className="text-indigo-500" />
                  <span>셀 합치기</span>
                </button>

                <button
                  type="button"
                  onClick={() => { editor?.chain().focus().splitCell().run(); setEditorContextMenu(null); }}
                  className="w-full px-3 py-1.5 text-left hover:bg-stone-100 dark:hover:bg-stone-800 rounded-lg flex items-center gap-2.5 cursor-pointer text-xs font-medium"
                >
                  <Split size={14} className="text-sky-500" />
                  <span>셀 나누기</span>
                </button>
              <div className="my-1 border-t border-stone-200 dark:border-stone-800" />
              <div className="grid grid-cols-2 gap-1 p-0.5 text-[11px]">
                <button type="button" onClick={() => { editor?.chain().focus().addRowBefore().run(); setEditorContextMenu(null); }} className="px-2 py-1 bg-stone-50 dark:bg-stone-800 rounded-md text-left hover:bg-amber-500/10 cursor-pointer">위 행 추가</button>
                <button type="button" onClick={() => { editor?.chain().focus().addRowAfter().run(); setEditorContextMenu(null); }} className="px-2 py-1 bg-stone-50 dark:bg-stone-800 rounded-md text-left hover:bg-amber-500/10 cursor-pointer">아래 행 추가</button>
                <button type="button" onClick={() => { editor?.chain().focus().addColumnBefore().run(); setEditorContextMenu(null); }} className="px-2 py-1 bg-stone-50 dark:bg-stone-800 rounded-md text-left hover:bg-amber-500/10 cursor-pointer">좌측 열 추가</button>
                <button type="button" onClick={() => { editor?.chain().focus().addColumnAfter().run(); setEditorContextMenu(null); }} className="px-2 py-1 bg-stone-50 dark:bg-stone-800 rounded-md text-left hover:bg-amber-500/10 cursor-pointer">우측 열 추가</button>
              </div>
              <div className="flex gap-1 p-0.5 text-[11px]">
                <button type="button" onClick={() => { editor?.chain().focus().deleteRow().run(); setEditorContextMenu(null); }} className="flex-1 px-2 py-1 bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 rounded-md text-center cursor-pointer">행 삭제</button>
                <button type="button" onClick={() => { editor?.chain().focus().deleteColumn().run(); setEditorContextMenu(null); }} className="flex-1 px-2 py-1 bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 rounded-md text-center cursor-pointer">열 삭제</button>
                <button type="button" onClick={() => { editor?.chain().focus().deleteTable().run(); setEditorContextMenu(null); }} className="flex-1 px-2 py-1 bg-rose-600 text-white rounded-md text-center font-bold cursor-pointer">표 삭제</button>
              </div>
            </div>
          ) : (
            <>
              <div className="px-3 py-1 font-bold text-[10px] text-stone-400 uppercase tracking-wider">텍스트 서식</div>
              <div className="grid grid-cols-5 gap-1 p-1">
                <button type="button" onClick={() => { editor?.chain().focus().toggleBold().run(); setEditorContextMenu(null); }} title="굵게"><Bold size={14} /></button>
                <button type="button" onClick={() => { editor?.chain().focus().toggleItalic().run(); setEditorContextMenu(null); }} title="기울임"><Italic size={14} /></button>
                <button type="button" onClick={() => { editor?.chain().focus().toggleUnderline().run(); setEditorContextMenu(null); }} title="밑줄"><UnderlineIcon size={14} /></button>
                <button type="button" onClick={() => { editor?.chain().focus().toggleStrike().run(); setEditorContextMenu(null); }} title="취소선"><Strikethrough size={14} /></button>
                <button type="button" onClick={() => { editor?.chain().focus().toggleHighlight().run(); setEditorContextMenu(null); }} title="형광펜"><Highlighter size={14} /></button>
              </div>
              <div className="my-1 border-t border-stone-100 dark:border-stone-800" />
              <div className="px-3 py-1 font-bold text-[10px] text-stone-400 uppercase tracking-wider">단락 스타일</div>
              <button type="button" onClick={() => { editor?.chain().focus().setParagraph().run(); setEditorContextMenu(null); }}>본문</button>
              <button type="button" onClick={() => { editor?.chain().focus().toggleHeading({ level: 1 }).run(); setEditorContextMenu(null); }}>제목 1 (H1)</button>
              <button type="button" onClick={() => { editor?.chain().focus().toggleHeading({ level: 2 }).run(); setEditorContextMenu(null); }}>제목 2 (H2)</button>
              <button type="button" onClick={() => { editor?.chain().focus().toggleHeading({ level: 3 }).run(); setEditorContextMenu(null); }}>제목 3 (H3)</button>
              <button type="button" onClick={() => { editor?.chain().focus().toggleBlockquote().run(); setEditorContextMenu(null); }}>인용구 (Quote)</button>
            </>
          )}
          <div className="my-1 border-t border-stone-100 dark:border-stone-800" />
          <button type="button" onClick={() => { setCommentDraft(''); setCommentComposer(editorContextMenu); setIsCommentPanelOpen(true); setEditorContextMenu(null); }} className="flex w-full items-center gap-2 rounded-lg bg-indigo-50 px-3 py-2 text-left font-semibold text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:text-indigo-300 dark:hover:bg-indigo-950/70 cursor-pointer"><MessageSquare size={14} />여기에 댓글 추가</button>
          <button type="button" onClick={() => { flushEditorUpdate(); void history.recordNow(editor?.getHTML() || document.content); setEditorContextMenu(null); history.setIsOpen(true); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer"><Clock3 size={14} className="text-stone-500" />문서 이력 보기</button>
          </div>
        </div>
      )}
      {collaboration && <aside aria-label="문서 댓글" className={`absolute inset-y-0 right-0 z-[100] flex w-[min(22rem,92vw)] flex-col border-l border-stone-200 bg-white shadow-2xl transition-transform duration-200 dark:border-stone-700 dark:bg-stone-900 ${isCommentPanelOpen ? 'translate-x-0' : 'translate-x-full pointer-events-none'}`}>
        {isCommentPanelOpen && (
          <>
            <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3 dark:border-stone-700">
              <div><h2 className="text-sm font-bold text-stone-800 dark:text-stone-100">댓글</h2><p className="text-[11px] text-stone-500">이 문서 · {comments.length}개</p></div>
              <button type="button" aria-label="댓글 패널 닫기" onMouseDown={(e) => e.preventDefault()} onClick={(e) => { e.stopPropagation(); setIsCommentPanelOpen(false); }} className="rounded-md p-1.5 text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer"><X size={16} /></button>
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
          </>
        )}
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
        <div className="pointer-events-none fixed right-3 top-1/2 z-[11010] -translate-y-1/2 rounded-full bg-stone-900/85 px-3 py-1.5 text-xs font-semibold tabular-nums text-white shadow-lg ring-1 ring-white/30 backdrop-blur-sm">
          {pdfPageIndicator.current} / {pdfPageIndicator.total}
        </div>,
        globalThis.document.body,
      )}
    </div>
  );
};
