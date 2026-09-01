import React, { useState, useEffect } from 'react';
import { TableColumn, TableRow } from '../../types';
import { cleanTextValue } from '../../utils/textSanitizer';
import {
  X,
  Plus,
  Sparkles,
  Tag,
  Hash,
  Type,
  Calendar,
  CheckSquare,
  Code,
  FileText,
  FileSpreadsheet,
  Upload,
  HelpCircle,
} from 'lucide-react';

interface AddRowModalProps {
  isOpen: boolean;
  onClose: () => void;
  columns: TableColumn[];
  tableName: string;
  insertPosition?: 'bottom' | 'top';
  onAddRow: (rowData: Record<string, any>, richContent?: string, position?: 'bottom' | 'top') => void;
  onOpenImportModal?: () => void;
}

export const AddRowModal: React.FC<AddRowModalProps> = ({
  isOpen,
  onClose,
  columns,
  tableName,
  insertPosition = 'bottom',
  onAddRow,
  onOpenImportModal,
}) => {
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [richContent, setRichContent] = useState<string>('');
  const [position, setPosition] = useState<'bottom' | 'top'>(insertPosition);

  // Custom text input for select/status columns when user chooses "직접 입력"
  const [customOptionInput, setCustomOptionInput] = useState<Record<string, string>>({});
  const [isCustomMode, setIsCustomMode] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (isOpen) {
      // Initialize form data with default values
      const initial: Record<string, any> = {};
      columns.forEach((col) => {
        if (col.type === 'checkbox') {
          initial[col.id] = false;
        } else if (col.type === 'number') {
          initial[col.id] = '';
        } else {
          initial[col.id] = '';
        }
      });
      setFormData(initial);
      setRichContent('');
      setPosition(insertPosition);
      setCustomOptionInput({});
      setIsCustomMode({});
    }
  }, [isOpen, columns, insertPosition]);

  if (!isOpen) return null;

  const handleChange = (colId: string, value: any) => {
    setFormData((prev) => ({
      ...prev,
      [colId]: value,
    }));
  };

  const handleCustomOptionSubmit = (colId: string) => {
    const customVal = customOptionInput[colId]?.trim();
    if (customVal) {
      handleChange(colId, customVal);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const cleanedData: Record<string, any> = {};
    columns.forEach((col) => {
      const val = formData[col.id];
      if (val !== undefined && val !== null) {
        if (typeof val === 'string' && col.type !== 'richText') {
          cleanedData[col.id] = cleanTextValue(val);
        } else if (col.type === 'number') {
          cleanedData[col.id] = val === '' ? '' : Number(val);
        } else {
          cleanedData[col.id] = val;
        }
      }
    });

    onAddRow(cleanedData, richContent, position);
    onClose();
  };

  const getColIcon = (type: string) => {
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

  const primaryCol = columns.find((c) => c.isPrimaryKey) || columns[0];

  return (
    <div
      id="add-row-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        id="add-row-modal-container"
        className="bg-white dark:bg-[#1e1e1e] rounded-2xl shadow-2xl border border-stone-200 dark:border-[#383838] w-full max-w-xl max-h-[90vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-200 dark:border-[#333333] bg-stone-50/80 dark:bg-[#252525]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 dark:bg-amber-400/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <Plus className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">
                  {tableName}
                </span>
              </div>
              <h2 className="text-base font-bold text-stone-900 dark:text-[#f5f5f5]">
                새 데이터 행 추가
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-[#333333] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
          {/* CSV / TXT Import Banner */}
          {onOpenImportModal && (
            <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-800/60">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                <span className="text-xs text-emerald-800 dark:text-emerald-300 font-medium">
                  엑셀이나 텍스트 파일(CSV/TXT)로 여러 행을 한 번에 가져오시겠습니까?
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenImportModal();
                }}
                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold rounded-lg transition-colors flex items-center gap-1 flex-shrink-0"
              >
                <Upload className="w-3 h-3" />
                <span>CSV/TXT 가져오기</span>
              </button>
            </div>
          )}

          {/* Insert position selector */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-stone-50 dark:bg-[#252525] border border-stone-200/70 dark:border-[#333333]">
            <span className="text-xs font-semibold text-stone-700 dark:text-[#cccccc]">
              행 삽입 위치
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setPosition('bottom')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                  position === 'bottom'
                    ? 'bg-amber-500 text-stone-950 shadow-xs'
                    : 'bg-white dark:bg-[#1f1f1f] text-stone-600 dark:text-[#aaaaaa] border border-stone-200 dark:border-[#383838]'
                }`}
              >
                테이블 하단에 추가
              </button>
              <button
                type="button"
                onClick={() => setPosition('top')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                  position === 'top'
                    ? 'bg-amber-500 text-stone-950 shadow-xs'
                    : 'bg-white dark:bg-[#1f1f1f] text-stone-600 dark:text-[#aaaaaa] border border-stone-200 dark:border-[#383838]'
                }`}
              >
                테이블 상단에 추가
              </button>
            </div>
          </div>

          {/* Dynamic Column Fields */}
          <div className="space-y-3.5">
            {columns.map((col) => {
              const val = formData[col.id] ?? '';
              const isPrimary = col.isPrimaryKey || col.id === primaryCol?.id;

              return (
                <div
                  key={col.id}
                  className={`p-3.5 rounded-xl border transition-all ${
                    isPrimary
                      ? 'bg-amber-50/30 dark:bg-amber-950/10 border-amber-200/80 dark:border-amber-900/40'
                      : 'bg-white dark:bg-[#252525] border-stone-200 dark:border-[#333333]'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-stone-800 dark:text-[#e5e5e5]">
                      {getColIcon(col.type)}
                      <span>{col.name}</span>
                      {isPrimary && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300 font-bold">
                          대표 항목
                        </span>
                      )}
                    </label>
                    <span className="text-[10px] text-stone-400 dark:text-[#777777] uppercase font-mono">
                      {col.type}
                    </span>
                  </div>

                  {/* Input by Column Type */}
                  {col.type === 'status' || col.type === 'select' ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        {/* Select or direct toggle */}
                        {!isCustomMode[col.id] ? (
                          <div className="flex-1 flex items-center gap-2">
                            <select
                              value={val}
                              onChange={(e) => {
                                if (e.target.value === '__custom_input__') {
                                  setIsCustomMode((prev) => ({ ...prev, [col.id]: true }));
                                } else {
                                  handleChange(col.id, e.target.value);
                                }
                              }}
                              className="flex-1 px-3 py-2 bg-stone-50 dark:bg-[#181818] border border-stone-200 dark:border-[#383838] rounded-lg text-xs text-stone-900 dark:text-[#f5f5f5] outline-none focus:border-amber-500"
                            >
                              <option value="">(선택 안 함 / 미정)</option>
                              {col.options && col.options.length > 0 ? (
                                col.options.map((opt) => (
                                  <option key={opt.id} value={opt.label || opt.id}>
                                    {opt.label}
                                  </option>
                                ))
                              ) : null}
                              {val && !col.options?.some((o) => o.id === val || o.label === val) && (
                                <option value={val}>{val} (기존 값)</option>
                              )}
                              <option value="__custom_input__">✏️ 직접 새 항목/태그 입력하기...</option>
                            </select>
                            <button
                              type="button"
                              onClick={() => setIsCustomMode((prev) => ({ ...prev, [col.id]: true }))}
                              className="px-2.5 py-2 text-xs text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40 rounded-lg border border-amber-200 dark:border-amber-900/50 whitespace-nowrap font-medium"
                              title="직접 텍스트로 분류 입력"
                            >
                              직접 입력
                            </button>
                          </div>
                        ) : (
                          <div className="flex-1 flex items-center gap-2">
                            <input
                              type="text"
                              autoFocus
                              placeholder="새 분류/상태명 직접 입력 (예: 사채원리금, 보류)"
                              value={customOptionInput[col.id] !== undefined ? customOptionInput[col.id] : val}
                              onChange={(e) => {
                                const newV = e.target.value;
                                setCustomOptionInput((prev) => ({ ...prev, [col.id]: newV }));
                                handleChange(col.id, newV);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleCustomOptionSubmit(col.id);
                                }
                              }}
                              className="flex-1 px-3 py-2 bg-stone-50 dark:bg-[#181818] border border-amber-500 rounded-lg text-xs text-stone-900 dark:text-[#f5f5f5] outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                handleCustomOptionSubmit(col.id);
                                setIsCustomMode((prev) => ({ ...prev, [col.id]: false }));
                              }}
                              className="px-3 py-2 bg-amber-500 text-stone-950 font-bold rounded-lg text-xs hover:bg-amber-400"
                            >
                              확인
                            </button>
                            <button
                              type="button"
                              onClick={() => setIsCustomMode((prev) => ({ ...prev, [col.id]: false }))}
                              className="px-2 py-2 text-xs text-stone-500 dark:text-[#aaaaaa] hover:bg-stone-100 dark:hover:bg-[#333333] rounded-lg"
                            >
                              목록 선택
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Quick preset badges if available */}
                      {col.options && col.options.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5 pt-1">
                          <span className="text-[11px] text-stone-400">추천:</span>
                          {col.options.map((opt) => (
                            <button
                              type="button"
                              key={opt.id}
                              onClick={() => {
                                handleChange(col.id, opt.label || opt.id);
                                setIsCustomMode((prev) => ({ ...prev, [col.id]: false }));
                              }}
                              style={{
                                backgroundColor: val === opt.label || val === opt.id ? opt.color : `${opt.color}15`,
                                color: val === opt.label || val === opt.id ? '#ffffff' : opt.color,
                                borderColor: `${opt.color}40`,
                              }}
                              className="px-2 py-0.5 rounded-full text-[11px] font-semibold border transition-all hover:opacity-90"
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : col.type === 'checkbox' ? (
                    <label className="flex items-center gap-2.5 cursor-pointer py-1">
                      <input
                        type="checkbox"
                        checked={!!val}
                        onChange={(e) => handleChange(col.id, e.target.checked)}
                        className="rounded accent-amber-500 w-4 h-4 cursor-pointer"
                      />
                      <span className="text-xs text-stone-700 dark:text-[#cccccc]">
                        {val ? '활성화됨 (체크)' : '비활성 (미체크)'}
                      </span>
                    </label>
                  ) : col.type === 'date' ? (
                    <input
                      type="date"
                      value={val}
                      onChange={(e) => handleChange(col.id, e.target.value)}
                      className="w-full px-3 py-2 bg-stone-50 dark:bg-[#181818] border border-stone-200 dark:border-[#383838] rounded-lg text-xs text-stone-900 dark:text-[#f5f5f5] outline-none focus:border-amber-500"
                    />
                  ) : col.type === 'number' ? (
                    <input
                      type="number"
                      placeholder="0"
                      value={val}
                      onChange={(e) => handleChange(col.id, e.target.value)}
                      className="w-full px-3 py-2 bg-stone-50 dark:bg-[#181818] border border-stone-200 dark:border-[#383838] rounded-lg text-xs text-stone-900 dark:text-[#f5f5f5] outline-none focus:border-amber-500"
                    />
                  ) : col.type === 'code' ? (
                    <textarea
                      rows={3}
                      placeholder="SQL 쿼리 또는 코드를 입력하세요..."
                      value={val}
                      onChange={(e) => handleChange(col.id, e.target.value)}
                      className="w-full px-3 py-2 bg-stone-50 dark:bg-[#181818] border border-stone-200 dark:border-[#383838] rounded-lg text-xs font-mono text-amber-700 dark:text-amber-300 outline-none focus:border-amber-500 leading-relaxed"
                    />
                  ) : col.type === 'richText' || col.name.includes('내용') || col.name.includes('설명') || col.name.includes('메모') ? (
                    <textarea
                      rows={3}
                      placeholder={`${col.name} 내용을 입력하세요...`}
                      value={val}
                      onChange={(e) => handleChange(col.id, e.target.value)}
                      className="w-full px-3 py-2 bg-stone-50 dark:bg-[#181818] border border-stone-200 dark:border-[#383838] rounded-lg text-xs text-stone-900 dark:text-[#f5f5f5] outline-none focus:border-amber-500 leading-relaxed"
                    />
                  ) : (
                    <input
                      type="text"
                      placeholder={`${col.name} 입력...`}
                      value={val}
                      onChange={(e) => handleChange(col.id, e.target.value)}
                      className="w-full px-3 py-2 bg-stone-50 dark:bg-[#181818] border border-stone-200 dark:border-[#383838] rounded-lg text-xs text-stone-900 dark:text-[#f5f5f5] outline-none focus:border-amber-500"
                    />
                  )}
                </div>
              );
            })}
          </div>
        </form>

        {/* Footer Buttons */}
        <div className="px-6 py-3.5 border-t border-stone-200 dark:border-[#333333] bg-stone-50 dark:bg-[#252525] flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-stone-200 dark:bg-[#333333] hover:bg-stone-300 dark:hover:bg-[#404040] text-stone-700 dark:text-[#cccccc] rounded-xl text-xs font-semibold transition-colors"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-sm transition-all active:scale-98"
          >
            <Plus className="w-4 h-4" />
            <span>새 행 저장하기</span>
          </button>
        </div>
      </div>
    </div>
  );
};
