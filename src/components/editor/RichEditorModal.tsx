import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { ReactNodeViewRenderer, useEditor, EditorContent } from '@tiptap/react';
import { DOMParser as ProseMirrorDOMParser } from '@tiptap/pm/model';
import { TextSelection, NodeSelection } from '@tiptap/pm/state';
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
import FontFamily from '@tiptap/extension-font-family';
import Link from '@tiptap/extension-link';
import Youtube from '@tiptap/extension-youtube';
import Gapcursor from '@tiptap/extension-gapcursor';
import { Color } from '@tiptap/extension-color';
import { Highlight } from '@tiptap/extension-highlight';
import { StickerExtension } from './StickerExtension';
import { CodeBlockComponent } from './CodeBlockComponent';
import { ImageComponent } from './ImageComponent';
import { fetchBridge, resolveApiUrl } from '../../services/httpBridge';
import { TableGridPicker } from './TableGridPicker';
import { RibbonToolbar } from './RibbonToolbar';
import { TopDialogs } from './TopDialogs';
import { TableRow as TableRowType, TableColumn } from '../../types';
import { cleanHtmlToPlainText, cleanTextValue } from '../../utils/textSanitizer';
import { detectLanguage, escapeHtml, formatJavaOrGeneralCode } from '../../utils/codeHighlighter';
import { delimitedTextToHtmlTable, convertTextDataToEditorContent } from '../../utils/csvParser';
import { compressAndResizeImage } from '../../utils/imageOptimizer';
import { wonbeeDexieDB } from '../../services/storage/dexieDb';
import { SelectOrCustomInput } from '../common/SelectOrCustomInput';
import { useStatusBar } from '../common/GlobalStatusBar';
import { autoFormatExpress, cleanLogNoise } from '../../utils/formatExpress';
import { useEditorTableActions } from '../../hooks/useEditorTableActions';
import { useEditorCodeActions } from '../../hooks/useEditorCodeActions';
import { useEditorFormatting } from '../../hooks/useEditorFormatting';
import { useEditorClipboard } from '../../hooks/useEditorClipboard';
import { getEffectiveColumnOptions } from '../../utils/columnOptionsUtils';
import { AiAgentDrawer } from '../agent/AiAgentDrawer';
import {
  markdownToHtml,
  htmlToMarkdown,
  isLikelyMarkdown,
  MARKDOWN_LANGUAGE_TEMPLATES,
  MarkdownLanguageTemplate,
} from '../../utils/markdownHelper';
import { analyzeContent } from '../../utils/contentParser';
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
  ChevronLeft,
  Plus,
  Trash2,
  Columns,
  Rows,
  FileText,
  Edit3,
  Database,
  ClipboardPaste,
  Copy,
  Scissors,
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
  AlignJustify,
  Indent,
  Outdent,
  Video,
  Save,
  AlertTriangle,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';

// Initialize Lowlight with common languages (Java, SQL, JS, TS, Python, JSON, HTML, Bash, etc.)
const baseLowlight = createLowlight(common);

const stripHtml = (html: string = ''): string => {
  if (!html) return '';
  // HTML 태그 제거 및 연속 공백 정리
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
};

// Register critical language aliases for Lowlight
try {
  baseLowlight.registerAlias('xml', ['html', 'htm', 'markup', 'svg', 'xhtml']);
  baseLowlight.registerAlias('javascript', ['js', 'jsx', 'mjs', 'cjs']);
  baseLowlight.registerAlias('typescript', ['ts', 'tsx']);
  baseLowlight.registerAlias('python', ['py']);
  baseLowlight.registerAlias('bash', ['sh', 'zsh', 'shell']);
  baseLowlight.registerAlias('c', ['pc', 'proc', 'h']);
  baseLowlight.registerAlias('cpp', ['cc', 'cxx', 'hpp']);
} catch (e) {
  console.warn('baseLowlight.registerAlias error:', e);
}

// High-performance LRU Cache for syntax highlighting AST results
const HIGHLIGHT_CACHE_LIMIT = 500;
const highlightCache = new Map<string, any>();

const getCachedHighlight = (targetLang: string, value: string, options?: any) => {
  const cacheKey = `${targetLang}::${value}`;
  if (highlightCache.has(cacheKey)) {
    const cached = highlightCache.get(cacheKey);
    // Refresh LRU position
    highlightCache.delete(cacheKey);
    highlightCache.set(cacheKey, cached);
    return cached;
  }

  const result = baseLowlight.highlight(targetLang, value, options);
  highlightCache.set(cacheKey, result);
  if (highlightCache.size > HIGHLIGHT_CACHE_LIMIT) {
    const oldestKey = highlightCache.keys().next().value;
    if (oldestKey !== undefined) {
      highlightCache.delete(oldestKey);
    }
  }
  return result;
};

const resolveLowlightLang = (lang: string, value: string): string => {
  const l = (lang || '').toLowerCase();
  if (l === 'html' || l === 'markup' || l === 'htm') return 'xml';
  if (l === 'js') return 'javascript';
  if (l === 'ts') return 'typescript';
  if (l === 'py') return 'python';
  if (l === 'sh') return 'bash';
  if (l === 'pc' || l === 'h') return 'c';
  // O(1) Early Return if explicit registered language is specified
  if (l && l !== 'auto' && baseLowlight.registered(l)) return l;

  // Only run language detection if language is 'auto' or unspecified
  const detected = detectLanguage(value);
  if (detected.isCode) {
    const dLang = detected.language;
    if (dLang === 'html' || dLang === 'markup' || dLang === 'xml') return 'xml';
    if (baseLowlight.registered(dLang)) return dLang;
  }

  const sample = value.length > 16000 ? value.slice(0, 16000) : value;
  if (/^\s*<!doctype\s+html\b/i.test(sample) || /^\s*<html\b/i.test(sample) || /<\s*(?:head|body|script|style)\b/i.test(sample)) {
    return 'xml';
  }
  if (/\b(?:package\s+[a-zA-Z0-9_.]+|import\s+java|public\s+class|class\s+\w+|public\s+static\s+void|System\.out|private\s+|protected\s+|@Override|public\s+static\s+final)\b/.test(sample)) {
    return 'java';
  }
  if (/\b(?:SELECT\s+|INSERT\s+INTO|UPDATE\s+|DELETE\s+FROM|CREATE\s+TABLE)\b/i.test(sample)) {
    return 'sql';
  }
  if (/\b(?:memcpy|memcmp|memset|malloc|free|printf|#include|typedef\s+struct|char\s*\*|sizeof\s*\()\b/.test(sample)) {
    return 'c';
  }
  return 'c';
};

// Safe high-performance wrapper for lowlight
const lowlight = {
  ...baseLowlight,
  registered: (aliasOrLanguage: string) => {
    if (!aliasOrLanguage) return false;
    if (aliasOrLanguage === 'auto') return true;
    const l = aliasOrLanguage.toLowerCase();
    if (l === 'html' || l === 'markup' || l === 'xml') return true;
    return Boolean(baseLowlight.registered(aliasOrLanguage));
  },
  highlight: (language: string, value: string, options?: any) => {
    if (!value) {
      return { type: 'root', children: [] };
    }
    // Safety guard for extreme memory exhaustion (> 3MB)
    if (value.length > 3000000) {
      return { type: 'root', children: [{ type: 'text', value }] };
    }
    try {
      const targetLang = resolveLowlightLang(language, value);
      return getCachedHighlight(targetLang, value, options);
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
      const targetLang = resolveLowlightLang('auto', value);
      return getCachedHighlight(targetLang, value, options);
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

/**
 * Sanitizes Excel/MS Office/Web HTML tables before pasting into TipTap editor.
 * Uses native DOMParser for single-pass tree traversal to prevent main-thread freezing (Jank)
 * when handling large tables with hundreds/thousands of cells.
 */
function sanitizeExcelTableHtml(htmlData: string): string {
  if (!htmlData || typeof htmlData !== 'string') return htmlData;

  if (typeof DOMParser !== 'undefined') {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlData, 'text/html');

      // 1. Single-pass removal of MS Office bloat, styles, meta, font, and script elements
      const bloatElements = doc.querySelectorAll('style, meta, font, o\\:p, script');
      bloatElements.forEach((el) => el.remove());

      const tables = doc.querySelectorAll('table');
      if (tables.length > 0) {
        tables.forEach((table) => {
          table.classList.add('wonbee-rich-table', 'wonbee-table-border-all');
          table.setAttribute('data-border-style', 'all');
          table.removeAttribute('border');

          // Clean up cells in a single DOM pass
          const cells = table.querySelectorAll('td, th');
          cells.forEach((cell) => {
            const styleAttr = cell.getAttribute('style') || '';
            if (styleAttr.includes('border: none') || styleAttr.includes('border:none')) {
              (cell as HTMLElement).style.border = '';
            }

            const paragraphs = cell.querySelectorAll('p');
            paragraphs.forEach((p) => {
              const textContent = p.textContent?.trim() || '';
              if (!textContent || textContent === ' ') {
                p.remove();
              } else {
                const textNode = doc.createTextNode(` ${textContent} `);
                p.replaceWith(textNode);
              }
            });

            const brs = cell.querySelectorAll('br');
            brs.forEach((br) => br.replaceWith(doc.createTextNode(' ')));
          });
        });

        return doc.body.innerHTML;
      }
    } catch (e) {
      console.warn('DOMParser table sanitize fallback:', e);
    }
  }

  // Fallback regex pass if DOMParser is unavailable
  return htmlData
    .replace(/<!--\[if[\s\S]*?<!\[endif\]-->/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<\/?o:p[^>]*>/gi, '')
    .replace(/<\/?font[^>]*>/gi, '');
}

/**
 * Saves image asset to Dexie offline or uploads it to the shared /api/assets store in server mode.
 * Prevents raw 100MB+ Base64 strings from polluting note database fields.
 */
async function saveOrUploadImageAsset(file: File, isServerMode: boolean): Promise<string> {
  const mimeType = file.type || 'image/png';
  const ext = mimeType.includes('png')
    ? 'png'
    : mimeType.includes('jpeg') || mimeType.includes('jpg')
    ? 'jpg'
    : mimeType.includes('webp')
    ? 'webp'
    : 'png';
  const assetId = `asset_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const filename = `${assetId}.${ext}`;

  if (isServerMode) {
    try {
      const { dataUrl } = await compressAndResizeImage(file);
      const res = await fetchBridge('/api/assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename,
          blobBase64: dataUrl,
          mimeType,
        }),
      });
      if (res.ok) {
        const json = await res.json();
        if (typeof json.url === 'string' && json.url.startsWith('asset://')) return json.url;
        if (json.url) return resolveApiUrl(json.url);
      }
    } catch (err) {
      console.warn('[Asset] Server asset upload failed, falling back to Dexie storage:', err);
    }
  }

  // Offline or Server Fallback -> Save to Dexie assets store as binary Blob
  const { dataUrl } = await compressAndResizeImage(file);
  const response = await fetch(dataUrl);
  const blob = await response.blob();

  await wonbeeDexieDB.saveAsset({
    id: assetId,
    blob,
    filename,
    mime_type: mimeType,
    created_at: Date.now(),
    is_dirty: 1,
  });

  return `asset://${assetId}`;
}

// Helper to compute combined inline styles for table cells/headers
const formatCellStyles = (attributes: Record<string, any>) => {
  const styles: string[] = [];
  if (attributes.textAlign) {
    styles.push(`text-align: ${attributes.textAlign}`);
  }
  if (attributes.backgroundColor) {
    styles.push(`background-color: ${attributes.backgroundColor}`);
  }
  if (attributes.cellBorder) {
    const color = attributes.cellBorderColor || '#475569';
    switch (attributes.cellBorder) {
      case 'none':
        styles.push('border: none !important');
        break;
      case 'thick':
        styles.push(`border: 2.5px solid ${color} !important`);
        break;
      case 'dashed':
        styles.push(`border: 1.5px dashed ${color} !important`);
        break;
      case 'bottom':
        styles.push('border-top: none !important; border-left: none !important; border-right: none !important');
        styles.push(`border-bottom: 2.5px solid ${color} !important`);
        break;
      case 'top':
        styles.push('border-bottom: none !important; border-left: none !important; border-right: none !important');
        styles.push(`border-top: 2.5px solid ${color} !important`);
        break;
      case 'left':
        styles.push('border-top: none !important; border-right: none !important; border-bottom: none !important');
        styles.push(`border-left: 2.5px solid ${color} !important`);
        break;
      case 'right':
        styles.push('border-top: none !important; border-left: none !important; border-bottom: none !important');
        styles.push(`border-right: 2.5px solid ${color} !important`);
        break;
      case 'all':
      default:
        styles.push(`border: 1.5px solid ${color} !important`);
        break;
    }
  }
  return styles.join('; ');
};

// Custom TableCell supporting background colors, text alignment and individual cell borders
const CustomTableCell = TableCell.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      textAlign: {
        default: null,
        parseHTML: (element) => element.style.textAlign || element.getAttribute('align') || element.getAttribute('data-align') || null,
        renderHTML: (attributes) => {
          if (!attributes.textAlign) return {};
          return {
            style: `text-align: ${attributes.textAlign}`,
            'data-align': attributes.textAlign,
          };
        },
      },
      backgroundColor: {
        default: null,
        parseHTML: (element) => element.style.backgroundColor || element.getAttribute('data-bg-color') || null,
        renderHTML: (attributes) => {
          const style = formatCellStyles(attributes);
          return {
            ...(style ? { style } : {}),
            ...(attributes.backgroundColor ? { 'data-bg-color': attributes.backgroundColor } : {}),
            ...(attributes.cellBorder ? { 'data-cell-border': attributes.cellBorder } : {}),
            ...(attributes.cellBorderColor ? { 'data-cell-border-color': attributes.cellBorderColor } : {}),
          };
        },
      },
      cellBorder: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-cell-border') || null,
        renderHTML: () => ({}),
      },
      cellBorderColor: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-cell-border-color') || null,
        renderHTML: () => ({}),
      },
    };
  },
});

// Custom TableHeader supporting background colors, text alignment and individual cell borders
const CustomTableHeader = TableHeader.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      textAlign: {
        default: null,
        parseHTML: (element) => element.style.textAlign || element.getAttribute('align') || element.getAttribute('data-align') || null,
        renderHTML: (attributes) => {
          if (!attributes.textAlign) return {};
          return {
            style: `text-align: ${attributes.textAlign}`,
            'data-align': attributes.textAlign,
          };
        },
      },
      backgroundColor: {
        default: null,
        parseHTML: (element) => element.style.backgroundColor || element.getAttribute('data-bg-color') || null,
        renderHTML: (attributes) => {
          const style = formatCellStyles(attributes);
          return {
            ...(style ? { style } : {}),
            ...(attributes.backgroundColor ? { 'data-bg-color': attributes.backgroundColor } : {}),
            ...(attributes.cellBorder ? { 'data-cell-border': attributes.cellBorder } : {}),
            ...(attributes.cellBorderColor ? { 'data-cell-border-color': attributes.cellBorderColor } : {}),
          };
        },
      },
      cellBorder: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-cell-border') || null,
        renderHTML: () => ({}),
      },
      cellBorderColor: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-cell-border-color') || null,
        renderHTML: () => ({}),
      },
    };
  },
});

// Custom TextStyle supporting custom font sizes
const CustomTextStyle = TextStyle.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      fontSize: {
        default: null,
        parseHTML: (element) => element.style.fontSize?.replace(/['"]+/g, '') || null,
        renderHTML: (attributes) => {
          if (!attributes.fontSize) {
            return {};
          }
          return {
            style: `font-size: ${attributes.fontSize};`,
          };
        },
      },
    };
  },
});

// Custom Table View with dynamic border style, border color, width, and drag resizing
class CustomTableView extends TableView {
  private customView?: any;
  private resizeHandle: HTMLDivElement | null = null;
  private insertBeforeBtn: HTMLDivElement | null = null;
  private insertAfterBtn: HTMLDivElement | null = null;
  private selectGripHandle: HTMLDivElement | null = null;
  private isResizing = false;
  private listeners: Array<{
    target: EventTarget;
    type: string;
    listener: EventListenerOrEventListenerObject;
    options?: any;
  }> = [];

  constructor(node: any, cellMinWidth: number, view?: any, HTMLAttributes: Record<string, any> = {}) {
    super(node, cellMinWidth, view, HTMLAttributes);
    this.customView = view;
    this.syncTableAttributes(node);
    this.initResizeHandle();
    this.initInsertButtons();
    this.initSelectGripHandle();
    this.initNodeSelectionListeners();
  }

  private addTrackedEventListener(
    target: EventTarget,
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: any
  ) {
    target.addEventListener(type, listener, options);
    this.listeners.push({ target, type, listener, options });
  }

  destroy() {
    this.listeners.forEach(({ target, type, listener, options }) => {
      try {
        target.removeEventListener(type, listener, options);
      } catch (_) {}
    });
    this.listeners = [];
    if (typeof (TableView.prototype as any).destroy === 'function') {
      (TableView.prototype as any).destroy.call(this);
    }
  }

  update(node: any) {
    const updated = super.update(node);
    if (updated) {
      this.syncTableAttributes(node);
      this.initInsertButtons();
      this.initSelectGripHandle();
    }
    return updated;
  }

  selectNode() {
    if (this.dom) {
      this.dom.classList.add('ProseMirror-selectednode', 'wonbee-table-selected');
    }
    if (this.table) {
      this.table.classList.add('wonbee-table-selected');
    }
  }

  deselectNode() {
    if (this.dom) {
      this.dom.classList.remove('ProseMirror-selectednode', 'wonbee-table-selected');
    }
    if (this.table) {
      this.table.classList.remove('wonbee-table-selected');
    }
  }

  private initSelectGripHandle() {
    if (typeof document === 'undefined' || !this.dom) return;
    if (this.selectGripHandle) return;

    const grip = document.createElement('div');
    grip.className = 'wonbee-table-select-grip';
    grip.setAttribute('contenteditable', 'false');
    grip.setAttribute('draggable', 'true');
    grip.setAttribute('data-drag-handle', 'true');
    grip.setAttribute('title', '클릭: 표 전체 선택 (파란색 블록 지정) / 드래그: 표 위치 이동');
    grip.innerHTML = `
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="9" cy="5" r="1.5"></circle><circle cx="15" cy="5" r="1.5"></circle>
        <circle cx="9" cy="12" r="1.5"></circle><circle cx="15" cy="12" r="1.5"></circle>
        <circle cx="9" cy="19" r="1.5"></circle><circle cx="15" cy="19" r="1.5"></circle>
      </svg>
    `;

    this.addTrackedEventListener(grip, 'mousedown', (e: Event) => {
      e.stopPropagation();
      if (!this.customView || typeof (this as any).getPos !== 'function') return;
      try {
        const pos = (this as any).getPos();
        if (typeof pos === 'number') {
          const { state, dispatch } = this.customView;
          const selection = NodeSelection.create(state.doc, pos);
          dispatch(state.tr.setSelection(selection));
          this.selectNode();
          this.customView.focus();
        }
      } catch (err) {
        console.warn('Table select grip error:', err);
      }
    });

    this.addTrackedEventListener(grip, 'click', (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      if (!this.customView || typeof (this as any).getPos !== 'function') return;
      try {
        const pos = (this as any).getPos();
        if (typeof pos === 'number') {
          const { state, dispatch } = this.customView;
          const selection = NodeSelection.create(state.doc, pos);
          dispatch(state.tr.setSelection(selection));
          this.selectNode();
          this.customView.focus();
        }
      } catch (err) {
        console.warn('Table select grip click error:', err);
      }
    });

    this.addTrackedEventListener(grip, 'dragstart', (e: Event) => {
      if (!this.customView || typeof (this as any).getPos !== 'function') return;
      try {
        const pos = (this as any).getPos();
        if (typeof pos === 'number') {
          const { state, dispatch } = this.customView;
          const selection = NodeSelection.create(state.doc, pos);
          dispatch(state.tr.setSelection(selection));
          this.selectNode();
          const dragEvent = e as DragEvent;
          if (dragEvent.dataTransfer) {
            dragEvent.dataTransfer.effectAllowed = 'move';
            dragEvent.dataTransfer.setData('text/plain', '[표]');
          }
        }
      } catch (_) {}
    });

    if (this.dom) {
      if (this.dom.firstChild) {
        this.dom.insertBefore(grip, this.dom.firstChild);
      } else {
        this.dom.appendChild(grip);
      }
      this.selectGripHandle = grip;
    }
  }

  private initNodeSelectionListeners() {
    if (typeof document === 'undefined' || !this.dom) return;

    // 테이블 본체 DND는 제한하고, 이동/선택은 상단 전용 핸들러(.wonbee-table-select-grip)로만 수행
    this.dom.removeAttribute('draggable');

    this.addTrackedEventListener(this.dom, 'mousedown', (e: Event) => {
      const mouseEvent = e as MouseEvent;
      const target = mouseEvent.target as HTMLElement;
      const isCellOrCellContent = Boolean(target && (target.tagName === 'TD' || target.tagName === 'TH' || target.closest('td, th')));

      // 셀 내부를 클릭하거나 Shift 키를 누른 셀 범위 선택 시에는 전체 선택(NodeSelection)을 타지 않음
      if (isCellOrCellContent) {
        return; // 셀 기본 선택 동작(CellSelection) 유지
      }

      // 표 외곽선 또는 여백 클릭 시에만 전체 노드 선택
      if (target === this.table || target === this.dom) {
        if (typeof (this as any).getPos === 'function' && this.customView) {
          try {
            const pos = (this as any).getPos();
            if (typeof pos === 'number') {
              const { state, dispatch } = this.customView;
              const selection = NodeSelection.create(state.doc, pos);
              dispatch(state.tr.setSelection(selection));
              this.customView.focus();
            }
          } catch (_) {}
        }
      }
    });
  }

  private initInsertButtons() {
    if (typeof document === 'undefined' || !this.dom) return;
    if (this.insertBeforeBtn && this.insertAfterBtn) return;

    const createInsertBtn = (position: 'before' | 'after') => {
      const bar = document.createElement('div');
      bar.className = `wonbee-table-insert-bar wonbee-table-insert-${position}`;
      bar.setAttribute('contenteditable', 'false');
      bar.setAttribute('role', 'button');
      bar.setAttribute(
        'title',
        position === 'before'
          ? '표 위에 빈 본문 줄(단락) 삽입하여 텍스트/데이터 입력 (단축키: Ctrl+Shift+Enter)'
          : '표 아래에 빈 본문 줄(단락) 삽입하여 텍스트/데이터 입력 (단축키: Ctrl+Enter)'
      );
      bar.innerHTML = `
        <div class="wonbee-table-insert-line">
          <span class="wonbee-table-insert-pill">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            <span>${position === 'before' ? '표 위에 빈 줄 삽입' : '표 아래에 빈 줄 삽입'}</span>
          </span>
        </div>
      `;

      this.addTrackedEventListener(bar, 'mousedown', (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
        if (!this.customView || typeof (this as any).getPos !== 'function') return;
        try {
          const pos = (this as any).getPos();
          if (typeof pos !== 'number') return;
          const { state, dispatch } = this.customView;
          const targetPos = position === 'before' ? pos : pos + this.node.nodeSize;
          const tr = state.tr.insert(targetPos, state.schema.nodes.paragraph.create());
          const resolved = tr.doc.resolve(targetPos + 1);
          tr.setSelection(TextSelection.near(resolved));
          dispatch(tr.scrollIntoView());
          this.customView.focus();
        } catch (err) {
          console.error('Table insert paragraph error:', err);
        }
      });

      return bar;
    };

    if (!this.insertBeforeBtn) {
      const beforeBar = createInsertBtn('before');
      this.dom.insertBefore(beforeBar, this.dom.firstChild);
      this.insertBeforeBtn = beforeBar;
    }

    if (!this.insertAfterBtn) {
      const afterBar = createInsertBtn('after');
      this.dom.appendChild(afterBar);
      this.insertAfterBtn = afterBar;
    }
  }

  private initResizeHandle() {
    if (typeof document === 'undefined') return;
    if (this.resizeHandle) return;

    const handle = document.createElement('div');
    handle.className = 'wonbee-table-resize-handle';
    handle.setAttribute('contenteditable', 'false');
    handle.setAttribute('title', '드래그하여 표 전체 너비 조절 (최대 크기 방지)');

    this.addTrackedEventListener(handle, 'mousedown', (e: Event) => {
      const mouseEvent = e as MouseEvent;
      mouseEvent.preventDefault();
      mouseEvent.stopPropagation();
      if (!this.table) return;

      this.isResizing = true;
      const startX = mouseEvent.clientX;
      const tableRect = this.table.getBoundingClientRect();
      const parentRect = this.dom?.parentElement?.getBoundingClientRect() || this.dom.getBoundingClientRect();
      const startWidth = tableRect.width;
      const parentWidth = parentRect.width || 800;

      const onMouseMove = (ev: MouseEvent) => {
        if (!this.isResizing) return;
        const deltaX = ev.clientX - startX;
        const newWidthPx = Math.max(160, Math.min(parentWidth, startWidth + deltaX));
        const pct = Math.round((newWidthPx / parentWidth) * 100);
        const widthVal = `${pct}%`;
        this.table.style.width = widthVal;
        this.table.setAttribute('data-table-width', widthVal);
      };

      const onMouseUp = () => {
        if (!this.isResizing) return;
        this.isResizing = false;
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);

        const finalWidth = this.table.getAttribute('data-table-width') || 'auto';
        if (this.customView && typeof (this as any).getPos === 'function') {
          try {
            const pos = (this as any).getPos();
            if (typeof pos === 'number') {
              this.customView.dispatch(
                this.customView.state.tr.setNodeMarkup(pos, null, {
                  ...this.node.attrs,
                  tableWidth: finalWidth,
                })
              );
            }
          } catch (_) {}
        }
      };

      this.addTrackedEventListener(window, 'mousemove', onMouseMove as EventListener);
      this.addTrackedEventListener(window, 'mouseup', onMouseUp as EventListener);
    });

    if (this.dom) {
      this.dom.appendChild(handle);
      this.resizeHandle = handle;
    }
  }

  private syncTableAttributes(node: any) {
    if (!this.table) return;
    const borderStyle = node.attrs?.borderStyle || 'all';
    const borderColor = node.attrs?.borderColor || '';
    const tableWidth = node.attrs?.tableWidth || 'auto';
    const tableAlign = node.attrs?.tableAlign || 'left';

    // Set width & max-width (preventing forced 100% max-size)
    this.table.setAttribute('data-table-width', tableWidth);
    this.table.setAttribute('data-table-align', tableAlign);

    if (tableWidth === 'auto') {
      this.table.style.width = 'auto';
    } else {
      this.table.style.width = tableWidth;
    }
    this.table.style.maxWidth = '100%';

    // Set table alignment
    if (tableAlign === 'center') {
      this.table.style.marginLeft = 'auto';
      this.table.style.marginRight = 'auto';
    } else if (tableAlign === 'right') {
      this.table.style.marginLeft = 'auto';
      this.table.style.marginRight = '0';
    } else {
      this.table.style.marginLeft = '0';
      this.table.style.marginRight = 'auto';
    }

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
      // CRITICAL: If the cell has an individual cell border applied, apply cell-specific styling and do NOT wipe it with table default
      const cellBorder = el.getAttribute('data-cell-border');
      if (cellBorder) {
        const cellColor = el.getAttribute('data-cell-border-color') || effectiveColor;
        switch (cellBorder) {
          case 'none':
            el.style.border = 'none';
            break;
          case 'thick':
            el.style.border = `2.5px solid ${cellColor}`;
            break;
          case 'dashed':
            el.style.border = `1.5px dashed ${cellColor}`;
            break;
          case 'bottom':
            el.style.borderTop = 'none';
            el.style.borderLeft = 'none';
            el.style.borderRight = 'none';
            el.style.borderBottom = `2.5px solid ${cellColor}`;
            break;
          case 'top':
            el.style.borderTop = `2.5px solid ${cellColor}`;
            el.style.borderLeft = 'none';
            el.style.borderRight = 'none';
            el.style.borderBottom = 'none';
            break;
          case 'left':
            el.style.borderTop = 'none';
            el.style.borderRight = 'none';
            el.style.borderBottom = 'none';
            el.style.borderLeft = `2.5px solid ${cellColor}`;
            break;
          case 'right':
            el.style.borderTop = 'none';
            el.style.borderLeft = 'none';
            el.style.borderBottom = 'none';
            el.style.borderRight = `2.5px solid ${cellColor}`;
            break;
          case 'all':
          default:
            el.style.border = `1.5px solid ${cellColor}`;
            break;
        }
        return;
      }

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
  selectable: false,
  draggable: false,
  addOptions() {
    return {
      ...this.parent?.(),
      allowTableNodeSelection: false,
      View: CustomTableView,
    };
  },
  addKeyboardShortcuts() {
    return {
      ...this.parent?.(),
      'Mod-Enter': () => {
        const { state, dispatch } = this.editor.view;
        const { $from } = state.selection;
        for (let d = $from.depth; d > 0; d--) {
          const node = $from.node(d);
          if (node.type.name === 'table') {
            const targetPos = $from.after(d);
            const tr = state.tr.insert(targetPos, state.schema.nodes.paragraph.create());
            const resolved = tr.doc.resolve(targetPos + 1);
            tr.setSelection(TextSelection.near(resolved));
            dispatch(tr.scrollIntoView());
            this.editor.view.focus();
            return true;
          }
        }
        return false;
      },
      'Shift-Mod-Enter': () => {
        const { state, dispatch } = this.editor.view;
        const { $from } = state.selection;
        for (let d = $from.depth; d > 0; d--) {
          const node = $from.node(d);
          if (node.type.name === 'table') {
            const targetPos = $from.before(d);
            const tr = state.tr.insert(targetPos, state.schema.nodes.paragraph.create());
            const resolved = tr.doc.resolve(targetPos + 1);
            tr.setSelection(TextSelection.near(resolved));
            dispatch(tr.scrollIntoView());
            this.editor.view.focus();
            return true;
          }
        }
        return false;
      },
    };
  },
  addAttributes() {
    return {
      ...this.parent?.(),
      tableWidth: {
        default: 'auto',
        parseHTML: (element) => element.getAttribute('data-table-width') || (element.style.width && element.style.width !== '100%' ? element.style.width : 'auto'),
        renderHTML: (attributes) => {
          const w = attributes.tableWidth || 'auto';
          return {
            'data-table-width': w,
            style: w !== 'auto' ? `width: ${w}; max-width: 100%;` : 'width: auto; max-width: 100%;',
          };
        },
      },
      tableAlign: {
        default: 'left',
        parseHTML: (element) => element.getAttribute('data-table-align') || 'left',
        renderHTML: (attributes) => ({
          'data-table-align': attributes.tableAlign || 'left',
        }),
      },
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
  // O(1) Map Lookup for Columns
  const columnMap = useMemo(() => {
    const map = new Map<string, TableColumn>();
    (columns || []).forEach((col) => {
      map.set(col.id, col);
    });
    return map;
  }, [columns]);

  const primaryColumn = useMemo(() => {
    return columns.find((c) => c.isPrimaryKey) || columns[0];
  }, [columns]);
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
  const [isAiAgentDrawerOpen, setIsAiAgentDrawerOpen] = useState(false);
  
  // Top-level modal popup state (rendered at the very top of rich editor container, never clipped or constrained by toolbar overflow)
  const [activeTopDialog, setActiveTopDialog] = useState<
    'table' | 'code' | 'image' | 'video' | 'link' | 'border' | 'textColor' | 'highlight' | 'md_paste' | null
  >(null);

  // Video Dialog state
  const [videoDialogUrl, setVideoDialogUrl] = useState('');

  // Editor Position & Selection Metrics for Modal Footer
  const [editorMetrics, setEditorMetrics] = useState({
    line: 1,
    col: 1,
    selectedChars: 0,
    selectedBytes: 0,
  });

  // Table Border Dialog scope ('cell' for selected cell(s), 'table' for entire table)
  const [borderScope, setBorderScope] = useState<'cell' | 'table'>('cell');

  // Code & Markdown Dialog Tab ('templates' | 'md_paste' | 'tools')
  const [codeDialogTab, setCodeDialogTab] = useState<'templates' | 'md_paste' | 'tools'>('templates');

  // Right-Click Context Menu State
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    isInTable: boolean;
  } | null>(null);

  useEffect(() => {
    if (!contextMenu) return;

    const handleOutsideClick = (e: Event) => {
      const popupEl = document.getElementById('rich-editor-context-menu');
      if (popupEl && popupEl.contains(e.target as Node)) {
        return;
      }
      setContextMenu(null);
    };

    // Attach capture phase listeners to close menu on outside clicks/scrolls
    const timer = setTimeout(() => {
      document.addEventListener('pointerdown', handleOutsideClick, true);
      document.addEventListener('scroll', handleOutsideClick, true);
      window.addEventListener('contextmenu', handleOutsideClick, true);
    }, 10);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('pointerdown', handleOutsideClick, true);
      document.removeEventListener('scroll', handleOutsideClick, true);
      window.removeEventListener('contextmenu', handleOutsideClick, true);
    };
  }, [contextMenu]);

  // Markdown & Data (Excel/CSV/TSV/TXT) Paste & Apply Dialog states
  const [mdPasteInputText, setMdPasteInputText] = useState('');
  const [mdPasteMode, setMdPasteMode] = useState<'insert' | 'replace'>('insert');
  const [mdPasteActiveTab, setMdPasteActiveTab] = useState<'input' | 'preview'>('input');
  const [dataPasteFormat, setDataPasteFormat] = useState<'auto' | 'csv' | 'md' | 'txt'>('auto');
  const [dataPasteDelimiter, setDataPasteDelimiter] = useState<'auto' | 'tab' | 'comma' | 'pipe' | 'semicolon' | 'space'>('auto');
  const [dataPasteHasHeader, setDataPasteHasHeader] = useState<boolean>(true);
  const [dataPasteOutputType, setDataPasteOutputType] = useState<'table' | 'md_table' | 'code_block' | 'plain'>('table');
  const [dataPasteTableWidth, setDataPasteTableWidth] = useState<string>('auto');

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

  // Horizontal scroll state & controls for '서식 편집 대상' tabs
  const targetTabsScrollRef = useRef<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkTabsScroll = useCallback(() => {
    const el = targetTabsScrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    const el = targetTabsScrollRef.current;
    if (!el) return;
    checkTabsScroll();
    el.addEventListener('scroll', checkTabsScroll, { passive: true });
    window.addEventListener('resize', checkTabsScroll);
    return () => {
      el.removeEventListener('scroll', checkTabsScroll);
      window.removeEventListener('resize', checkTabsScroll);
    };
  }, [checkTabsScroll, richTargets]);

  // Scroll active tab into view when selectedTargetId changes
  useEffect(() => {
    const el = targetTabsScrollRef.current;
    if (!el) return;
    const activeBtn = el.querySelector(`[data-target-id="${selectedTargetId}"]`);
    if (activeBtn && typeof (activeBtn as HTMLElement).scrollIntoView === 'function') {
      (activeBtn as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }
  }, [selectedTargetId]);

  const scrollTabs = useCallback((direction: 'left' | 'right') => {
    const el = targetTabsScrollRef.current;
    if (!el) return;
    el.scrollBy({ left: direction === 'left' ? -150 : 150, behavior: 'smooth' });
  }, []);

  // Helper to format content for TipTap editor using common analyzeContent utility
  const formatContentForEditor = useCallback((rawContent: string): string => {
    if (!rawContent || typeof rawContent !== 'string') return '';
    const trimmed = rawContent.trim();
    if (!trimmed) return '';

    const parsed = analyzeContent(rawContent);

    // 1. If Markdown, parse to HTML
    if (parsed.isMarkdown) {
      return markdownToHtml(rawContent);
    }

    // 2. If single pure code block, format as code block
    if (parsed.isPureCode) {
      const formatted = formatJavaOrGeneralCode(parsed.code);
      return `<pre><code class="language-${parsed.codeLanguage}">${escapeHtml(formatted)}</code></pre>`;
    }

    // 3. If it already has complex HTML or pre/code blocks, preserve HTML
    if (trimmed.includes('<pre') || trimmed.includes('<code') || (trimmed.includes('<') && trimmed.includes('>'))) {
      return rawContent;
    }

    // 4. Multi-line plain text fallback: wrap in paragraphs
    if (rawContent.includes('\n')) {
      const lines = rawContent.split('\n');
      return lines.map((line) => `<p>${escapeHtml(line) || '<br>'}</p>`).join('');
    }

    return escapeHtml(rawContent);
  }, []);

  // Manual Save & Unsaved Changes State
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(row?.updatedAt || null);
  const [showExitConfirm, setShowExitConfirm] = useState<boolean>(false);
  const lastSavedSnapshotRef = useRef<string>('');

  // Sync state when modal opens or row/initialTargetId changes
  useEffect(() => {
    if (row && isOpen) {
      const sanitized = sanitizeRowData(row.data);
      setCurrentRowData(sanitized);
      setRichContent(row.richContent || '');
      
      const targetId = resolveTargetId(initialTargetId);
      setSelectedTargetId(targetId);
      selectedTargetIdRef.current = targetId;

      lastSavedSnapshotRef.current = JSON.stringify({
        data: sanitized,
        richContent: row.richContent || '',
      });
      setHasUnsavedChanges(false);
      setLastSavedAt(row.updatedAt || null);
      setShowExitConfirm(false);
    }
  }, [row?.id, isOpen, initialTargetId, columns, sanitizeRowData, resolveTargetId]);

  // TipTap Editor instance reference
  const editorRef = useRef<any>(null);

  // Explicit Save Handler - Only saves when the user clicks save or uses Ctrl+S
  const handleSave = useCallback(async (): Promise<boolean> => {
    if (!row) return false;
    setIsSaving(true);
    try {
      let latestData = { ...currentRowDataRef.current };
      let latestRichContent = richContentRef.current;

      const ed = editorRef.current;
      if (ed) {
        const html = ed.getHTML();
        const currentTarget = selectedTargetIdRef.current;
        if (currentTarget === '__richContent__') {
          latestRichContent = html;
          setRichContent(html);
          richContentRef.current = html;
        } else {
          const targetCol = columnMap.get(currentTarget);
          const hasRichFormatting =
            targetCol?.type === 'richText' ||
            /<\s*(?:table|thead|tbody|tr|td|th|img|sticker-node|h[1-6]|ul|ol|li|blockquote|pre|code|strong|b|em|i|u|s|del|mark|span|a|hr)\b/i.test(html) ||
            /style\s*=\s*["']/i.test(html) ||
            /data-color\s*=/i.test(html) ||
            html.includes('data-type=') ||
            html.includes('sticker');
          const valToStore = hasRichFormatting ? html : cleanHtmlToPlainText(html);
          latestData[currentTarget] = valToStore;
          setCurrentRowData((prev) => ({ ...prev, [currentTarget]: valToStore }));
          currentRowDataRef.current = latestData;
        }
      }

      const saveTime = Date.now();
      const updatedRow: TableRowType = {
        ...row,
        data: latestData,
        richContent: latestRichContent,
        updatedAt: saveTime,
      };

      await onSaveRow(updatedRow);
      setHasUnsavedChanges(false);
      lastSavedSnapshotRef.current = JSON.stringify({
        data: latestData,
        richContent: latestRichContent,
      });
      setLastSavedAt(saveTime);
      setToastMessage('✓ 저장되었습니다.');
      setTimeout(() => setToastMessage(null), 2500);
      return true;
    } catch (err) {
      console.error('Save failed:', err);
      setToastMessage('⚠ 저장 중 오류가 발생했습니다.');
      setTimeout(() => setToastMessage(null), 3000);
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [row, columns, onSaveRow]);

  // Request close: show confirmation dialog if modified, otherwise close immediately
  const handleRequestClose = useCallback(() => {
    if (hasUnsavedChanges) {
      setShowExitConfirm(true);
    } else {
      onClose();
    }
  }, [hasUnsavedChanges, onClose]);

  // Keyboard shortcuts: Ctrl+S to save, Escape to close/confirm
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        e.stopPropagation();
        handleSave();
        return;
      }

      if (e.key === 'Escape') {
        if (contextMenu) {
          e.preventDefault();
          e.stopPropagation();
          setContextMenu(null);
        } else if (showExitConfirm) {
          e.preventDefault();
          e.stopPropagation();
          setShowExitConfirm(false);
        } else if (activeTopDialog) {
          e.preventDefault();
          e.stopPropagation();
          setActiveTopDialog(null);
        } else {
          e.preventDefault();
          handleRequestClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTopDialog, showExitConfirm, contextMenu, handleSave, handleRequestClose]);

  // Warn on browser tab close/reload if there are unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges && isOpen) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges, isOpen]);

  // TipTap Editor instance
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        codeBlock: false,
        gapcursor: false,
      }),
      CodeBlockLowlight.extend({
        draggable: true,
        selectable: true,
        addAttributes() {
          return {
            ...this.parent?.(),
            width: {
              default: 100,
              parseHTML: (element) => element.getAttribute('data-code-width') || element.style.width || '100%',
              renderHTML: (attributes) => {
                if (!attributes.width) return {};
                return {
                  'data-code-width': attributes.width,
                  style: attributes.width !== '100%' ? `width: ${attributes.width}; max-width: 100%;` : undefined,
                };
              },
            },
            height: {
              default: null,
              parseHTML: (element) => element.getAttribute('data-code-height') || element.style.height || null,
              renderHTML: (attributes) => {
                if (!attributes.height) return {};
                return {
                  'data-code-height': attributes.height,
                  style: `height: ${attributes.height}; max-height: ${attributes.height};`,
                };
              },
            },
            align: {
              default: 'left',
              parseHTML: (element) => element.getAttribute('data-code-align') || 'left',
              renderHTML: (attributes) => {
                if (!attributes.align) return {};
                return {
                  'data-code-align': attributes.align,
                };
              },
            },
          };
        },
        addNodeView() {
          return ReactNodeViewRenderer(CodeBlockComponent);
        },
      }).configure({
        lowlight,
        defaultLanguage: 'auto',
      }),
      Underline,
      Gapcursor,
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
      CustomTable.configure({
        resizable: true,
        allowTableNodeSelection: false,
        View: CustomTableView,
        HTMLAttributes: {
          class: 'wonbee-rich-table',
        },
      }),
      TableRow,
      CustomTableHeader,
      CustomTableCell,
      TextAlign.configure({
        types: ['heading', 'paragraph', 'tableHeader', 'tableCell'],
      }),
      CustomTextStyle,
      FontFamily,
      Color,
      Highlight.configure({
        multicolor: true,
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: {
          class: 'text-amber-600 dark:text-amber-400 underline hover:text-amber-700 dark:hover:text-amber-300 transition-colors cursor-pointer',
          target: '_blank',
          rel: 'noopener noreferrer',
        },
      }),
      Youtube.configure({
        inline: false,
        width: 640,
        height: 360,
        HTMLAttributes: {
          class: 'rounded-xl overflow-hidden my-3 max-w-full shadow-md border border-stone-200 dark:border-stone-800',
        },
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
      handleDOMEvents: {
        contextmenu: (view, event) => {
          event.preventDefault();
          event.stopPropagation();
          const target = event.target as HTMLElement;

          // Dual check for table context: DOM element closest + ProseMirror depth check
          let inTableDom = false;
          if (target) {
            inTableDom = Boolean(target.closest('table, td, th, .tableWrapper'));
          }

          let inTableProse = false;
          try {
            const { $from } = view.state.selection;
            for (let d = $from.depth; d > 0; d--) {
              if ($from.node(d).type.name === 'table') {
                inTableProse = true;
                break;
              }
            }
          } catch (_) {}

          const isInTable = inTableDom || inTableProse;

          setTimeout(() => {
            setContextMenu({
              x: event.clientX,
              y: event.clientY,
              isInTable,
            });
          }, 0);
          return true;
        },
        mousedown: (view, event) => {
          const target = event.target as HTMLElement;
          if (!target) return false;

          const isCellOrCellContent = Boolean(target.tagName === 'TD' || target.tagName === 'TH' || target.closest('td, th'));

          // 셀 내부에서 발생한 클릭/Shift+클릭은 ProseMirror의 셀렉션(CellSelection)으로 넘김
          if (isCellOrCellContent) {
            return false;
          }

          return false;
        },
      },
      transformPastedHTML: (html) => {
        if (
          html &&
          (html.includes('<table') ||
            html.includes('xmlns:x="urn:schemas-microsoft-com:office:excel"') ||
            (html.includes('<tr') && html.includes('<td')))
        ) {
          return sanitizeExcelTableHtml(html);
        }
        return html;
      },
      handleKeyDown: (view, event) => {
        const { state, dispatch } = view;
        const { selection } = state;

        // 1. Backspace key handling: when inside an empty paragraph before a block node
        if (event.key === 'Backspace' && selection.empty) {
          const { $from } = selection;
          const parent = $from.parent;

          if (parent.type.name === 'paragraph' && parent.content.size === 0) {
            const nextNode = $from.nodeAfter || state.doc.nodeAt($from.after());
            if (
              nextNode &&
              (nextNode.type.name === 'table' ||
                nextNode.type.name === 'codeBlock' ||
                nextNode.type.name === 'image')
            ) {
              event.preventDefault();
              const tr = state.tr.delete($from.before(), $from.after());
              dispatch(tr);
              return true;
            }
          }
        }

        // 2. Delete key handling: when at the end of a paragraph right before a block node
        if (event.key === 'Delete' && selection.empty) {
          const { $from } = selection;
          const nextNode = $from.nodeAfter;
          if (
            nextNode &&
            (nextNode.type.name === 'table' ||
              nextNode.type.name === 'codeBlock' ||
              nextNode.type.name === 'image')
          ) {
            event.preventDefault();
            const blockPos = $from.pos;
            const tr = state.tr.setSelection(NodeSelection.create(state.doc, blockPos));
            dispatch(tr);
            return true;
          }
        }

        // 3. Tab key support: insert 4 spaces for code indenting instead of losing focus
        if (event.key === 'Tab') {
          event.preventDefault();
          view.dispatch(view.state.tr.insertText('    '));
          return true;
        }
        return false;
      },
      handlePaste: (view, event) => {
        const { state } = view;
        const { $from } = state.selection;

        // 1. Check if current cursor is inside codeBlock
        const isInCodeBlock = $from.depth > 0 && $from.node($from.depth).type.name === 'codeBlock';

        if (isInCodeBlock) {
          event.preventDefault();
          const text = event.clipboardData?.getData('text/plain') || '';
          if (text) {
            const tr = state.tr.insertText(text);
            view.dispatch(tr);
          }
          return true;
        }

        const clipboardData = event.clipboardData;
        if (!clipboardData) return false;

        const ed = editorRef.current || (view as any).editor;
        const plainText = clipboardData.getData('text/plain') || '';

        // Format Express smart paste check for raw logs or minified messy strings
        if (plainText && (plainText.includes('INFO') || plainText.includes('DEBUG') || plainText.includes('ERROR') || plainText.length > 300)) {
          const cleaned = cleanLogNoise(plainText);
          if (cleaned !== plainText || (plainText.trim().startsWith('{') && plainText.includes('\n') === false)) {
            const { formatted, detectedType } = autoFormatExpress(plainText);
            event.preventDefault();
            const lang = detectedType === 'JSON' ? 'json' : detectedType.includes('XML') ? 'markup' : detectedType === 'SQL' ? 'sql' : 'plaintext';
            if (ed) {
              ed.chain().focus().insertContent(`<pre><code class="language-${lang}">${escapeHtml(formatted)}</code></pre>`).run();
              setToastMessage(`✨ Format Express: [${detectedType}] 스마트 정제 및 노이즈 제거 완료`);
              setTimeout(() => setToastMessage(null), 3500);
              return true;
            }
          }
        }

        // 0. Copied file check: User copied a .md / .markdown / .txt file in OS and pressed Ctrl+V
        const files = clipboardData.files;
        if (files && files.length > 0) {
          const mdFile = Array.from(files).find(
            (f) =>
              f.name.endsWith('.md') ||
              f.name.endsWith('.markdown') ||
              f.name.endsWith('.txt') ||
              f.type === 'text/markdown' ||
              f.type === 'text/plain'
          );
          if (mdFile) {
            event.preventDefault();
            const reader = new FileReader();
            reader.onload = (ev) => {
              const text = (ev.target?.result as string) || '';
              const html = markdownToHtml(text);
              const targetEd = editorRef.current || (view as any).editor;
              if (targetEd) {
                targetEd.chain().focus().insertContent(html).run();
                setToastMessage(`✓ 복사한 마크다운 파일 (${mdFile.name})이 서식 및 코드 하이라이트와 함께 적용되었습니다.`);
                setTimeout(() => setToastMessage(null), 3000);
              }
            };
            reader.readAsText(mdFile);
            return true;
          }
        }

        const htmlData = clipboardData.getData('text/html') || '';

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
          const cleanTableHtml = sanitizeExcelTableHtml(htmlData);

          if (ed) {
            ed.chain().focus().insertContent(cleanTableHtml).run();
            setToastMessage('✓ 엑셀/스프레드시트 표 데이터(정제 완료) 붙여넣기 완료');
            setTimeout(() => setToastMessage(null), 2500);
            return true;
          }
        }

        // 2. Tab-separated spreadsheet data check (Excel / Sheets plain text copy)
        if (plainText && plainText.includes('\t') && plainText.includes('\n')) {
          const tableHtml = delimitedTextToHtmlTable(plainText);
          if (tableHtml) {
            event.preventDefault();
            if (ed) {
              ed.chain().focus().insertContent(tableHtml).run();
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
              const isFileProtocol = typeof window !== 'undefined' && window.location.protocol.startsWith('file:');
              const isServerMode = !isFileProtocol && localStorage.getItem('wonbee_use_server') !== 'false';
              saveOrUploadImageAsset(file, isServerMode).then((imgSrc) => {
                const targetEd = editorRef.current || (view as any).editor;
                if (targetEd) {
                  targetEd.chain().focus().setImage({
                    src: imgSrc,
                    alt: 'Pasted Image',
                    ...({ width: '50%', layout: 'inline' } as any),
                  }).run();
                  setToastMessage('✓ 이미지가 안전하게 스토리지에 저장되어 삽입되었습니다.');
                  setTimeout(() => setToastMessage(null), 2500);
                }
              });
              return true;
            }
          }
        }

        if (!plainText) return false;

        const insertHtmlSafely = (htmlContent: string) => {
          const targetEd = editorRef.current || (view as any).editor;
          if (targetEd && targetEd.commands && typeof targetEd.commands.insertContent === 'function') {
            targetEd.chain().focus().insertContent(htmlContent).run();
            return true;
          }
          try {
            const parser = ProseMirrorDOMParser.fromSchema(state.schema);
            const div = document.createElement('div');
            div.innerHTML = htmlContent;
            const slice = parser.parseSlice(div);
            view.dispatch(state.tr.replaceSelection(slice).scrollIntoView());
            return true;
          } catch (err) {
            console.warn('Fallback HTML insertion error:', err);
            return false;
          }
        };

        // 4. Markdown content check: maintain full formatting (headings, tables, task lists, blockquotes, code blocks)
        if (isLikelyMarkdown(plainText)) {
          event.preventDefault();
          const html = markdownToHtml(plainText);
          const inserted = insertHtmlSafely(html);
          if (inserted) {
            setToastMessage('✓ 마크다운(.md) 서식 및 코드 블록이 자동으로 인식되어 완벽하게 적용되었습니다.');
            setTimeout(() => setToastMessage(null), 3000);
            return true;
          }
        }

        return false;
      },
    },
    onUpdate: ({ editor }) => {
      setHasUnsavedChanges(true);
      const html = editor.getHTML();
      const currentTarget = selectedTargetIdRef.current;
      if (currentTarget === '__richContent__') {
        setRichContent(html);
      } else {
        const targetCol = columnMap.get(currentTarget);
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

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

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

  // Custom Editor Hooks Integration
  const {
    handleInsertNewTable,
    getActiveTableAttrs,
    setTableBorderStyle,
    setTableBorderColor,
    handleInsertParagraphBeforeTable,
    handleInsertParagraphAfterTable,
    getActiveTableCellAttrs,
    applyCellBorder,
    applyCellBorderColor,
  } = useEditorTableActions({
    editor,
    setActiveTopDialog,
    setToastMessage,
  });

  const {
    getSelectedText,
    handleAutoHighlightSelection,
    handleInsertBashBlock,
    handleInsertSqlBlock,
    handleInsertJavaBlock,
    handleInsertCBlock,
    handleInsertPythonBlock,
    handleFormatCodeInEditor,
  } = useEditorCodeActions({
    editor,
    setToastMessage,
  });

  const {
    setFontSize,
    setFontFamily,
    handleIndent,
    handleOutdent,
    handleApplyTextColor,
    handleResetTextColor,
    handleApplyHighlight,
    handleResetHighlight,
  } = useEditorFormatting({
    editor,
    setActiveTopDialog,
    setToastMessage,
    savedSelectionRef,
  });

  const {
    handleContextCopy,
    handleContextCut,
    handleContextPaste,
    handleContextDeleteSelection,
  } = useEditorClipboard({
    editor,
    contextMenu,
    setContextMenu,
    setToastMessage,
    getSelectedText,
  });

  const { updateMetrics } = useStatusBar();

  useEffect(() => {
    if (!editor) return;
    let timerId: any = null;

    const updateSelectionMetrics = () => {
      if (timerId) return;
      timerId = requestAnimationFrame(() => {
        timerId = null;
        if (!editor || editor.isDestroyed) return;
        const { state } = editor;
        const { from, to, empty } = state.selection;
        const textBefore = state.doc.textBetween(0, from, '\n');
        const lineNum = textBefore.split('\n').length;
        const lastNewlineIdx = textBefore.lastIndexOf('\n');
        const colNum = lastNewlineIdx === -1 ? from + 1 : from - lastNewlineIdx;

        const selectedText = empty ? '' : state.doc.textBetween(from, to, '\n');
        const encoder = new TextEncoder();
        const selectedBytes = encoder.encode(selectedText).length;

        const fullHtml = editor.getHTML();
        const totalBytes = encoder.encode(fullHtml).length;

        setEditorMetrics({
          line: lineNum,
          col: colNum,
          selectedChars: selectedText.length,
          selectedBytes,
        });

        updateMetrics({
          line: lineNum,
          col: colNum,
          selectedChars: selectedText.length,
          selectedBytes,
          totalBytes,
          lastModifiedAt: row?.updatedAt || Date.now(),
        });
      });
    };

    editor.on('selectionUpdate', updateSelectionMetrics);
    editor.on('update', updateSelectionMetrics);
    updateSelectionMetrics();

    return () => {
      if (timerId) cancelAnimationFrame(timerId);
      editor.off('selectionUpdate', updateSelectionMetrics);
      editor.off('update', updateSelectionMetrics);
    };
  }, [editor, row?.updatedAt, updateMetrics]);

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

  const handleCellChange = (columnId: string, val: any) => {
    setHasUnsavedChanges(true);
    const targetCol = columnMap.get(columnId);
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
//   const handleAutoHighlightSelection = useCallback(() => {
//     if (!editor) return;
//     const selected = getSelectedText();
//     if (!selected || selected.trim() === '') {
//       // Nothing selected: toggle default code block
//       editor.chain().focus().toggleCodeBlock().run();
//       return;
//     }
//
//     const langDetection = detectLanguage(selected);
//     const hasJavaPattern = /\b(package\s+[a-zA-Z0-9_.]+|import\s+java|public\s+class|class\s+\w+|public\s+static\s+void|System\.out|public\s+static\s+final)\b/.test(selected);
//     const isShebang = /^(#!\/(bin|usr\/bin|usr\/local\/bin)\/(bash|sh|zsh|env\s+bash|env\s+sh))/m.test(selected);
//
//     let detectedLang = langDetection.isCode ? langDetection.language : 'plaintext';
//     if (isShebang || /\b(sudo\s+|chmod\s+|curl\s+|docker\s+|npm\s+run|git\s+|grep\s+|echo\s+)/.test(selected)) {
//       detectedLang = 'bash';
//     } else if (hasJavaPattern) {
//       detectedLang = 'java';
//     } else if (/\b(SELECT\s+|INSERT\s+INTO|UPDATE\s+|DELETE\s+FROM|CREATE\s+TABLE)\b/i.test(selected)) {
//       detectedLang = 'sql';
//     }
//
//     if (editor.isActive('codeBlock')) {
//       editor.chain().focus().updateAttributes('codeBlock', { language: detectedLang }).run();
//     } else {
//       editor.chain().focus().setCodeBlock({ language: detectedLang }).run();
//     }

  const handleApplyMarkdownPaste = useCallback(() => {
    handleApplyPastedData(mdPasteInputText, mdPasteMode);
  }, [mdPasteInputText, mdPasteMode]);

  const handleSaveAndClose = useCallback(async () => {
    const ok = await handleSave();
    if (ok) {
      setShowExitConfirm(false);
      onClose();
    }
  }, [handleSave, onClose]);

  const handleDiscardAndClose = useCallback(() => {
    setShowExitConfirm(false);
    setHasUnsavedChanges(false);
    onClose();
  }, [onClose]);

  const handleMdFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && editor) {
      const reader = new FileReader();
      reader.onload = (uploadEvent) => {
        const text = (uploadEvent.target?.result as string) || '';
        if (activeTopDialog === 'code' || activeTopDialog === 'md_paste') {
          setMdPasteInputText(text);
          setCodeDialogTab('md_paste');
          setMdPasteActiveTab('input');
          setToastMessage(`✓ 파일 (${file.name}) 내용을 데이터 붙여넣기 창에 불러왔습니다.`);
        } else {
          const converted = convertTextDataToEditorContent(text, {
            tableWidth: dataPasteTableWidth,
          });
          const content = converted.detectedFormat === 'md'
            ? markdownToHtml(converted.markdownEquivalent || text)
            : converted.html;
          editor.chain().focus().insertContent(content).run();
          setToastMessage(`✓ 파일 (${file.name}) 데이터 불러오기 완료!`);
        }
        setTimeout(() => setToastMessage(null), 3000);
      };
      reader.readAsText(file);
    }
    if (mdFileInputRef.current) mdFileInputRef.current.value = '';
  };

  const handleFormatExpress = useCallback(() => {
    if (!editor) return;
    const { from, to, empty } = editor.state.selection;
    const targetText = empty
      ? editor.state.doc.textBetween(0, editor.state.doc.content.size, '\n')
      : editor.state.doc.textBetween(from, to, '\n');

    if (!targetText.trim()) {
      setToastMessage('⚠ 정제할 텍스트가 없습니다.');
      setTimeout(() => setToastMessage(null), 2000);
      return;
    }

    const { formatted, detectedType } = autoFormatExpress(targetText);
    const lang = detectedType === 'JSON' ? 'json' : detectedType.includes('XML') ? 'markup' : detectedType === 'SQL' ? 'sql' : 'plaintext';

    if (empty) {
      editor.commands.setContent(`<pre><code class="language-${lang}">${escapeHtml(formatted)}</code></pre>`);
    } else {
      editor.chain().focus().deleteSelection().insertContent(`<pre><code class="language-${lang}">${escapeHtml(formatted)}</code></pre>`).run();
    }
    setToastMessage(`✨ Format Express: [${detectedType}] 스마트 정제가 완료되었습니다.`);
    setTimeout(() => setToastMessage(null), 3000);
  }, [editor, setToastMessage]);

  const handlePasteCodeFromClipboard = async () => {
    if (!editor) return;
    try {
      const text = await navigator.clipboard.readText();
      if (!text) return;
      const langDetection = detectLanguage(text);
      const language = langDetection.isCode ? langDetection.language : 'auto';
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

  const handleInsertMarkdownTemplate = useCallback((tpl: MarkdownLanguageTemplate) => {
    if (!editor) return;
    const html = markdownToHtml(tpl.markdown);
    editor.chain().focus().insertContent(html).run();
    setToastMessage(`✓ ${tpl.name} 마크다운 템플릿이 삽입되었습니다.`);
    setTimeout(() => setToastMessage(null), 3000);
  }, [editor, setToastMessage]);

  const handleDownloadMarkdownTemplate = useCallback((tpl: MarkdownLanguageTemplate) => {
    const blob = new Blob([tpl.markdown], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = tpl.filename;
    a.click();
    URL.revokeObjectURL(url);
    setToastMessage(`✓ ${tpl.filename} 마크다운 파일이 다운로드되었습니다.`);
    setTimeout(() => setToastMessage(null), 3000);
  }, [setToastMessage]);

  const handleInsertVideo = useCallback(() => {
    if (!editor || !videoDialogUrl.trim()) return;
    const url = videoDialogUrl.trim();
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
      (editor.commands as any).setYoutubeVideo({ src: url });
    } else {
      editor.chain().focus().insertContent(`<video controls src="${escapeHtml(url)}" class="rounded-xl max-w-full my-3 shadow-md"></video><p></p>`).run();
    }
    setActiveTopDialog(null);
    setVideoDialogUrl('');
    setToastMessage('✓ 동영상이 삽입되었습니다.');
    setTimeout(() => setToastMessage(null), 2500);
  }, [editor, videoDialogUrl, setActiveTopDialog, setToastMessage]);

  const openVideoDialog = useCallback(() => {
    setVideoDialogUrl('');
    setActiveTopDialog('video');
  }, [setActiveTopDialog]);

  const handleCopyAsMarkdown = () => {
    if (!editor) return;
    const html = editor.getHTML();
    const md = htmlToMarkdown(html);
    navigator.clipboard.writeText(md);
    setToastMessage('✓ 현재 내용이 마크다운(.md)으로 복사되었습니다.');
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handlePasteMarkdownFromClipboard = async () => {
    const ed = editorRef.current || editor;
    if (!ed) return;
    try {
      const text = await navigator.clipboard.readText();
      if (text && text.trim()) {
        const converted = convertTextDataToEditorContent(text, {
          format: dataPasteFormat,
          delimiter: dataPasteDelimiter,
          hasHeader: dataPasteHasHeader,
          outputType: dataPasteOutputType,
          tableWidth: dataPasteTableWidth,
        });
        const content = converted.detectedFormat === 'md'
          ? markdownToHtml(converted.markdownEquivalent || text)
          : converted.html;
        ed.chain().focus().insertContent(content).run();
        setToastMessage(`✓ 클립보드 데이터(${converted.detectedFormat.toUpperCase()})가 서식과 함께 적용되었습니다!`);
        setTimeout(() => setToastMessage(null), 3000);
        return;
      }
    } catch (err) {
      console.warn('Direct clipboard read restricted or empty:', err);
    }
    // If clipboard is empty or permission requires UI interaction, open dedicated paste dialog
    setMdPasteInputText('');
    setMdPasteActiveTab('input');
    setActiveTopDialog('md_paste');
    setToastMessage('데이터 붙여넣기 창이 열렸습니다. 엑셀, CSV, TXT, MD 텍스트를 붙여넣으세요.');
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleApplyPastedData = (text: string, mode: 'insert' | 'replace' = mdPasteMode) => {
    const ed = editorRef.current || editor;
    if (!ed || !text.trim()) return;

    const converted = convertTextDataToEditorContent(text, {
      format: dataPasteFormat,
      delimiter: dataPasteDelimiter,
      hasHeader: dataPasteHasHeader,
      outputType: dataPasteOutputType,
      tableWidth: dataPasteTableWidth,
    });

    let contentToInsert = converted.html;
    let successMsg = '';

    if (converted.detectedFormat === 'md') {
      contentToInsert = markdownToHtml(converted.markdownEquivalent || text);
      successMsg = '✓ 마크다운(.md) 서식 및 코드 블록이 적용되었습니다.';
    } else if (converted.detectedFormat === 'csv') {
      if (dataPasteOutputType === 'md_table' && converted.markdownEquivalent) {
        contentToInsert = markdownToHtml(converted.markdownEquivalent);
      }
      successMsg = `✓ 엑셀/CSV 데이터 (${converted.colCount}열 × ${converted.rowCount}행)가 표로 변환되어 적용되었습니다!`;
    } else {
      successMsg = '✓ 텍스트 데이터가 성공적으로 적용되었습니다.';
    }

    if (mode === 'replace') {
      ed.chain().focus().setContent(contentToInsert).run();
      setToastMessage(`${successMsg} (전체 교체)`);
    } else {
      ed.chain().focus().insertContent(contentToInsert).run();
      setToastMessage(successMsg);
    }
    setActiveTopDialog(null);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleApplyPastedMarkdown = (text: string, mode: 'insert' | 'replace' = 'insert') => {
    handleApplyPastedData(text, mode);
  };

  // Helper to adjust active table attributes (tableWidth, tableAlign, borderStyle, borderColor)
  const setTableAttributes = (attrs: { tableWidth?: string; tableAlign?: string; borderStyle?: string; borderColor?: string }) => {
    if (!editor) return;
    const { state, dispatch } = editor.view;
    const { $from } = state.selection;
    for (let depth = $from.depth; depth > 0; depth--) {
      const node = $from.node(depth);
      if (node.type.name === 'table') {
        const pos = $from.before(depth);
        dispatch(
          state.tr.setNodeMarkup(pos, null, {
            ...node.attrs,
            ...attrs,
          })
        );
        return;
      }
    }
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

  const primaryTitle = primaryColumn ? String(currentRowData[primaryColumn.id] || '새 데이터 항목') : '데이터 세부 정보';
  const currentTargetName = richTargets.find((t) => t.id === selectedTargetId)?.name || '내용';

  if (!isOpen || !row) return null;

  return (
    <div
      id="rich-editor-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/60 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={handleRequestClose}
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

        {/* TOP LEVEL DIALOGS OVERLAY */}
        <TopDialogs
          activeTopDialog={activeTopDialog}
          setActiveTopDialog={setActiveTopDialog}
          editor={editor}
          tableDialogRows={tableDialogRows}
          setTableDialogRows={setTableDialogRows}
          tableDialogCols={tableDialogCols}
          setTableDialogCols={setTableDialogCols}
          tableDialogHeaderRow={tableDialogHeaderRow}
          setTableDialogHeaderRow={setTableDialogHeaderRow}
          handleInsertNewTable={handleInsertNewTable}
          codeDialogTab={codeDialogTab}
          setCodeDialogTab={setCodeDialogTab}
          mdPasteInputText={mdPasteInputText}
          setMdPasteInputText={setMdPasteInputText}
          mdPasteActiveTab={mdPasteActiveTab}
          setMdPasteActiveTab={setMdPasteActiveTab}
          dataPasteFormat={dataPasteFormat}
          setDataPasteFormat={setDataPasteFormat}
          dataPasteDelimiter={dataPasteDelimiter}
          setDataPasteDelimiter={setDataPasteDelimiter}
          dataPasteHasHeader={dataPasteHasHeader}
          setDataPasteHasHeader={setDataPasteHasHeader}
          dataPasteOutputType={dataPasteOutputType}
          setDataPasteOutputType={setDataPasteOutputType}
          dataPasteTableWidth={dataPasteTableWidth}
          setDataPasteTableWidth={setDataPasteTableWidth}
          handleApplyMarkdownPaste={handleApplyMarkdownPaste}
          handleAutoHighlightSelection={handleAutoHighlightSelection}
          handleInsertCBlock={handleInsertCBlock}
          handleInsertSqlBlock={handleInsertSqlBlock}
          handleInsertJavaBlock={handleInsertJavaBlock}
          handleInsertPythonBlock={handleInsertPythonBlock}
          handleInsertBashBlock={handleInsertBashBlock}
          handlePasteCodeFromClipboard={handlePasteCodeFromClipboard}
          handleFormatCodeInEditor={handleFormatCodeInEditor}
          handlePasteMarkdownFromClipboard={handlePasteMarkdownFromClipboard}
          handleCopyAsMarkdown={handleCopyAsMarkdown}
          handleInsertMarkdownTemplate={handleInsertMarkdownTemplate}
          handleDownloadMarkdownTemplate={handleDownloadMarkdownTemplate}
          MARKDOWN_LANGUAGE_TEMPLATES={MARKDOWN_LANGUAGE_TEMPLATES}
          imageDialogTab={imageDialogTab}
          setImageDialogTab={setImageDialogTab}
          imageDialogUrl={imageDialogUrl}
          setImageDialogUrl={setImageDialogUrl}
          imageDialogAlt={imageDialogAlt}
          setImageDialogAlt={setImageDialogAlt}
          imageDialogWidth={imageDialogWidth}
          setImageDialogWidth={setImageDialogWidth}
          handleInsertImageSubmit={handleInsertImageUrl}
          handleImageUpload={handleImageUpload}
          linkDialogUrl={linkDialogUrl}
          setLinkDialogUrl={setLinkDialogUrl}
          linkDialogText={linkDialogText}
          setLinkDialogText={setLinkDialogText}
          linkDialogNewTab={linkDialogNewTab}
          setLinkDialogNewTab={setLinkDialogNewTab}
          handleInsertLinkSubmit={handleApplyLink}
          videoDialogUrl={videoDialogUrl}
          setVideoDialogUrl={setVideoDialogUrl}
          handleInsertVideoSubmit={handleInsertVideo}
          showExitConfirm={showExitConfirm}
          setShowExitConfirm={setShowExitConfirm}
          handleSaveAndClose={handleSaveAndClose}
          handleDiscardAndClose={handleDiscardAndClose}
          savedSelectionRef={savedSelectionRef}
          setToastMessage={setToastMessage}
        />

        {/* Drag Over Overlay */}

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
              <h2 className="text-base font-bold text-stone-900 dark:text-stone-100 truncate max-w-md whitespace-nowrap overflow-hidden text-ellipsis">
                {stripHtml(primaryTitle)}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* Save Status Indicator */}
            {isSaving ? (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs bg-amber-500/10 text-amber-700 dark:text-amber-400 font-medium">
                <Loader2 className="w-3.5 h-3.5 text-amber-500 animate-spin" />
                <span>저장 중...</span>
              </div>
            ) : hasUnsavedChanges ? (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs bg-amber-500/15 border border-amber-500/30 text-amber-800 dark:text-amber-300 font-semibold shadow-xs">
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                <span>수정됨 (저장 안 됨)</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs bg-stone-100 dark:bg-stone-800/80 text-stone-600 dark:text-stone-300">
                <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                <span className="text-stone-500 dark:text-stone-400 font-medium">
                  {lastSavedAt ? `저장 완료 (${new Date(lastSavedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })})` : '저장 완료'}
                </span>
              </div>
            )}

            {/* Manual Save Button */}
            <button
              type="button"
              onClick={() => handleSave()}
              disabled={isSaving}
              className={`hidden px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs ${
                hasUnsavedChanges
                  ? 'bg-amber-500 hover:bg-amber-400 text-stone-950 ring-2 ring-amber-400/40 font-extrabold cursor-pointer'
                  : 'bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 text-stone-600 dark:text-stone-300'
              }`}
              title="저장하기 (단축키: Ctrl+S)"
            >
              {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              <span>저장</span>
              <kbd className="hidden md:inline-block px-1 py-0.5 rounded text-[10px] bg-black/10 dark:bg-white/10 text-current font-mono">
                Ctrl+S
              </kbd>
            </button>

            {/* Fullscreen Toggle */}
            <button
              type="button"
              onClick={toggleFullscreen}
              className="p-1.5 rounded-lg text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
              title={isFullscreen ? '창 크기 복원' : '전체 화면'}
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            {/* Close Button */}
            <button
              type="button"
              onClick={handleRequestClose}
              className="p-1.5 rounded-lg text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
              title="닫기 (ESC)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Target Field Switcher Tabs (e.g. 내용 | 처리방법 | 추가 상세 노트) */}
        <div className="px-4 sm:px-6 py-2 bg-stone-100/70 dark:bg-stone-900/60 border-b border-stone-200 dark:border-stone-800 flex items-center justify-between gap-3 shrink-0">
          <div className="flex-1 min-w-0 flex items-center gap-1.5 relative">
            <span className="text-[11px] font-bold text-stone-500 dark:text-stone-400 mr-1 flex items-center gap-1 shrink-0 select-none">
              <Edit3 className="w-3.5 h-3.5 text-amber-500" />
              서식 편집 대상:
            </span>

            {/* Scroll Left Button if overflowed */}
            {canScrollLeft && (
              <button
                type="button"
                onClick={() => scrollTabs('left')}
                className="p-1 rounded-md bg-white dark:bg-stone-800 shadow-xs border border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300 hover:text-amber-600 hover:bg-stone-50 shrink-0 z-10 transition-colors"
                title="왼쪽으로 스크롤"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Scrollable Container */}
            <div
              ref={targetTabsScrollRef}
              onWheel={(e) => {
                if (e.deltaY !== 0 && e.currentTarget.scrollWidth > e.currentTarget.clientWidth) {
                  e.currentTarget.scrollLeft += e.deltaY;
                }
              }}
              className="flex-1 min-w-0 flex items-center gap-1.5 overflow-x-auto custom-scrollbar py-0.5 scroll-smooth"
            >
              {richTargets.map((field) => {
                const isSelected = selectedTargetId === field.id;
                return (
                  <button
                    key={field.id}
                    data-target-id={field.id}
                    type="button"
                    onClick={() => handleSwitchTarget(field.id)}
                    title={field.name}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center transition-all shrink-0 max-w-[130px] sm:max-w-[150px] md:max-w-[170px] min-h-[34px] border ${
                      isSelected
                        ? 'bg-amber-500 text-stone-950 border-amber-500 shadow-sm font-bold ring-1 ring-amber-400/50'
                        : 'bg-white dark:bg-stone-800 text-stone-600 dark:text-stone-300 border-stone-200/80 dark:border-stone-700/60 hover:bg-stone-200 dark:hover:bg-stone-700'
                    }`}
                  >
                    <span
                      className="line-clamp-2 leading-[1.25] text-[11px] break-words text-left"
                      style={{
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        wordBreak: 'break-word',
                      }}
                    >
                      {field.name}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Scroll Right Button if overflowed */}
            {canScrollRight && (
              <button
                type="button"
                onClick={() => scrollTabs('right')}
                className="p-1 rounded-md bg-white dark:bg-stone-800 shadow-xs border border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300 hover:text-amber-600 hover:bg-stone-50 shrink-0 z-10 transition-colors"
                title="오른쪽으로 스크롤"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <div className="text-[11px] text-amber-700 dark:text-amber-400 font-medium whitespace-nowrap hidden sm:flex items-center gap-1">
              <span>현재</span>
              <strong className="max-w-[120px] md:max-w-[160px] truncate inline-block align-bottom" title={currentTargetName}>
                [{currentTargetName}]
              </strong>
              <span>서식 편집 중</span>
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

            <button
              type="button"
              onClick={() => setIsAiAgentDrawerOpen(true)}
              className="px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 bg-amber-500/15 text-amber-800 dark:text-amber-300 hover:bg-amber-500/25 border border-amber-300/80 dark:border-amber-700/80 transition-colors shadow-2xs"
              title="AI를 통해 행 데이터(상태, 우선순위, 마감일, 비고 등)를 자연어로 수정합니다."
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>AI 속성 수정</span>
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
        <RibbonToolbar
          editor={editor}
          activeRibbonTab={activeRibbonTab}
          setActiveRibbonTab={setActiveRibbonTab}
          activeTopDialog={activeTopDialog}
          setActiveTopDialog={setActiveTopDialog}
          savedSelectionRef={savedSelectionRef}
          setFontFamily={setFontFamily}
          setFontSize={setFontSize}
          handleIndent={handleIndent}
          handleOutdent={handleOutdent}
          handleAutoHighlightSelection={handleAutoHighlightSelection}
          handleInsertSticker={handleInsertSticker}
          handlePasteMarkdownFromClipboard={handlePasteMarkdownFromClipboard}
          handleImageUpload={handleImageUpload}
          handleMdFileUpload={handleMdFileUpload}
          openTableDialog={openTableDialog}
          openImageDialog={openImageDialog}
          openVideoDialog={openVideoDialog}
          openLinkDialog={openLinkDialog}
          setCodeDialogTab={setCodeDialogTab}
          setIsAiAgentDrawerOpen={setIsAiAgentDrawerOpen}
          handleFormatExpress={handleFormatExpress}
          columnMap={columnMap}
          columns={columns}
        />

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
                title="선택한 행 삭제"
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
                title="선택한 열 삭제"
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
              <div className="w-[1px] h-3.5 bg-amber-300 dark:bg-amber-800 mx-0.5" />
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-stone-500 font-medium">표 너비:</span>
                {[
                  { label: '자동', val: 'auto', title: '내용에 맞춰 자동 조절 (최대 크기 강제 방지)' },
                  { label: '50%', val: '50%', title: '에디터 너비의 50%' },
                  { label: '75%', val: '75%', title: '에디터 너비의 75%' },
                  { label: '100%', val: '100%', title: '에디터 너비의 100%' },
                ].map((w) => (
                  <button
                    key={w.val}
                    type="button"
                    onClick={() => setTableAttributes({ tableWidth: w.val })}
                    className="px-1.5 py-0.5 rounded bg-white dark:bg-[#252525] border border-amber-300 dark:border-amber-700 hover:bg-amber-50 dark:hover:bg-[#303030] text-[10px] font-medium transition-colors"
                    title={w.title}
                  >
                    {w.label}
                  </button>
                ))}
              </div>
              <div className="w-[1px] h-3.5 bg-amber-300 dark:bg-amber-800 mx-0.5" />
              <div className="flex items-center gap-0.5" title="표 정렬 위치">
                <button
                  type="button"
                  onClick={() => setTableAttributes({ tableAlign: 'left' })}
                  className="p-1 rounded bg-white dark:bg-[#252525] border border-amber-300 dark:border-amber-700 hover:bg-amber-50 dark:hover:bg-[#303030] text-stone-700 dark:text-stone-300 transition-colors"
                  title="표 왼쪽 정렬"
                >
                  <AlignLeft className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => setTableAttributes({ tableAlign: 'center' })}
                  className="p-1 rounded bg-white dark:bg-[#252525] border border-amber-300 dark:border-amber-700 hover:bg-amber-50 dark:hover:bg-[#303030] text-stone-700 dark:text-stone-300 transition-colors"
                  title="표 가운데 정렬"
                >
                  <AlignCenter className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => setTableAttributes({ tableAlign: 'right' })}
                  className="p-1 rounded bg-white dark:bg-[#252525] border border-amber-300 dark:border-amber-700 hover:bg-amber-50 dark:hover:bg-[#303030] text-stone-700 dark:text-stone-300 transition-colors"
                  title="표 오른쪽 정렬"
                >
                  <AlignRight className="w-3 h-3" />
                </button>
              </div>
              <div className="w-[1px] h-3.5 bg-amber-300 dark:bg-amber-800 mx-0.5" />
              {/* Insert paragraph before & after table */}
              <div className="flex items-center gap-1" title="표 앞뒤에 빈 본문 줄(단락)을 삽입하여 텍스트나 데이터를 입력합니다">
                <button
                  type="button"
                  onClick={handleInsertParagraphBeforeTable}
                  className="px-2 py-0.5 rounded bg-amber-500/10 dark:bg-amber-500/20 border border-amber-400 dark:border-amber-600 hover:bg-amber-500/30 text-amber-900 dark:text-amber-200 text-[11px] font-semibold transition-colors flex items-center gap-1 shadow-2xs"
                  title="표 위쪽에 새 본문 줄(단락) 삽입 (단축키: Ctrl+Shift+Enter)"
                >
                  <ArrowUp className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                  <span>표 위에 줄 삽입</span>
                </button>
                <button
                  type="button"
                  onClick={handleInsertParagraphAfterTable}
                  className="px-2 py-0.5 rounded bg-amber-500/10 dark:bg-amber-500/20 border border-amber-400 dark:border-amber-600 hover:bg-amber-500/30 text-amber-900 dark:text-amber-200 text-[11px] font-semibold transition-colors flex items-center gap-1 shadow-2xs"
                  title="표 아래쪽에 새 본문 줄(단락) 삽입 (단축키: Ctrl+Enter)"
                >
                  <ArrowDown className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                  <span>표 아래에 줄 삽입</span>
                </button>
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
        <div
          className="flex-1 p-6 overflow-y-auto min-h-[350px] relative cursor-text"
          onClick={(e) => {
            if (e.target === e.currentTarget && editor) {
              const { state, dispatch } = editor.view;
              const lastNode = state.doc.lastChild;
              if (lastNode && (lastNode.type.name === 'table' || lastNode.type.name === 'codeBlock')) {
                const endPos = state.doc.content.size;
                const tr = state.tr.insert(endPos, state.schema.nodes.paragraph.create());
                const resolved = tr.doc.resolve(endPos + 1);
                tr.setSelection(TextSelection.near(resolved));
                dispatch(tr.scrollIntoView());
                editor.view.focus();
              } else {
                editor.chain().focus('end').run();
              }
            }
          }}
        >
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
                    onClick={handleRequestClose}
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
        <div className="px-6 py-2.5 border-t border-stone-200 dark:border-stone-800 bg-stone-50/60 dark:bg-stone-900/60 flex items-center justify-between text-xs text-stone-500 select-none">
          {/* Left Info Area: Position & Selection Data */}
          <div className="flex items-center gap-2.5 font-mono text-[11px] text-stone-600 dark:text-[#aaaaaa]">
            <span>Ln {editorMetrics.line}, Col {editorMetrics.col}</span>
            <span className="text-stone-300 dark:text-stone-700">|</span>
            <span>Sel: {editorMetrics.selectedChars.toLocaleString()} chars, {editorMetrics.selectedBytes.toLocaleString()} bytes</span>
            {!loadingState.isLoading && loadingState.sizeFormatted && (
              <>
                <span className="text-stone-300 dark:text-stone-700">|</span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20 text-[11px]">
                  <Zap className="w-3 h-3" />
                  <span>크기: {loadingState.sizeFormatted}</span>
                </span>
              </>
            )}
          </div>

          {/* Right Action Button Group */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleRequestClose}
              className="px-3.5 py-1.5 border border-stone-300 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-600 dark:text-stone-300 font-medium rounded-lg text-xs transition-colors cursor-pointer"
            >
              닫기
            </button>
            <button
              type="button"
              onClick={() => handleSave()}
              disabled={isSaving}
              className={`px-3.5 py-1.5 border rounded-lg font-bold text-xs transition-all flex items-center gap-1.5 shadow-xs cursor-pointer ${
                hasUnsavedChanges
                  ? 'border-amber-400 bg-amber-500/15 hover:bg-amber-500/25 text-amber-900 dark:text-amber-300 ring-2 ring-amber-400/30'
                  : 'border-stone-300 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-600 dark:text-stone-300'
              }`}
            >
              {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              <span>저장 (Ctrl+S)</span>
            </button>

            <button
              type="button"
              onClick={async () => {
                if (hasUnsavedChanges) {
                  const ok = await handleSave();
                  if (ok) onClose();
                } else {
                  onClose();
                }
              }}
              disabled={isSaving}
              className="px-4 py-1.5 bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold rounded-lg text-xs transition-colors shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>완료 및 닫기</span>
            </button>
          </div>
        </div>

        {/* Unsaved Changes Exit Confirmation Dialog */}
        {showExitConfirm && (
          <div
            id="unsaved-changes-dialog-backdrop"
            className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
            onClick={(e) => {
              e.stopPropagation();
            }}
          >
            <div
              id="unsaved-changes-dialog"
              className="w-full max-w-md bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-2xl shadow-2xl p-6 space-y-4 animate-in zoom-in-95 duration-150"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start gap-3.5">
                <div className="p-3 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 shrink-0">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div className="space-y-1.5">
                  <h3 className="text-base font-bold text-stone-900 dark:text-stone-100">
                    저장되지 않은 변경사항이 있습니다
                  </h3>
                  <p className="text-xs text-stone-600 dark:text-stone-400 leading-relaxed">
                    수정된 서식과 텍스트가 아직 저장되지 않았습니다. 저장하지 않고 나가면 현재 변경된 내용이 모두 취소됩니다. 저장하시겠습니까?
                  </p>
                </div>
              </div>

              <div className="pt-3 border-t border-stone-100 dark:border-stone-800 flex flex-col sm:flex-row items-center justify-end gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setShowExitConfirm(false)}
                  className="w-full sm:w-auto px-3.5 py-2 rounded-xl border border-stone-200 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-600 dark:text-stone-300 font-medium transition-colors cursor-pointer"
                >
                  취소 (계속 편집)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowExitConfirm(false);
                    setHasUnsavedChanges(false);
                    onClose();
                  }}
                  className="w-full sm:w-auto px-3.5 py-2 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 font-medium transition-colors cursor-pointer"
                >
                  저장하지 않고 닫기
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const ok = await handleSave();
                    if (ok) {
                      setShowExitConfirm(false);
                      onClose();
                    }
                  }}
                  className="w-full sm:w-auto px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold transition-colors shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>저장하고 닫기</span>
                </button>
              </div>
            </div>
          </div>
        )}
        {/* AI Agent Drawer within Editor */}
        <AiAgentDrawer
          isOpen={isAiAgentDrawerOpen}
          onClose={() => setIsAiAgentDrawerOpen(false)}
          editorContent={editor ? editor.getText() : ''}
          columns={columns}
          activeRow={{
            ...row,
            data: currentRowData,
            richContent: editor ? editor.getHTML() : row.richContent,
          }}
          onUpdateRow={(updated) => {
            if (updated.data) {
              setCurrentRowData(updated.data);
              setHasUnsavedChanges(true);
            }
          }}
          initialTab="data"
          onApplyToEditor={(newText) => {
            if (editor) {
              const html = isLikelyMarkdown(newText) ? markdownToHtml(newText) : newText;
              editor.commands.setContent(html);
              setHasUnsavedChanges(true);
            }
          }}
          onInsertToEditor={(snippet) => {
            if (editor) {
              const html = isLikelyMarkdown(snippet) ? markdownToHtml(snippet) : snippet;
              editor.commands.insertContent(html);
              setHasUnsavedChanges(true);
            }
          }}
        />

        {/* Right-Click Context Menu Popup */}
        {contextMenu && (
          <div
            id="rich-editor-context-menu"
            className="fixed z-[9999] w-72 bg-white/95 dark:bg-[#202020]/95 backdrop-blur-md rounded-2xl shadow-2xl border border-stone-200/80 dark:border-stone-700/80 p-2 text-xs text-stone-800 dark:text-stone-200 animate-in fade-in zoom-in-95 select-none pointer-events-auto"
            style={{
              top: Math.max(10, Math.min(contextMenu.y, window.innerHeight - 520)),
              left: Math.max(10, Math.min(contextMenu.x, window.innerWidth - 300)),
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-3 py-2 border-b border-stone-200/60 dark:border-stone-800 flex items-center justify-between mb-1">
              <div className="flex items-center gap-2 font-bold text-stone-800 dark:text-stone-100">
                <div className="p-1 rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400">
                  <Sparkles className="w-3.5 h-3.5" />
                </div>
                <span>서식 & 편집 메뉴</span>
              </div>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 font-semibold">
                TipTap
              </span>
            </div>

            <div className="space-y-1">
              {/* Section 1: Clipboard Operations */}
              <div className="py-0.5 space-y-0.5 border-b border-stone-200/60 dark:border-stone-800">
                <div className="px-2.5 py-0.5 text-[10px] font-bold text-stone-400 uppercase tracking-wider">
                  클립보드
                </div>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={handleContextCopy}
                  className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl hover:bg-amber-500/10 hover:text-amber-600 dark:hover:text-amber-400 transition-all text-left group"
                >
                  <span className="flex items-center gap-2 font-medium">
                    <Copy className="w-3.5 h-3.5 text-stone-400 group-hover:text-amber-500 transition-colors" />
                    <span>복사 (Copy)</span>
                  </span>
                  <kbd className="font-mono text-[10px] text-stone-400">Ctrl+C</kbd>
                </button>

                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={handleContextCut}
                  className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl hover:bg-amber-500/10 hover:text-amber-600 dark:hover:text-amber-400 transition-all text-left group"
                >
                  <span className="flex items-center gap-2 font-medium">
                    <Scissors className="w-3.5 h-3.5 text-stone-400 group-hover:text-amber-500 transition-colors" />
                    <span>잘라내기 (Cut)</span>
                  </span>
                  <kbd className="font-mono text-[10px] text-stone-400">Ctrl+X</kbd>
                </button>

                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={handleContextPaste}
                  className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl hover:bg-amber-500/10 hover:text-amber-600 dark:hover:text-amber-400 transition-all text-left group"
                >
                  <span className="flex items-center gap-2 font-medium">
                    <ClipboardPaste className="w-3.5 h-3.5 text-amber-500" />
                    <span>붙여넣기 (Paste)</span>
                  </span>
                  <kbd className="font-mono text-[10px] text-stone-400">Ctrl+V</kbd>
                </button>
              </div>

              {/* Section 2: Paragraph Styles */}
              <div className="py-0.5 space-y-0.5 border-b border-stone-200/60 dark:border-stone-800">
                <div className="px-2.5 py-0.5 text-[10px] font-bold text-stone-400 uppercase tracking-wider">
                  문단 스타일
                </div>
                <button
                  type="button"
                  onClick={() => { editor?.chain().focus().setParagraph().run(); setContextMenu(null); }}
                  className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl hover:bg-amber-500/10 hover:text-amber-600 dark:hover:text-amber-400 transition-all text-left group"
                >
                  <span className="flex items-center gap-2 font-medium">
                    <Type className="w-3.5 h-3.5 text-stone-400 group-hover:text-amber-500 transition-colors" />
                    <span>본문 (Paragraph)</span>
                  </span>
                  <kbd className="font-mono text-[10px] text-stone-400">Ctrl+Alt+0</kbd>
                </button>
                <button
                  type="button"
                  onClick={() => { editor?.chain().focus().toggleHeading({ level: 1 }).run(); setContextMenu(null); }}
                  className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl hover:bg-amber-500/10 hover:text-amber-600 dark:hover:text-amber-400 transition-all text-left font-bold group"
                >
                  <span className="flex items-center gap-2">
                    <Heading1 className="w-3.5 h-3.5 text-amber-500" />
                    <span>제목 1 (H1)</span>
                  </span>
                  <kbd className="font-mono text-[10px] text-stone-400 font-normal">Ctrl+Alt+1</kbd>
                </button>
                <button
                  type="button"
                  onClick={() => { editor?.chain().focus().toggleHeading({ level: 2 }).run(); setContextMenu(null); }}
                  className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl hover:bg-amber-500/10 hover:text-amber-600 dark:hover:text-amber-400 transition-all text-left font-bold group"
                >
                  <span className="flex items-center gap-2">
                    <Heading2 className="w-3.5 h-3.5 text-amber-500" />
                    <span>제목 2 (H2)</span>
                  </span>
                  <kbd className="font-mono text-[10px] text-stone-400 font-normal">Ctrl+Alt+2</kbd>
                </button>
                <button
                  type="button"
                  onClick={() => { editor?.chain().focus().toggleHeading({ level: 3 }).run(); setContextMenu(null); }}
                  className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl hover:bg-amber-500/10 hover:text-amber-600 dark:hover:text-amber-400 transition-all text-left font-bold group"
                >
                  <span className="flex items-center gap-2">
                    <Heading3 className="w-3.5 h-3.5 text-amber-500" />
                    <span>제목 3 (H3)</span>
                  </span>
                  <kbd className="font-mono text-[10px] text-stone-400 font-normal">Ctrl+Alt+3</kbd>
                </button>
                <button
                  type="button"
                  onClick={() => { editor?.chain().focus().toggleBlockquote().run(); setContextMenu(null); }}
                  className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl hover:bg-amber-500/10 hover:text-amber-600 dark:hover:text-amber-400 transition-all text-left italic group"
                >
                  <span className="flex items-center gap-2 font-medium">
                    <Quote className="w-3.5 h-3.5 text-stone-400 group-hover:text-amber-500 transition-colors" />
                    <span>인용구 (Blockquote)</span>
                  </span>
                  <kbd className="font-mono text-[10px] text-stone-400 not-italic">Ctrl+Shift+B</kbd>
                </button>
              </div>

              {/* Section 3: Text Formatting */}
              <div className="py-0.5 space-y-0.5 border-b border-stone-200/60 dark:border-stone-800">
                <div className="px-2.5 py-0.5 text-[10px] font-bold text-stone-400 uppercase tracking-wider">
                  텍스트 서식
                </div>
                <div className="grid grid-cols-2 gap-1 px-1">
                  <button
                    type="button"
                    onClick={() => { editor?.chain().focus().toggleBold().run(); setContextMenu(null); }}
                    className={`flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-xl font-bold transition-all ${
                      editor?.isActive('bold')
                        ? 'bg-amber-500 text-stone-950 shadow-xs'
                        : 'hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-300'
                    }`}
                  >
                    <Bold className="w-3.5 h-3.5" />
                    <span>굵게</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { editor?.chain().focus().toggleItalic().run(); setContextMenu(null); }}
                    className={`flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-xl italic transition-all ${
                      editor?.isActive('italic')
                        ? 'bg-amber-500 text-stone-950 shadow-xs'
                        : 'hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-300'
                    }`}
                  >
                    <Italic className="w-3.5 h-3.5" />
                    <span>기울임</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { editor?.chain().focus().toggleStrike().run(); setContextMenu(null); }}
                    className={`flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-xl line-through transition-all ${
                      editor?.isActive('strike')
                        ? 'bg-amber-500 text-stone-950 shadow-xs'
                        : 'hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-300'
                    }`}
                  >
                    <Strikethrough className="w-3.5 h-3.5" />
                    <span>취소선</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { editor?.chain().focus().toggleHighlight().run(); setContextMenu(null); }}
                    className="flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-xl bg-amber-500/20 text-amber-800 dark:text-amber-300 hover:bg-amber-500/30 transition-all font-medium"
                  >
                    <Highlighter className="w-3.5 h-3.5 text-amber-500" />
                    <span>형광펜</span>
                  </button>
                </div>
              </div>

              {/* Section 4: Table Operations (Conditionally rendered when inside table) */}
              {contextMenu.isInTable && (
                <div className="py-0.5 space-y-1 border-b border-stone-200/60 dark:border-stone-800">
                  <div className="px-2.5 py-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400 flex items-center justify-between uppercase tracking-wider">
                    <span className="flex items-center gap-1">
                      <TableIcon className="w-3.5 h-3.5" />
                      <span>표(Table) 조작 메뉴</span>
                    </span>
                    <span className="px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-600 text-[9px] font-mono">
                      Cell Mode
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-1 px-1">
                    <button
                      type="button"
                      onClick={() => { editor?.chain().focus().addRowBefore().run(); setContextMenu(null); }}
                      className="flex items-center gap-1.5 px-2 py-1.5 rounded-xl hover:bg-amber-500/10 hover:text-amber-600 dark:hover:text-amber-400 transition-colors text-left"
                    >
                      <ArrowUp className="w-3.5 h-3.5 text-amber-500" />
                      <span>위에 행 추가</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => { editor?.chain().focus().addRowAfter().run(); setContextMenu(null); }}
                      className="flex items-center gap-1.5 px-2 py-1.5 rounded-xl hover:bg-amber-500/10 hover:text-amber-600 dark:hover:text-amber-400 transition-colors text-left"
                    >
                      <ArrowDown className="w-3.5 h-3.5 text-amber-500" />
                      <span>아래 행 추가</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => { editor?.chain().focus().addColumnBefore().run(); setContextMenu(null); }}
                      className="flex items-center gap-1.5 px-2 py-1.5 rounded-xl hover:bg-amber-500/10 hover:text-amber-600 dark:hover:text-amber-400 transition-colors text-left"
                    >
                      <Columns className="w-3.5 h-3.5 text-amber-500" />
                      <span>왼쪽 열 추가</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => { editor?.chain().focus().addColumnAfter().run(); setContextMenu(null); }}
                      className="flex items-center gap-1.5 px-2 py-1.5 rounded-xl hover:bg-amber-500/10 hover:text-amber-600 dark:hover:text-amber-400 transition-colors text-left"
                    >
                      <Columns className="w-3.5 h-3.5 text-amber-500 rotate-180" />
                      <span>오른쪽 열 추가</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-1 px-1 border-t border-stone-200/40 dark:border-stone-800/60 pt-1">
                    <button
                      type="button"
                      onClick={() => { editor?.chain().focus().deleteRow().run(); setContextMenu(null); }}
                      className="flex items-center gap-1.5 px-2 py-1.5 rounded-xl hover:bg-rose-500/10 text-rose-600 dark:text-rose-400 transition-colors text-left"
                    >
                      <Rows className="w-3.5 h-3.5" />
                      <span>선택한 행 삭제</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => { editor?.chain().focus().deleteColumn().run(); setContextMenu(null); }}
                      className="flex items-center gap-1.5 px-2 py-1.5 rounded-xl hover:bg-rose-500/10 text-rose-600 dark:text-rose-400 transition-colors text-left"
                    >
                      <Columns className="w-3.5 h-3.5" />
                      <span>선택한 열 삭제</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => { editor?.chain().focus().mergeCells().run(); setContextMenu(null); }}
                      className="flex items-center gap-1.5 px-2 py-1.5 rounded-xl hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors text-left"
                    >
                      <Combine className="w-3.5 h-3.5 text-indigo-500" />
                      <span>선택 셀 병합</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => { editor?.chain().focus().splitCell().run(); setContextMenu(null); }}
                      className="flex items-center gap-1.5 px-2 py-1.5 rounded-xl hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors text-left"
                    >
                      <Split className="w-3.5 h-3.5 text-sky-500" />
                      <span>병합 셀 분할</span>
                    </button>
                  </div>

                  <div className="flex gap-1 px-1 border-t border-stone-200/40 dark:border-stone-800/60 pt-1">
                    <button
                      type="button"
                      onClick={() => { editor?.chain().focus().toggleHeaderRow().run(); setContextMenu(null); }}
                      className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-xl hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors text-[11px] font-medium"
                    >
                      <span>제목 헤더 행 토글</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => { editor?.chain().focus().deleteTable().run(); setContextMenu(null); }}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl hover:bg-rose-500/10 text-rose-600 dark:text-rose-400 transition-colors text-[11px] font-semibold"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>표 삭제</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Section 5: Delete & Clear Formatting */}
              <div className="py-0.5 space-y-0.5 border-t border-stone-200/60 dark:border-stone-800">
                <button
                  type="button"
                  onClick={handleContextDeleteSelection}
                  className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl hover:bg-rose-500/10 text-rose-600 dark:text-rose-400 transition-all font-medium group"
                >
                  <span className="flex items-center gap-2">
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>선택 데이터/노드 삭제</span>
                  </span>
                  <kbd className="font-mono text-[10px] text-stone-400">Del</kbd>
                </button>

                <button
                  type="button"
                  onClick={() => { editor?.chain().focus().unsetAllMarks().clearNodes().run(); setContextMenu(null); }}
                  className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-600 dark:text-stone-300 transition-all font-medium"
                >
                  <span className="flex items-center gap-2">
                    <RemoveFormatting className="w-3.5 h-3.5 text-stone-400" />
                    <span>서식 및 노드 초기화</span>
                  </span>
                  <kbd className="font-mono text-[10px] text-stone-400">Clear</kbd>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
