import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { ReactNodeViewRenderer, useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { createLowlight, common } from 'lowlight';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Underline from '@tiptap/extension-underline';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import { Table, TableView } from '@tiptap/extension-table';
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
  Terminal,
  Zap,
  Cpu,
  Check,
} from 'lucide-react';

// Initialize Lowlight with common languages (Java, SQL, JS, TS, Python, JSON, HTML, Bash, etc.)
const baseLowlight = createLowlight(common);

// Safe high-performance wrapper for lowlight
// Accurately resolves languages (including 'auto' and language aliases) and highlights up to 3MB
// without stripping syntax tokens or freezing the browser.
const lowlight = {
  ...baseLowlight,
  registered: (aliasOrLanguage: string) => {
    if (!aliasOrLanguage) return false;
    if (aliasOrLanguage === 'auto') return true;
    return Boolean(baseLowlight.registered(aliasOrLanguage));
  },
  highlight: (language: string, value: string, options?: any) => {
    if (!value) {
      return { type: 'root', children: [] };
    }
    // Safety guard for extreme memory exhaustion (> 3MB / 3,000,000 chars)
    if (value.length > 3000000) {
      return { type: 'root', children: [{ type: 'text', value }] };
    }
    try {
      let targetLang = language;
      if (!targetLang || targetLang === 'auto' || !baseLowlight.registered(targetLang)) {
        const detected = detectLanguage(value);
        if (detected.isCode && baseLowlight.registered(detected.language)) {
          targetLang = detected.language;
        } else {
          const sample = value.length > 16000 ? value.slice(0, 16000) : value;
          if (/\b(?:package\s+[a-zA-Z0-9_.]+|import\s+java|public\s+class|class\s+\w+|public\s+static\s+void|System\.out|private\s+|protected\s+|@Override|public\s+static\s+final)\b/.test(sample)) {
            targetLang = 'java';
          } else if (/\b(?:SELECT\s+|INSERT\s+INTO|UPDATE\s+|DELETE\s+FROM|CREATE\s+TABLE)\b/i.test(sample)) {
            targetLang = 'sql';
          } else {
            targetLang = 'java';
          }
        }
      }
      return baseLowlight.highlight(targetLang, value, options);
    } catch (err) {
      console.warn('lowlight highlight error:', err);
      try {
        return baseLowlight.highlightAuto(value, options);
      } catch {
        return { type: 'root', children: [{ type: 'text', value }] };
      }
    }
  },
  highlightAuto: (value: string, options?: any) => {
    if (!value) {
      return { type: 'root', children: [] };
    }
    if (value.length > 3000000) {
      return { type: 'root', children: [{ type: 'text', value }] };
    }
    try {
      const detected = detectLanguage(value);
      if (detected.isCode && baseLowlight.registered(detected.language)) {
        return baseLowlight.highlight(detected.language, value, options);
      }
      const sample = value.length > 16000 ? value.slice(0, 16000) : value;
      if (/\b(?:package\s+[a-zA-Z0-9_.]+|import\s+java|public\s+class|class\s+\w+|public\s+static\s+void|System\.out|private\s+|protected\s+|@Override|public\s+static\s+final)\b/.test(sample)) {
        return baseLowlight.highlight('java', value, options);
      }
      if (/\b(?:SELECT\s+|INSERT\s+INTO|UPDATE\s+|DELETE\s+FROM|CREATE\s+TABLE)\b/i.test(sample)) {
        return baseLowlight.highlight('sql', value, options);
      }
      return baseLowlight.highlightAuto(value, options);
    } catch (err) {
      console.warn('lowlight highlightAuto error:', err);
      return { type: 'root', children: [{ type: 'text', value }] };
    }
  },
  listLanguages: () => {
    const list = baseLowlight.listLanguages();
    if (!list.includes('auto')) {
      return ['auto', ...list];
    }
    return list;
  },
};

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

// Custom Table View with dynamic border style & border color reactivity
class CustomTableView extends TableView {
  constructor(node: any, cellMinWidth: number, view?: any, HTMLAttributes: Record<string, any> = {}) {
    super(node, cellMinWidth, view, HTMLAttributes);
    this.syncTableAttributes(node);
  }

  update(node: any) {
    const updated = super.update(node);
    if (updated) {
      this.syncTableAttributes(node);
    }
    return updated;
  }

  private syncTableAttributes(node: any) {
    if (!this.table) return;
    const borderStyle = node.attrs?.borderStyle || 'all';
    const borderColor = node.attrs?.borderColor || '';

    // Remove any prior border style classes
    this.table.classList.remove(
      'wonbee-table-border-all',
      'wonbee-table-border-outer',
      'wonbee-table-border-thick',
      'wonbee-table-border-horizontal',
      'wonbee-table-border-none'
    );
    this.table.classList.add('wonbee-rich-table', `wonbee-table-border-${borderStyle}`);
    this.table.setAttribute('data-border-style', borderStyle);

    if (borderColor) {
      this.table.setAttribute('data-border-color', borderColor);
      this.table.style.setProperty('--table-border-color', borderColor);
      this.table.style.borderColor = borderColor;
    } else {
      this.table.removeAttribute('data-border-color');
      this.table.style.removeProperty('--table-border-color');
      this.table.style.borderColor = '';
    }

    // Direct inline styles for guaranteed visual rendering across all browsers
    const effectiveColor = borderColor || 'var(--table-border-color, #475569)';
    const gridColor = borderColor || 'var(--table-border-color, #cbd5e1)';

    if (borderStyle === 'outer') {
      this.table.style.border = `2.5px solid ${effectiveColor}`;
      this.table.style.outline = `1px solid ${effectiveColor}`;
    } else if (borderStyle === 'thick') {
      this.table.style.border = `3.5px solid ${effectiveColor}`;
      this.table.style.outline = `1px solid ${effectiveColor}`;
    } else if (borderStyle === 'horizontal') {
      this.table.style.borderLeft = 'none';
      this.table.style.borderRight = 'none';
      this.table.style.borderTop = `2px solid ${effectiveColor}`;
      this.table.style.borderBottom = `2px solid ${effectiveColor}`;
      this.table.style.outline = 'none';
    } else if (borderStyle === 'none') {
      this.table.style.border = 'none';
      this.table.style.outline = 'none';
    } else {
      // all
      this.table.style.border = `1px solid ${gridColor}`;
      this.table.style.outline = 'none';
    }

    // Explicitly adjust child cell borders for outer/none/horizontal styles
    const cells = this.table.querySelectorAll('td, th');
    cells.forEach((cellEl) => {
      const el = cellEl as HTMLElement;
      if (borderStyle === 'outer' || borderStyle === 'none') {
        el.style.border = 'none';
      } else if (borderStyle === 'horizontal') {
        el.style.borderLeft = 'none';
        el.style.borderRight = 'none';
        el.style.borderTop = `1px solid ${gridColor}`;
        el.style.borderBottom = `1px solid ${gridColor}`;
      } else {
        // all or thick
        el.style.border = `1px solid ${gridColor}`;
      }
    });
  }
}

// Custom Table supporting borders & styles
const CustomTable = Table.extend({
  addOptions() {
    return {
      ...this.parent?.(),
      View: CustomTableView,
    };
  },
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

export interface EditorLoadingState {
  isLoading: boolean;
  progress: number;
  stage: number;
  stageText: string;
  sizeFormatted: string;
  charCount: number;
  lineCount: number;
  isLargeData: boolean;
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
          const sample = val.length > 8000 ? val.slice(0, 8000) : val;
          const isComplex =
            sample.includes('<table') ||
            sample.includes('<img') ||
            sample.includes('sticker') ||
            sample.includes('<pre') ||
            sample.includes('<code') ||
            sample.includes('<blockquote') ||
            sample.includes('<h1') ||
            sample.includes('<h2') ||
            sample.includes('<h3') ||
            sample.includes('<ul') ||
            sample.includes('<ol');
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
  
  // Top-level modal popup state (rendered at the very top of rich editor container, never clipped or constrained by toolbar overflow)
  const [activeTopDialog, setActiveTopDialog] = useState<
    'table' | 'code' | 'image' | 'link' | 'border' | 'textColor' | 'highlight' | null
  >(null);

  // Table Dialog states
  const [tableDialogRows, setTableDialogRows] = useState(3);
  const [tableDialogCols, setTableDialogCols] = useState(3);
  const [tableDialogHeaderRow, setTableDialogHeaderRow] = useState(true);

  // Image Dialog states
  const [imageDialogTab, setImageDialogTab] = useState<'upload' | 'url'>('upload');
  const [imageDialogUrl, setImageDialogUrl] = useState('');
  const [imageDialogAlt, setImageDialogAlt] = useState('');
  const [imageDialogWidth, setImageDialogWidth] = useState<'100%' | '75%' | '50%' | '30%'>('100%');

  // Link Dialog states
  const [linkDialogUrl, setLinkDialogUrl] = useState('');
  const [linkDialogText, setLinkDialogText] = useState('');
  const [linkDialogNewTab, setLinkDialogNewTab] = useState(false);

  const [isPropsBarOpen, setIsPropsBarOpen] = useState(false);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const mdFileInputRef = useRef<HTMLInputElement | null>(null);

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

    // If it already has HTML code block, ensure it is not stuck on plaintext if it's real code
    if (trimmed.includes('<pre') || trimmed.includes('<code')) {
      if (trimmed.includes('language-plaintext') || trimmed.includes('language-auto') || !/class="[^"]*language-[a-zA-Z0-9_-]+/i.test(trimmed)) {
        const codeText = trimmed
          .replace(/<[^>]+>/g, '')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&amp;/g, '&');
        const detected = detectLanguage(codeText);
        const hasJava = /\b(?:package\s+[a-zA-Z0-9_.]+|import\s+java|public\s+class|class\s+\w+|public\s+static\s+void|System\.out|private\s+|protected\s+|@Override|public\s+static\s+final)\b/.test(codeText.slice(0, 32000));
        const effective = detected.isCode ? detected.language : (hasJava ? 'java' : null);
        if (effective && effective !== 'plaintext') {
          return trimmed
            .replace(/class="([^"]*)language-(?:plaintext|auto)([^"]*)"/gi, `class="$1language-${effective}$2"`)
            .replace(/<code(?!\s+class="[^"]*language-)/gi, `<code class="language-${effective}"`);
        }
      }
      return rawContent;
    }

    // Fast check for real rich HTML block tags on sample
    const sample = trimmed.length > 32000 ? trimmed.slice(0, 32000) : trimmed;
    const hasRealHtmlTags =
      /<\s*(?:table|thead|tbody|tr|td|th|img|sticker-node|h[1-6]|ul|ol|li|blockquote|p|div|span|strong|b|em|i|u|s|del|mark|a|hr)\b/i.test(sample) ||
      /style\s*=\s*["']/i.test(sample) ||
      /data-color\s*=/i.test(sample);
    if (hasRealHtmlTags) {
      return rawContent;
    }

    // Check if it's Markdown format (e.g. ## headers, | table |, - list, ```` code blocks, etc.)
    if (isLikelyMarkdown(rawContent)) {
      return markdownToHtml(rawContent);
    }

    // Check if it's source code (Java, SQL, JS, etc.) or has Java patterns
    const langDetect = detectLanguage(rawContent);
    const hasJavaPattern = /\b(?:package\s+[a-zA-Z0-9_.]+|import\s+java|public\s+class|class\s+\w+|public\s+static\s+void|System\.out|private\s+|protected\s+|@Override|public\s+static\s+final)\b/.test(sample);
    const hasCodeStructure =
      rawContent.includes('\n') &&
      ((sample.includes('{') && sample.includes('}')) || (sample.includes('(') && sample.includes(')'))) &&
      (sample.includes(';') || sample.includes('//') || sample.includes('/*') || /^\s{2,}\S/m.test(sample));

    if (langDetect.isCode || hasJavaPattern || hasCodeStructure) {
      const formatted = formatJavaOrGeneralCode(rawContent);
      let lang = langDetect.isCode ? langDetect.language : (hasJavaPattern ? 'java' : 'auto');
      if (lang === 'auto' || lang === 'plaintext') {
        if (hasJavaPattern || sample.includes('System.out') || sample.includes('String ') || sample.includes('void ')) {
          lang = 'java';
        } else if (/\b(?:SELECT|INSERT|UPDATE|DELETE|CREATE\s+TABLE)\b/i.test(sample)) {
          lang = 'sql';
        } else {
          lang = 'java';
        }
      }
      return `<pre><code class="language-${lang}">${escapeHtml(formatted)}</code></pre>`;
    }

    // If it's multi-line plain text: wrap in paragraphs so TipTap never collapses newlines into spaces
    if (rawContent.includes('\n')) {
      const lines = rawContent.split('\n');
      return lines
        .map((line) => `<p>${escapeHtml(line) || '<br>'}</p>`)
        .join('');
    }

    return escapeHtml(rawContent);
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

  // Combined state object for auto-save hook - memoized to prevent infinite re-render loops
  const combinedRowState: TableRowType | null = useMemo(() => {
    if (!row) return null;
    return {
      ...row,
      data: currentRowData,
      richContent: richContent,
      updatedAt: row.updatedAt,
    };
  }, [row, currentRowData, richContent]);

  // Auto-save hook with 400ms debounce
  const { status, lastSavedAt, forceSave } = useAutoSave<TableRowType | null>({
    data: combinedRowState,
    onSave: async (dataToSave) => {
      if (dataToSave) {
        await onSaveRow({
          ...dataToSave,
          updatedAt: Date.now(),
        });
      }
    },
    debounceMs: 400,
    enabled: isOpen && !!row,
  });

  // Close top dialog when pressing Escape, or close modal if no dialog is open
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (activeTopDialog) {
          e.preventDefault();
          e.stopPropagation();
          setActiveTopDialog(null);
        } else {
          forceSave();
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTopDialog, forceSave, onClose]);

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
        View: CustomTableView,
        HTMLAttributes: {
          class: 'wonbee-rich-table',
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
    content: '',
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

        const htmlData = clipboardData.getData('text/html') || '';
        const plainText = clipboardData.getData('text/plain') || '';

        // 1. HTML Table check FIRST (Excel, Google Sheets, or Web table)
        // Microsoft Excel puts both image/png and text/html table in clipboard!
        // Table parsing MUST run before image handler to avoid inserting Excel tables as images.
        const isHtmlTable = htmlData && (
          htmlData.includes('<table') ||
          htmlData.includes('xmlns:x="urn:schemas-microsoft-com:office:excel"') ||
          (htmlData.includes('<tr') && htmlData.includes('<td'))
        );

        if (isHtmlTable) {
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
            setToastMessage('✓ 엑셀/스프레드시트 표 데이터(테두리 적용) 붙여넣기 완료');
            setTimeout(() => setToastMessage(null), 2500);
            return true;
          }
        }

        // 2. Tab-separated spreadsheet data check (Excel / Sheets plain text copy)
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

        // 3. Pure Image paste handler (screenshots, image files, ONLY when NOT a table)
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
                    ...({ width: '50%', layout: 'inline' } as any),
                  }).run();
                  setToastMessage('✓ 이미지가 삽입되었습니다 (크기 조절 및 나란히 배치 지원).');
                  setTimeout(() => setToastMessage(null), 2500);
                }
              });
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
        const hasRichFormatting =
          targetCol?.type === 'richText' ||
          /<\s*(?:table|thead|tbody|tr|td|th|img|sticker-node|h[1-6]|ul|ol|li|blockquote|pre|code|strong|b|em|i|u|s|del|mark|span|a|hr)\b/i.test(html) ||
          /style\s*=\s*["']/i.test(html) ||
          /data-color\s*=/i.test(html) ||
          html.includes('data-type=') ||
          html.includes('sticker');

        if (hasRichFormatting) {
          // Always preserve rich HTML (text color, highlight, bold, underline, code blocks, tables)
          setCurrentRowData((prev) => ({
            ...prev,
            [currentTarget]: html,
          }));
        } else {
          // Plain column with simple text: store clean plain text
          const plain = cleanHtmlToPlainText(html);
          setCurrentRowData((prev) => ({
            ...prev,
            [currentTarget]: plain,
          }));
        }
      }
    },
  });

  // Loading state & stage progression for responsive large-data handling
  const [loadingState, setLoadingState] = useState<EditorLoadingState>({
    isLoading: true,
    progress: 0,
    stage: 1,
    stageText: '데이터 로딩 준비 중...',
    sizeFormatted: '0 B',
    charCount: 0,
    lineCount: 0,
    isLargeData: false,
  });

  const loadingTimersRef = useRef<(NodeJS.Timeout | number)[]>([]);

  const clearLoadingTimers = useCallback(() => {
    loadingTimersRef.current.forEach((t) => {
      clearTimeout(t as NodeJS.Timeout);
      if (typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(t as number);
      }
    });
    loadingTimersRef.current = [];
  }, []);

  useEffect(() => {
    return () => {
      clearLoadingTimers();
    };
  }, [clearLoadingTimers]);

  const currentRowDataRef = useRef(currentRowData);
  currentRowDataRef.current = currentRowData;
  const richContentRef = useRef(richContent);
  richContentRef.current = richContent;
  const hasLoadedRowKeyRef = useRef<string>('');
  const savedSelectionRef = useRef<{ from: number; to: number } | null>(null);

  // Continuously track non-empty selection so formatting dialogs and toolbar clicks never lose target text
  useEffect(() => {
    if (!editor) return;
    const updateSelection = () => {
      const { from, to, empty } = editor.state.selection;
      if (!empty) {
        savedSelectionRef.current = { from, to };
      }
    };
    editor.on('selectionUpdate', updateSelection);
    return () => {
      editor.off('selectionUpdate', updateSelection);
    };
  }, [editor]);

  // Color apply handlers with selection restoration
  const handleApplyTextColor = useCallback(
    (color: string) => {
      if (!editor) return;
      const sel = savedSelectionRef.current;
      if (sel && sel.from !== sel.to) {
        editor.chain().setTextSelection(sel).setColor(color).focus().run();
      } else {
        editor.chain().focus().setColor(color).run();
      }
      setActiveTopDialog(null);
    },
    [editor]
  );

  const handleResetTextColor = useCallback(() => {
    if (!editor) return;
    const sel = savedSelectionRef.current;
    if (sel && sel.from !== sel.to) {
      editor.chain().setTextSelection(sel).unsetColor().focus().run();
    } else {
      editor.chain().focus().unsetColor().run();
    }
    setActiveTopDialog(null);
  }, [editor]);

  const handleApplyHighlight = useCallback(
    (color: string) => {
      if (!editor) return;
      const sel = savedSelectionRef.current;
      if (sel && sel.from !== sel.to) {
        editor.chain().setTextSelection(sel).toggleHighlight({ color }).focus().run();
      } else {
        editor.chain().focus().toggleHighlight({ color }).run();
      }
      setActiveTopDialog(null);
    },
    [editor]
  );

  const handleResetHighlight = useCallback(() => {
    if (!editor) return;
    const sel = savedSelectionRef.current;
    if (sel && sel.from !== sel.to) {
      editor.chain().setTextSelection(sel).unsetHighlight().focus().run();
    } else {
      editor.chain().focus().unsetHighlight().run();
    }
    setActiveTopDialog(null);
  }, [editor]);

  // High-performance direct content loader for editor
  const loadContentWithProgress = useCallback(
    (targetId: string, rawDataToLoad?: string) => {
      clearLoadingTimers();
      if (!editor) return;

      const raw =
        rawDataToLoad !== undefined
          ? rawDataToLoad
          : targetId === '__richContent__'
          ? (row?.richContent || richContentRef.current || '')
          : String(currentRowDataRef.current[targetId] ?? row?.data?.[targetId] ?? '');

      const charCount = raw.length;
      const lineCount = raw ? raw.split('\n').length : 0;
      const byteLength = new Blob([raw]).size;
      const sizeFormatted =
        byteLength > 1024 * 1024
          ? `${(byteLength / (1024 * 1024)).toFixed(1)} MB`
          : byteLength > 1024
          ? `${(byteLength / 1024).toFixed(1)} KB`
          : `${byteLength} B`;

      // 150KB or any standard data (< 1.5MB) loads directly and synchronously in milliseconds
      const isGigantic = byteLength > 1500 * 1024;

      if (!isGigantic) {
        try {
          const formatted = formatContentForEditor(raw);
          editor.commands.setContent(formatted, { emitUpdate: false });
        } catch (err) {
          console.error('Fast setContent failed, fallback to plain code block:', err);
          editor.commands.setContent(`<pre><code>${escapeHtml(raw)}</code></pre>`, { emitUpdate: false });
        } finally {
          setLoadingState({
            isLoading: false,
            progress: 100,
            stage: 4,
            stageText: '에디터 준비 완료',
            sizeFormatted,
            charCount,
            lineCount,
            isLargeData: false,
          });
        }
        return;
      }

      // For truly gigantic buffers (> 1.5MB), yield 1 frame to ensure responsive UI paint, then set content
      setLoadingState({
        isLoading: true,
        progress: 50,
        stage: 2,
        stageText: '대용량 데이터 로딩 중...',
        sizeFormatted,
        charCount,
        lineCount,
        isLargeData: true,
      });

      const frameId = requestAnimationFrame(() => {
        try {
          const formatted = formatContentForEditor(raw);
          editor.commands.setContent(formatted, { emitUpdate: false });
        } catch (err) {
          console.error('Large data setContent error:', err);
          editor.commands.setContent(`<pre><code>${escapeHtml(raw)}</code></pre>`, { emitUpdate: false });
        } finally {
          setLoadingState({
            isLoading: false,
            progress: 100,
            stage: 4,
            stageText: '완료',
            sizeFormatted,
            charCount,
            lineCount,
            isLargeData: false,
          });
        }
      });

      // Safety timeout to ensure loadingState never gets stuck under any circumstance
      const safetyTimer = setTimeout(() => {
        setLoadingState((prev) => ({
          ...prev,
          isLoading: false,
        }));
      }, 300);

      loadingTimersRef.current.push(frameId as any, safetyTimer);
    },
    [editor, row?.id, formatContentForEditor, clearLoadingTimers]
  );

  // Sync TipTap editor content when modal opens or row/initialTargetId changes
  useEffect(() => {
    if (!isOpen) {
      hasLoadedRowKeyRef.current = '';
      return;
    }

    if (editor && row && isOpen) {
      const targetId = resolveTargetId(initialTargetId);
      setSelectedTargetId(targetId);
      selectedTargetIdRef.current = targetId;

      const loadKey = `${row.id}_${targetId}`;
      if (hasLoadedRowKeyRef.current !== loadKey) {
        hasLoadedRowKeyRef.current = loadKey;

        const rawContent =
          targetId === '__richContent__'
            ? (row.richContent || '')
            : String(row.data?.[targetId] ?? '');

        loadContentWithProgress(targetId, rawContent);
      }
    }
  }, [row?.id, isOpen, initialTargetId, editor, resolveTargetId, loadContentWithProgress]);

  // Switch target field
  const handleSwitchTarget = (targetId: string) => {
    setSelectedTargetId(targetId);
    selectedTargetIdRef.current = targetId;
    if (row) {
      hasLoadedRowKeyRef.current = `${row.id}_${targetId}`;
    }

    if (editor) {
      const rawContent =
        targetId === '__richContent__'
          ? (richContentRef.current || '')
          : String(currentRowDataRef.current[targetId] ?? '');
      loadContentWithProgress(targetId, rawContent);
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

  // Helper to extract currently selected text in editor
  const getSelectedText = useCallback((): string => {
    if (!editor) return '';
    const { state } = editor;
    const { from, to, empty } = state.selection;
    if (empty) return '';
    return state.doc.textBetween(from, to, '\n');
  }, [editor]);

  // Insert a new table safely with multi-layer fallback to guarantee creation
  const handleInsertNewTable = useCallback((rows: number, cols: number, withHeader: boolean = true) => {
    if (!editor) return;
    try {
      const { state } = editor;
      const { $from } = state.selection;
      let isInsideTable = false;
      for (let d = $from.depth; d > 0; d--) {
        if ($from.node(d).type.name === 'table') {
          isInsideTable = true;
          break;
        }
      }

      if (isInsideTable) {
        // If cursor is already inside a table, insert paragraph after table first
        editor.chain().focus('end').insertContent('<p></p>').insertTable({ rows, cols, withHeaderRow: withHeader }).run();
      } else {
        const success = editor.chain().focus().insertTable({ rows, cols, withHeaderRow: withHeader }).run();
        if (!success) {
          editor.chain().focus('end').insertContent('<p></p>').insertTable({ rows, cols, withHeaderRow: withHeader }).run();
        }
      }
      setActiveTopDialog(null);
      setActiveRibbonTab('format');
      setToastMessage(`✓ ${cols}열 × ${rows}행 표가 삽입되었습니다.`);
      setTimeout(() => setToastMessage(null), 2500);
    } catch (err) {
      console.error('Failed to insert table:', err);
      // Fallback: direct HTML table injection
      let tableHtml = '<table class="wonbee-rich-table wonbee-table-border-all" data-border-style="all"><tbody>';
      for (let r = 0; r < rows; r++) {
        tableHtml += '<tr>';
        for (let c = 0; c < cols; c++) {
          tableHtml += (r === 0 && withHeader) ? '<th>헤더</th>' : '<td>내용</td>';
        }
        tableHtml += '</tr>';
      }
      tableHtml += '</tbody></table><p></p>';
      editor.chain().focus().insertContent(tableHtml).run();
      setActiveTopDialog(null);
      setActiveRibbonTab('format');
      setToastMessage(`✓ ${cols}열 × ${rows}행 표가 삽입되었습니다.`);
      setTimeout(() => setToastMessage(null), 2500);
    }
  }, [editor]);

  const openTableDialog = useCallback(() => {
    setTableDialogRows(3);
    setTableDialogCols(3);
    setTableDialogHeaderRow(true);
    setActiveTopDialog('table');
  }, []);

  const openImageDialog = useCallback(() => {
    setImageDialogTab('upload');
    setImageDialogUrl('');
    setImageDialogAlt('');
    setImageDialogWidth('100%');
    setActiveTopDialog('image');
  }, []);

  const openLinkDialog = useCallback(() => {
    if (!editor) return;
    const currentHref = editor.getAttributes('link').href || '';
    const selected = getSelectedText();
    setLinkDialogUrl(currentHref);
    setLinkDialogText(selected);
    setLinkDialogNewTab(editor.getAttributes('link').target === '_blank');
    setActiveTopDialog('link');
  }, [editor, getSelectedText]);

  const handleApplyLink = useCallback(() => {
    if (!editor) return;
    const url = linkDialogUrl.trim();
    if (!url) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      setToastMessage('✓ 링크가 해제되었습니다.');
    } else {
      const formattedUrl = url.startsWith('http://') || url.startsWith('https://') || url.startsWith('mailto:') ? url : `https://${url}`;
      if (linkDialogText.trim() && editor.state.selection.empty) {
        editor.chain().focus().insertContent(`<a href="${formattedUrl}"${linkDialogNewTab ? ' target="_blank"' : ''}>${escapeHtml(linkDialogText.trim())}</a>`).run();
      } else {
        editor.chain().focus().extendMarkRange('link').setLink({
          href: formattedUrl,
          ...(linkDialogNewTab ? { target: '_blank' } : {}),
        }).run();
      }
      setToastMessage('✓ 하이퍼링크가 적용되었습니다.');
    }
    setActiveTopDialog(null);
    setTimeout(() => setToastMessage(null), 2500);
  }, [editor, linkDialogUrl, linkDialogText, linkDialogNewTab]);

  const handleInsertImageUrl = useCallback(() => {
    if (!editor || !imageDialogUrl.trim()) return;
    const cleanUrl = imageDialogUrl.trim();
    editor.chain().focus().setImage({
      src: cleanUrl,
      alt: imageDialogAlt.trim() || '이미지',
      ...({ width: imageDialogWidth, layout: imageDialogWidth === '100%' ? 'block' : 'inline' } as any),
    }).run();
    setActiveTopDialog(null);
    setToastMessage('✓ 이미지가 삽입되었습니다.');
    setTimeout(() => setToastMessage(null), 2500);
  }, [editor, imageDialogUrl, imageDialogAlt, imageDialogWidth]);

  // Auto-detect language of selected text and wrap in code block with syntax highlighting
  const handleAutoHighlightSelection = useCallback(() => {
    if (!editor) return;
    const selected = getSelectedText();
    if (!selected || selected.trim() === '') {
      // Nothing selected: toggle default code block
      editor.chain().focus().toggleCodeBlock().run();
      return;
    }

    const langDetection = detectLanguage(selected);
    const hasJavaPattern = /\b(package\s+[a-zA-Z0-9_.]+|import\s+java|public\s+class|class\s+\w+|public\s+static\s+void|System\.out|public\s+static\s+final)\b/.test(selected);
    const isShebang = /^(#!\/(bin|usr\/bin|usr\/local\/bin)\/(bash|sh|zsh|env\s+bash|env\s+sh))/m.test(selected);

    let detectedLang = langDetection.isCode ? langDetection.language : 'plaintext';
    if (isShebang || /\b(sudo\s+|chmod\s+|curl\s+|docker\s+|npm\s+run|git\s+|grep\s+|echo\s+)/.test(selected)) {
      detectedLang = 'bash';
    } else if (hasJavaPattern) {
      detectedLang = 'java';
    } else if (/\b(SELECT\s+|INSERT\s+INTO|UPDATE\s+|DELETE\s+FROM|CREATE\s+TABLE)\b/i.test(selected)) {
      detectedLang = 'sql';
    }

    if (editor.isActive('codeBlock')) {
      editor.chain().focus().updateAttributes('codeBlock', { language: detectedLang }).run();
    } else {
      editor.chain().focus().setCodeBlock({ language: detectedLang }).run();
    }

    setToastMessage(`✓ 선택 데이터가 [${detectedLang.toUpperCase()}] 코드 블록으로 자동 변환되었습니다.`);
    setTimeout(() => setToastMessage(null), 2500);
  }, [editor, getSelectedText]);

  // Bash Shell Script Insertion & Conversion
  const handleInsertBashBlock = useCallback(() => {
    if (!editor) return;
    const selected = getSelectedText();
    if (selected && selected.trim() !== '') {
      if (editor.isActive('codeBlock')) {
        editor.chain().focus().updateAttributes('codeBlock', { language: 'bash' }).run();
      } else {
        editor.chain().focus().setCodeBlock({ language: 'bash' }).run();
      }
      setToastMessage('✓ 선택 영역이 Bash 쉘 스크립트 코드 블록으로 변환되었습니다.');
      setTimeout(() => setToastMessage(null), 2500);
      return;
    }

    const sampleBash = `#!/bin/bash\n# Bash Shell Script\nset -euo pipefail\n\necho "배쉬 쉘 스크립트 실행 시작..."\ncurl -sSf https://api.example.com/health | grep "status: ok"\n`;
    editor.chain().focus().insertContent({
      type: 'codeBlock',
      attrs: { language: 'bash' },
      content: [{ type: 'text', text: sampleBash }],
    }).run();
    setToastMessage('✓ Bash 쉘 스크립트 템플릿이 삽입되었습니다.');
    setTimeout(() => setToastMessage(null), 2500);
  }, [editor, getSelectedText]);

  const handleInsertSqlBlock = useCallback(() => {
    if (!editor) return;
    const selected = getSelectedText();
    if (selected && selected.trim() !== '') {
      if (editor.isActive('codeBlock')) {
        editor.chain().focus().updateAttributes('codeBlock', { language: 'sql' }).run();
      } else {
        editor.chain().focus().setCodeBlock({ language: 'sql' }).run();
      }
      setToastMessage('✓ 선택 영역이 SQL 쿼리 블록으로 변환되었습니다.');
      setTimeout(() => setToastMessage(null), 2500);
      return;
    }

    const sampleSql = `-- SQL Query\nSELECT \n  id, name, created_at \nFROM \n  my_table \nWHERE \n  status = 'ACTIVE'\nORDER BY \n  id DESC;`;
    editor.chain().focus().insertContent({
      type: 'codeBlock',
      attrs: { language: 'sql' },
      content: [{ type: 'text', text: sampleSql }],
    }).run();
    setToastMessage('✓ SQL 쿼리 템플릿이 삽입되었습니다.');
    setTimeout(() => setToastMessage(null), 2500);
  }, [editor, getSelectedText]);

  const handleInsertJavaBlock = useCallback(() => {
    if (!editor) return;
    const selected = getSelectedText();
    if (selected && selected.trim() !== '') {
      if (editor.isActive('codeBlock')) {
        editor.chain().focus().updateAttributes('codeBlock', { language: 'java' }).run();
      } else {
        editor.chain().focus().setCodeBlock({ language: 'java' }).run();
      }
      setToastMessage('✓ 선택 영역이 Java 코드 블록으로 변환되었습니다.');
      setTimeout(() => setToastMessage(null), 2500);
      return;
    }

    const sampleJava = `// Java Source Code\npublic class Solution {\n    public static void main(String[] args) {\n        System.out.println("Hello, World!");\n    }\n}`;
    editor.chain().focus().insertContent({
      type: 'codeBlock',
      attrs: { language: 'java' },
      content: [{ type: 'text', text: sampleJava }],
    }).run();
    setToastMessage('✓ Java 클래스 템플릿이 삽입되었습니다.');
    setTimeout(() => setToastMessage(null), 2500);
  }, [editor, getSelectedText]);

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

  // Reference to track the most recently focused/clicked table position
  const lastTablePosRef = useRef<number | null>(null);

  // Monitor editor transactions to maintain lastTablePosRef
  useEffect(() => {
    if (!editor) return;
    const trackTablePosition = () => {
      try {
        const { $from } = editor.state.selection;
        for (let d = $from.depth; d > 0; d--) {
          if ($from.node(d).type.name === 'table') {
            lastTablePosRef.current = $from.before(d);
            return;
          }
        }
      } catch {
        // Safe fallback
      }
    };
    editor.on('selectionUpdate', trackTablePosition);
    editor.on('transaction', trackTablePosition);
    return () => {
      editor.off('selectionUpdate', trackTablePosition);
      editor.off('transaction', trackTablePosition);
    };
  }, [editor]);

  // Helper to get active table attributes for highlighting current selection in UI
  const getActiveTableAttrs = useCallback(() => {
    if (!editor) return { borderStyle: 'all', borderColor: null };
    const { state } = editor;
    const { $from } = state.selection;
    for (let d = $from.depth; d > 0; d--) {
      const node = $from.node(d);
      if (node.type.name === 'table') {
        return {
          borderStyle: (node.attrs.borderStyle || 'all') as 'all' | 'outer' | 'thick' | 'horizontal' | 'none',
          borderColor: (node.attrs.borderColor || null) as string | null,
        };
      }
    }
    if (lastTablePosRef.current !== null) {
      try {
        const nodeAtLast = state.doc.nodeAt(lastTablePosRef.current);
        if (nodeAtLast && nodeAtLast.type.name === 'table') {
          return {
            borderStyle: (nodeAtLast.attrs.borderStyle || 'all') as 'all' | 'outer' | 'thick' | 'horizontal' | 'none',
            borderColor: (nodeAtLast.attrs.borderColor || null) as string | null,
          };
        }
      } catch {
        // ignore
      }
    }
    let firstAttrs: { borderStyle: 'all' | 'outer' | 'thick' | 'horizontal' | 'none'; borderColor: string | null } = {
      borderStyle: 'all',
      borderColor: null,
    };
    state.doc.descendants((node) => {
      if (node.type.name === 'table') {
        firstAttrs = {
          borderStyle: (node.attrs.borderStyle || 'all') as any,
          borderColor: node.attrs.borderColor || null,
        };
        return false;
      }
      return true;
    });
    return firstAttrs;
  }, [editor]);

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

    // 2. Check if we recently tracked a table position
    if (foundTablePos === null && lastTablePosRef.current !== null) {
      try {
        const nodeAtLast = state.doc.nodeAt(lastTablePosRef.current);
        if (nodeAtLast && nodeAtLast.type.name === 'table') {
          foundTablePos = lastTablePosRef.current;
          currentAttrs = nodeAtLast.attrs;
        }
      } catch {
        // ignore
      }
    }

    // 3. If not, look for the first table in the document
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
      lastTablePosRef.current = foundTablePos;
      const targetColor = color !== undefined ? color : currentAttrs.borderColor;
      const newAttrs = {
        ...currentAttrs,
        borderStyle: style,
        ...(targetColor !== undefined ? { borderColor: targetColor || null } : {}),
      };
      tr.setNodeMarkup(foundTablePos, undefined, newAttrs);
      view.dispatch(tr);

      // Direct DOM update fallback for instantaneous visual reactivity
      try {
        const domNode = view.nodeDOM(foundTablePos) as HTMLElement | null;
        if (domNode) {
          const tableEl = (domNode.tagName === 'TABLE' ? domNode : domNode.querySelector('table')) as HTMLTableElement | null;
          if (tableEl) {
            tableEl.classList.remove(
              'wonbee-table-border-all',
              'wonbee-table-border-outer',
              'wonbee-table-border-thick',
              'wonbee-table-border-horizontal',
              'wonbee-table-border-none'
            );
            tableEl.classList.add('wonbee-rich-table', `wonbee-table-border-${style}`);
            tableEl.setAttribute('data-border-style', style);
            if (targetColor) {
              tableEl.setAttribute('data-border-color', targetColor);
              tableEl.style.setProperty('--table-border-color', targetColor);
              tableEl.style.borderColor = targetColor;
            } else {
              tableEl.removeAttribute('data-border-color');
              tableEl.style.removeProperty('--table-border-color');
              tableEl.style.borderColor = '';
            }
          }
        }
      } catch {
        // ignore fallback errors
      }

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

    if (foundTablePos === null && lastTablePosRef.current !== null) {
      try {
        const nodeAtLast = state.doc.nodeAt(lastTablePosRef.current);
        if (nodeAtLast && nodeAtLast.type.name === 'table') {
          foundTablePos = lastTablePosRef.current;
          currentAttrs = nodeAtLast.attrs;
        }
      } catch {
        // ignore
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
      lastTablePosRef.current = foundTablePos;
      const newAttrs = {
        ...currentAttrs,
        borderColor: color || null,
      };
      tr.setNodeMarkup(foundTablePos, undefined, newAttrs);
      view.dispatch(tr);

      // Direct DOM update fallback
      try {
        const domNode = view.nodeDOM(foundTablePos) as HTMLElement | null;
        if (domNode) {
          const tableEl = (domNode.tagName === 'TABLE' ? domNode : domNode.querySelector('table')) as HTMLTableElement | null;
          if (tableEl) {
            if (color) {
              tableEl.setAttribute('data-border-color', color);
              tableEl.style.setProperty('--table-border-color', color);
              tableEl.style.borderColor = color;
            } else {
              tableEl.removeAttribute('data-border-color');
              tableEl.style.removeProperty('--table-border-color');
              tableEl.style.borderColor = '';
            }
          }
        }
      } catch {
        // ignore fallback errors
      }

      setToastMessage(color ? `✓ 표 테두리 색상(${color})이 적용되었습니다.` : '✓ 표 테두리 색상이 기본값으로 초기화되었습니다.');
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
          <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 bg-stone-900/90 dark:bg-stone-100 text-white dark:text-stone-900 px-4 py-2 rounded-xl text-xs font-semibold shadow-xl flex items-center gap-2 backdrop-blur-sm animate-in fade-in zoom-in-95 duration-150 pointer-events-none">
            <CheckCircle className="w-4 h-4 text-emerald-400 dark:text-emerald-600" />
            <span>{toastMessage}</span>
          </div>
        )}

        {/* TOP LEVEL DIALOGS OVERLAY (최상단 팝업 다이얼로그 - 스크롤 및 툴바 overflow 잘림 없이 최상단에 완전 표시) */}
        {activeTopDialog && (
          <div
            id="rich-editor-top-dialog-backdrop"
            className="absolute inset-0 z-50 flex items-start justify-center pt-8 md:pt-14 pb-8 px-4 bg-stone-950/45 backdrop-blur-[2px] animate-in fade-in duration-150 overflow-y-auto"
            onClick={() => setActiveTopDialog(null)}
          >
            <div
              id="rich-editor-top-dialog"
              className="bg-white dark:bg-[#1e1e1e] rounded-2xl border border-stone-200 dark:border-[#383838] shadow-2xl w-full max-w-md md:max-w-lg animate-in zoom-in-95 duration-150 overflow-hidden text-stone-900 dark:text-stone-100 my-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {/* DIALOG 1: 새 표 삽입 (Table Dialog) */}
              {activeTopDialog === 'table' && (
                <div className="p-5 space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-stone-100 dark:border-stone-800">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                        <TableIcon className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2">
                          새 표 삽입
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 font-mono font-medium">Excel 스타일</span>
                        </h3>
                        <p className="text-[11px] text-stone-500 dark:text-stone-400">
                          원하는 행과 열 크기를 지정하여 스프레드시트형 표를 삽입합니다
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTopDialog(null)}
                      className="p-1.5 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* 1. Matrix Grid Picker */}
                  <div>
                    <div className="text-[11px] font-semibold text-stone-700 dark:text-stone-300 mb-2 flex items-center justify-between">
                      <span>1. 마우스 드래그로 빠른 선택</span>
                      <span className="text-[10px] text-stone-400 font-mono">최대 10×10</span>
                    </div>
                    <div className="flex justify-center p-3 bg-stone-50 dark:bg-[#141414] rounded-xl border border-stone-200/70 dark:border-stone-800">
                      <TableGridPicker
                        onInsert={(rows, cols) => {
                          handleInsertNewTable(rows, cols, tableDialogHeaderRow);
                        }}
                      />
                    </div>
                  </div>

                  {/* 2. Manual Inputs */}
                  <div>
                    <div className="text-[11px] font-semibold text-stone-700 dark:text-stone-300 mb-2">
                      2. 행 및 열 크기 직접 입력
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-3 bg-stone-50 dark:bg-[#141414] rounded-xl border border-stone-200/70 dark:border-stone-800 flex items-center justify-between">
                        <span className="text-xs font-medium text-stone-600 dark:text-stone-300">열 (Columns)</span>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setTableDialogCols((c) => Math.max(1, c - 1))}
                            className="w-7 h-7 rounded-lg bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 flex items-center justify-center hover:bg-stone-100 dark:hover:bg-stone-700 text-stone-600 dark:text-stone-300 transition-colors text-xs font-bold"
                          >
                            -
                          </button>
                          <input
                            type="number"
                            min={1}
                            max={12}
                            value={tableDialogCols}
                            onChange={(e) => setTableDialogCols(Math.max(1, Math.min(12, parseInt(e.target.value) || 1)))}
                            className="w-10 text-center font-mono font-bold text-sm bg-transparent border-b border-amber-500 focus:outline-hidden"
                          />
                          <button
                            type="button"
                            onClick={() => setTableDialogCols((c) => Math.min(12, c + 1))}
                            className="w-7 h-7 rounded-lg bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 flex items-center justify-center hover:bg-stone-100 dark:hover:bg-stone-700 text-stone-600 dark:text-stone-300 transition-colors text-xs font-bold"
                          >
                            +
                          </button>
                        </div>
                      </div>

                      <div className="p-3 bg-stone-50 dark:bg-[#141414] rounded-xl border border-stone-200/70 dark:border-stone-800 flex items-center justify-between">
                        <span className="text-xs font-medium text-stone-600 dark:text-stone-300">행 (Rows)</span>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setTableDialogRows((r) => Math.max(1, r - 1))}
                            className="w-7 h-7 rounded-lg bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 flex items-center justify-center hover:bg-stone-100 dark:hover:bg-stone-700 text-stone-600 dark:text-stone-300 transition-colors text-xs font-bold"
                          >
                            -
                          </button>
                          <input
                            type="number"
                            min={1}
                            max={30}
                            value={tableDialogRows}
                            onChange={(e) => setTableDialogRows(Math.max(1, Math.min(30, parseInt(e.target.value) || 1)))}
                            className="w-10 text-center font-mono font-bold text-sm bg-transparent border-b border-amber-500 focus:outline-hidden"
                          />
                          <button
                            type="button"
                            onClick={() => setTableDialogRows((r) => Math.min(30, r + 1))}
                            className="w-7 h-7 rounded-lg bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 flex items-center justify-center hover:bg-stone-100 dark:hover:bg-stone-700 text-stone-600 dark:text-stone-300 transition-colors text-xs font-bold"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 3. Quick Presets */}
                  <div>
                    <div className="text-[11px] font-semibold text-stone-700 dark:text-stone-300 mb-1.5">
                      3. 추천 규격 프리셋
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        { label: '2×2 (4분할)', rows: 2, cols: 2 },
                        { label: '3×3 (기본 표)', rows: 3, cols: 3 },
                        { label: '4×3 (요약 표)', rows: 3, cols: 4 },
                        { label: '5×4 (상세 목록)', rows: 4, cols: 5 },
                        { label: '2열 비교표', rows: 4, cols: 2 },
                      ].map((preset) => (
                        <button
                          key={preset.label}
                          type="button"
                          onClick={() => {
                            setTableDialogRows(preset.rows);
                            setTableDialogCols(preset.cols);
                          }}
                          className={`px-2.5 py-1 rounded-lg text-xs border transition-colors ${
                            tableDialogRows === preset.rows && tableDialogCols === preset.cols
                              ? 'bg-amber-100 dark:bg-amber-950/60 border-amber-400 text-amber-800 dark:text-amber-300 font-semibold'
                              : 'bg-stone-50 dark:bg-[#252525] border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-700'
                          }`}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 4. Options */}
                  <div className="pt-2 border-t border-stone-100 dark:border-stone-800">
                    <label className="flex items-center gap-2 cursor-pointer text-xs text-stone-700 dark:text-stone-300 select-none">
                      <input
                        type="checkbox"
                        checked={tableDialogHeaderRow}
                        onChange={(e) => setTableDialogHeaderRow(e.target.checked)}
                        className="rounded border-stone-300 text-amber-500 focus:ring-amber-500 w-4 h-4"
                      />
                      <span>첫 번째 행을 제목 헤더(Header)로 강조</span>
                    </label>
                  </div>

                  {/* 5. Footer Buttons */}
                  <div className="pt-3 border-t border-stone-100 dark:border-stone-800 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setActiveTopDialog(null)}
                      className="px-4 py-2 rounded-xl border border-stone-200 dark:border-stone-700 text-xs font-medium text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
                    >
                      취소
                    </button>
                    <button
                      type="button"
                      onClick={() => handleInsertNewTable(tableDialogRows, tableDialogCols, tableDialogHeaderRow)}
                      className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-bold transition-colors shadow-sm flex items-center gap-1.5"
                    >
                      <TableIcon className="w-3.5 h-3.5" />
                      <span>{tableDialogCols}열 × {tableDialogRows}행 표 삽입하기</span>
                    </button>
                  </div>
                </div>
              )}

              {/* DIALOG 2: 코드 & MD (Code & Markdown Dialog) */}
              {activeTopDialog === 'code' && (
                <div className="p-5 space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-stone-100 dark:border-stone-800">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                        <Code className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2">
                          코드 블록 & 마크다운
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 font-mono font-medium">Syntax Highlighting</span>
                        </h3>
                        <p className="text-[11px] text-stone-500 dark:text-stone-400">
                          선택 영역 자동 분석, 주요 언어 템플릿 및 마크다운 가져오기/내보내기
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTopDialog(null)}
                      className="p-1.5 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Selected Text Highlight Banner */}
                  {editor && !editor.state.selection.empty && (
                    <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center justify-between gap-3 animate-in fade-in">
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                          <span>선택된 텍스트가 있습니다</span>
                        </div>
                        <div className="text-[11px] text-stone-500 dark:text-stone-400 truncate">
                          "{getSelectedText().slice(0, 35)}..."
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          handleAutoHighlightSelection();
                          setActiveTopDialog(null);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-bold whitespace-nowrap shadow-xs transition-colors"
                      >
                        자동 하이라이팅 적용
                      </button>
                    </div>
                  )}

                  {/* Language Templates Grid */}
                  <div>
                    <div className="text-[11px] font-semibold text-stone-700 dark:text-stone-300 mb-2">
                      주요 언어 코드 블록 템플릿
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          handleInsertBashBlock();
                          setActiveTopDialog(null);
                        }}
                        className="p-2.5 rounded-xl border border-stone-200 dark:border-stone-700/80 bg-stone-50 dark:bg-[#222222] hover:bg-stone-100 dark:hover:bg-[#2a2a2a] text-left transition-colors flex items-center gap-2.5"
                      >
                        <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                          <Terminal className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="text-xs font-bold text-stone-800 dark:text-stone-200">Bash / Shell</div>
                          <div className="text-[10px] text-stone-400">명령어 & 쉘 스크립트</div>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          handleInsertSqlBlock();
                          setActiveTopDialog(null);
                        }}
                        className="p-2.5 rounded-xl border border-stone-200 dark:border-stone-700/80 bg-stone-50 dark:bg-[#222222] hover:bg-stone-100 dark:hover:bg-[#2a2a2a] text-left transition-colors flex items-center gap-2.5"
                      >
                        <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                          <Database className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="text-xs font-bold text-stone-800 dark:text-stone-200">SQL 쿼리</div>
                          <div className="text-[10px] text-stone-400">SELECT / JOIN / DDL</div>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          handleInsertJavaBlock();
                          setActiveTopDialog(null);
                        }}
                        className="p-2.5 rounded-xl border border-stone-200 dark:border-stone-700/80 bg-stone-50 dark:bg-[#222222] hover:bg-stone-100 dark:hover:bg-[#2a2a2a] text-left transition-colors flex items-center gap-2.5"
                      >
                        <div className="p-1.5 rounded-lg bg-orange-500/10 text-orange-600 dark:text-orange-400">
                          <FileCode className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="text-xs font-bold text-stone-800 dark:text-stone-200">Java 클래스</div>
                          <div className="text-[10px] text-stone-400">메서드 & 엔티티</div>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          if (editor) {
                            const template = `function calculateMetrics(data) {\n  return data.map(item => ({\n    id: item.id,\n    total: item.quantity * item.price\n  }));\n}`;
                            editor.chain().focus().insertContent(`<pre><code class="language-javascript">${escapeHtml(template)}</code></pre><p></p>`).run();
                          }
                          setActiveTopDialog(null);
                        }}
                        className="p-2.5 rounded-xl border border-stone-200 dark:border-stone-700/80 bg-stone-50 dark:bg-[#222222] hover:bg-stone-100 dark:hover:bg-[#2a2a2a] text-left transition-colors flex items-center gap-2.5"
                      >
                        <div className="p-1.5 rounded-lg bg-yellow-500/10 text-yellow-600 dark:text-yellow-400">
                          <Code className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="text-xs font-bold text-stone-800 dark:text-stone-200">JavaScript / TS</div>
                          <div className="text-[10px] text-stone-400">JS / TS 함수 작성</div>
                        </div>
                      </button>
                    </div>
                  </div>

                  {/* Utilities */}
                  <div className="pt-2 border-t border-stone-100 dark:border-stone-800">
                    <div className="text-[11px] font-semibold text-stone-700 dark:text-stone-300 mb-1.5">
                      코드 편의 도구
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          handlePasteCodeFromClipboard();
                          setActiveTopDialog(null);
                        }}
                        className="p-2 rounded-xl border border-stone-200 dark:border-stone-700 hover:bg-stone-50 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-300 text-xs flex items-center gap-2 transition-colors"
                      >
                        <ClipboardPaste className="w-3.5 h-3.5 text-indigo-500" />
                        <span>클립보드 코드 붙여넣기</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          handleFormatCodeInEditor();
                          setActiveTopDialog(null);
                        }}
                        className="p-2 rounded-xl border border-stone-200 dark:border-stone-700 hover:bg-stone-50 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-300 text-xs flex items-center gap-2 transition-colors"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                        <span>들여쓰기 자동 정렬</span>
                      </button>
                    </div>
                  </div>

                  {/* Markdown 연동 */}
                  <div className="pt-2 border-t border-stone-100 dark:border-stone-800">
                    <div className="text-[11px] font-semibold text-stone-700 dark:text-stone-300 mb-1.5">
                      마크다운 (.md) 파일 연동
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setActiveTopDialog(null);
                          mdFileInputRef.current?.click();
                        }}
                        className="flex-1 py-1.5 px-2.5 rounded-xl border border-stone-200 dark:border-stone-700 hover:bg-stone-50 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-300 text-xs flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <FileDown className="w-3.5 h-3.5 text-amber-500" />
                        <span>MD 가져오기</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          handleCopyAsMarkdown();
                          setActiveTopDialog(null);
                        }}
                        className="flex-1 py-1.5 px-2.5 rounded-xl border border-stone-200 dark:border-stone-700 hover:bg-stone-50 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-300 text-xs flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <Download className="w-3.5 h-3.5 text-sky-500" />
                        <span>MD 복사</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          handleDownloadMarkdown();
                          setActiveTopDialog(null);
                        }}
                        className="flex-1 py-1.5 px-2.5 rounded-xl border border-stone-200 dark:border-stone-700 hover:bg-stone-50 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-300 text-xs flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <FileText className="w-3.5 h-3.5 text-emerald-500" />
                        <span>.md 다운로드</span>
                      </button>
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="pt-3 border-t border-stone-100 dark:border-stone-800 flex justify-end">
                    <button
                      type="button"
                      onClick={() => setActiveTopDialog(null)}
                      className="px-4 py-1.5 rounded-xl border border-stone-200 dark:border-stone-700 text-xs font-medium text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
                    >
                      닫기
                    </button>
                  </div>
                </div>
              )}

              {/* DIALOG 3: 이미지 삽입 (Image Dialog) */}
              {activeTopDialog === 'image' && (
                <div className="p-5 space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-stone-100 dark:border-stone-800">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                        <ImageIcon className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2">
                          이미지 삽입
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 font-medium">자동 리사이즈</span>
                        </h3>
                        <p className="text-[11px] text-stone-500 dark:text-stone-400">
                          컴퓨터 파일 업로드 또는 웹 이미지 URL 주소를 입력하세요
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTopDialog(null)}
                      className="p-1.5 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Tab Selector */}
                  <div className="flex rounded-xl bg-stone-100 dark:bg-[#141414] p-1">
                    <button
                      type="button"
                      onClick={() => setImageDialogTab('upload')}
                      className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5 ${
                        imageDialogTab === 'upload'
                          ? 'bg-white dark:bg-[#282828] text-stone-900 dark:text-stone-100 shadow-xs'
                          : 'text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200'
                      }`}
                    >
                      <Upload className="w-3.5 h-3.5 text-emerald-500" />
                      <span>컴퓨터 파일 업로드</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setImageDialogTab('url')}
                      className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5 ${
                        imageDialogTab === 'url'
                          ? 'bg-white dark:bg-[#282828] text-stone-900 dark:text-stone-100 shadow-xs'
                          : 'text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200'
                      }`}
                    >
                      <Link2 className="w-3.5 h-3.5 text-sky-500" />
                      <span>웹 이미지 URL 입력</span>
                    </button>
                  </div>

                  {/* Tab 1: Upload */}
                  {imageDialogTab === 'upload' && (
                    <div className="space-y-3">
                      <div
                        onClick={() => {
                          setActiveTopDialog(null);
                          fileInputRef.current?.click();
                        }}
                        className="p-6 border-2 border-dashed border-stone-300 dark:border-stone-700 hover:border-emerald-500 dark:hover:border-emerald-500 rounded-2xl flex flex-col items-center justify-center gap-2 cursor-pointer bg-stone-50/50 dark:bg-[#141414]/50 hover:bg-emerald-50/20 dark:hover:bg-emerald-950/20 transition-all text-center"
                      >
                        <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                          <Upload className="w-6 h-6" />
                        </div>
                        <div className="text-xs font-bold text-stone-800 dark:text-stone-200">
                          이미지 파일을 클릭하여 선택하거나 끌어다 놓으세요
                        </div>
                        <div className="text-[11px] text-stone-400">
                          PNG, JPG, GIF, WebP 지원 (자동 최적화 및 크기 조절 툴팁 지원)
                        </div>
                        <button
                          type="button"
                          className="mt-1 px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-xs"
                        >
                          파일 선택하기
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Tab 2: URL */}
                  {imageDialogTab === 'url' && (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-stone-700 dark:text-stone-300 mb-1">
                          웹 이미지 URL 주소
                        </label>
                        <input
                          type="url"
                          placeholder="https://example.com/photo.jpg"
                          value={imageDialogUrl}
                          onChange={(e) => setImageDialogUrl(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl border border-stone-300 dark:border-stone-700 bg-stone-50 dark:bg-[#181818] text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-stone-700 dark:text-stone-300 mb-1">
                          대체 텍스트 / 이미지 설명 (선택사항)
                        </label>
                        <input
                          type="text"
                          placeholder="이미지 설명"
                          value={imageDialogAlt}
                          onChange={(e) => setImageDialogAlt(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl border border-stone-300 dark:border-stone-700 bg-stone-50 dark:bg-[#181818] text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                        />
                      </div>
                      {imageDialogUrl && imageDialogUrl.startsWith('http') && (
                        <div className="p-2 rounded-xl bg-stone-100 dark:bg-[#141414] border border-stone-200 dark:border-stone-800 text-center">
                          <div className="text-[10px] text-stone-400 mb-1">미리보기</div>
                          <img
                            src={imageDialogUrl}
                            alt="미리보기"
                            className="max-h-36 mx-auto rounded-lg object-contain shadow-xs"
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = 'none';
                            }}
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {/* Image Width Size */}
                  <div className="pt-2 border-t border-stone-100 dark:border-stone-800">
                    <div className="text-[11px] font-semibold text-stone-700 dark:text-stone-300 mb-1.5">
                      삽입 너비 크기
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      {[
                        { label: '100% (전체 너비)', val: '100%' as const },
                        { label: '75% (중대형)', val: '75%' as const },
                        { label: '50% (나란히 배치)', val: '50%' as const },
                        { label: '30% (소형)', val: '30%' as const },
                      ].map((s) => (
                        <button
                          key={s.val}
                          type="button"
                          onClick={() => setImageDialogWidth(s.val)}
                          className={`py-1.5 px-2 rounded-lg text-xs border transition-colors ${
                            imageDialogWidth === s.val
                              ? 'bg-emerald-100 dark:bg-emerald-950/60 border-emerald-400 text-emerald-800 dark:text-emerald-300 font-semibold'
                              : 'bg-stone-50 dark:bg-[#252525] border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-700'
                          }`}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="pt-3 border-t border-stone-100 dark:border-stone-800 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setActiveTopDialog(null)}
                      className="px-4 py-2 rounded-xl border border-stone-200 dark:border-stone-700 text-xs font-medium text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
                    >
                      취소
                    </button>
                    {imageDialogTab === 'url' ? (
                      <button
                        type="button"
                        onClick={handleInsertImageUrl}
                        disabled={!imageDialogUrl.trim()}
                        className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-bold transition-colors shadow-sm flex items-center gap-1.5"
                      >
                        <ImageIcon className="w-3.5 h-3.5" />
                        <span>이미지 삽입하기</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setActiveTopDialog(null);
                          fileInputRef.current?.click();
                        }}
                        className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-colors shadow-sm flex items-center gap-1.5"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>파일 탐색기 열기</span>
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* DIALOG 4: 하이퍼링크 (Link Dialog) */}
              {activeTopDialog === 'link' && (
                <div className="p-5 space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-stone-100 dark:border-stone-800">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400">
                        <Link2 className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100">
                          하이퍼링크 삽입 / 편집
                        </h3>
                        <p className="text-[11px] text-stone-500 dark:text-stone-400">
                          웹 주소(URL) 링크를 연결합니다
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTopDialog(null)}
                      className="p-1.5 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-stone-700 dark:text-stone-300 mb-1">
                        연결할 웹 주소 (URL)
                      </label>
                      <input
                        type="text"
                        placeholder="https://example.com"
                        value={linkDialogUrl}
                        onChange={(e) => setLinkDialogUrl(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-stone-300 dark:border-stone-700 bg-stone-50 dark:bg-[#181818] text-xs focus:ring-2 focus:ring-sky-500 focus:outline-hidden"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-stone-700 dark:text-stone-300 mb-1">
                        표시할 링크 텍스트
                      </label>
                      <input
                        type="text"
                        placeholder="링크 이름 (비워둘 시 본문 텍스트 또는 URL 적용)"
                        value={linkDialogText}
                        onChange={(e) => setLinkDialogText(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-stone-300 dark:border-stone-700 bg-stone-50 dark:bg-[#181818] text-xs focus:ring-2 focus:ring-sky-500 focus:outline-hidden"
                      />
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer text-xs text-stone-700 dark:text-stone-300 select-none">
                      <input
                        type="checkbox"
                        checked={linkDialogNewTab}
                        onChange={(e) => setLinkDialogNewTab(e.target.checked)}
                        className="rounded border-stone-300 text-sky-500 focus:ring-sky-500 w-4 h-4"
                      />
                      <span>새 창(새 탭)에서 열기 (target="_blank")</span>
                    </label>
                  </div>

                  <div className="pt-3 border-t border-stone-100 dark:border-stone-800 flex items-center justify-between">
                    {editor && editor.isActive('link') ? (
                      <button
                        type="button"
                        onClick={() => {
                          editor.chain().focus().extendMarkRange('link').unsetLink().run();
                          setActiveTopDialog(null);
                          setToastMessage('✓ 링크가 제거되었습니다.');
                          setTimeout(() => setToastMessage(null), 2500);
                        }}
                        className="px-3 py-1.5 rounded-xl border border-rose-200 dark:border-rose-900/60 text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                      >
                        링크 제거
                      </button>
                    ) : <div />}
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setActiveTopDialog(null)}
                        className="px-4 py-2 rounded-xl border border-stone-200 dark:border-stone-700 text-xs font-medium text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
                      >
                        취소
                      </button>
                      <button
                        type="button"
                        onClick={handleApplyLink}
                        className="px-5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold transition-colors shadow-sm"
                      >
                        링크 적용
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* DIALOG 5: 표 테두리 및 서식 (Table Border Dialog) */}
              {activeTopDialog === 'border' && (() => {
                const activeAttrs = getActiveTableAttrs();
                const currentStyle = activeAttrs.borderStyle || 'all';
                const currentColor = activeAttrs.borderColor;

                return (
                  <div className="p-5 space-y-4">
                    <div className="flex items-center justify-between pb-3 border-b border-stone-100 dark:border-stone-800">
                      <div className="flex items-center gap-2.5">
                        <div className="p-2 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                          <Grid className="w-5 h-5" />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100">
                            표 테두리 설정
                          </h3>
                          <p className="text-[11px] text-stone-500 dark:text-stone-400">
                            선택한 표의 테두리 모양과 선 색상을 실시간으로 변경합니다
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setActiveTopDialog(null)}
                        className="p-1.5 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Border Styles */}
                    <div>
                      <div className="text-[11px] font-semibold text-stone-700 dark:text-stone-300 mb-2 flex items-center justify-between">
                        <span>테두리 스타일 선택</span>
                        <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">클릭 시 즉시 표에 반영</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setTableBorderStyle('all')}
                          className={`p-2.5 rounded-xl border flex items-center justify-between transition-all text-left ${
                            currentStyle === 'all'
                              ? 'border-amber-500 bg-amber-500/10 text-amber-900 dark:text-amber-200 ring-2 ring-amber-500/30 font-semibold'
                              : 'border-stone-200 dark:border-stone-700 hover:bg-stone-50 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-300'
                          }`}
                        >
                          <span className="flex items-center gap-2 text-xs">
                            <Grid className="w-4 h-4 text-amber-500" />
                            <span>모든 테두리 (격자)</span>
                          </span>
                          <span className="text-[10px] text-stone-400 font-mono">기본</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setTableBorderStyle('outer')}
                          className={`p-2.5 rounded-xl border flex items-center gap-2 transition-all text-xs text-left ${
                            currentStyle === 'outer'
                              ? 'border-sky-500 bg-sky-500/10 text-sky-900 dark:text-sky-200 ring-2 ring-sky-500/30 font-semibold'
                              : 'border-stone-200 dark:border-stone-700 hover:bg-stone-50 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-300'
                          }`}
                        >
                          <Square className="w-4 h-4 text-sky-500" />
                          <span>바깥쪽 테두리만</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setTableBorderStyle('thick')}
                          className={`p-2.5 rounded-xl border flex items-center gap-2 transition-all text-xs text-left ${
                            currentStyle === 'thick'
                              ? 'border-indigo-500 bg-indigo-500/10 text-indigo-900 dark:text-indigo-200 ring-2 ring-indigo-500/30 font-semibold'
                              : 'border-stone-200 dark:border-stone-700 hover:bg-stone-50 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-300'
                          }`}
                        >
                          <Square className="w-4 h-4 text-indigo-500 stroke-[2.5]" />
                          <span>굵은 바깥 테두리</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setTableBorderStyle('horizontal')}
                          className={`p-2.5 rounded-xl border flex items-center gap-2 transition-all text-xs text-left ${
                            currentStyle === 'horizontal'
                              ? 'border-emerald-500 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200 ring-2 ring-emerald-500/30 font-semibold'
                              : 'border-stone-200 dark:border-stone-700 hover:bg-stone-50 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-300'
                          }`}
                        >
                          <Rows className="w-4 h-4 text-emerald-500" />
                          <span>가로 구분선만</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setTableBorderStyle('none')}
                          className={`p-2.5 rounded-xl border flex items-center gap-2 transition-all text-xs col-span-2 text-left ${
                            currentStyle === 'none'
                              ? 'border-stone-500 bg-stone-500/10 text-stone-900 dark:text-stone-200 ring-2 ring-stone-500/30 font-semibold'
                              : 'border-stone-200 dark:border-stone-700 hover:bg-stone-50 dark:hover:bg-stone-800 text-stone-500 dark:text-stone-400'
                          }`}
                        >
                          <X className="w-4 h-4 text-stone-400" />
                          <span>테두리 없음 (편집 시 옅은 가이드 점선)</span>
                        </button>
                      </div>
                    </div>

                    {/* Line Colors */}
                    <div className="pt-2 border-t border-stone-100 dark:border-stone-800">
                      <div className="text-[11px] font-semibold text-stone-700 dark:text-stone-300 mb-2 flex items-center justify-between">
                        <span>테두리 선 색상</span>
                        {currentColor && (
                          <button
                            type="button"
                            onClick={() => setTableBorderColor('')}
                            className="text-[10px] text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 underline cursor-pointer"
                          >
                            기본 색상으로 초기화
                          </button>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {[
                          { color: '#d1d5db', name: '기본 연회색' },
                          { color: '#4b5563', name: '진한 회색' },
                          { color: '#0f172a', name: '흑색' },
                          { color: '#3b82f6', name: '블루' },
                          { color: '#f59e0b', name: '앰버' },
                          { color: '#10b981', name: '초록' },
                          { color: '#ef4444', name: '빨강' },
                          { color: '#8b5cf6', name: '보라' },
                        ].map((c) => {
                          const isSelected = currentColor?.toLowerCase() === c.color.toLowerCase() || (!currentColor && c.color === '#d1d5db');
                          return (
                            <button
                              key={c.color}
                              type="button"
                              onClick={() => setTableBorderColor(c.color)}
                              className={`w-7 h-7 rounded-full border border-stone-300 dark:border-stone-600 hover:scale-110 transition-all shadow-xs relative ${
                                isSelected ? 'ring-2 ring-offset-2 ring-amber-500 scale-110' : ''
                              }`}
                              style={{ backgroundColor: c.color }}
                              title={c.name}
                            />
                          );
                        })}

                        {/* Custom Color Input */}
                        <label
                          className="w-7 h-7 rounded-full border border-dashed border-stone-400 dark:border-stone-600 flex items-center justify-center cursor-pointer hover:scale-110 transition-transform relative overflow-hidden"
                          title="직접 색상 선택 (Color Picker)"
                        >
                          <input
                            type="color"
                            value={currentColor || '#3b82f6'}
                            onChange={(e) => setTableBorderColor(e.target.value)}
                            className="absolute -top-4 -left-4 w-16 h-16 opacity-0 cursor-pointer"
                          />
                          <span className="text-[10px] font-bold text-stone-600 dark:text-stone-300">+</span>
                        </label>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-stone-100 dark:border-stone-800 flex justify-end">
                      <button
                        type="button"
                        onClick={() => setActiveTopDialog(null)}
                        className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-bold transition-colors shadow-sm"
                      >
                        완료 및 닫기
                      </button>
                    </div>
                  </div>
                );
              })()}

              {/* DIALOG 6: 글자 색상 (Text Color Dialog) */}
              {activeTopDialog === 'textColor' && (
                <div className="p-5 space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-stone-100 dark:border-stone-800">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                        <Palette className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100">
                          글자 색상 선택
                        </h3>
                        <p className="text-[11px] text-stone-500 dark:text-stone-400">
                          {savedSelectionRef.current && savedSelectionRef.current.from !== savedSelectionRef.current.to
                            ? '선택된 텍스트 영역에 글꼴 색상을 적용합니다'
                            : '선택한 텍스트 또는 커서 위치의 글꼴 색상을 지정합니다'}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTopDialog(null)}
                      className="p-1.5 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-4 gap-2.5">
                    {[
                      { color: '#1c1917', name: '기본(검정)' },
                      { color: '#ef4444', name: '빨강' },
                      { color: '#f97316', name: '주황' },
                      { color: '#d97706', name: '황토' },
                      { color: '#10b981', name: '초록' },
                      { color: '#06b6d4', name: '청록' },
                      { color: '#3b82f6', name: '파랑' },
                      { color: '#6366f1', name: '남색' },
                      { color: '#8b5cf6', name: '보라' },
                      { color: '#ec4899', name: '핑크' },
                      { color: '#6b7280', name: '회색' },
                      { color: '#9ca3af', name: '연회색' },
                    ].map((item) => (
                      <button
                        key={item.color}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => handleApplyTextColor(item.color)}
                        className="p-2.5 rounded-xl border border-stone-200 dark:border-stone-700 hover:scale-105 transition-transform flex flex-col items-center gap-1.5 bg-stone-50 dark:bg-[#252525]"
                      >
                        <div
                          className="w-7 h-7 rounded-full border border-black/15 shadow-2xs"
                          style={{ backgroundColor: item.color }}
                        />
                        <span className="text-[11px] text-stone-600 dark:text-stone-300 font-medium">{item.name}</span>
                      </button>
                    ))}
                  </div>

                  <div className="pt-3 border-t border-stone-100 dark:border-stone-800 flex items-center justify-between">
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={handleResetTextColor}
                      className="px-3 py-1.5 rounded-xl border border-stone-200 dark:border-stone-700 text-xs font-medium text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
                    >
                      색상 초기화 (기본색)
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTopDialog(null)}
                      className="px-4 py-1.5 rounded-xl bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 text-xs font-bold transition-colors"
                    >
                      닫기
                    </button>
                  </div>
                </div>
              )}

              {/* DIALOG 7: 형광펜 (Highlight Dialog) */}
              {activeTopDialog === 'highlight' && (
                <div className="p-5 space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-stone-100 dark:border-stone-800">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                        <Highlighter className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100">
                          형광펜 배경색 선택
                        </h3>
                        <p className="text-[11px] text-stone-500 dark:text-stone-400">
                          {savedSelectionRef.current && savedSelectionRef.current.from !== savedSelectionRef.current.to
                            ? '선택된 텍스트 영역에 형광펜 배경색을 적용합니다'
                            : '선택된 텍스트 또는 커서 위치에 형광펜 강조 효과를 적용합니다'}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTopDialog(null)}
                      className="p-1.5 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-3 gap-2.5">
                    {[
                      { color: '#fef08a', name: '노랑 형광펜' },
                      { color: '#bbf7d0', name: '연두 형광펜' },
                      { color: '#bae6fd', name: '하늘 형광펜' },
                      { color: '#fbcfe8', name: '분홍 형광펜' },
                      { color: '#ddd6fe', name: '연보라 형광펜' },
                      { color: '#fed7aa', name: '살구 형광펜' },
                    ].map((item) => (
                      <button
                        key={item.color}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => handleApplyHighlight(item.color)}
                        className="p-3 rounded-xl border border-stone-200 dark:border-stone-700 hover:scale-105 transition-transform flex flex-col items-center gap-1.5 bg-stone-50 dark:bg-[#252525]"
                      >
                        <div
                          className="w-8 h-8 rounded-lg border border-black/10 shadow-2xs"
                          style={{ backgroundColor: item.color }}
                        />
                        <span className="text-xs text-stone-700 dark:text-stone-200 font-medium">{item.name}</span>
                      </button>
                    ))}
                  </div>

                  <div className="pt-3 border-t border-stone-100 dark:border-stone-800 flex items-center justify-between">
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={handleResetHighlight}
                      className="px-3 py-1.5 rounded-xl border border-stone-200 dark:border-stone-700 text-xs font-medium text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
                    >
                      형광펜 지우기
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTopDialog(null)}
                      className="px-4 py-1.5 rounded-xl bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 text-xs font-bold transition-colors"
                    >
                      닫기
                    </button>
                  </div>
                </div>
              )}
            </div>
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
                    {/* Text Color Picker */}
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

                    {/* Highlight / Background */}
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

                    {/* Clear Formatting */}
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
                  </div>

                  <div className="w-[1px] h-4 bg-stone-200 dark:bg-stone-800 mx-1" />

                  {/* Lists & Quotes */}
                  <div className="flex items-center gap-0.5">
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
                  {/* Table Insert Button with Interactive Matrix Picker */}
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

                  {/* Image Insert */}
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

                  <div className="w-[1px] h-4 bg-stone-200 dark:bg-stone-800 mx-1" />

                  {/* Code & Markdown Integrated Dropdown (With Direct Auto-Highlight on Selection) */}
                  <div className="relative inline-flex items-center">
                    <button
                      type="button"
                      onClick={() => {
                        if (editor && !editor.state.selection.empty) {
                          handleAutoHighlightSelection();
                        } else {
                          setActiveTopDialog(activeTopDialog === 'code' ? null : 'code');
                        }
                      }}
                      className={`px-2.5 py-1.5 rounded-l-lg flex items-center gap-1.5 transition-colors border-y border-l ${
                        editor.isActive('codeBlock') || activeTopDialog === 'code'
                          ? 'bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700 font-semibold'
                          : 'bg-white dark:bg-stone-800 hover:bg-stone-100 dark:hover:bg-stone-700/80 text-stone-700 dark:text-stone-200 border-stone-200 dark:border-stone-700'
                      }`}
                      title={editor && !editor.state.selection.empty ? '선택 영역 자동 감지 코드 블록으로 변환' : '코드 블록 및 MD 대화상자 열기'}
                    >
                      <Code className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                      <span className="font-medium">코드 & MD</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTopDialog(activeTopDialog === 'code' ? null : 'code')}
                      className={`px-1.5 py-1.5 rounded-r-lg border-y border-r transition-colors flex items-center justify-center ${
                        editor.isActive('codeBlock') || activeTopDialog === 'code'
                          ? 'bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700'
                          : 'bg-white dark:bg-stone-800 hover:bg-stone-100 dark:hover:bg-stone-700/80 text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200 border-stone-200 dark:border-stone-700'
                      }`}
                      title="코드 & MD 상세 옵션 메뉴 열기"
                    >
                      <ChevronDown className="w-3 h-3" />
                    </button>
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
                  {/* Table Border Button */}
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

        {/* Top Slim Progress Bar */}
        {loadingState.isLoading && (
          <div className="w-full h-1 bg-amber-100/50 dark:bg-stone-800 overflow-hidden relative">
            <div
              className="h-full bg-gradient-to-r from-amber-500 to-amber-400 transition-all duration-300 ease-out"
              style={{ width: `${loadingState.progress}%` }}
            />
          </div>
        )}

        {/* Scrollable Body Area */}
        <div className="flex-1 p-6 overflow-y-auto min-h-[350px] relative">
          {loadingState.isLoading ? (
            <div className="h-full min-h-[340px] flex flex-col items-center justify-center py-8 px-4 select-none">
              <div className="w-full max-w-md bg-white dark:bg-[#1e1e1e] rounded-2xl border border-stone-200/90 dark:border-[#333333] shadow-2xl p-6 md:p-8 text-center transition-all animate-in fade-in zoom-in-95 duration-200">
                {/* Top Badge & Icon */}
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-amber-500/10 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 mb-4 ring-8 ring-amber-500/5">
                  <Cpu className="w-7 h-7 animate-pulse" />
                </div>

                <h3 className="text-base font-bold text-stone-900 dark:text-stone-100 mb-1">
                  데이터 불러오는 중...
                </h3>
                <p className="text-xs text-stone-500 dark:text-stone-400 mb-5">
                  {loadingState.isLargeData ? '대용량 데이터 감지됨 — 백그라운드 고속 로더가 동작 중입니다.' : '에디터를 안전하게 초기화하고 있습니다.'}
                </p>

                {/* Data Stats Bar */}
                <div className="grid grid-cols-3 gap-2 p-2.5 rounded-xl bg-stone-50 dark:bg-[#252525] border border-stone-200/70 dark:border-[#333333] mb-5 text-center text-xs">
                  <div>
                    <div className="text-[10px] text-stone-400 font-medium">데이터 크기</div>
                    <div className="font-mono font-bold text-amber-600 dark:text-amber-400">{loadingState.sizeFormatted}</div>
                  </div>
                  <div className="border-x border-stone-200/60 dark:border-[#383838]">
                    <div className="text-[10px] text-stone-400 font-medium">텍스트 분량</div>
                    <div className="font-mono font-bold text-stone-700 dark:text-stone-300">{loadingState.charCount.toLocaleString()} 자</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-stone-400 font-medium">총 라인 수</div>
                    <div className="font-mono font-bold text-stone-700 dark:text-stone-300">약 {loadingState.lineCount.toLocaleString()} 줄</div>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="space-y-2 mb-6">
                  <div className="flex items-center justify-between text-xs font-semibold text-stone-700 dark:text-stone-300">
                    <span className="flex items-center gap-1.5">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-500" />
                      <span>{loadingState.stageText}</span>
                    </span>
                    <span className="font-mono text-amber-600 dark:text-amber-400">{loadingState.progress}%</span>
                  </div>
                  <div className="w-full h-2.5 bg-stone-100 dark:bg-[#2c2c2c] rounded-full overflow-hidden p-0.5 border border-stone-200/50 dark:border-[#3a3a3a]">
                    <div
                      className="h-full bg-gradient-to-r from-amber-500 to-amber-400 rounded-full transition-all duration-300 ease-out shadow-sm"
                      style={{ width: `${loadingState.progress}%` }}
                    />
                  </div>
                </div>

                {/* Step indicators */}
                <div className="grid grid-cols-4 gap-1 mb-6 text-[10px]">
                  <div className={`p-1.5 rounded-lg border transition-colors ${loadingState.stage >= 1 ? 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400 font-semibold' : 'border-stone-200 dark:border-[#2f2f2f] text-stone-400'}`}>
                    1. 버퍼 추출
                  </div>
                  <div className={`p-1.5 rounded-lg border transition-colors ${loadingState.stage >= 2 ? 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400 font-semibold' : 'border-stone-200 dark:border-[#2f2f2f] text-stone-400'}`}>
                    2. 구문 분석
                  </div>
                  <div className={`p-1.5 rounded-lg border transition-colors ${loadingState.stage >= 3 ? 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400 font-semibold' : 'border-stone-200 dark:border-[#2f2f2f] text-stone-400'}`}>
                    3. 트리 빌드
                  </div>
                  <div className={`p-1.5 rounded-lg border transition-colors ${loadingState.stage >= 4 ? 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400 font-semibold' : 'border-stone-200 dark:border-[#2f2f2f] text-stone-400'}`}>
                    4. 렌더 완료
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-between pt-2 border-t border-stone-100 dark:border-[#2c2c2c] text-xs">
                  <span className="text-[11px] text-stone-400 text-left">
                    💡 정규식 고속 샘플링 & 가속 적용됨
                  </span>
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-3 py-1.5 rounded-lg border border-stone-300 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-600 dark:text-stone-300 text-xs transition-colors"
                  >
                    취소 및 닫기
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <EditorContent editor={editor} />
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-2.5 border-t border-stone-200 dark:border-stone-800 bg-stone-50/60 dark:bg-stone-900/60 flex items-center justify-between text-xs text-stone-500">
          <div className="flex items-center gap-3">
            <span>💡 <strong>작성 팁:</strong> 자바(Java) 등 소스코드를 붙여넣으면 들여쓰기·띄어쓰기가 완벽히 보존된 코드 블록으로 자동 변환됩니다 (Tab 키 지원).</span>
            {!loadingState.isLoading && loadingState.sizeFormatted && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20 text-[11px] font-mono">
                <Zap className="w-3 h-3" />
                <span>데이터: {loadingState.sizeFormatted}</span>
              </span>
            )}
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
