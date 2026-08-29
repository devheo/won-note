import React, { useEffect, useState, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { StickerExtension } from './StickerExtension';
import { TableRow as TableRowType, TableColumn, AutoSaveStatus } from '../../types';
import { useAutoSave } from '../../hooks/useAutoSave';
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
  Plus,
  Trash2,
  Columns,
  Rows,
} from 'lucide-react';

interface RichEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  row: TableRowType | null;
  columns: TableColumn[];
  tableName: string;
  onSaveRow: (updatedRow: TableRowType) => Promise<void> | void;
}

export const RichEditorModal: React.FC<RichEditorModalProps> = ({
  isOpen,
  onClose,
  row,
  columns,
  tableName,
  onSaveRow,
}) => {
  const [currentRowData, setCurrentRowData] = useState<Record<string, any>>({});
  const [richContent, setRichContent] = useState<string>('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activeTab, setActiveTab] = useState<'editor' | 'fields' | 'stickers'>('editor');
  const [isTableMenuOpen, setIsTableMenuOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const tableMenuRef = useRef<HTMLDivElement | null>(null);

  // Close table menu when clicking outside
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (tableMenuRef.current && !tableMenuRef.current.contains(e.target as Node)) {
        setIsTableMenuOpen(false);
      }
    };
    if (isTableMenuOpen) {
      window.addEventListener('mousedown', handleOutsideClick);
    }
    return () => window.removeEventListener('mousedown', handleOutsideClick);
  }, [isTableMenuOpen]);

  // Sync state when row changes
  useEffect(() => {
    if (row) {
      setCurrentRowData(row.data || {});
      setRichContent(row.richContent || '');
    }
  }, [row]);

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
        codeBlock: {
          HTMLAttributes: {
            class: 'bg-[#181818] text-amber-300 p-4 rounded-xl font-mono text-xs my-3 border border-[#333333] leading-relaxed overflow-x-auto',
          },
        },
      }),
      Table.configure({
        resizable: true,
        HTMLAttributes: {
          class: 'wonbee-rich-table',
        },
      }),
      TableRow,
      TableHeader,
      TableCell,
      Image.configure({
        inline: true,
        allowBase64: true,
        HTMLAttributes: {
          class: 'rounded-xl max-h-96 object-contain my-3 shadow-md border border-stone-200 dark:border-[#383838]',
        },
      }),
      Placeholder.configure({
        placeholder: '내용을 작성하세요... (/ 키로 블록 삽입 또는 상단 도구 모음 활용)',
      }),
      StickerExtension,
    ],
    content: row?.richContent || '',
    editorProps: {
      attributes: {
        class:
          'prose dark:prose-invert max-w-none focus:outline-none min-h-[320px] text-sm text-stone-800 dark:text-[#f0f0f0] leading-relaxed font-sans',
      },
    },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      setRichContent(html);
    },
  });

  // Keep TipTap in sync if opened row changes
  useEffect(() => {
    if (editor && row && row.richContent !== undefined) {
      if (editor.getHTML() !== row.richContent) {
        editor.commands.setContent(row.richContent || '');
      }
    }
  }, [row?.id, editor]);

  if (!isOpen || !row) return null;

  const handleCellChange = (columnId: string, val: any) => {
    setCurrentRowData((prev) => ({
      ...prev,
      [columnId]: val,
    }));
  };

  const handleInsertSticker = (color: 'amber' | 'yellow' | 'green' | 'blue' | 'rose' | 'purple' = 'amber') => {
    if (editor) {
      editor.chain().focus().insertSticker({ color }).run();
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && editor) {
      const reader = new FileReader();
      reader.onload = (uploadEvent) => {
        const src = uploadEvent.target?.result as string;
        editor.chain().focus().setImage({ src, alt: file.name }).run();
      };
      reader.readAsDataURL(file);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const primaryColumn = columns.find((c) => c.isPrimaryKey) || columns[0];
  const primaryTitle = primaryColumn ? String(currentRowData[primaryColumn.id] || '새 데이터 항목') : '데이터 세부 정보';

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
        className={`bg-white dark:bg-stone-900 rounded-2xl shadow-2xl border border-stone-200 dark:border-stone-800 flex flex-col overflow-hidden transition-all duration-200 ${
          isFullscreen ? 'w-full h-full max-w-none rounded-none' : 'w-full max-w-4xl max-h-[90vh]'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
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
              onClick={() => setIsFullscreen(!isFullscreen)}
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

        {/* Quick Structured Properties Bar */}
        <div className="px-6 py-3 bg-stone-50/80 dark:bg-stone-900/30 border-b border-stone-200 dark:border-stone-800 overflow-x-auto flex items-center gap-4 text-xs">
          <div className="text-[11px] font-semibold text-stone-400 uppercase tracking-wider whitespace-nowrap">
            속성 필드:
          </div>
          <div className="flex items-center gap-3">
            {columns.map((col) => (
              <div
                key={col.id}
                className="flex items-center gap-1.5 bg-white dark:bg-stone-800 px-2.5 py-1 rounded-md border border-stone-200/80 dark:border-stone-700/60 flex-shrink-0"
              >
                <span className="text-stone-400 font-medium">{col.name}:</span>
                {col.type === 'status' || col.type === 'select' ? (
                  <select
                    value={currentRowData[col.id] || ''}
                    onChange={(e) => handleCellChange(col.id, e.target.value)}
                    className="bg-transparent font-medium text-stone-800 dark:text-stone-200 outline-none text-xs cursor-pointer"
                  >
                    <option value="" className="text-stone-400">선택 없음</option>
                    {col.options?.map((opt) => (
                      <option key={opt.id} value={opt.id} className="dark:bg-stone-900">
                        {opt.label}
                      </option>
                    ))}
                  </select>
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
                    value={currentRowData[col.id] || ''}
                    onChange={(e) => handleCellChange(col.id, e.target.value)}
                    className="bg-transparent text-stone-800 dark:text-stone-200 outline-none text-xs"
                  />
                ) : (
                  <input
                    type="text"
                    value={currentRowData[col.id] ?? ''}
                    onChange={(e) => handleCellChange(col.id, e.target.value)}
                    placeholder="값 입력..."
                    className="bg-transparent text-stone-800 dark:text-stone-200 outline-none text-xs max-w-[140px]"
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* TipTap Custom Minimal Formatting Toolbar */}
        {editor && (
          <div className="px-6 py-2 border-b border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => editor.chain().focus().toggleBold().run()}
                className={`p-1.5 rounded hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors ${
                  editor.isActive('bold') ? 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400' : 'text-stone-600 dark:text-stone-300'
                }`}
                title="굵게 (Ctrl+B)"
              >
                <Bold className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={() => editor.chain().focus().toggleItalic().run()}
                className={`p-1.5 rounded hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors ${
                  editor.isActive('italic') ? 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400' : 'text-stone-600 dark:text-stone-300'
                }`}
                title="기울임 (Ctrl+I)"
              >
                <Italic className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={() => editor.chain().focus().toggleStrike().run()}
                className={`p-1.5 rounded hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors ${
                  editor.isActive('strike') ? 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400' : 'text-stone-600 dark:text-stone-300'
                }`}
                title="취소선"
              >
                <Strikethrough className="w-3.5 h-3.5" />
              </button>

              <div className="w-[1px] h-4 bg-stone-200 dark:bg-stone-800 mx-1" />

              <button
                type="button"
                onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
                className={`p-1.5 rounded hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors ${
                  editor.isActive('heading', { level: 1 }) ? 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400' : 'text-stone-600 dark:text-stone-300'
                }`}
                title="제목 1"
              >
                <Heading1 className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                className={`p-1.5 rounded hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors ${
                  editor.isActive('heading', { level: 2 }) ? 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400' : 'text-stone-600 dark:text-stone-300'
                }`}
                title="제목 2"
              >
                <Heading2 className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
                className={`p-1.5 rounded hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors ${
                  editor.isActive('heading', { level: 3 }) ? 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400' : 'text-stone-600 dark:text-stone-300'
                }`}
                title="제목 3"
              >
                <Heading3 className="w-3.5 h-3.5" />
              </button>

              <div className="w-[1px] h-4 bg-stone-200 dark:bg-stone-800 mx-1" />

              <button
                type="button"
                onClick={() => editor.chain().focus().toggleBulletList().run()}
                className={`p-1.5 rounded hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors ${
                  editor.isActive('bulletList') ? 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400' : 'text-stone-600 dark:text-stone-300'
                }`}
                title="글머리 기호 목록"
              >
                <List className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={() => editor.chain().focus().toggleOrderedList().run()}
                className={`p-1.5 rounded hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors ${
                  editor.isActive('orderedList') ? 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400' : 'text-stone-600 dark:text-stone-300'
                }`}
                title="번호 매기기 목록"
              >
                <ListOrdered className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={() => editor.chain().focus().toggleBlockquote().run()}
                className={`p-1.5 rounded hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors ${
                  editor.isActive('blockquote') ? 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400' : 'text-stone-600 dark:text-stone-300'
                }`}
                title="인용구"
              >
                <Quote className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={() => editor.chain().focus().toggleCodeBlock().run()}
                className={`p-1.5 rounded hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors ${
                  editor.isActive('codeBlock') ? 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400' : 'text-stone-600 dark:text-stone-300'
                }`}
                title="코드 / SQL 블록"
              >
                <FileCode className="w-3.5 h-3.5" />
              </button>

              <div className="w-[1px] h-4 bg-stone-200 dark:bg-stone-800 mx-1" />

              {/* Image Upload Button */}
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleImageUpload}
                accept="image/*"
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="p-1.5 rounded hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-600 dark:text-stone-300 transition-colors"
                title="이미지 첨부"
              >
                <ImageIcon className="w-3.5 h-3.5" />
              </button>

              <div className="w-[1px] h-4 bg-stone-200 dark:bg-stone-800 mx-1" />

              {/* TipTap Rich Table Controls Dropdown */}
              <div className="relative" ref={tableMenuRef}>
                <button
                  type="button"
                  onClick={() => setIsTableMenuOpen(!isTableMenuOpen)}
                  className={`px-2 py-1 rounded text-xs flex items-center gap-1 font-medium transition-colors ${
                    editor.isActive('table')
                      ? 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-700'
                      : 'hover:bg-stone-100 dark:hover:bg-[#2e2e2e] text-stone-700 dark:text-[#cccccc]'
                  }`}
                  title="리치 에디터 표 삽입 및 행/열 관리"
                >
                  <TableIcon className="w-3.5 h-3.5 text-amber-500" />
                  <span>표 (Table)</span>
                  <ChevronDown className="w-3 h-3 text-stone-400" />
                </button>

                {isTableMenuOpen && (
                  <div className="absolute left-0 top-full mt-1 w-56 bg-white dark:bg-[#222222] border border-stone-200 dark:border-[#383838] rounded-xl shadow-xl p-1.5 z-50 text-xs text-stone-700 dark:text-[#cccccc] animate-in fade-in slide-in-from-top-1 duration-150 mat-shadow-3">
                    <div className="px-2 py-1 text-[10px] font-bold text-stone-400 dark:text-[#888888] uppercase tracking-wider">
                      표 생성
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
                        setIsTableMenuOpen(false);
                      }}
                      className="w-full px-2 py-1.5 rounded-lg text-left hover:bg-stone-100 dark:hover:bg-[#2e2e2e] flex items-center gap-2 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5 text-emerald-500" />
                      새 표 삽입 (3x3)
                    </button>

                    <div className="my-1 border-t border-stone-200 dark:border-[#333333]" />

                    <div className="px-2 py-1 text-[10px] font-bold text-stone-400 dark:text-[#888888] uppercase tracking-wider">
                      행 & 열 관리
                    </div>
                    <button
                      type="button"
                      disabled={!editor.isActive('table')}
                      onClick={() => {
                        editor.chain().focus().addRowBefore().run();
                        setIsTableMenuOpen(false);
                      }}
                      className="w-full px-2 py-1.5 rounded-lg text-left hover:bg-stone-100 dark:hover:bg-[#2e2e2e] disabled:opacity-40 flex items-center gap-2 transition-colors"
                    >
                      <Rows className="w-3.5 h-3.5 text-blue-500" />
                      위에 행 추가
                    </button>
                    <button
                      type="button"
                      disabled={!editor.isActive('table')}
                      onClick={() => {
                        editor.chain().focus().addRowAfter().run();
                        setIsTableMenuOpen(false);
                      }}
                      className="w-full px-2 py-1.5 rounded-lg text-left hover:bg-stone-100 dark:hover:bg-[#2e2e2e] disabled:opacity-40 flex items-center gap-2 transition-colors"
                    >
                      <Rows className="w-3.5 h-3.5 text-blue-500" />
                      아래에 행 추가
                    </button>
                    <button
                      type="button"
                      disabled={!editor.isActive('table')}
                      onClick={() => {
                        editor.chain().focus().deleteRow().run();
                        setIsTableMenuOpen(false);
                      }}
                      className="w-full px-2 py-1.5 rounded-lg text-left hover:bg-stone-100 dark:hover:bg-[#2e2e2e] disabled:opacity-40 flex items-center gap-2 text-rose-600 dark:text-rose-400 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      현재 행 삭제
                    </button>

                    <div className="my-1 border-t border-stone-200 dark:border-[#333333]" />

                    <button
                      type="button"
                      disabled={!editor.isActive('table')}
                      onClick={() => {
                        editor.chain().focus().addColumnBefore().run();
                        setIsTableMenuOpen(false);
                      }}
                      className="w-full px-2 py-1.5 rounded-lg text-left hover:bg-stone-100 dark:hover:bg-[#2e2e2e] disabled:opacity-40 flex items-center gap-2 transition-colors"
                    >
                      <Columns className="w-3.5 h-3.5 text-amber-500" />
                      왼쪽에 열 추가
                    </button>
                    <button
                      type="button"
                      disabled={!editor.isActive('table')}
                      onClick={() => {
                        editor.chain().focus().addColumnAfter().run();
                        setIsTableMenuOpen(false);
                      }}
                      className="w-full px-2 py-1.5 rounded-lg text-left hover:bg-stone-100 dark:hover:bg-[#2e2e2e] disabled:opacity-40 flex items-center gap-2 transition-colors"
                    >
                      <Columns className="w-3.5 h-3.5 text-amber-500" />
                      오른쪽에 열 추가
                    </button>
                    <button
                      type="button"
                      disabled={!editor.isActive('table')}
                      onClick={() => {
                        editor.chain().focus().deleteColumn().run();
                        setIsTableMenuOpen(false);
                      }}
                      className="w-full px-2 py-1.5 rounded-lg text-left hover:bg-stone-100 dark:hover:bg-[#2e2e2e] disabled:opacity-40 flex items-center gap-2 text-rose-600 dark:text-rose-400 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      현재 열 삭제
                    </button>

                    <div className="my-1 border-t border-stone-200 dark:border-[#333333]" />

                    <button
                      type="button"
                      disabled={!editor.isActive('table')}
                      onClick={() => {
                        editor.chain().focus().toggleHeaderRow().run();
                        setIsTableMenuOpen(false);
                      }}
                      className="w-full px-2 py-1.5 rounded-lg text-left hover:bg-stone-100 dark:hover:bg-[#2e2e2e] disabled:opacity-40 flex items-center gap-2 transition-colors"
                    >
                      <span>헤더 행(Header) 토글</span>
                    </button>
                    <button
                      type="button"
                      disabled={!editor.isActive('table')}
                      onClick={() => {
                        editor.chain().focus().mergeOrSplit().run();
                        setIsTableMenuOpen(false);
                      }}
                      className="w-full px-2 py-1.5 rounded-lg text-left hover:bg-stone-100 dark:hover:bg-[#2e2e2e] disabled:opacity-40 flex items-center gap-2 transition-colors"
                    >
                      <span>셀 병합 / 분할</span>
                    </button>
                    <button
                      type="button"
                      disabled={!editor.isActive('table')}
                      onClick={() => {
                        editor.chain().focus().deleteTable().run();
                        setIsTableMenuOpen(false);
                      }}
                      className="w-full px-2 py-1.5 rounded-lg text-left hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600 dark:text-rose-400 disabled:opacity-40 font-medium flex items-center gap-2 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      표 전체 삭제
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Sticker Insert Group (OneNote Style) */}
            <div className="flex items-center gap-1.5 bg-amber-50 dark:bg-amber-950/40 px-2 py-1 rounded-lg border border-amber-200/60 dark:border-amber-900/40">
              <span className="text-[11px] font-bold text-amber-800 dark:text-amber-300 flex items-center gap-1">
                <StickyNote className="w-3 h-3" />
                원노트 스티커 삽입:
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

        {/* TipTap Editor Scrollable Body Area */}
        <div className="flex-1 p-6 overflow-y-auto min-h-[350px]">
          <EditorContent editor={editor} />
        </div>

        {/* Modal Footer Info */}
        <div className="px-6 py-2.5 border-t border-stone-200 dark:border-stone-800 bg-stone-50/60 dark:bg-stone-900/60 flex items-center justify-between text-xs text-stone-500">
          <div className="flex items-center gap-2">
            <span>💡 <strong>꿀팁:</strong> 마크다운 문법(#, *, -)과 원노트 스티커를 결합해 풍부한 노트를 만드세요.</span>
          </div>
          <button
            onClick={() => {
              forceSave();
              onClose();
            }}
            className="px-4 py-1.5 bg-stone-900 dark:bg-stone-100 hover:bg-amber-500 dark:hover:bg-amber-400 text-stone-100 dark:text-stone-900 font-semibold rounded-lg transition-colors"
          >
            완료
          </button>
        </div>
      </div>
    </div>
  );
};
