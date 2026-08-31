import React, { useState, useEffect } from 'react';
import { TableRow, TableColumn, TableDocument } from '../../types';
import {
  X,
  ChevronLeft,
  ChevronRight,
  Maximize2,
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
  ExternalLink,
  Layers,
  Sparkles,
  Pin,
  HelpCircle,
  FolderOpen,
} from 'lucide-react';
import { detectLanguage } from '../../utils/codeHighlighter';
import { CodeBlockViewer } from '../common/CodeBlockViewer';
import { cleanTextValue } from '../../utils/textSanitizer';
import { SelectOrCustomInput } from '../common/SelectOrCustomInput';

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

  // Reset editing state whenever row changes, drawer opens/closes, or index changes
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

  // Keyboard navigation
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
    const cleaned = typeof editValue === 'string' && targetCol?.type !== 'richText'
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

  // Get primary title of row
  const primaryCol = columns.find((c) => c.isPrimaryKey) || columns[0];
  const primaryTitle = primaryCol ? String(row.data[primaryCol.id] || '제목 없음') : '레코드 데이터';

  const getColIcon = (type: string) => {
    switch (type) {
      case 'number':
        return <Hash className="w-3.5 h-3.5 text-blue-500" />;
      case 'date':
        return <Calendar className="w-3.5 h-3.5 text-purple-500" />;
      case 'status':
        return <Tag className="w-3.5 h-3.5 text-amber-500" />;
      case 'code':
        return <Code className="w-3.5 h-3.5 text-emerald-500" />;
      case 'checkbox':
        return <CheckSquare className="w-3.5 h-3.5 text-rose-500" />;
      case 'richText':
        return <FileText className="w-3.5 h-3.5 text-indigo-500" />;
      default:
        return <Type className="w-3.5 h-3.5 text-stone-400" />;
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

  return (
    <div
      id="modern-row-detail-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={handleClose}
    >
      <div
        className="bg-white dark:bg-[#1e1e1e] border border-stone-200 dark:border-[#383838] rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col transition-all duration-150 mat-shadow-3"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Bar */}
        <div className="px-6 py-4 border-b border-stone-200 dark:border-[#333333] bg-stone-50/80 dark:bg-[#242424] flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center flex-shrink-0 font-bold border border-amber-500/20">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold text-stone-500 dark:text-[#9e9e9e] uppercase tracking-wider">
                  {tableName}
                </span>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-stone-200/70 dark:bg-[#333333] text-stone-600 dark:text-[#cccccc] font-mono font-medium">
                  #{currentIndex + 1} / {totalRows}
                </span>
              </div>
              <h2 className="text-base font-bold text-stone-900 dark:text-[#f5f5f5] truncate">
                {primaryTitle}
              </h2>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {/* Prev / Next Row Navigation */}
            <div className="flex items-center bg-stone-200/60 dark:bg-[#2c2c2c] rounded-lg p-0.5 mr-1 border border-stone-300/40 dark:border-[#383838]">
              <button
                onClick={() => handleNavigate(currentIndex - 1)}
                disabled={currentIndex === 0}
                className="p-1 rounded text-stone-600 dark:text-[#cccccc] hover:bg-white dark:hover:bg-[#383838] disabled:opacity-30 transition-colors"
                title="이전 행 (←)"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => handleNavigate(currentIndex + 1)}
                disabled={currentIndex >= totalRows - 1}
                className="p-1 rounded text-stone-600 dark:text-[#cccccc] hover:bg-white dark:hover:bg-[#383838] disabled:opacity-30 transition-colors"
                title="다음 행 (→)"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Copy JSON */}
            <button
              onClick={handleCopyAll}
              className="px-2.5 py-1.5 rounded-lg bg-stone-100 dark:bg-[#2c2c2c] hover:bg-stone-200 dark:hover:bg-[#383838] text-stone-700 dark:text-[#cccccc] text-xs font-medium flex items-center gap-1.5 border border-stone-200 dark:border-[#383838] transition-colors"
              title="이 행의 모든 데이터를 JSON 형식으로 복사"
            >
              {copiedAll ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedAll ? '복사 완료!' : 'JSON 복사'}</span>
            </button>

            {/* Open in TipTap Rich Editor */}
            <button
              onClick={() => {
                onOpenRichEditor(row);
                handleClose();
              }}
              className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold rounded-lg text-xs flex items-center gap-1.5 shadow-sm transition-colors"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <span>에디터로 편집</span>
            </button>

            {/* Close */}
            <button
              onClick={handleClose}
              className="p-1.5 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-[#2c2c2c] rounded-lg transition-colors ml-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Body Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar text-xs bg-white dark:bg-[#1e1e1e]">
          {/* 1. Key-Value Properties Grid */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold text-stone-800 dark:text-[#eeeeee] uppercase tracking-wider flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-amber-500" />
                테이블 데이터 속성 ({columns.length}개 필드)
              </h3>
              <span className="text-[11px] text-stone-400 dark:text-[#888888]">
                항목을 클릭하여 수정하거나 복사할 수 있습니다
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {columns.map((col) => {
                const val = row.data[col.id];
                const isEditing = editingColId === col.id;
                const isCopied = copiedKey === col.id;
                const isRichOrLong = col.type === 'richText' || (typeof val === 'string' && (val.length > 60 || val.includes('\n')));

                return (
                  <div
                    key={col.id}
                    className={`p-3 rounded-xl bg-stone-50/70 dark:bg-[#242424] border border-stone-200/80 dark:border-[#333333] hover:border-amber-500/50 dark:hover:border-amber-500/50 transition-all group/field relative ${
                      isRichOrLong ? 'col-span-1 md:col-span-2' : ''
                    }`}
                  >
                    {/* Field Header */}
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1.5 font-semibold text-stone-700 dark:text-[#cccccc]">
                        {getColIcon(col.type)}
                        <span className="truncate">{col.name}</span>
                        {col.isPrimaryKey && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-600 dark:text-amber-400 font-bold">
                            PK
                          </span>
                        )}
                        {col.type === 'richText' && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 font-medium">
                            서식 지원
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1 opacity-0 group-hover/field:opacity-100 transition-opacity">
                        <button
                          onClick={() => handleCopyField(col.id, val)}
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
                            title="빠른 수정"
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
                            <span className="text-stone-700 dark:text-[#cccccc]">
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
                          {col.type === 'richText' && (
                            <button
                              onClick={() => {
                                onOpenRichEditor(row);
                                onClose();
                              }}
                              className="ml-auto text-[11px] text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-1 font-semibold"
                            >
                              <Sparkles className="w-3 h-3" />
                              서식 에디터로 확장
                            </button>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="text-stone-900 dark:text-[#e0e0e0] font-medium min-h-[22px]">
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
                            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md font-semibold ${
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

                          const isRichHtml =
                            col.type === 'richText' ||
                            strVal.includes('<img') ||
                            strVal.includes('<table') ||
                            strVal.includes('<sticker-node') ||
                            strVal.includes('<h1>') ||
                            strVal.includes('<h2>') ||
                            strVal.includes('<h3>') ||
                            strVal.includes('<strong>') ||
                            strVal.includes('<em>') ||
                            strVal.includes('<blockquote>') ||
                            (strVal.startsWith('<p>') && strVal.includes('</p>'));

                          if (isRichHtml) {
                            return (
                              <div
                                className="prose dark:prose-invert max-w-none text-xs leading-relaxed break-words tiptap"
                                dangerouslySetInnerHTML={{ __html: strVal }}
                              />
                            );
                          }

                          const cleanedString = cleanTextValue(strVal);
                          const detected = detectLanguage(cleanedString);
                          if (detected.isCode) {
                            return (
                              <CodeBlockViewer
                                code={cleanedString}
                                language={detected.language}
                                maxHeight="max-h-80"
                              />
                            );
                          }
                          return (
                            <p className="whitespace-pre-wrap break-words leading-relaxed text-xs">
                              {cleanedString}
                            </p>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 2. Optional Extra Rich Document Note (Only shown when content exists) */}
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
                className="prose dark:prose-invert max-w-none text-xs text-stone-800 dark:text-[#cccccc] leading-relaxed tiptap p-3 bg-white dark:bg-[#1a1a1a] rounded-lg border border-stone-200/60 dark:border-[#2d2d2d]"
                dangerouslySetInnerHTML={{ __html: row.richContent }}
              />
            </div>
          )}

          {/* 3. OneNote Sticky Notes Preview */}
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
        <div className="px-6 py-3 border-t border-stone-200 dark:border-[#333333] bg-stone-50/80 dark:bg-[#242424] flex items-center justify-between flex-shrink-0">
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
              onClick={onClose}
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
  );
};
