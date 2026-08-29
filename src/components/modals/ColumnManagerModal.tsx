import React, { useState } from 'react';
import { TableColumn, ColumnType } from '../../types';
import {
  X,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Eye,
  EyeOff,
  Tag,
  Hash,
  Calendar,
  Code,
  Type,
  CheckSquare,
  Sparkles,
  Sliders,
  Check,
  Edit2,
  AlertTriangle,
} from 'lucide-react';

interface ColumnManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  columns: TableColumn[];
  hiddenColumnIds: Set<string>;
  onToggleColumnVisibility: (colId: string) => void;
  onReorderColumns: (newCols: TableColumn[]) => void;
  onAddColumn: (col: TableColumn) => void;
  onUpdateColumn: (colId: string, updated: Partial<TableColumn>) => void;
  onDeleteColumn: (colId: string) => void;
}

export const ColumnManagerModal: React.FC<ColumnManagerModalProps> = ({
  isOpen,
  onClose,
  columns,
  hiddenColumnIds,
  onToggleColumnVisibility,
  onReorderColumns,
  onAddColumn,
  onUpdateColumn,
  onDeleteColumn,
}) => {
  const [newColName, setNewColName] = useState('');
  const [newColType, setNewColType] = useState<ColumnType>('text');
  const [editingColId, setEditingColId] = useState<string | null>(null);
  const [editColName, setEditColName] = useState('');
  const [editColType, setEditColType] = useState<ColumnType>('text');

  // Dedicated Column Delete Confirmation Modal State
  const [columnToDelete, setColumnToDelete] = useState<TableColumn | null>(null);

  if (!isOpen) return null;

  const handleAddNew = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newColName.trim()) return;

    const newColId = `col-${Date.now().toString(36)}`;
    const newCol: TableColumn = {
      id: newColId,
      name: newColName.trim(),
      type: newColType,
      width: 160,
      options:
        newColType === 'status' || newColType === 'select'
          ? [
              { id: 'opt-1', label: '대기', color: '#9CA3AF' },
              { id: 'opt-2', label: '진행중', color: '#F59E0B' },
              { id: 'opt-3', label: '완료', color: '#10B981' },
            ]
          : undefined,
    };

    onAddColumn(newCol);
    setNewColName('');
  };

  const handleMove = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= columns.length) return;

    const next = [...columns];
    const [moved] = next.splice(index, 1);
    next.splice(targetIndex, 0, moved);
    onReorderColumns(next);
  };

  const confirmDeleteColumn = () => {
    if (columnToDelete) {
      onDeleteColumn(columnToDelete.id);
      setColumnToDelete(null);
    }
  };

  const getColIcon = (type: ColumnType) => {
    switch (type) {
      case 'number':
        return <Hash className="w-3.5 h-3.5 text-blue-500" />;
      case 'select':
      case 'status':
        return <Tag className="w-3.5 h-3.5 text-amber-500" />;
      case 'date':
        return <Calendar className="w-3.5 h-3.5 text-purple-500" />;
      case 'checkbox':
        return <CheckSquare className="w-3.5 h-3.5 text-emerald-500" />;
      case 'code':
        return <Code className="w-3.5 h-3.5 text-stone-500 dark:text-amber-400" />;
      case 'richText':
        return <Sparkles className="w-3.5 h-3.5 text-amber-500" />;
      default:
        return <Type className="w-3.5 h-3.5 text-stone-400" />;
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-[#1e1e1e] rounded-2xl shadow-2xl border border-stone-200 dark:border-[#383838] w-full max-w-lg overflow-hidden flex flex-col max-h-[85vh] mat-shadow-3 relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-200 dark:border-[#333333] bg-stone-50 dark:bg-[#252525]">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-amber-500" />
            <h2 className="text-sm font-bold text-stone-900 dark:text-[#f5f5f5]">
              열(Column) 구조 및 표시 관리
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-[#333333] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Add Column Section */}
        <form
          onSubmit={handleAddNew}
          className="p-4 border-b border-stone-200 dark:border-[#333333] bg-amber-50/40 dark:bg-amber-950/10 flex items-center gap-2"
        >
          <input
            type="text"
            placeholder="새 열 이름 입력 (예: 담당자, 마감일)"
            value={newColName}
            onChange={(e) => setNewColName(e.target.value)}
            className="flex-1 px-3 py-1.5 bg-white dark:bg-[#181818] border border-stone-200 dark:border-[#383838] rounded-lg text-xs text-stone-800 dark:text-[#f0f0f0] outline-none focus:border-amber-500"
          />
          <select
            value={newColType}
            onChange={(e) => setNewColType(e.target.value as ColumnType)}
            className="px-2.5 py-1.5 bg-white dark:bg-[#181818] border border-stone-200 dark:border-[#383838] rounded-lg text-xs text-stone-800 dark:text-[#f0f0f0] outline-none"
          >
            <option value="text">텍스트 (Text)</option>
            <option value="number">숫자 (Number)</option>
            <option value="status">상태 (Status Tag)</option>
            <option value="select">선택 (Select)</option>
            <option value="date">날짜 (Date)</option>
            <option value="checkbox">체크박스 (Checkbox)</option>
            <option value="code">코드 블록 (Code)</option>
            <option value="richText">서식 문서 (RichText)</option>
          </select>
          <button
            type="submit"
            disabled={!newColName.trim()}
            className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-stone-950 rounded-lg text-xs font-bold flex items-center gap-1 transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            열 추가
          </button>
        </form>

        {/* Existing Columns List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
          <div className="text-[11px] font-semibold text-stone-400 dark:text-[#888888] uppercase tracking-wider mb-2 flex items-center justify-between">
            <span>현재 열 목록 ({columns.length}개)</span>
            <span>순서 및 표시 여부</span>
          </div>

          {columns.map((col, idx) => {
            const isHidden = hiddenColumnIds.has(col.id);
            const isEditing = editingColId === col.id;

            return (
              <div
                key={col.id}
                className={`flex items-center justify-between p-2.5 rounded-xl border transition-all ${
                  isHidden
                    ? 'bg-stone-50 dark:bg-[#181818] border-stone-200/60 dark:border-[#2e2e2e] opacity-60'
                    : 'bg-white dark:bg-[#252525] border-stone-200 dark:border-[#383838] shadow-2xs'
                }`}
              >
                {/* Left: Type Icon & Name */}
                <div className="flex items-center gap-2.5 flex-1 min-w-0 mr-3">
                  <div className="p-1.5 rounded-lg bg-stone-100 dark:bg-[#1e1e1e] flex-shrink-0">
                    {getColIcon(col.type)}
                  </div>

                  {isEditing ? (
                    <div className="flex items-center gap-2 flex-1">
                      <input
                        type="text"
                        value={editColName}
                        onChange={(e) => setEditColName(e.target.value)}
                        className="px-2 py-1 bg-white dark:bg-[#181818] border border-amber-500 rounded text-xs text-stone-900 dark:text-[#f5f5f5] flex-1 outline-none"
                      />
                      <select
                        value={editColType}
                        onChange={(e) => setEditColType(e.target.value as ColumnType)}
                        className="px-2 py-1 bg-white dark:bg-[#181818] border border-stone-300 dark:border-[#444] rounded text-xs text-stone-900 dark:text-[#f5f5f5] outline-none"
                      >
                        <option value="text">텍스트</option>
                        <option value="number">숫자</option>
                        <option value="status">상태 태그</option>
                        <option value="select">선택</option>
                        <option value="date">날짜</option>
                        <option value="checkbox">체크박스</option>
                        <option value="code">코드</option>
                        <option value="richText">서식 문서</option>
                      </select>
                      <button
                        onClick={() => {
                          if (editColName.trim()) {
                            onUpdateColumn(col.id, {
                              name: editColName.trim(),
                              type: editColType,
                            });
                          }
                          setEditingColId(null);
                        }}
                        className="p-1 bg-emerald-500 hover:bg-emerald-400 text-white rounded"
                        title="적용"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold text-stone-900 dark:text-[#f0f0f0] truncate">
                          {col.name}
                        </span>
                        {col.isPrimaryKey && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 font-bold">
                            기본 키
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-stone-400 dark:text-[#888888] capitalize">
                        {col.type} • {col.width || 160}px
                      </span>
                    </div>
                  )}
                </div>

                {/* Right: Actions (Reorder, Visibility, Edit, Delete) */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  {/* Up / Down */}
                  <button
                    disabled={idx === 0}
                    onClick={() => handleMove(idx, 'up')}
                    className="p-1 rounded hover:bg-stone-100 dark:hover:bg-[#333333] disabled:opacity-20 text-stone-500 dark:text-[#aaaaaa] transition-colors"
                    title="위로 이동"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    disabled={idx === columns.length - 1}
                    onClick={() => handleMove(idx, 'down')}
                    className="p-1 rounded hover:bg-stone-100 dark:hover:bg-[#333333] disabled:opacity-20 text-stone-500 dark:text-[#aaaaaa] transition-colors"
                    title="아래로 이동"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>

                  {/* Toggle Visibility */}
                  <button
                    onClick={() => onToggleColumnVisibility(col.id)}
                    className={`p-1 rounded hover:bg-stone-100 dark:hover:bg-[#333333] transition-colors ${
                      isHidden ? 'text-stone-400' : 'text-amber-600 dark:text-amber-400'
                    }`}
                    title={isHidden ? '열 표시하기' : '열 숨기기'}
                  >
                    {isHidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>

                  {/* Edit Name / Type */}
                  {!isEditing && (
                    <button
                      onClick={() => {
                        setEditingColId(col.id);
                        setEditColName(col.name);
                        setEditColType(col.type);
                      }}
                      className="p-1 rounded hover:bg-stone-100 dark:hover:bg-[#333333] text-stone-500 dark:text-[#aaaaaa] transition-colors"
                      title="이름/타입 변경"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {/* Delete Column (Protected for primary key) */}
                  {!col.isPrimaryKey && (
                    <button
                      onClick={() => setColumnToDelete(col)}
                      className="p-1 rounded hover:bg-rose-100 dark:hover:bg-rose-950/40 text-stone-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
                      title="열 삭제"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-stone-200 dark:border-[#333333] bg-stone-50 dark:bg-[#222222] flex items-center justify-between text-xs">
          <span className="text-[11px] text-stone-400 dark:text-[#888888]">
            열 순서와 너비는 테이블에 즉시 반영됩니다.
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-stone-900 dark:bg-stone-100 hover:bg-amber-500 dark:hover:bg-amber-400 text-white dark:text-stone-900 font-semibold rounded-lg transition-colors"
          >
            닫기
          </button>
        </div>

        {/* Dedicated Delete Confirmation Dialog */}
        {columnToDelete && (
          <div className="absolute inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-6 z-50 animate-in fade-in duration-150">
            <div className="bg-white dark:bg-[#222222] rounded-2xl border border-rose-200 dark:border-rose-900/60 shadow-2xl p-5 max-w-sm w-full animate-in zoom-in-95 duration-150 text-stone-900 dark:text-[#f0f0f0]">
              <div className="flex items-center gap-3 mb-3 text-rose-600 dark:text-rose-400">
                <div className="p-2 rounded-xl bg-rose-100 dark:bg-rose-950/60">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm">열(Column) 삭제 확인</h3>
                  <p className="text-[11px] text-stone-500 dark:text-[#a0a0a0]">
                    되돌릴 수 없는 작업입니다.
                  </p>
                </div>
              </div>

              <p className="text-xs text-stone-600 dark:text-[#cccccc] mb-4 leading-relaxed bg-stone-50 dark:bg-[#181818] p-3 rounded-xl border border-stone-200 dark:border-[#333333]">
                정말 <strong className="text-rose-600 dark:text-rose-400">'{columnToDelete.name}'</strong> 열을 삭제하시겠습니까?
                <br />
                해당 열에 입력된 모든 데이터가 테이블에서 영구적으로 삭제됩니다.
              </p>

              <div className="flex items-center justify-end gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setColumnToDelete(null)}
                  className="px-3.5 py-1.5 rounded-lg border border-stone-200 dark:border-[#383838] text-stone-600 dark:text-[#cccccc] hover:bg-stone-100 dark:hover:bg-[#2c2c2c] font-medium transition-colors"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={confirmDeleteColumn}
                  className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold transition-all shadow-sm flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  열 삭제하기
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

