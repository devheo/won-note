import React, { useState, useEffect, useRef } from 'react';
import { TableRow, TableColumn } from '../../types';
import {
  X,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  Copy,
  Check,
  Calendar,
  Clock,
  Tag,
  Hash,
  Type,
  Code,
  CheckSquare,
  FileText,
  Trash2,
  Edit3,
  Sparkles,
  Pin,
  ZoomIn,
  ZoomOut,
  Expand,
  Image as ImageIcon,
} from 'lucide-react';
import { detectLanguage } from '../../utils/codeHighlighter';
import { CodeBlockViewer } from '../common/CodeBlockViewer';
import { cleanTextValue, extractFirstImageSrc } from '../../utils/textSanitizer';
import { SelectOrCustomInput } from '../common/SelectOrCustomInput';
import { ImageLightboxModal } from '../common/ImageLightboxModal';

interface ModernRowDetailViewerProps {
  isOpen: boolean;
  onClose: () => void;
  row: TableRow | null;
  columns: TableColumn[];
  tableName: string;
  totalRows: number;
  currentIndex: number;
  onNavigate: (newIndex: number) => void;
  onOpenRichEditor: (row: TableRow) => void;
  onUpdateRow: (updatedRow: TableRow) => void;
  onDeleteRow: (rowId: string) => void;
}

type WidthMode = 'standard' | 'wide' | 'full';

export const ModernRowDetailViewer: React.FC<ModernRowDetailViewerProps> = ({
  isOpen,
  onClose,
  row,
  columns,
  tableName,
  totalRows,
  currentIndex,
  onNavigate,
  onOpenRichEditor,
  onUpdateRow,
  onDeleteRow,
}) => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const [editingColId, setEditingColId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<any>('');
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [widthMode, setWidthMode] = useState<WidthMode>('standard');
  const [lightboxImg, setLightboxImg] = useState<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  // Reset editing state whenever row changes
  useEffect(() => {
    setEditingColId(null);
    setEditValue('');
  }, [isOpen, row?.id, currentIndex]);

  const handleClose = () => {
    setEditingColId(null);
    setEditValue('');
    onClose();
  };

  const handleNavigate = (newIdx: number) => {
    setEditingColId(null);
    setEditValue('');
    onNavigate(newIdx);
  };

  // Keyboard navigation & zoom shortcuts
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      } else if (e.key === 'ArrowLeft' && currentIndex > 0) {
        handleNavigate(currentIndex - 1);
      } else if (e.key === 'ArrowRight' && currentIndex < totalRows - 1) {
        handleNavigate(currentIndex + 1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, currentIndex, totalRows, handleClose, handleNavigate]);

  if (!isOpen || !row) return null;

  // Copy single field
  const handleCopyField = (key: string, value: any) => {
    navigator.clipboard.writeText(String(value ?? ''));
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  };

  // Copy entire row JSON
  const handleCopyAll = () => {
    navigator.clipboard.writeText(JSON.stringify(row, null, 2));
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 1500);
  };

  // Commit field edit in viewer
  const handleSaveField = (colId: string) => {
    const targetCol = columns.find((c) => c.id === colId);
    const cleaned =
      typeof editValue === 'string' && targetCol?.type !== 'richText'
        ? cleanTextValue(editValue)
        : editValue;

    const updated: TableRow = {
      ...row,
      data: {
        ...row.data,
        [colId]: cleaned,
      },
      updatedAt: Date.now(),
    };
    onUpdateRow(updated);
    setEditingColId(null);
    setEditValue('');
  };

  const primaryCol = columns.find((c) => c.isPrimaryKey) || columns[0];
  const primaryTitle = primaryCol
    ? cleanTextValue(row.data[primaryCol.id]) || '제목 없음'
    : '레코드 데이터';

  const getColIcon = (type: string) => {
    switch (type) {
      case 'number':
        return <Hash className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />;
      case 'select':
      case 'status':
        return <Tag className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />;
      case 'date':
        return <Calendar className="w-3.5 h-3.5 text-purple-500 flex-shrink-0" />;
      case 'checkbox':
        return <CheckSquare className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />;
      case 'code':
        return <Code className="w-3.5 h-3.5 text-stone-500 dark:text-amber-400 flex-shrink-0" />;
      case 'richText':
        return <Sparkles className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />;
      default:
        return <Type className="w-3.5 h-3.5 text-stone-400 flex-shrink-0" />;
    }
  };

  const formatDate = (timestamp?: number) => {
    if (!timestamp) return '-';
    return new Date(timestamp).toLocaleString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getContainerWidthClass = () => {
    if (widthMode === 'full') return 'w-full h-full max-w-none rounded-none m-0';
    if (widthMode === 'wide') return 'w-full max-w-6xl max-h-[92vh] rounded-2xl';
    return 'w-full max-w-4xl max-h-[88vh] rounded-2xl';
  };

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/65 backdrop-blur-xs animate-in fade-in duration-150"
        onClick={handleClose}
      >
        <div
          className={`bg-white dark:bg-[#1e1e1e] shadow-2xl border border-stone-200 dark:border-[#383838] overflow-hidden flex flex-col mat-shadow-3 transition-all duration-200 ${getContainerWidthClass()}`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Top Bar / Header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-stone-200 dark:border-[#333333] bg-stone-50/90 dark:bg-[#252525] flex-shrink-0">
            {/* Title & Index */}
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex-shrink-0 font-bold text-xs">
                #{currentIndex + 1}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold text-stone-900 dark:text-[#f5f5f5] truncate">
                    {primaryTitle}
                  </h2>
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-stone-200/60 dark:bg-[#333333] text-stone-600 dark:text-[#a0a0a0] font-medium flex-shrink-0">
                    {tableName}
                  </span>
                </div>
                <div className="text-[11px] text-stone-400 dark:text-[#888888]">
                  총 {totalRows}개 중 {currentIndex + 1}번째 레코드
                </div>
              </div>
            </div>

            {/* Middle Controls: Zoom & Width Toggles */}
            <div className="flex items-center gap-2">
              {/* Zoom Controls */}
              <div className="hidden sm:flex items-center gap-1 bg-stone-100 dark:bg-[#1a1a1a] px-2 py-1 rounded-xl border border-stone-200 dark:border-[#333333]">
                <button
                  onClick={() => setZoomLevel((z) => Math.max(z - 10, 70))}
                  className="p-1 hover:bg-stone-200 dark:hover:bg-[#2e2e2e] rounded text-stone-500 dark:text-stone-300"
                  title="축소"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <span className="text-[11px] font-mono font-bold text-stone-700 dark:text-stone-300 min-w-[36px] text-center">
                  {zoomLevel}%
                </span>
                <button
                  onClick={() => setZoomLevel((z) => Math.min(z + 10, 160))}
                  className="p-1 hover:bg-stone-200 dark:hover:bg-[#2e2e2e] rounded text-stone-500 dark:text-stone-300"
                  title="확대"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Width Mode Toggle */}
              <div className="flex items-center gap-1 bg-stone-100 dark:bg-[#1a1a1a] p-0.5 rounded-xl border border-stone-200 dark:border-[#333333]">
                <button
                  onClick={() => setWidthMode('standard')}
                  className={`px-2 py-1 text-[11px] font-semibold rounded-lg transition-colors ${
                    widthMode === 'standard'
                      ? 'bg-amber-500 text-stone-950 shadow-xs'
                      : 'text-stone-500 dark:text-stone-400 hover:text-stone-800'
                  }`}
                  title="기본 너비"
                >
                  기본
                </button>
                <button
                  onClick={() => setWidthMode('wide')}
                  className={`px-2 py-1 text-[11px] font-semibold rounded-lg transition-colors ${
                    widthMode === 'wide'
                      ? 'bg-amber-500 text-stone-950 shadow-xs'
                      : 'text-stone-500 dark:text-stone-400 hover:text-stone-800'
                  }`}
                  title="와이드 너비"
                >
                  와이드
                </button>
                <button
                  onClick={() => setWidthMode(widthMode === 'full' ? 'standard' : 'full')}
                  className={`p-1.5 rounded-lg transition-colors ${
                    widthMode === 'full'
                      ? 'bg-amber-500 text-stone-950 shadow-xs'
                      : 'text-stone-500 dark:text-stone-400 hover:text-stone-800'
                  }`}
                  title={widthMode === 'full' ? '원래대로' : '전체화면'}
                >
                  {widthMode === 'full' ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                </button>
              </div>

              {/* Navigation Arrows */}
              <div className="flex items-center gap-1 bg-stone-100 dark:bg-[#1a1a1a] p-0.5 rounded-xl border border-stone-200 dark:border-[#333333]">
                <button
                  disabled={currentIndex === 0}
                  onClick={() => handleNavigate(currentIndex - 1)}
                  className="p-1 rounded-lg text-stone-600 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-[#333333] disabled:opacity-30 transition-colors"
                  title="이전 레코드 (←)"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  disabled={currentIndex === totalRows - 1}
                  onClick={() => handleNavigate(currentIndex + 1)}
                  className="p-1 rounded-lg text-stone-600 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-[#333333] disabled:opacity-30 transition-colors"
                  title="다음 레코드 (→)"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              {/* Close Button */}
              <button
                onClick={handleClose}
                className="p-1.5 rounded-xl text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-[#333333] transition-colors"
                title="닫기 (ESC)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Main Body */}
          <div
            ref={scrollContainerRef}
            className="flex-1 overflow-y-auto p-5 space-y-5 custom-scrollbar"
            style={{ fontSize: `${zoomLevel}%` }}
          >
            {/* 1. Fields Grid */}
            <div className="p-4 rounded-xl bg-stone-50/70 dark:bg-[#242424] border border-stone-200/80 dark:border-[#333333]">
              <div className="flex items-center justify-between mb-3 border-b border-stone-200/60 dark:border-[#333333] pb-2">
                <h3 className="text-xs font-bold text-stone-800 dark:text-[#eeeeee] uppercase tracking-wider flex items-center gap-1.5">
                  <span>열 필드 데이터 목록</span>
                  <span className="text-[10px] text-stone-400 font-normal">({columns.length}개)</span>
                </h3>
                <button
                  onClick={handleCopyAll}
                  className="text-[11px] font-medium text-stone-500 dark:text-[#aaaaaa] hover:text-amber-600 dark:hover:text-amber-400 flex items-center gap-1"
                >
                  {copiedAll ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedAll ? '전체 복사됨' : 'JSON 복사'}</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {columns.map((col) => {
                  const val = row.data[col.id];
                  const isEditing = editingColId === col.id;
                  const isCopied = copiedKey === col.id;
                  const rawString = typeof val === 'object' ? JSON.stringify(val) : String(val ?? '');
                  const imgUrl = extractFirstImageSrc(rawString);

                  const isRichOrLong =
                    col.type === 'richText' ||
                    col.type === 'code' ||
                    rawString.length > 80 ||
                    rawString.includes('<table') ||
                    rawString.includes('<img');

                  return (
                    <div
                      key={col.id}
                      className={`p-3 rounded-xl bg-white dark:bg-[#1b1b1b] border border-stone-200 dark:border-[#333333] group/field transition-all ${
                        isRichOrLong ? 'col-span-1 md:col-span-2' : ''
                      }`}
                    >
                      {/* Field Header */}
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-1.5 font-semibold text-stone-700 dark:text-[#cccccc] text-xs">
                          {getColIcon(col.type)}
                          <span className="truncate">{col.name}</span>
                          {col.isPrimaryKey && (
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-600 dark:text-amber-400 font-bold">
                              기본키 (PK)
                            </span>
                          )}
                          {imgUrl && (
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-500 font-medium flex items-center gap-0.5">
                              <ImageIcon className="w-2.5 h-2.5" /> 이미지
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1 opacity-0 group-hover/field:opacity-100 transition-opacity">
                          {imgUrl && (
                            <button
                              onClick={() => setLightboxImg(imgUrl)}
                              className="p-1 rounded text-stone-400 hover:text-amber-500 hover:bg-stone-100 dark:hover:bg-[#333333]"
                              title="이미지 크게 보기"
                            >
                              <Expand className="w-3 h-3" />
                            </button>
                          )}
                          <button
                            onClick={() => handleCopyField(col.id, cleanTextValue(val))}
                            className="p-1 rounded text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 hover:bg-stone-200/50 dark:hover:bg-[#333333]"
                            title="값 복사"
                          >
                            {isCopied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                          </button>
                          {!isEditing && (
                            <button
                              onClick={() => {
                                setEditingColId(col.id);
                                setEditValue(cleanTextValue(val));
                              }}
                              className="p-1 rounded text-stone-400 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-stone-200/50 dark:hover:bg-[#333333]"
                              title="수정"
                            >
                              <Edit3 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Field Value */}
                      {isEditing ? (
                        <div className="mt-2 space-y-2">
                          {col.type === 'status' || col.type === 'select' ? (
                            <SelectOrCustomInput
                              autoFocus
                              size="md"
                              value={editValue}
                              options={col.options}
                              placeholder="선택 안 함"
                              onChange={(newVal) => setEditValue(newVal)}
                            />
                          ) : col.type === 'checkbox' ? (
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={!!editValue}
                                onChange={(e) => setEditValue(e.target.checked)}
                                className="rounded accent-amber-500 w-4 h-4"
                              />
                              <span className="text-stone-700 dark:text-[#cccccc] text-xs">
                                {editValue ? '선택됨 (True)' : '선택 안 됨 (False)'}
                              </span>
                            </label>
                          ) : isRichOrLong ? (
                            <textarea
                              autoFocus
                              rows={4}
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              className="w-full bg-white dark:bg-[#1e1e1e] border border-amber-500 rounded-lg p-2 text-xs outline-none text-stone-900 dark:text-[#f5f5f5] leading-relaxed resize-y"
                              placeholder="내용을 입력하세요..."
                            />
                          ) : (
                            <input
                              autoFocus
                              type={col.type === 'number' ? 'number' : col.type === 'date' ? 'date' : 'text'}
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveField(col.id);
                                if (e.key === 'Escape') setEditingColId(null);
                              }}
                              className="w-full bg-white dark:bg-[#1e1e1e] border border-amber-500 rounded-lg px-2.5 py-1.5 text-xs outline-none text-stone-900 dark:text-[#f5f5f5]"
                            />
                          )}

                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => handleSaveField(col.id)}
                              className="px-3 py-1 bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold rounded-lg text-xs transition-colors"
                            >
                              저장
                            </button>
                            <button
                              onClick={() => setEditingColId(null)}
                              className="px-3 py-1 bg-stone-200 dark:bg-[#333333] hover:bg-stone-300 dark:hover:bg-[#404040] text-stone-600 dark:text-[#cccccc] rounded-lg text-xs transition-colors"
                            >
                              취소
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="text-stone-900 dark:text-[#e0e0e0] font-medium text-xs min-h-[22px]">
                          {col.type === 'status' || col.type === 'select' ? (
                            (() => {
                              if (val === undefined || val === null || val === '') {
                                return <span className="text-stone-400 dark:text-[#777777] italic">미정</span>;
                              }
                              const strVal = cleanTextValue(val);
                              const option = col.options?.find(
                                (o) => o.id === strVal || o.label === strVal || o.id === String(val) || o.label === String(val)
                              );
                              if (option) {
                                return (
                                  <span
                                    style={{
                                      backgroundColor: `${option.color}20`,
                                      color: option.color,
                                      borderColor: `${option.color}40`,
                                    }}
                                    className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border"
                                  >
                                    {option.label}
                                  </span>
                                );
                              }
                              const defaultTagColors = ['#F59E0B', '#3B82F6', '#10B981', '#8B5CF6', '#EC4899', '#06B6D4'];
                              let hash = 0;
                              for (let i = 0; i < strVal.length; i++) hash = (hash << 5) - hash + strVal.charCodeAt(i);
                              const color = defaultTagColors[Math.abs(hash) % defaultTagColors.length];

                              return (
                                <span
                                  style={{
                                    backgroundColor: `${color}20`,
                                    color: color,
                                    borderColor: `${color}40`,
                                  }}
                                  className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border"
                                >
                                  {strVal}
                                </span>
                              );
                            })()
                          ) : col.type === 'checkbox' ? (
                            <span
                              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md font-semibold text-xs ${
                                val
                                  ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                                  : 'bg-stone-200/60 dark:bg-[#333333] text-stone-500 dark:text-[#999999]'
                              }`}
                            >
                              {val ? '✓ 활성됨' : '미체크'}
                            </span>
                          ) : col.type === 'code' ? (
                            <CodeBlockViewer
                              code={String(val ?? '')}
                              language="sql"
                              maxHeight="max-h-72"
                            />
                          ) : (() => {
                            const strVal = String(val ?? '');
                            if (!strVal || strVal.trim() === '') {
                              return <span className="text-stone-400 dark:text-[#777777] italic">(비어 있음)</span>;
                            }

                            // Only treat as rich HTML if explicitly richText or contains complex rich elements like images/tables/stickers
                            const isRichHtml =
                              (col.type === 'richText' ||
                               strVal.includes('<img') ||
                               strVal.includes('<table') ||
                               strVal.includes('<sticker-node')) &&
                              (strVal.includes('<') && strVal.includes('>'));

                            if (isRichHtml) {
                              return (
                                <div
                                  className="prose dark:prose-invert max-w-none text-xs leading-relaxed break-words tiptap wonbee-rendered-table cursor-pointer [&_p]:mb-2 [&_p]:leading-relaxed"
                                  onClick={(e) => {
                                    const target = e.target as HTMLElement;
                                    if (target.tagName === 'IMG') {
                                      const src = target.getAttribute('src');
                                      if (src) setLightboxImg(src);
                                    }
                                  }}
                                  dangerouslySetInnerHTML={{ __html: strVal }}
                                />
                              );
                            }

                            const cleanedString = cleanTextValue(strVal);
                            const detected = detectLanguage(cleanedString);
                            if (detected.isCode && (cleanedString.includes('\n') || cleanedString.length > 50)) {
                              return (
                                <CodeBlockViewer
                                  code={cleanedString}
                                  language={detected.language}
                                  maxHeight="max-h-80"
                                />
                              );
                            }
                            return (
                              <div className="whitespace-pre-wrap break-words leading-relaxed text-xs text-stone-800 dark:text-[#f0f0f0] font-sans">
                                {cleanedString}
                              </div>
                            );
                          })()}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 2. Extra Rich Document Note (If present) */}
            {row.richContent && row.richContent.trim() !== '' && (
              <div className="p-4 rounded-xl bg-stone-50/70 dark:bg-[#242424] border border-stone-200/80 dark:border-[#333333]">
                <div className="flex items-center justify-between mb-3 border-b border-stone-200/60 dark:border-[#333333] pb-2">
                  <h3 className="text-xs font-bold text-stone-800 dark:text-[#eeeeee] uppercase tracking-wider flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-indigo-500" />
                    추가 상세 서식 문서 / 메모
                  </h3>
                  <button
                    onClick={() => {
                      onOpenRichEditor(row);
                      onClose();
                    }}
                    className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-1"
                  >
                    <Edit3 className="w-3 h-3" />
                    서식 에디터 열기
                  </button>
                </div>

                <div
                  className="prose dark:prose-invert max-w-none text-xs text-stone-800 dark:text-[#cccccc] leading-relaxed tiptap p-3 bg-white dark:bg-[#1a1a1a] rounded-lg border border-stone-200/60 dark:border-[#2d2d2d] wonbee-rendered-table cursor-pointer"
                  onClick={(e) => {
                    const target = e.target as HTMLElement;
                    if (target.tagName === 'IMG') {
                      const src = target.getAttribute('src');
                      if (src) setLightboxImg(src);
                    }
                  }}
                  dangerouslySetInnerHTML={{ __html: row.richContent }}
                />
              </div>
            )}

            {/* 3. Sticky Notes */}
            {row.stickers && row.stickers.length > 0 && (
              <div className="p-4 rounded-xl bg-stone-50/70 dark:bg-[#242424] border border-stone-200/80 dark:border-[#333333]">
                <h3 className="text-xs font-bold text-stone-800 dark:text-[#eeeeee] uppercase tracking-wider flex items-center gap-1.5 mb-3">
                  <Pin className="w-3.5 h-3.5 text-amber-500" />
                  부착된 원노트 스티커 메모 ({row.stickers.length}개)
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {row.stickers.map((stk) => (
                    <div
                      key={stk.id}
                      className="p-3 rounded-xl bg-amber-50 dark:bg-[#2a261c] border border-amber-200 dark:border-amber-900/50 shadow-sm space-y-1.5 relative"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-stone-800 dark:text-amber-300 text-xs">
                          {stk.title}
                        </span>
                        {stk.isPinned && <Pin className="w-3 h-3 text-amber-600 dark:text-amber-400 fill-current" />}
                      </div>
                      <p className="text-[11px] text-stone-600 dark:text-[#cccccc] whitespace-pre-wrap leading-relaxed">
                        {stk.content}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 4. Metadata Footprint */}
            <div className="pt-3 border-t border-stone-200 dark:border-[#333333] flex flex-wrap items-center justify-between gap-3 text-[11px] text-stone-400 dark:text-[#888888]">
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  생성: {formatDate(row.createdAt)}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  최종 수정: {formatDate(row.updatedAt)}
                </span>
              </div>
              <div className="font-mono text-[10px]">ID: {row.id}</div>
            </div>
          </div>

          {/* Bottom Actions Bar */}
          <div className="px-5 py-3 border-t border-stone-200 dark:border-[#333333] bg-stone-50/90 dark:bg-[#242424] flex items-center justify-between flex-shrink-0">
            <button
              onClick={() => {
                if (window.confirm('정말 이 레코드를 삭제하시겠습니까?')) {
                  onDeleteRow(row.id);
                  onClose();
                }
              }}
              className="px-3 py-1.5 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              레코드 삭제
            </button>

            <div className="flex items-center gap-2">
              <button
                onClick={handleClose}
                className="px-4 py-1.5 bg-stone-200/80 dark:bg-[#333333] hover:bg-stone-300 dark:hover:bg-[#404040] text-stone-700 dark:text-[#eeeeee] font-semibold rounded-lg text-xs transition-colors"
              >
                닫기 (ESC)
              </button>
              <button
                onClick={() => {
                  onOpenRichEditor(row);
                  onClose();
                }}
                className="px-4 py-1.5 bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold rounded-lg text-xs flex items-center gap-1.5 shadow-sm transition-colors"
              >
                <Edit3 className="w-3.5 h-3.5" />
                리치 에디터 열기
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Image Lightbox Modal */}
      <ImageLightboxModal
        isOpen={!!lightboxImg}
        imageUrl={lightboxImg}
        onClose={() => setLightboxImg(null)}
      />
    </>
  );
};
