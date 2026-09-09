import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { ReactNodeViewRenderer, useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { createLowlight, all } from 'lowlight';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Underline from '@tiptap/extension-underline';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { TextAlign } from '@tiptap/extension-text-align';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import { Highlight } from '@tiptap/extension-highlight';
import { StickerExtension } from './StickerExtension';
import { CodeBlockComponent } from './CodeBlockComponent';
import { ImageComponent } from './ImageComponent';
import { TableGridPicker } from './TableGridPicker';
import { TableRow as TableRowType, TableColumn, AutoSaveStatus } from '../../types';
import { useAutoSave } from '../../hooks/useAutoSave';
import { cleanHtmlToPlainText, cleanTextValue } from '../../utils/textSanitizer';
import { detectLanguage, escapeHtml, formatJavaOrGeneralCode } from '../../utils/codeHighlighter';
import { delimitedTextToHtmlTable } from '../../utils/csvParser';
import { compressAndResizeImage } from '../../utils/imageOptimizer';
import { SelectOrCustomInput } from '../common/SelectOrCustomInput';
import { getEffectiveColumnOptions } from '../../utils/columnOptionsUtils';
import { markdownToHtml, htmlToMarkdown, isLikelyMarkdown } from '../../utils/markdownHelper';
import {
  X,
  Bold,
  Italic,
  Strikethrough,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Code,
  Image as ImageIcon,
  StickyNote,
  CheckCircle,
  Loader2,
  Maximize2,
  Minimize2,
  Sparkles,
  Calendar,
  Tag,
  Hash,
  Type,
  FileCode,
  Paperclip,
  Upload,
  Table as TableIcon,
  ChevronDown,
  ChevronRight,
  Plus,
  Trash2,
  Columns,
  Rows,
  FileText,
  Edit3,
  Database,
  ClipboardPaste,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Highlighter,
  Palette,
  Combine,
  Split,
  PaintBucket,
  Underline as UnderlineIcon,
  CheckSquare,
  Download,
  FileDown,
  Eye,
  Grid,
  Square,
  Undo2,
  Redo2,
  RemoveFormatting,
  Minus,
  Link2,
} from 'lucide-react';

// Initialize Lowlight with all supported languages (Java, SQL, JS, TS, Python, etc.)
const lowlight = createLowlight(all);

// Custom TableCell supporting background colors
const CustomTableCell = TableCell.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      backgroundColor: {
        default: null,
        parseHTML: (element) => element.style.backgroundColor || element.getAttribute('data-bg-color') || null,
        renderHTML: (attributes) => {
          if (!attributes.backgroundColor) {
            return {};
          }
          return {
            style: `background-color: ${attributes.backgroundColor};`,
            'data-bg-color': attributes.backgroundColor,
          };
        },
      },
    };
  },
});

// Custom Table supporting borders & styles
const CustomTable = Table.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      borderStyle: {
        default: 'all',
        parseHTML: (element) => element.getAttribute('data-border-style') || 'all',
        renderHTML: (attributes) => {
          const style = attributes.borderStyle || 'all';
          return {
            'data-border-style': style,
            class: `wonbee-rich-table wonbee-table-border-${style}`,
          };
        },
      },
      borderColor: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-border-color') || null,
        renderHTML: (attributes) => {
          if (!attributes.borderColor) return {};
          return {
            'data-border-color': attributes.borderColor,
            style: `--table-border-color: ${attributes.borderColor}; border-color: ${attributes.borderColor};`,
          };
        },
      },
    };
  },
});

// Custom Image supporting inline layout, side-by-side positioning, and resizing
const CustomImage = Image.extend({
  inline: true,
  group: 'inline',
  draggable: true,
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: 'auto',
        parseHTML: (element) => element.getAttribute('data-width') || element.getAttribute('width') || element.style.width || 'auto',
        renderHTML: (attributes) => {
          if (!attributes.width || attributes.width === 'auto') return {};
          return {
            width: attributes.width,
            'data-width': attributes.width,
            style: `width: ${attributes.width}; max-width: 100%;`,
          };
        },
      },
      layout: {
        default: 'inline',
        parseHTML: (element) => element.getAttribute('data-layout') || 'inline',
        renderHTML: (attributes) => {
          const layout = attributes.layout || 'inline';
          let displayStyle = 'display: inline-block; vertical-align: middle; margin: 0.25rem 0.4rem;';
          if (layout === 'center') displayStyle = 'display: block; margin: 0.75rem auto;';
          if (layout === 'left') displayStyle = 'float: left; margin: 0.25rem 1rem 0.5rem 0;';
          if (layout === 'right') displayStyle = 'float: right; margin: 0.25rem 0 0.5rem 1rem;';
          return {
            'data-layout': layout,
            style: displayStyle,
          };
        },
      },
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(ImageComponent);
  },
});

interface RichEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  row: TableRowType | null;
  columns: TableColumn[];
  allRows?: TableRowType[];
  tableName: string;
  initialTargetId?: string | null;
  onSaveRow: (updatedRow: TableRowType) => Promise<void> | void;
}

export const RichEditorModal: React.FC<RichEditorModalProps> = ({
  isOpen,
  onClose,
  row,
  columns,
  allRows = [],
  tableName,
  initialTargetId,
  onSaveRow,
}) => {
  const sanitizeRowData = useCallback((data: Record<string, any> = {}) => {
    const sanitized: Record<string, any> = { ...data };
    columns.forEach((col) => {
      if (sanitized[col.id] !== undefined && sanitized[col.id] !== null) {
        const val = sanitized[col.id];
        if (typeof val === 'string' && val.includes('<') && val.includes('>')) {
          const isComplex =
            val.includes('<table') ||
            val.includes('<img') ||
            val.includes('sticker') ||
            val.includes('<pre') ||
            val.includes('<code') ||
            val.includes('<blockquote') ||
            val.includes('<h1') ||
            val.includes('<h2') ||
            val.includes('<h3') ||
            val.includes('<ul') ||
            val.includes('<ol');
          if (!isComplex && col.type !== 'code') {
            sanitized[col.id] = cleanTextValue(val);
          }
        }
      }
    });
    return sanitized;
  }, [columns]);

  const [currentRowData, setCurrentRowData] = useState<Record<string, any>>(() => {
    return row?.data ? sanitizeRowData(row.data) : {};
  });
  const [richContent, setRichContent] = useState<string>(() => row?.richContent || '');
  const [isFullscreen, setIsFullscreen] = useState<boolean>(() => {
    return localStorage.getItem('wonbee_rich_editor_fullscreen') === 'true';
  });

  const toggleFullscreen = () => {
    setIsFullscreen((prev) => {
      const next = !prev;
      localStorage.setItem('wonbee_rich_editor_fullscreen', String(next));
      return next;
    });
  };
  const [activeRibbonTab, setActiveRibbonTab] = useState<'home' | 'insert' | 'format'>('home');
  const [isTableMenuOpen, setIsTableMenuOpen] = useState(false);
  const [isBorderMenuOpen, setIsBorderMenuOpen] = useState(false);
  const [isCodeMdMenuOpen, setIsCodeMdMenuOpen] = useState(false);
  const [isTextColorMenuOpen, setIsTextColorMenuOpen] = useState(false);
  const [isHighlightMenuOpen, setIsHighlightMenuOpen] = useState(false);
  const [isCellBgMenuOpen, setIsCellBgMenuOpen] = useState(false);
  const [isPropsBarOpen, setIsPropsBarOpen] = useState(false);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const mdFileInputRef = useRef<HTMLInputElement | null>(null);
  const tableMenuRef = useRef<HTMLDivElement | null>(null);
  const borderMenuRef = useRef<HTMLDivElement | null>(null);
  const codeMdMenuRef = useRef<HTMLDivElement | null>(null);
  const textColorMenuRef = useRef<HTMLDivElement | null>(null);
  const highlightMenuRef = useRef<HTMLDivElement | null>(null);
  const cellBgMenuRef = useRef<HTMLDivElement | null>(null);

  // Targets for rich editing: all columns in the table + general extra rich document note
  const richTargets = React.useMemo(() => {
    const list: { id: string; name: string; isColumn: boolean; type?: string }[] = [];
    
    // Prioritize richText and text columns first, then others
    const textCols: TableColumn[] = [];
    const otherCols: TableColumn[] = [];

    columns.forEach((col) => {
      if (col.type === 'richText' || col.type === 'text' || col.name.includes('내용') || col.name.includes('방법') || col.name.includes('메모') || col.name.includes('설명')) {
        textCols.push(col);
      } else {
        otherCols.push(col);
      }
    });

    [...textCols, ...otherCols].forEach((col) => {
      list.push({
        id: col.id,
        name: col.name,
        isColumn: true,
        type: col.type,
      });
    });

    // Only add extra rich document note if the row actually has legacy non-empty richContent (that is not the welcome placeholder)
    if (row?.richContent && row.richContent.trim() !== '' && !row.richContent.includes('환영합니다') && !row.richContent.includes('새 테이블이 성공적으로 생성되었습니다')) {
      list.push({
        id: '__richContent__',
        name: '추가 상세 서식 문서 / 메모',
        isColumn: false,
      });
    }

    return list;
  }, [columns, row?.richContent]);

  // Resolve target ID helper prioritizing initialTargetId if provided
  const resolveTargetId = useCallback((targetId?: string | null) => {
    if (targetId) {
      if (targetId === '__richContent__' && row?.richContent && !row.richContent.includes('환영합니다')) return '__richContent__';
      if (columns.some((c) => c.id === targetId)) return targetId;
    }
    const firstRich = columns.find((c) => c.type === 'richText');
    if (firstRich) return firstRich.id;
    return richTargets[0]?.id || columns[0]?.id || '';
  }, [columns, row?.richContent, richTargets]);

  const [selectedTargetId, setSelectedTargetId] = useState<string>(() => resolveTargetId(initialTargetId));
  const selectedTargetIdRef = useRef<string>(selectedTargetId);
  selectedTargetIdRef.current = selectedTargetId;

  // Helper to format content for TipTap editor, ensuring plain Java/source code is safely wrapped in code block
  const formatContentForEditor = useCallback((rawContent: string): string => {
    if (!rawContent || typeof rawContent !== 'string') return '';
    const trimmed = rawContent.trim();
    if (!trimmed) return '';

    // If it already has HTML code block, leave it to TipTap HTML parser
    if (trimmed.includes('<pre') || trimmed.includes('<code')) {
      return rawContent;
    }

    // Check for real rich HTML block tags (excluding code generics like <String>)
    const hasRealHtmlTags = /<\s*(?:table|thead|tbody|tr|td|th|img|sticker-node|h[1-6]|ul|ol|li|blockquote)\b/i.test(trimmed);
    if (hasRealHtmlTags) {
      return rawContent;
    }

    // Check if it's Markdown format (e.g. ## headers, | table |, - list, ```` code blocks, etc.)
    if (isLikelyMarkdown(rawContent)) {
      return markdownToHtml(rawContent);
    }

    // Check if it's source code (Java, SQL, JS, etc.) or has Java patterns
    const langDetect = detectLanguage(rawContent);
    const hasJavaPattern = /\b(?:package\s+[a-zA-Z0-9_.]+|import\s+java|public\s+class|class\s+\w+|public\s+static\s+void|System\.out|private\s+|protected\s+|@Override|public\s+static\s+final)\b/.test(rawContent);

    if (langDetect.isCode || hasJavaPattern) {
      const formatted = formatJavaOrGeneralCode(rawContent);
      const lang = langDetect.isCode ? langDetect.language : 'java';
      return `<pre><code class="language-${lang}">${escapeHtml(formatted)}</code></pre>`;
    }

    // If it's multi-line plain text: wrap in paragraphs so TipTap never collapses newlines into spaces
    if (rawContent.includes('\n')) {
      return rawContent
        .split('\n')
        .map((line) => `<p>${escapeHtml(line) || '<br>'}</p>`)
        .join('');
    }

    return escapeHtml(rawContent);
  }, []);

  // Calculate initial content immediately for editor creation
  const initialContent = useMemo(() => {
    if (!row) return '';
    const targetId = resolveTargetId(initialTargetId);
    const raw = targetId === '__richContent__'
      ? (row.richContent || '')
      : String(row.data?.[targetId] ?? '');
    return formatContentForEditor(raw);
  }, [row, initialTargetId, resolveTargetId, formatContentForEditor]);

  // Close menus when clicking outside
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (tableMenuRef.current && !tableMenuRef.current.contains(target)) {
        setIsTableMenuOpen(false);
      }
      if (borderMenuRef.current && !borderMenuRef.current.contains(target)) {
        setIsBorderMenuOpen(false);
      }
      if (codeMdMenuRef.current && !codeMdMenuRef.current.contains(target)) {
        setIsCodeMdMenuOpen(false);
      }
      if (textColorMenuRef.current && !textColorMenuRef.current.contains(target)) {
        setIsTextColorMenuOpen(false);
      }
      if (highlightMenuRef.current && !highlightMenuRef.current.contains(target)) {
        setIsHighlightMenuOpen(false);
      }
      if (cellBgMenuRef.current && !cellBgMenuRef.current.contains(target)) {
        setIsCellBgMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', handleOutsideClick);
    return () => window.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // Sync state when modal opens or row/initialTargetId changes
  useEffect(() => {
    if (row && isOpen) {
      const sanitized = sanitizeRowData(row.data);
      setCurrentRowData(sanitized);
      setRichContent(row.richContent || '');
      
      const targetId = resolveTargetId(initialTargetId);
      setSelectedTargetId(targetId);
      selectedTargetIdRef.current = targetId;
    }
  }, [row?.id, isOpen, initialTargetId, columns, sanitizeRowData, resolveTargetId]);

  // Combined state object for auto-save hook
  const combinedRowState: TableRowType | null = row
    ? {
        ...row,
        data: currentRowData,
        richContent: richContent,
        updatedAt: Date.now(),
      }
    : null;

  // Auto-save hook with 400ms debounce
  const { status, lastSavedAt, forceSave } = useAutoSave<TableRowType | null>({
    data: combinedRowState,
    onSave: async (dataToSave) => {
      if (dataToSave) {
        await onSaveRow(dataToSave);
      }
    },
    debounceMs: 400,
    enabled: isOpen && !!row,
  });

  // TipTap Editor instance
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        codeBlock: false,
      }),
      CodeBlockLowlight.extend({
        addNodeView() {
          return ReactNodeViewRenderer(CodeBlockComponent);
        },
      }).configure({
        lowlight,
        defaultLanguage: 'auto',
      }),
      Underline,
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
      CustomTable.configure({
        resizable: true,
        HTMLAttributes: {
          class: 'wonbee-rich-table wonbee-table-border-all',
        },
      }),
      TableRow,
      TableHeader,
      CustomTableCell,
      TextAlign.configure({
        types: ['heading', 'paragraph', 'tableHeader', 'tableCell'],
      }),
      TextStyle,
      Color,
      Highlight.configure({
        multicolor: true,
      }),
      CustomImage.configure({
        inline: true,
        allowBase64: true,
        HTMLAttributes: {
          class: 'rounded-xl max-h-96 object-contain shadow-md border border-stone-200 dark:border-[#383838]',
        },
      }),
      Placeholder.configure({
        placeholder: '내용을 작성하세요... (/ 키로 블록 삽입 또는 상단 도구 모음 활용, 마크다운/코드 붙여넣기 및 파일 드래그 지원)',
      }),
      StickerExtension,
    ],
    content: initialContent,
    editorProps: {
      attributes: {
        class:
          'prose dark:prose-invert max-w-none focus:outline-none min-h-[350px] text-sm text-stone-800 dark:text-[#f0f0f0] leading-relaxed font-sans',
      },
      handleKeyDown: (view, event) => {
        // Tab key support: insert 4 spaces for code indenting instead of losing focus
        if (event.key === 'Tab') {
          event.preventDefault();
          view.dispatch(view.state.tr.insertText('    '));
          return true;
        }
        return false;
      },
      handlePaste: (view, event) => {
        const clipboardData = event.clipboardData;
        if (!clipboardData) return false;

        // 1. Image paste handler
        const items = clipboardData.items;
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          if (item.type.startsWith('image/')) {
            const file = item.getAsFile();
            if (file) {
              event.preventDefault();
              compressAndResizeImage(file).then(({ dataUrl }) => {
                if (editor) {
                  editor.chain().focus().setImage({
                    src: dataUrl,
                    alt: 'Pasted Image',
                    ...({ width: '48%', layout: 'inline' } as any),
                  }).run();
                  setToastMessage('✓ 이미지가 삽입되었습니다 (크기 조절 및 나란히 배치 지원).');
                  setTimeout(() => setToastMessage(null), 2500);
                }
              });
              return true;
            }
          }
        }

        // 2. HTML Table check (Excel, Google Sheets, or Web table)
        const htmlData = clipboardData.getData('text/html');
        if (htmlData && htmlData.includes('<table')) {
          event.preventDefault();
          // Normalize and apply full crisp borders to pasted tables
          let cleanTableHtml = htmlData
            .replace(/<table([^>]*)>/gi, (match, attrs) => {
              let cleanAttrs = attrs
                .replace(/border=["']?0["']?/gi, '')
                .replace(/style=["'][^"']*border:\s*none[^"']*["']/gi, '');
              return `<table class="wonbee-rich-table wonbee-table-border-all" data-border-style="all"${cleanAttrs}>`;
            })
            .replace(/<td([^>]*)>/gi, (match, attrs) => {
              let cleanAttrs = attrs.replace(/border:\s*none/gi, '');
              return `<td${cleanAttrs}>`;
            })
            .replace(/<th([^>]*)>/gi, (match, attrs) => {
              let cleanAttrs = attrs.replace(/border:\s*none/gi, '');
              return `<th${cleanAttrs}>`;
            });

          if (editor) {
            editor.chain().focus().insertContent(cleanTableHtml).run();
            setToastMessage('✓ 테이블 데이터(테두리 적용) 붙여넣기 완료');
            setTimeout(() => setToastMessage(null), 2500);
            return true;
          }
        }

        // 3. Tab-separated spreadsheet data check (Excel / Sheets text copy)
        const plainText = clipboardData.getData('text/plain');
        if (plainText && plainText.includes('\t') && plainText.includes('\n')) {
          const tableHtml = delimitedTextToHtmlTable(plainText);
          if (tableHtml) {
            event.preventDefault();
            if (editor) {
              editor.chain().focus().insertContent(tableHtml).run();
              setToastMessage('✓ 스프레드시트 데이터가 테두리 표로 변환되어 삽입되었습니다.');
              setTimeout(() => setToastMessage(null), 2500);
              return true;
            }
          }
        }

        if (!plainText) return false;

        // Check if cursor is currently inside an existing codeBlock
        const state = view.state;
        const { $from } = state.selection;
        const isInsideCodeBlock = $from.parent.type.name === 'codeBlock';

        if (isInsideCodeBlock) {
          // If already inside a code block, strictly insert raw plain text preserving all spaces, indents, and newlines
          event.preventDefault();
          view.dispatch(state.tr.replaceSelectionWith(state.schema.text(plainText)));
          return true;
        }

        // 3. Markdown content check: maintain full formatting (headings, tables, task lists, blockquotes, code blocks)
        if (isLikelyMarkdown(plainText)) {
          event.preventDefault();
          const html = markdownToHtml(plainText);
          if (editor) {
            editor.chain().focus().insertContent(html).run();
            return true;
          }
        }

        // 4. Source code check (Java, SQL, JS/TS, Python, etc.)
        // or multi-line text with indentations
        const langDetection = detectLanguage(plainText);
        const hasJavaCodeSignature =
          /\b(package\s+[a-zA-Z0-9_.]+|import\s+java|public\s+class|class\s+\w+|public\s+static\s+void|System\.(out|err)|private\s+|protected\s+|@Override|void\s+\w+\s*\(|int\s+\w+\s*=|public\s+static\s+final)\b/.test(plainText);
        const isMultilineWithIndentation =
          plainText.includes('\n') && (/^\s{2,}\S/m.test(plainText) || /^\t\S/m.test(plainText));

        if (langDetection.isCode || hasJavaCodeSignature || (isMultilineWithIndentation && (plainText.includes('{') || plainText.includes(';') || plainText.includes('(')))) {
          // It's source code! Insert as a dedicated codeBlock with auto/detected language attribute
          event.preventDefault();
          const language = langDetection.isCode
            ? langDetection.language
            : hasJavaCodeSignature
            ? 'java'
            : 'auto';

          const formattedCode = formatJavaOrGeneralCode(plainText);
          const codeBlockType = state.schema.nodes.codeBlock;
          if (codeBlockType) {
            const codeBlockNode = codeBlockType.create(
              { language },
              state.schema.text(formattedCode)
            );
            view.dispatch(state.tr.replaceSelectionWith(codeBlockNode));
            return true;
          }
        }

        return false;
      },
    },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      const currentTarget = selectedTargetIdRef.current;
      if (currentTarget === '__richContent__') {
        setRichContent(html);
      } else {
        const targetCol = columns.find((c) => c.id === currentTarget);
        const isComplexRich =
          html.includes('<table') ||
          html.includes('<img') ||
          html.includes('sticker') ||
          html.includes('<h1') ||
          html.includes('<h2') ||
          html.includes('<h3') ||
          html.includes('<ul') ||
          html.includes('<ol') ||
          html.includes('<blockquote') ||
          html.includes('<pre') ||
          html.includes('<strong>') ||
          html.includes('<em>') ||
          html.includes('<s>');

        if (isComplexRich) {
          // Always preserve rich HTML (especially <pre><code> code blocks, tables, stickers)
          // regardless of column type so code formatting and spaces are never lost!
          setCurrentRowData((prev) => ({
            ...prev,
            [currentTarget]: html,
          }));
        } else if (targetCol && targetCol.type !== 'richText') {
          // Plain column with simple text: strip unnecessary <p> wrapper
          const plain = cleanHtmlToPlainText(html);
          setCurrentRowData((prev) => ({
            ...prev,
            [currentTarget]: plain,
          }));
        } else {
          // Plain text in richText column: store clean plain text without <p> wrappers if single line
          const plain = cleanHtmlToPlainText(html);
          setCurrentRowData((prev) => ({
            ...prev,
            [currentTarget]: plain,
          }));
        }
      }
    },
  });

  // Sync TipTap editor content when modal opens or target/row changes
  useEffect(() => {
    if (editor && row && isOpen) {
      const targetId = resolveTargetId(initialTargetId);
      const rawContent = targetId === '__richContent__'
        ? (row.richContent || '')
        : String(row.data?.[targetId] ?? '');
      const contentToSet = formatContentForEditor(rawContent);

      // Only set if different to prevent cursor jumps
      if (editor.getHTML() !== contentToSet) {
        editor.commands.setContent(contentToSet, { emitUpdate: false });
      }
    }
  }, [row?.id, isOpen, initialTargetId, editor, resolveTargetId, formatContentForEditor]);

  // Switch target field
  const handleSwitchTarget = (targetId: string) => {
    setSelectedTargetId(targetId);
    selectedTargetIdRef.current = targetId;

    if (editor) {
      const rawContent = targetId === '__richContent__'
        ? (richContent || '')
        : String(currentRowData[targetId] ?? '');
      const content = formatContentForEditor(rawContent);
      editor.commands.setContent(content, { emitUpdate: false });
    }
  };

  if (!isOpen || !row) return null;

  const handleCellChange = (columnId: string, val: any) => {
    const targetCol = columns.find((c) => c.id === columnId);
    const cleaned = typeof val === 'string' && targetCol?.type !== 'richText' ? cleanTextValue(val) : val;

    setCurrentRowData((prev) => ({
      ...prev,
      [columnId]: cleaned,
    }));
    // If the changed field is the currently active editing field in TipTap, update editor too
    if (columnId === selectedTargetId && editor) {
      if (editor.getHTML() !== String(cleaned ?? '')) {
        editor.commands.setContent(String(cleaned ?? ''));
      }
    }
  };

  const handleInsertSticker = (color: 'amber' | 'yellow' | 'green' | 'blue' | 'rose' | 'purple' = 'amber') => {
    if (editor) {
      editor.chain().focus().insertSticker({ color }).run();
    }
  };

  const handleInsertSqlBlock = () => {
    if (editor) {
      const sampleSql = `-- SQL Query\nSELECT \n  id, name, created_at \nFROM \n  my_table \nWHERE \n  status = 'ACTIVE'\nORDER BY \n  id DESC;`;
      editor.chain().focus().insertContent({
        type: 'codeBlock',
        attrs: { language: 'sql' },
        content: [{ type: 'text', text: sampleSql }],
      }).run();
    }
  };

  const handleInsertJavaBlock = () => {
    if (editor) {
      const sampleJava = `// Java Source Code\npublic class Solution {\n    public static void main(String[] args) {\n        System.out.println("Hello, World!");\n    }\n}`;
      editor.chain().focus().insertContent({
        type: 'codeBlock',
        attrs: { language: 'java' },
        content: [{ type: 'text', text: sampleJava }],
      }).run();
    }
  };

  const handlePasteCodeFromClipboard = async () => {
    if (!editor) return;
    try {
      const text = await navigator.clipboard.readText();
      if (!text) return;
      const langDetection = detectLanguage(text);
      const isJava = /\b(package\s+[a-zA-Z0-9_.]+|import\s+java|public\s+class|class\s+\w+|public\s+static\s+void|System\.out|public\s+static\s+final)\b/.test(text);
      const language = langDetection.isCode ? langDetection.language : (isJava ? 'java' : 'auto');
      const formattedText = formatJavaOrGeneralCode(text);

      editor.chain().focus().insertContent({
        type: 'codeBlock',
        attrs: { language },
        content: [{ type: 'text', text: formattedText }],
      }).run();
    } catch (err) {
      console.warn('Failed to read clipboard text', err);
    }
  };

  const handleFormatCodeInEditor = () => {
    if (!editor) return;
    const { state } = editor;
    const { $from } = state.selection;
    if ($from.parent.type.name === 'codeBlock') {
      const codeText = $from.parent.textContent;
      const formatted = formatJavaOrGeneralCode(codeText);
      const start = $from.start();
      const end = $from.end();
      editor.chain().focus().command(({ tr }) => {
        tr.replaceWith(start, end, state.schema.text(formatted));
        return true;
      }).run();
    } else {
      const plain = editor.getText();
      if (!plain) return;
      const formatted = formatJavaOrGeneralCode(plain);
      const lang = detectLanguage(formatted).language || 'java';
      editor.commands.setContent(`<pre><code class="language-${lang}">${escapeHtml(formatted)}</code></pre>`);
    }
  };

  const handleMdFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && editor) {
      const reader = new FileReader();
      reader.onload = (uploadEvent) => {
        const text = (uploadEvent.target?.result as string) || '';
        const html = markdownToHtml(text);
        editor.chain().focus().insertContent(html).run();
        setToastMessage(`✓ 마크다운 파일 (${file.name}) 불러오기 완료!`);
        setTimeout(() => setToastMessage(null), 3000);
      };
      reader.readAsText(file);
    }
    if (mdFileInputRef.current) mdFileInputRef.current.value = '';
  };

  const handleCopyAsMarkdown = () => {
    if (!editor) return;
    const html = editor.getHTML();
    const md = htmlToMarkdown(html);
    navigator.clipboard.writeText(md);
    setToastMessage('✓ 현재 내용이 마크다운(.md)으로 복사되었습니다.');
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleDownloadMarkdown = () => {
    if (!editor) return;
    const html = editor.getHTML();
    const md = htmlToMarkdown(html);
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `document_${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
    setToastMessage('✓ 마크다운(.md) 파일이 다운로드되었습니다.');
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingFile(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingFile(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingFile(false);
    const files = e.dataTransfer.files;
    if (!files || files.length === 0 || !editor) return;

    const file = files[0];
    if (file.name.endsWith('.md') || file.name.endsWith('.markdown') || file.name.endsWith('.txt') || file.type === 'text/markdown') {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const text = (ev.target?.result as string) || '';
        const html = markdownToHtml(text);
        editor.chain().focus().insertContent(html).run();
        setToastMessage(`✓ 마크다운 파일 (${file.name}) 서식이 적용되었습니다.`);
        setTimeout(() => setToastMessage(null), 3000);
      };
      reader.readAsText(file);
      return;
    }

    if (file.type.startsWith('image/')) {
      compressAndResizeImage(file).then(({ dataUrl }) => {
        editor.chain().focus().setImage({
          src: dataUrl,
          alt: file.name,
          ...({ width: '48%', layout: 'inline' } as any),
        }).run();
        setToastMessage('✓ 이미지가 삽입되었습니다 (크기 조절 및 나란히 배치 지원).');
        setTimeout(() => setToastMessage(null), 2500);
      });
      return;
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && editor) {
      try {
        const { dataUrl } = await compressAndResizeImage(file);
        editor.chain().focus().setImage({
          src: dataUrl,
          alt: file.name,
          ...({ width: '48%', layout: 'inline' } as any),
        }).run();
        setToastMessage('✓ 이미지가 삽입되었습니다 (크기 조절 및 나란히 배치 지원).');
        setTimeout(() => setToastMessage(null), 2500);
      } catch {
        const reader = new FileReader();
        reader.onload = (uploadEvent) => {
          const src = uploadEvent.target?.result as string;
          editor.chain().focus().setImage({
            src,
            alt: file.name,
            ...({ width: '48%', layout: 'inline' } as any),
          }).run();
        };
        reader.readAsDataURL(file);
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Table Border Style Handler
  const setTableBorderStyle = useCallback((style: 'all' | 'outer' | 'thick' | 'horizontal' | 'none', color?: string) => {
    if (!editor) return;
    const { state, view } = editor;
    const { tr, selection } = state;
    const { $from } = selection;

    let foundTablePos: number | null = null;
    let currentAttrs: Record<string, any> = {};

    // 1. Check if cursor is directly inside a table
    for (let d = $from.depth; d > 0; d--) {
      const node = $from.node(d);
      if (node.type.name === 'table') {
        foundTablePos = $from.before(d);
        currentAttrs = node.attrs;
        break;
      }
    }

    // 2. If not, look for the first table in the document
    if (foundTablePos === null) {
      state.doc.descendants((node, pos) => {
        if (node.type.name === 'table' && foundTablePos === null) {
          foundTablePos = pos;
          currentAttrs = node.attrs;
          return false;
        }
        return true;
      });
    }

    if (foundTablePos !== null) {
      const newAttrs = {
        ...currentAttrs,
        borderStyle: style,
        ...(color !== undefined ? { borderColor: color } : {}),
      };
      tr.setNodeMarkup(foundTablePos, undefined, newAttrs);
      view.dispatch(tr);

      const labels: Record<string, string> = {
        all: '모든 테두리 (격자)',
        outer: '바깥쪽 테두리만',
        thick: '굵은 바깥 테두리',
        horizontal: '가로 구분선만',
        none: '테두리 없음',
      };
      setToastMessage(`✓ 표 테두리: ${labels[style] || style} 적용`);
      setTimeout(() => setToastMessage(null), 2500);
    } else {
      setToastMessage('표를 먼저 클릭하거나 선택해주세요.');
      setTimeout(() => setToastMessage(null), 2000);
    }
  }, [editor]);

  // Table Border Color Handler
  const setTableBorderColor = useCallback((color: string) => {
    if (!editor) return;
    const { state, view } = editor;
    const { tr, selection } = state;
    const { $from } = selection;

    let foundTablePos: number | null = null;
    let currentAttrs: Record<string, any> = {};

    for (let d = $from.depth; d > 0; d--) {
      const node = $from.node(d);
      if (node.type.name === 'table') {
        foundTablePos = $from.before(d);
        currentAttrs = node.attrs;
        break;
      }
    }

    if (foundTablePos === null) {
      state.doc.descendants((node, pos) => {
        if (node.type.name === 'table' && foundTablePos === null) {
          foundTablePos = pos;
          currentAttrs = node.attrs;
          return false;
        }
        return true;
      });
    }

    if (foundTablePos !== null) {
      const newAttrs = {
        ...currentAttrs,
        borderColor: color || null,
      };
      tr.setNodeMarkup(foundTablePos, undefined, newAttrs);
      view.dispatch(tr);
      setToastMessage('✓ 표 테두리 색상이 변경되었습니다.');
      setTimeout(() => setToastMessage(null), 2000);
    } else {
      setToastMessage('표를 먼저 클릭하거나 선택해주세요.');
      setTimeout(() => setToastMessage(null), 2000);
    }
  }, [editor]);

  const primaryColumn = columns.find((c) => c.isPrimaryKey) || columns[0];
  const primaryTitle = primaryColumn ? String(currentRowData[primaryColumn.id] || '새 데이터 항목') : '데이터 세부 정보';
  const currentTargetName = richTargets.find((t) => t.id === selectedTargetId)?.name || '내용';

  return (
    <div
      id="rich-editor-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/60 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={() => {
        forceSave();
        onClose();
      }}
    >
      <div
        id="rich-editor-modal-container"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`bg-white dark:bg-stone-900 rounded-2xl shadow-2xl border border-stone-200 dark:border-stone-800 flex flex-col overflow-hidden transition-all duration-200 relative ${
          isFullscreen ? 'w-full h-full max-w-none rounded-none' : 'w-full max-w-5xl h-[88vh] max-h-[92vh]'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Toast Notification */}
        {toastMessage && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 bg-stone-900/90 dark:bg-stone-100 text-white dark:text-stone-900 px-4 py-2 rounded-xl text-xs font-semibold shadow-xl flex items-center gap-2 backdrop-blur-sm animate-in fade-in zoom-in-95 duration-150">
            <CheckCircle className="w-4 h-4 text-emerald-400 dark:text-emerald-600" />
            <span>{toastMessage}</span>
          </div>
        )}

        {/* Drag Over Overlay */}
        {isDraggingFile && (
          <div className="absolute inset-0 z-50 bg-amber-500/10 dark:bg-amber-500/20 backdrop-blur-[2px] border-2 border-dashed border-amber-500 rounded-2xl flex flex-col items-center justify-center pointer-events-none animate-in fade-in duration-100">
            <div className="p-5 rounded-2xl bg-white/95 dark:bg-stone-900/95 shadow-2xl text-center space-y-2 border border-amber-500/40">
              <FileDown className="w-10 h-10 text-amber-500 mx-auto animate-bounce" />
              <div className="text-sm font-bold text-stone-900 dark:text-stone-100">
                마크다운(.md) 또는 이미지 파일 놓기
              </div>
              <div className="text-xs text-stone-500 dark:text-stone-400">
                서식·표·코드 블록이 100% 보존되어 에디터에 자동 삽입됩니다
              </div>
            </div>
          </div>
        )}

        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-3.5 border-b border-stone-200 dark:border-stone-800 bg-stone-50/50 dark:bg-stone-900/50">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 dark:bg-amber-400/10 text-amber-600 dark:text-amber-400 flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider">
                  {tableName}
                </span>
                <span className="text-stone-300 dark:text-stone-700">•</span>
                <span className="text-xs text-stone-500 dark:text-stone-400">행 #{row.id}</span>
              </div>
              <h2 className="text-base font-bold text-stone-900 dark:text-stone-100 truncate">
                {primaryTitle}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Auto Save Status Indicator */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs bg-stone-100 dark:bg-stone-800/80 text-stone-600 dark:text-stone-300">
              {status === 'saving' ? (
                <>
                  <Loader2 className="w-3 h-3 text-amber-500 animate-spin" />
                  <span className="text-amber-600 dark:text-amber-400 font-medium">자동 저장 중...</span>
                </>
              ) : status === 'saved' || status === 'idle' ? (
                <>
                  <CheckCircle className="w-3 h-3 text-emerald-500" />
                  <span className="text-stone-500 dark:text-stone-400">
                    {lastSavedAt ? `저장됨 (${new Date(lastSavedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })})` : '저장됨'}
                  </span>
                </>
              ) : (
                <span className="text-rose-500 font-medium">저장 실패</span>
              )}
            </div>

            {/* Fullscreen Toggle */}
            <button
              onClick={toggleFullscreen}
              className="p-1.5 rounded-lg text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
              title={isFullscreen ? '창 크기 복원' : '전체 화면'}
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            {/* Close Button */}
            <button
              onClick={() => {
                forceSave();
                onClose();
              }}
              className="p-1.5 rounded-lg text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
              title="닫기 (ESC)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Target Field Switcher Tabs (e.g. 내용 | 처리방법 | 추가 상세 노트) */}
        <div className="px-6 py-2 bg-stone-100/70 dark:bg-stone-900/60 border-b border-stone-200 dark:border-stone-800 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar">
            <span className="text-[11px] font-bold text-stone-500 dark:text-stone-400 mr-1 flex items-center gap-1">
              <Edit3 className="w-3.5 h-3.5 text-amber-500" />
              서식 편집 대상:
            </span>
            {richTargets.map((field) => (
              <button
                key={field.id}
                type="button"
                onClick={() => handleSwitchTarget(field.id)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                  selectedTargetId === field.id
                    ? 'bg-amber-500 text-stone-950 shadow-sm font-bold'
                    : 'bg-white dark:bg-stone-800 text-stone-600 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-700'
                }`}
              >
                <span>{field.name}</span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <div className="text-[11px] text-amber-700 dark:text-amber-400 font-medium whitespace-nowrap hidden sm:block">
              현재 <strong>[{currentTargetName}]</strong> 서식 편집 중
            </div>
            <button
              type="button"
              onClick={() => setIsPropsBarOpen(!isPropsBarOpen)}
              className={`px-2 py-1 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors ${
                isPropsBarOpen
                  ? 'bg-amber-500/15 text-amber-800 dark:text-amber-300 font-semibold'
                  : 'text-stone-600 dark:text-stone-400 hover:bg-stone-200 dark:hover:bg-stone-800'
              }`}
              title="테이블 행의 다른 속성 컬럼값 입력 필드 열기/접기"
            >
              <span>속성 필드 ({columns.length})</span>
              {isPropsBarOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* Quick Structured Properties Bar (Collapsible) */}
        {isPropsBarOpen && (
          <div className="px-6 py-2.5 bg-stone-50/90 dark:bg-stone-900/50 border-b border-stone-200 dark:border-stone-800 overflow-x-auto flex items-center gap-3 text-xs animate-in slide-in-from-top-1 duration-150 shrink-0">
            <div className="text-[11px] font-bold text-stone-400 dark:text-stone-500 uppercase tracking-wider whitespace-nowrap">
              속성 필드:
            </div>
            <div className="flex items-center gap-2.5">
              {columns.map((col) => (
                <div
                  key={col.id}
                  className="flex items-center gap-1.5 bg-white dark:bg-stone-800 px-2.5 py-1 rounded-lg border border-stone-200/80 dark:border-stone-700/60 flex-shrink-0"
                >
                  <span className="text-stone-400 font-medium">{col.name}:</span>
                  {col.type === 'status' || col.type === 'select' ? (
                    <div className="min-w-[130px]">
                      <SelectOrCustomInput
                        value={cleanTextValue(currentRowData[col.id])}
                        options={getEffectiveColumnOptions(col, allRows)}
                        placeholder="미정/선택 없음"
                        onChange={(val) => handleCellChange(col.id, val)}
                      />
                    </div>
                  ) : col.type === 'checkbox' ? (
                    <input
                      type="checkbox"
                      checked={!!currentRowData[col.id]}
                      onChange={(e) => handleCellChange(col.id, e.target.checked)}
                      className="rounded accent-amber-500 cursor-pointer"
                    />
                  ) : col.type === 'date' ? (
                    <input
                      type="date"
                      value={cleanTextValue(currentRowData[col.id]) || ''}
                      onChange={(e) => handleCellChange(col.id, e.target.value)}
                      className="bg-transparent text-stone-800 dark:text-stone-200 outline-none text-xs"
                    />
                  ) : (
                    <input
                      type="text"
                      value={cleanTextValue(currentRowData[col.id])}
                      onChange={(e) => handleCellChange(col.id, e.target.value)}
                      placeholder="값 입력..."
                      className="bg-transparent text-stone-800 dark:text-stone-200 outline-none text-xs min-w-[90px] max-w-[200px]"
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Excel/Office-style Ribbon Toolbar with Home / Insert / Format Tabs */}
        {editor && (
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

              {/* Quick Action Buttons on Top Right (Undo, Redo) */}
              <div className="flex items-center gap-1 pb-1">
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
                  {/* Font Styling: Bold, Italic, Underline, Strikethrough */}
                  <div className="flex items-center gap-0.5">
                    <button
                      type="button"
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
                    {/* Text Color Picker */}
                    <div className="relative" ref={textColorMenuRef}>
                      <button
                        type="button"
                        onClick={() => setIsTextColorMenuOpen(!isTextColorMenuOpen)}
                        className="px-2 py-1 rounded hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-600 dark:text-stone-300 transition-colors flex items-center gap-1 text-xs"
                        title="글꼴 색상 선택"
                      >
                        <Palette className="w-3.5 h-3.5 text-indigo-500" />
                        <span>글자색</span>
                        <ChevronDown className="w-2.5 h-2.5 opacity-60" />
                      </button>
                      {isTextColorMenuOpen && (
                        <div className="absolute left-0 top-full mt-1.5 w-44 bg-white dark:bg-[#242424] border border-stone-200 dark:border-[#383838] rounded-xl shadow-xl z-50 p-2 text-xs animate-in fade-in zoom-in-95">
                          <div className="text-[10px] font-bold text-stone-400 dark:text-[#888888] uppercase tracking-wider mb-1.5">
                            글꼴 색상 선택
                          </div>
                          <div className="grid grid-cols-4 gap-1.5 mb-2">
                            {[
                              { color: '#1c1917', name: '기본(검정)' },
                              { color: '#ef4444', name: '빨강' },
                              { color: '#3b82f6', name: '파랑' },
                              { color: '#10b981', name: '초록' },
                              { color: '#8b5cf6', name: '보라' },
                              { color: '#f97316', name: '주황' },
                              { color: '#d97706', name: '황토' },
                              { color: '#6b7280', name: '회색' },
                            ].map((item) => (
                              <button
                                key={item.color}
                                type="button"
                                onClick={() => {
                                  editor.chain().focus().setColor(item.color).run();
                                  setIsTextColorMenuOpen(false);
                                }}
                                className="w-7 h-7 rounded-lg border border-stone-200 dark:border-[#444444] hover:scale-110 transition-transform shadow-2xs flex items-center justify-center"
                                style={{ backgroundColor: item.color }}
                                title={item.name}
                              />
                            ))}
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              editor.chain().focus().unsetColor().run();
                              setIsTextColorMenuOpen(false);
                            }}
                            className="w-full py-1 text-center rounded text-[11px] font-medium text-stone-500 hover:bg-stone-100 dark:hover:bg-[#333333] transition-colors"
                          >
                            색상 초기화
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Highlight / Background */}
                    <div className="relative" ref={highlightMenuRef}>
                      <button
                        type="button"
                        onClick={() => setIsHighlightMenuOpen(!isHighlightMenuOpen)}
                        className={`px-2 py-1 rounded transition-colors flex items-center gap-1 text-xs ${
                          editor.isActive('highlight')
                            ? 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400 font-semibold'
                            : 'hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-600 dark:text-stone-300'
                        }`}
                        title="형광펜 / 텍스트 배경색"
                      >
                        <Highlighter className="w-3.5 h-3.5 text-amber-500" />
                        <span>형광펜</span>
                        <ChevronDown className="w-2.5 h-2.5 opacity-60" />
                      </button>
                      {isHighlightMenuOpen && (
                        <div className="absolute left-0 top-full mt-1.5 w-44 bg-white dark:bg-[#242424] border border-stone-200 dark:border-[#383838] rounded-xl shadow-xl z-50 p-2 text-xs animate-in fade-in zoom-in-95">
                          <div className="text-[10px] font-bold text-stone-400 dark:text-[#888888] uppercase tracking-wider mb-1.5">
                            형광펜 색상
                          </div>
                          <div className="grid grid-cols-4 gap-1.5 mb-2">
                            {[
                              { color: '#fef08a', name: '노랑' },
                              { color: '#bbf7d0', name: '연두' },
                              { color: '#bae6fd', name: '하늘' },
                              { color: '#fbcfe8', name: '분홍' },
                              { color: '#ddd6fe', name: '연보라' },
                              { color: '#fed7aa', name: '살구' },
                            ].map((item) => (
                              <button
                                key={item.color}
                                type="button"
                                onClick={() => {
                                  editor.chain().focus().toggleHighlight({ color: item.color }).run();
                                  setIsHighlightMenuOpen(false);
                                }}
                                className="w-7 h-7 rounded-lg border border-stone-200 dark:border-[#444444] hover:scale-110 transition-transform shadow-2xs"
                                style={{ backgroundColor: item.color }}
                                title={item.name}
                              />
                            ))}
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              editor.chain().focus().unsetHighlight().run();
                              setIsHighlightMenuOpen(false);
                            }}
                            className="w-full py-1 text-center rounded text-[11px] font-medium text-stone-500 hover:bg-stone-100 dark:hover:bg-[#333333] transition-colors"
                          >
                            형광펜 지우기
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Clear Formatting */}
                    <button
                      type="button"
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
                      onClick={() => editor.chain().focus().setTextAlign('right').run()}
                      className={`p-1.5 rounded hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors ${
                        editor.isActive({ textAlign: 'right' }) ? 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400 font-bold' : 'text-stone-600 dark:text-stone-300'
                      }`}
                      title="오른쪽 정렬"
                    >
                      <AlignRight className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="w-[1px] h-4 bg-stone-200 dark:bg-stone-800 mx-1" />

                  {/* Lists & Quotes */}
                  <div className="flex items-center gap-0.5">
                    <button
                      type="button"
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
                      onClick={() => editor.chain().focus().setHorizontalRule().run()}
                      className="p-1.5 rounded hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-600 dark:text-stone-300 transition-colors"
                      title="가로 구분선 삽입"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

              {/* TAB 2: 삽입 (Insert) - Table, Image, Code & MD, Sticky Notes, Link */}
              {activeRibbonTab === 'insert' && (
                <div className="flex items-center gap-1 shrink-0 flex-nowrap text-xs">
                  {/* Table Insert Button with Interactive Matrix Picker */}
                  <div className="relative" ref={tableMenuRef}>
                    <button
                      type="button"
                      onClick={() => setIsTableMenuOpen(!isTableMenuOpen)}
                      className={`px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors border ${
                        editor.isActive('table')
                          ? 'bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700 font-semibold'
                          : 'bg-white dark:bg-stone-800 hover:bg-stone-100 dark:hover:bg-stone-700/80 text-stone-700 dark:text-stone-200 border-stone-200 dark:border-stone-700'
                      }`}
                      title="엑셀 스타일 표 삽입 (원하는 크기로 드래그하여 생성)"
                    >
                      <TableIcon className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                      <span className="font-medium">새 표 삽입</span>
                      <ChevronDown className="w-3 h-3 opacity-60" />
                    </button>

                    {isTableMenuOpen && (
                      <div className="absolute left-0 top-full mt-1.5 w-72 bg-white dark:bg-[#242424] border border-stone-200 dark:border-[#383838] rounded-xl shadow-2xl z-50 p-3 text-xs animate-in fade-in">
                        <div className="text-[11px] font-bold text-stone-600 dark:text-[#a0a0a0] mb-2 flex items-center justify-between">
                          <span>표 크기 선택 (드래그)</span>
                          <span className="text-[10px] text-amber-600 dark:text-amber-400 font-mono">Excel 스타일</span>
                        </div>
                        <TableGridPicker
                          onInsert={(rows, cols) => {
                            editor.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run();
                            setIsTableMenuOpen(false);
                            setActiveRibbonTab('format');
                            setToastMessage(`✓ ${cols}열 × ${rows}행 표가 삽입되었습니다.`);
                            setTimeout(() => setToastMessage(null), 2500);
                          }}
                        />
                        <div className="mt-2.5 pt-2 border-t border-stone-100 dark:border-stone-800 text-[10px] text-stone-400 flex items-center justify-between">
                          <span>마우스로 칸 수를 지정하여 클릭하세요</span>
                          <span className="font-mono text-amber-500">최대 10×10</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Image Insert */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-stone-800 hover:bg-stone-100 dark:hover:bg-stone-700/80 text-stone-700 dark:text-stone-200 border border-stone-200 dark:border-stone-700 flex items-center gap-1.5 transition-colors"
                      title="이미지 파일 삽입 (텍스트 인라인/나란히 배치 및 크기 조절 지원)"
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
                  </div>

                  <div className="w-[1px] h-4 bg-stone-200 dark:bg-stone-800 mx-1" />

                  {/* Code & Markdown Integrated Dropdown */}
                  <div className="relative" ref={codeMdMenuRef}>
                    <button
                      type="button"
                      onClick={() => setIsCodeMdMenuOpen(!isCodeMdMenuOpen)}
                      className={`px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors border ${
                        editor.isActive('codeBlock')
                          ? 'bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700 font-semibold'
                          : 'bg-white dark:bg-stone-800 hover:bg-stone-100 dark:hover:bg-stone-700/80 text-stone-700 dark:text-stone-200 border-stone-200 dark:border-stone-700'
                      }`}
                      title="코드 블록(SQL, Java), 코드 서식 정리, MD 열기/복사/다운로드"
                    >
                      <Code className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                      <span className="font-medium">코드 & MD</span>
                      <ChevronDown className="w-2.5 h-2.5 opacity-60" />
                    </button>

                    {isCodeMdMenuOpen && (
                      <div className="absolute left-0 top-full mt-1.5 w-64 bg-white dark:bg-[#242424] border border-stone-200 dark:border-[#383838] rounded-xl shadow-2xl z-50 p-2 text-xs divide-y divide-stone-100 dark:divide-[#333333] space-y-1.5 animate-in fade-in">
                        {/* Code Block Tools */}
                        <div className="space-y-1 pb-1">
                          <div className="px-2 py-0.5 text-[10px] font-bold text-stone-400 dark:text-[#888888] uppercase tracking-wider flex items-center justify-between">
                            <span>코드 블록 삽입 & 편집</span>
                            <span className="text-[9px] text-amber-600 dark:text-amber-400 font-mono font-normal">Syntax</span>
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              editor.chain().focus().toggleCodeBlock().run();
                              setIsCodeMdMenuOpen(false);
                            }}
                            className={`w-full px-2 py-1.5 rounded-lg text-left hover:bg-stone-100 dark:hover:bg-[#2e2e2e] flex items-center gap-2 transition-colors ${
                              editor.isActive('codeBlock') ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 font-medium' : 'text-stone-700 dark:text-[#f0f0f0]'
                            }`}
                          >
                            <Code className="w-3.5 h-3.5 text-stone-500" />
                            <span>기본 코드 블록</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              handleInsertSqlBlock();
                              setIsCodeMdMenuOpen(false);
                            }}
                            className="w-full px-2 py-1.5 rounded-lg text-left hover:bg-stone-100 dark:hover:bg-[#2e2e2e] flex items-center gap-2 transition-colors text-stone-700 dark:text-[#f0f0f0]"
                          >
                            <Database className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                            <span className="font-mono font-medium">SQL 쿼리 템플릿</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              handleInsertJavaBlock();
                              setIsCodeMdMenuOpen(false);
                            }}
                            className="w-full px-2 py-1.5 rounded-lg text-left hover:bg-stone-100 dark:hover:bg-[#2e2e2e] flex items-center gap-2 transition-colors text-stone-700 dark:text-[#f0f0f0]"
                          >
                            <FileCode className="w-3.5 h-3.5 text-orange-500" />
                            <span className="font-mono font-medium">Java 클래스 템플릿</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              handlePasteCodeFromClipboard();
                              setIsCodeMdMenuOpen(false);
                            }}
                            className="w-full px-2 py-1.5 rounded-lg text-left hover:bg-stone-100 dark:hover:bg-[#2e2e2e] flex items-center gap-2 transition-colors text-stone-700 dark:text-[#f0f0f0]"
                          >
                            <ClipboardPaste className="w-3.5 h-3.5 text-indigo-500" />
                            <span>클립보드 코드 붙여넣기</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              handleFormatCodeInEditor();
                              setIsCodeMdMenuOpen(false);
                            }}
                            className="w-full px-2 py-1.5 rounded-lg text-left hover:bg-stone-100 dark:hover:bg-[#2e2e2e] flex items-center gap-2 transition-colors text-amber-600 dark:text-amber-400 font-medium"
                          >
                            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                            <span>코드 자동 정렬 / 들여쓰기</span>
                          </button>
                        </div>

                        {/* Markdown Tools */}
                        <div className="space-y-1 pt-1.5">
                          <div className="px-2 py-0.5 text-[10px] font-bold text-stone-400 dark:text-[#888888] uppercase tracking-wider">
                            마크다운 (Markdown)
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              setIsCodeMdMenuOpen(false);
                              mdFileInputRef.current?.click();
                            }}
                            className="w-full px-2 py-1.5 rounded-lg text-left hover:bg-stone-100 dark:hover:bg-[#2e2e2e] flex items-center gap-2 transition-colors text-stone-700 dark:text-[#f0f0f0]"
                          >
                            <FileDown className="w-3.5 h-3.5 text-amber-500" />
                            <span>MD 파일 열기 (가져오기)</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setIsCodeMdMenuOpen(false);
                              handleCopyAsMarkdown();
                            }}
                            className="w-full px-2 py-1.5 rounded-lg text-left hover:bg-stone-100 dark:hover:bg-[#2e2e2e] flex items-center gap-2 transition-colors text-stone-700 dark:text-[#f0f0f0]"
                          >
                            <Download className="w-3.5 h-3.5 text-sky-500" />
                            <span>MD 형식으로 복사</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setIsCodeMdMenuOpen(false);
                              handleDownloadMarkdown();
                            }}
                            className="w-full px-2 py-1.5 rounded-lg text-left hover:bg-stone-100 dark:hover:bg-[#2e2e2e] flex items-center gap-2 transition-colors text-stone-700 dark:text-[#f0f0f0]"
                          >
                            <FileText className="w-3.5 h-3.5 text-emerald-500" />
                            <span>MD 파일로 다운로드 (.md)</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                  <input
                    ref={mdFileInputRef}
                    type="file"
                    accept=".md,.markdown,.txt"
                    className="hidden"
                    onChange={handleMdFileUpload}
                  />

                  {/* Link Insert Button */}
                  <button
                    type="button"
                    onClick={() => {
                      const prevUrl = editor.getAttributes('link').href || '';
                      const url = window.prompt('연결할 링크(URL) 주소를 입력하세요:', prevUrl);
                      if (url === null) return;
                      if (url === '') {
                        editor.chain().focus().extendMarkRange('link').unsetLink().run();
                      } else {
                        const formattedUrl = url.startsWith('http://') || url.startsWith('https://') ? url : `https://${url}`;
                        editor.chain().focus().extendMarkRange('link').setLink({ href: formattedUrl }).run();
                      }
                    }}
                    className={`px-2 py-1.5 rounded-lg border flex items-center gap-1 transition-colors ${
                      editor.isActive('link')
                        ? 'bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700 font-semibold'
                        : 'bg-white dark:bg-stone-800 hover:bg-stone-100 dark:hover:bg-stone-700/80 text-stone-700 dark:text-stone-200 border-stone-200 dark:border-stone-700'
                    }`}
                    title="링크 삽입 / 편집"
                  >
                    <Link2 className="w-3.5 h-3.5 text-sky-500" />
                    <span>링크</span>
                  </button>

                  <div className="w-[1px] h-4 bg-stone-200 dark:bg-stone-800 mx-1" />

                  {/* Sticker Notes Group */}
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
                  {/* Table Border Quick Dropdown */}
                  <div className="relative" ref={borderMenuRef}>
                    <button
                      type="button"
                      onClick={() => setIsBorderMenuOpen(!isBorderMenuOpen)}
                      className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-stone-800 hover:bg-stone-100 dark:hover:bg-stone-700/80 text-stone-700 dark:text-stone-200 border border-stone-200 dark:border-stone-700 flex items-center gap-1.5 transition-colors font-medium shadow-2xs"
                      title="표 테두리 설정 (모든 테두리, 바깥쪽, 굵은 테두리, 가로줄, 테두리 없음)"
                    >
                      <Grid className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                      <span>표 테두리</span>
                      <ChevronDown className="w-2.5 h-2.5 opacity-60" />
                    </button>

                    {isBorderMenuOpen && (
                      <div className="absolute left-0 top-full mt-1.5 w-60 bg-white dark:bg-[#242424] border border-stone-200 dark:border-[#383838] rounded-xl shadow-2xl z-50 p-2.5 text-xs space-y-2 animate-in fade-in">
                        <div className="text-[10px] font-bold text-stone-400 dark:text-[#888888] uppercase tracking-wider">
                          표 테두리 스타일
                        </div>
                        <div className="grid grid-cols-1 gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setTableBorderStyle('all');
                              setIsBorderMenuOpen(false);
                            }}
                            className="w-full px-2.5 py-1.5 rounded-lg text-left hover:bg-stone-100 dark:hover:bg-[#2e2e2e] flex items-center justify-between transition-colors text-stone-700 dark:text-[#f0f0f0]"
                          >
                            <span className="flex items-center gap-2">
                              <Grid className="w-3.5 h-3.5 text-amber-500" />
                              <span className="font-medium">모든 테두리 (격자)</span>
                            </span>
                            <span className="text-[10px] text-stone-400 font-mono">기본</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setTableBorderStyle('outer');
                              setIsBorderMenuOpen(false);
                            }}
                            className="w-full px-2.5 py-1.5 rounded-lg text-left hover:bg-stone-100 dark:hover:bg-[#2e2e2e] flex items-center gap-2 transition-colors text-stone-700 dark:text-[#f0f0f0]"
                          >
                            <Square className="w-3.5 h-3.5 text-sky-500" />
                            <span>바깥쪽 테두리만</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setTableBorderStyle('thick');
                              setIsBorderMenuOpen(false);
                            }}
                            className="w-full px-2.5 py-1.5 rounded-lg text-left hover:bg-stone-100 dark:hover:bg-[#2e2e2e] flex items-center gap-2 transition-colors text-stone-700 dark:text-[#f0f0f0]"
                          >
                            <Square className="w-3.5 h-3.5 text-indigo-500 stroke-[2.5]" />
                            <span>굵은 바깥 테두리</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setTableBorderStyle('horizontal');
                              setIsBorderMenuOpen(false);
                            }}
                            className="w-full px-2.5 py-1.5 rounded-lg text-left hover:bg-stone-100 dark:hover:bg-[#2e2e2e] flex items-center gap-2 transition-colors text-stone-700 dark:text-[#f0f0f0]"
                          >
                            <Rows className="w-3.5 h-3.5 text-emerald-500" />
                            <span>가로 구분선만</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setTableBorderStyle('none');
                              setIsBorderMenuOpen(false);
                            }}
                            className="w-full px-2.5 py-1.5 rounded-lg text-left hover:bg-stone-100 dark:hover:bg-[#2e2e2e] flex items-center gap-2 transition-colors text-stone-500 dark:text-stone-400"
                          >
                            <X className="w-3.5 h-3.5 text-stone-400" />
                            <span>테두리 없음</span>
                          </button>
                        </div>

                        {/* Border Line Color Palette */}
                        <div className="pt-2 border-t border-stone-100 dark:border-[#333333]">
                          <div className="text-[10px] font-bold text-stone-400 dark:text-[#888888] uppercase tracking-wider mb-1.5">
                            테두리 선 색상
                          </div>
                          <div className="flex items-center gap-1.5">
                            {[
                              { color: '#d1d5db', name: '기본 연회색' },
                              { color: '#4b5563', name: '진한 회색' },
                              { color: '#3b82f6', name: '블루' },
                              { color: '#f59e0b', name: '앰버' },
                              { color: '#10b981', name: '초록' },
                              { color: '#ef4444', name: '빨강' },
                            ].map((c) => (
                              <button
                                key={c.color}
                                type="button"
                                onClick={() => {
                                  setTableBorderColor(c.color);
                                  setIsBorderMenuOpen(false);
                                }}
                                className="w-6 h-6 rounded-full border border-stone-300 dark:border-stone-600 hover:scale-110 transition-transform shadow-2xs"
                                style={{ backgroundColor: c.color }}
                                title={c.name}
                              />
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Cell Background Colors */}
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

                  {/* Cell Merge & Split */}
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

                  {/* Row & Column Actions */}
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
                      title="현재 행 삭제"
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
                      title="현재 열 삭제"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="w-[1px] h-4 bg-stone-200 dark:bg-stone-800 mx-1" />

                  {/* Delete Entire Table */}
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
        )}

        {/* Table Quick Action Sub-bar when cursor is inside a table */}
        {editor && editor.isActive('table') && (
          <div className="px-6 py-1.5 bg-amber-500/10 dark:bg-amber-500/15 border-b border-amber-500/20 flex items-center justify-between gap-2 text-xs flex-wrap animate-in fade-in duration-150">
            <div className="flex items-center gap-1.5 font-semibold text-amber-900 dark:text-amber-300">
              <TableIcon className="w-3.5 h-3.5" />
              <span>표 편집 모드:</span>
            </div>
            <div className="flex items-center gap-1 flex-wrap">
              <button
                type="button"
                onClick={() => editor.chain().focus().addRowBefore().run()}
                className="px-2 py-0.5 rounded bg-white dark:bg-[#252525] border border-amber-300 dark:border-amber-700 hover:bg-amber-50 dark:hover:bg-[#303030] text-[11px] font-medium transition-colors"
                title="위에 새 행 추가"
              >
                + 행(위)
              </button>
              <button
                type="button"
                onClick={() => editor.chain().focus().addRowAfter().run()}
                className="px-2 py-0.5 rounded bg-white dark:bg-[#252525] border border-amber-300 dark:border-amber-700 hover:bg-amber-50 dark:hover:bg-[#303030] text-[11px] font-medium transition-colors"
                title="아래에 새 행 추가"
              >
                + 행(아래)
              </button>
              <button
                type="button"
                onClick={() => editor.chain().focus().deleteRow().run()}
                className="px-2 py-0.5 rounded bg-white dark:bg-[#252525] border border-rose-300 dark:border-rose-800 text-rose-600 dark:text-rose-400 hover:bg-rose-50 text-[11px] font-medium transition-colors"
                title="현재 행 삭제"
              >
                - 행 삭제
              </button>
              <div className="w-[1px] h-3.5 bg-amber-300 dark:bg-amber-800 mx-0.5" />
              <button
                type="button"
                onClick={() => editor.chain().focus().addColumnBefore().run()}
                className="px-2 py-0.5 rounded bg-white dark:bg-[#252525] border border-amber-300 dark:border-amber-700 hover:bg-amber-50 dark:hover:bg-[#303030] text-[11px] font-medium transition-colors"
                title="왼쪽에 새 열 추가"
              >
                + 열(좌)
              </button>
              <button
                type="button"
                onClick={() => editor.chain().focus().addColumnAfter().run()}
                className="px-2 py-0.5 rounded bg-white dark:bg-[#252525] border border-amber-300 dark:border-amber-700 hover:bg-amber-50 dark:hover:bg-[#303030] text-[11px] font-medium transition-colors"
                title="오른쪽에 새 열 추가"
              >
                + 열(우)
              </button>
              <button
                type="button"
                onClick={() => editor.chain().focus().deleteColumn().run()}
                className="px-2 py-0.5 rounded bg-white dark:bg-[#252525] border border-rose-300 dark:border-rose-800 text-rose-600 dark:text-rose-400 hover:bg-rose-50 text-[11px] font-medium transition-colors"
                title="현재 열 삭제"
              >
                - 열 삭제
              </button>
              <div className="w-[1px] h-3.5 bg-amber-300 dark:bg-amber-800 mx-0.5" />
              <button
                type="button"
                onClick={() => editor.chain().focus().mergeCells().run()}
                className="px-2 py-0.5 rounded bg-white dark:bg-[#252525] border border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-400 hover:bg-indigo-50 text-[11px] font-medium transition-colors flex items-center gap-1"
                title="드래그하여 선택한 셀 병합"
              >
                <Combine className="w-3 h-3" />
                셀 병합
              </button>
              <button
                type="button"
                onClick={() => editor.chain().focus().splitCell().run()}
                className="px-2 py-0.5 rounded bg-white dark:bg-[#252525] border border-sky-300 dark:border-sky-700 text-sky-700 dark:text-sky-400 hover:bg-sky-50 text-[11px] font-medium transition-colors flex items-center gap-1"
                title="병합된 셀 분할"
              >
                <Split className="w-3 h-3" />
                셀 분할
              </button>
              <div className="w-[1px] h-3.5 bg-amber-300 dark:bg-amber-800 mx-0.5" />
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-stone-500 font-medium">셀 배경:</span>
                {[
                  { color: '', label: '기본' },
                  { color: '#fef3c7', label: '노랑' },
                  { color: '#d1fae5', label: '초록' },
                  { color: '#dbeafe', label: '파랑' },
                  { color: '#ede9fe', label: '보라' },
                  { color: '#ffe4e6', label: '분홍' },
                ].map((c) => (
                  <button
                    key={c.color || 'none'}
                    type="button"
                    onClick={() => editor.chain().focus().setCellAttribute('backgroundColor', c.color || null).run()}
                    className="w-4 h-4 rounded border border-black/20 hover:scale-125 transition-transform flex items-center justify-center text-[8px]"
                    style={{ backgroundColor: c.color || 'transparent' }}
                    title={`셀 배경: ${c.label}`}
                  >
                    {!c.color && '✕'}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Scrollable Body Area */}
        <div className="flex-1 p-6 overflow-y-auto min-h-[350px]">
          <EditorContent editor={editor} />
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-2.5 border-t border-stone-200 dark:border-stone-800 bg-stone-50/60 dark:bg-stone-900/60 flex items-center justify-between text-xs text-stone-500">
          <div className="flex items-center gap-2">
            <span>💡 <strong>작성 팁:</strong> 자바(Java) 등 소스코드를 붙여넣으면 들여쓰기·띄어쓰기가 완벽히 보존된 코드 블록으로 자동 변환됩니다 (Tab 키 들여쓰기 지원).</span>
          </div>
          <button
            onClick={() => {
              forceSave();
              onClose();
            }}
            className="px-5 py-1.5 bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold rounded-lg transition-colors shadow-sm"
          >
            완료 및 닫기
          </button>
        </div>
      </div>
    </div>
  );
};
