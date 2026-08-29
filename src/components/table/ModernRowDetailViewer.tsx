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

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowLeft' && currentIndex > 0) {
        onNavigate(currentIndex - 1);
      } else if (e.key === 'ArrowRight' && currentIndex < totalRows - 1) {
        onNavigate(currentIndex + 1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, currentIndex, totalRows, onClose, onNavigate]);

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
    const updated: TableRow = {
      ...row,
      data: {
        ...row.data,
        [colId]: editValue,
      },
      updatedAt: Date.now(),
    };
    onUpdateRow(updated);
    setEditingColId(null);
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
      onClick={onClose}
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
                onClick={() => onNavigate(currentIndex - 1)}
                disabled={currentIndex === 0}
                className="p-1 rounded text-stone-600 dark:text-[#cccccc] hover:bg-white dark:hover:bg-[#383838] disabled:opacity-30 transition-colors"
                title="이전 행 (←)"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => onNavigate(currentIndex + 1)}
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
                onClose();
              }}
              className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold rounded-lg text-xs flex items-center gap-1.5 shadow-sm transition-colors"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <span>에디터로 편집</span>
            </button>

            {/* Close */}
            <button
              onClick={onClose}
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

                return (
                  <div
                    key={col.id}
                    className="p-3 rounded-xl bg-stone-50/70 dark:bg-[#242424] border border-stone-200/80 dark:border-[#333333] hover:border-amber-500/50 dark:hover:border-amber-500/50 transition-all group/field relative"
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
                              setEditValue(val ?? '');
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
                      <div className="mt-2 flex items-center gap-1.5">
                        {col.type === 'status' || col.type === 'select' ? (
                          <select
                            autoFocus
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            className="w-full bg-white dark:bg-[#1e1e1e] border border-amber-500 rounded-lg px-2.5 py-1 text-xs outline-none text-stone-900 dark:text-[#f5f5f5]"
                          >
                            <option value="">선택 안 함</option>
                            {col.options?.map((opt) => (
                              <option key={opt.id} value={opt.id}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
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
                            className="w-full bg-white dark:bg-[#1e1e1e] border border-amber-500 rounded-lg px-2.5 py-1 text-xs outline-none text-stone-900 dark:text-[#f5f5f5]"
                          />
                        )}

                        <button
                          onClick={() => handleSaveField(col.id)}
                          className="px-2 py-1 bg-amber-500 text-stone-950 font-bold rounded-lg text-xs"
                        >
                          저장
                        </button>
                        <button
                          onClick={() => setEditingColId(null)}
                          className="px-2 py-1 bg-stone-200 dark:bg-[#333333] text-stone-600 dark:text-[#cccccc] rounded-lg text-xs"
                        >
                          취소
                        </button>
                      </div>
                    ) : (
                      <div className="text-stone-900 dark:text-[#e0e0e0] font-medium min-h-[22px] flex items-center">
                        {col.type === 'status' || col.type === 'select' ? (
                          (() => {
                            const option = col.options?.find((o) => o.id === val);
                            if (!option) return <span className="text-stone-400 italic">미정</span>;
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
                          <code className="px-2 py-1 rounded bg-stone-100 dark:bg-[#1e1e1e] border border-stone-200 dark:border-[#333333] text-amber-700 dark:text-amber-300 font-mono text-[11px] block w-full overflow-x-auto">
                            {String(val ?? '')}
                          </code>
                        ) : (
                          <p className="whitespace-pre-wrap break-words leading-relaxed">
                            {val !== undefined && val !== null && String(val) !== '' ? (
                              String(val)
                            ) : (
                              <span className="text-stone-400 dark:text-[#777777] italic">
                                (비어 있음)
                              </span>
                            )}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 2. Rich Content Document Preview */}
          <div className="p-4 rounded-xl bg-stone-50/70 dark:bg-[#242424] border border-stone-200/80 dark:border-[#333333]">
            <div className="flex items-center justify-between mb-3 border-b border-stone-200/60 dark:border-[#333333] pb-2">
              <h3 className="text-xs font-bold text-stone-800 dark:text-[#eeeeee] uppercase tracking-wider flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-indigo-500" />
                리치 에디터 문서 본문 (TipTap Content)
              </h3>
              <button
                onClick={() => {
                  onOpenRichEditor(row);
                  onClose();
                }}
                className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-1"
              >
                <Edit3 className="w-3 h-3" />
                에디터 열기
              </button>
            </div>

            {row.richContent && row.richContent.trim() !== '' ? (
              <div
                className="prose dark:prose-invert max-w-none text-xs text-stone-800 dark:text-[#cccccc] leading-relaxed tiptap p-3 bg-white dark:bg-[#1a1a1a] rounded-lg border border-stone-200/60 dark:border-[#2d2d2d]"
                dangerouslySetInnerHTML={{ __html: row.richContent }}
              />
            ) : (
              <div className="py-6 text-center text-stone-400 dark:text-[#777777]">
                <p className="italic">작성된 리치 텍스트 본문이 없습니다.</p>
                <button
                  onClick={() => {
                    onOpenRichEditor(row);
                    onClose();
                  }}
                  className="mt-2 text-xs font-bold text-amber-600 dark:text-amber-400 hover:underline"
                >
                  본문 작성 및 스티커 추가하기 →
                </button>
              </div>
            )}
          </div>

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
