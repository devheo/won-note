import React, { useState, useMemo, useEffect, useRef } from 'react';
import { TableColumn, TableRow } from '../../types';
import { cleanTextValue } from '../../utils/textSanitizer';
import {
  Search,
  Check,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  Filter,
  X,
  Tag,
} from 'lucide-react';

interface DistinctOption {
  key: string; // The normalized value key (empty string for blank)
  label: string;
  color?: string;
  count: number;
}

interface ExcelColumnFilterDropdownProps {
  isOpen: boolean;
  onClose: () => void;
  column: TableColumn;
  allRows: TableRow[];
  activeFilterValues?: string[]; // If undefined/null, no filter is active
  isSorted: boolean;
  sortDirection: 'asc' | 'desc';
  onApplyFilter: (columnId: string, selectedValues: string[] | null) => void;
  onApplySort: (columnId: string, direction: 'asc' | 'desc' | null) => void;
  onDisableFilter?: (columnId: string) => void;
  anchorRect: DOMRect | null;
}

export const ExcelColumnFilterDropdown: React.FC<ExcelColumnFilterDropdownProps> = ({
  isOpen,
  onClose,
  column,
  allRows,
  activeFilterValues,
  isSorted,
  sortDirection,
  onApplyFilter,
  onApplySort,
  onDisableFilter,
  anchorRect,
}) => {
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Extract all distinct values and their row counts
  const distinctOptions: DistinctOption[] = useMemo(() => {
    const map = new Map<string, { label: string; color?: string; count: number }>();

    allRows.forEach((row) => {
      const rawVal = row.data[column.id];
      let key = '';
      let label = '';
      let color: string | undefined = undefined;

      if (rawVal === undefined || rawVal === null || rawVal === '') {
        key = '__EMPTY__';
        label = '(비어 있음)';
      } else if (column.type === 'checkbox') {
        const boolVal = !!rawVal;
        key = boolVal ? 'true' : 'false';
        label = boolVal ? '✓ 선택됨 (True)' : '미체크 (False)';
      } else if (column.type === 'status' || column.type === 'select') {
        const cleaned = cleanTextValue(rawVal);
        const opt = column.options?.find(
          (o) => o.id === cleaned || o.label === cleaned || o.id === String(rawVal) || o.label === String(rawVal)
        );
        key = opt ? opt.label : cleaned;
        label = opt ? opt.label : cleaned;
        color = opt?.color;
      } else {
        const cleaned = cleanTextValue(rawVal);
        key = cleaned;
        label = cleaned;
      }

      if (!map.has(key)) {
        map.set(key, { label, color, count: 1 });
      } else {
        const cur = map.get(key)!;
        cur.count += 1;
      }
    });

    // If column has predefined options (select/status), include them even if count is 0
    if (column.options && (column.type === 'select' || column.type === 'status')) {
      column.options.forEach((opt) => {
        if (!map.has(opt.label)) {
          map.set(opt.label, { label: opt.label, color: opt.color, count: 0 });
        }
      });
    }

    const list: DistinctOption[] = [];
    map.forEach((value, key) => {
      list.push({
        key,
        label: value.label,
        color: value.color,
        count: value.count,
      });
    });

    // Sort distinct values alphabetically (empty always at the end)
    list.sort((a, b) => {
      if (a.key === '__EMPTY__') return 1;
      if (b.key === '__EMPTY__') return -1;
      return a.label.localeCompare(b.label, 'ko', { numeric: true });
    });

    return list;
  }, [allRows, column]);

  // Selected keys state inside the popup
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => {
    if (activeFilterValues && activeFilterValues.length > 0) {
      return new Set(activeFilterValues);
    }
    // Default: all are selected
    return new Set(distinctOptions.map((o) => o.key));
  });

  // Re-sync when opened or active filter changes
  useEffect(() => {
    if (isOpen) {
      if (activeFilterValues && activeFilterValues.length > 0) {
        setSelectedKeys(new Set(activeFilterValues));
      } else {
        setSelectedKeys(new Set(distinctOptions.map((o) => o.key)));
      }
      setSearchQuery('');
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
  }, [isOpen, activeFilterValues, distinctOptions]);

  // Handle outside click to close
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    window.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !anchorRect) return null;

  // Filtered distinct options by search
  const visibleOptions = distinctOptions.filter((opt) =>
    opt.label.toLowerCase().includes(searchQuery.trim().toLowerCase())
  );

  const isAllVisibleSelected =
    visibleOptions.length > 0 &&
    visibleOptions.every((opt) => selectedKeys.has(opt.key));

  const toggleSelectAll = () => {
    if (isAllVisibleSelected) {
      // Unselect all visible
      setSelectedKeys((prev) => {
        const next = new Set(prev);
        visibleOptions.forEach((opt) => next.delete(opt.key));
        return next;
      });
    } else {
      // Select all visible
      setSelectedKeys((prev) => {
        const next = new Set(prev);
        visibleOptions.forEach((opt) => next.add(opt.key));
        return next;
      });
    }
  };

  const toggleOption = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const selectOnlyThis = (key: string) => {
    setSelectedKeys(new Set([key]));
  };

  const handleApply = () => {
    // If all distinct keys are selected, clear filter
    if (selectedKeys.size === distinctOptions.length) {
      onApplyFilter(column.id, null);
    } else {
      onApplyFilter(column.id, Array.from(selectedKeys));
    }
    onClose();
  };

  const handleResetFilter = () => {
    setSelectedKeys(new Set(distinctOptions.map((o) => o.key)));
    onApplyFilter(column.id, null);
    onClose();
  };

  // Compute Popover Position (prevent going off screen)
  const dropdownWidth = 270;
  let leftPos = anchorRect.left;
  if (leftPos + dropdownWidth > window.innerWidth - 16) {
    leftPos = Math.max(16, window.innerWidth - dropdownWidth - 16);
  }
  const topPos = anchorRect.bottom + 4;

  return (
    <div
      ref={dropdownRef}
      style={{
        position: 'fixed',
        top: `${topPos}px`,
        left: `${leftPos}px`,
        width: `${dropdownWidth}px`,
        zIndex: 9999,
      }}
      className="bg-white dark:bg-[#202020] border border-stone-200 dark:border-[#383838] rounded-xl shadow-2xl overflow-hidden flex flex-col mat-shadow-3 text-xs animate-in fade-in zoom-in-95 duration-150"
    >
      {/* Header */}
      <div className="px-3.5 py-2.5 bg-stone-50 dark:bg-[#282828] border-b border-stone-200 dark:border-[#333333] flex items-center justify-between">
        <div className="flex items-center gap-1.5 min-w-0">
          <Filter className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
          <span className="font-bold text-stone-800 dark:text-[#f0f0f0] truncate">
            {column.name} 필터 및 정렬
          </span>
        </div>
        <div className="flex items-center gap-1">
          {onDisableFilter && (
            <button
              onClick={() => {
                onDisableFilter(column.id);
                onClose();
              }}
              className="text-[10px] px-1.5 py-0.5 rounded text-stone-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
              title="이 열의 필터 기능을 끕니다"
            >
              필터 끄기
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1 rounded text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-200/50 dark:hover:bg-[#333333]"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Sort Section (Excel-like Sort buttons) */}
      <div className="p-2 border-b border-stone-200/80 dark:border-[#333333] space-y-1">
        <div className="text-[10px] font-bold text-stone-400 dark:text-[#888888] uppercase px-1.5">
          정렬 순서
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <button
            onClick={() => onApplySort(column.id, 'asc')}
            className={`px-2 py-1.5 rounded-lg flex items-center justify-center gap-1.5 text-xs font-semibold transition-colors ${
              isSorted && sortDirection === 'asc'
                ? 'bg-amber-500 text-stone-950 shadow-xs'
                : 'bg-stone-100 dark:bg-[#2a2a2a] hover:bg-stone-200 dark:hover:bg-[#333333] text-stone-700 dark:text-[#cccccc]'
            }`}
          >
            <ArrowUp className="w-3.5 h-3.5" />
            <span>오름차순 (A→Z)</span>
          </button>
          <button
            onClick={() => onApplySort(column.id, 'desc')}
            className={`px-2 py-1.5 rounded-lg flex items-center justify-center gap-1.5 text-xs font-semibold transition-colors ${
              isSorted && sortDirection === 'desc'
                ? 'bg-amber-500 text-stone-950 shadow-xs'
                : 'bg-stone-100 dark:bg-[#2a2a2a] hover:bg-stone-200 dark:hover:bg-[#333333] text-stone-700 dark:text-[#cccccc]'
            }`}
          >
            <ArrowDown className="w-3.5 h-3.5" />
            <span>내림차순 (Z→A)</span>
          </button>
        </div>
        {isSorted && (
          <button
            onClick={() => onApplySort(column.id, null)}
            className="w-full py-1 text-center text-[11px] text-amber-600 dark:text-amber-400 hover:underline flex items-center justify-center gap-1"
          >
            <RotateCcw className="w-3 h-3" />
            <span>정렬 해제 (기본 순서 복귀)</span>
          </button>
        )}
      </div>

      {/* Filter by Value Section */}
      <div className="p-2 space-y-2 flex-1 flex flex-col min-h-0">
        <div className="flex items-center justify-between px-1">
          <span className="text-[10px] font-bold text-stone-400 dark:text-[#888888] uppercase">
            값으로 필터링
          </span>
          <span className="text-[10px] text-stone-500 dark:text-[#888888]">
            {selectedKeys.size}/{distinctOptions.length}개 선택됨
          </span>
        </div>

        {/* Search within distinct values */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400" />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="값 검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-6 py-1 bg-stone-100 dark:bg-[#282828] border border-stone-200 dark:border-[#383838] rounded-lg text-xs outline-none focus:border-amber-500 text-stone-900 dark:text-[#f0f0f0]"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 dark:hover:text-stone-200"
            >
              ✕
            </button>
          )}
        </div>

        {/* Select All Checkbox */}
        <div className="flex items-center justify-between px-1.5 py-1 bg-stone-50 dark:bg-[#252525] rounded-lg border border-stone-200/60 dark:border-[#333333]">
          <label className="flex items-center gap-2 cursor-pointer select-none text-xs font-semibold text-stone-800 dark:text-[#dddddd]">
            <input
              type="checkbox"
              checked={isAllVisibleSelected}
              onChange={toggleSelectAll}
              className="rounded accent-amber-500 cursor-pointer w-3.5 h-3.5"
            />
            <span>(모두 선택 / 전체 해제)</span>
          </label>
        </div>

        {/* Distinct Values Scrollable List */}
        <div className="max-h-48 overflow-y-auto space-y-0.5 custom-scrollbar pr-1">
          {visibleOptions.length === 0 ? (
            <div className="p-3 text-center text-stone-400 italic text-xs">
              검색 결과가 없습니다.
            </div>
          ) : (
            visibleOptions.map((opt) => {
              const isChecked = selectedKeys.has(opt.key);
              return (
                <div
                  key={opt.key}
                  className="flex items-center justify-between px-1.5 py-1 rounded hover:bg-stone-100 dark:hover:bg-[#2c2c2c] group/opt transition-colors"
                >
                  <label className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleOption(opt.key)}
                      className="rounded accent-amber-500 cursor-pointer w-3.5 h-3.5 flex-shrink-0"
                    />

                    {opt.color ? (
                      <span
                        style={{
                          backgroundColor: `${opt.color}20`,
                          color: opt.color,
                          borderColor: `${opt.color}40`,
                        }}
                        className="px-2 py-0.2 rounded-full text-[11px] font-bold border truncate"
                      >
                        {opt.label}
                      </span>
                    ) : (
                      <span
                        className={`truncate text-xs ${
                          opt.key === '__EMPTY__'
                            ? 'text-stone-400 italic'
                            : 'text-stone-800 dark:text-[#eeeeee]'
                        }`}
                      >
                        {opt.label}
                      </span>
                    )}

                    <span className="text-[10px] text-stone-400 dark:text-[#777777] font-mono ml-auto mr-1 flex-shrink-0">
                      ({opt.count})
                    </span>
                  </label>

                  <button
                    onClick={() => selectOnlyThis(opt.key)}
                    className="opacity-0 group-hover/opt:opacity-100 text-[10px] text-amber-600 dark:text-amber-400 hover:underline px-1 py-0.5 rounded font-medium flex-shrink-0"
                    title="이 값만 선택"
                  >
                    단독
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Footer Action Buttons */}
      <div className="p-2.5 bg-stone-50 dark:bg-[#252525] border-t border-stone-200 dark:border-[#333333] flex items-center justify-between gap-2">
        <button
          onClick={handleResetFilter}
          className="px-2.5 py-1.5 text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 text-xs font-medium transition-colors"
        >
          초기화
        </button>

        <div className="flex items-center gap-1.5">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg bg-stone-200 dark:bg-[#333333] hover:bg-stone-300 dark:hover:bg-[#404040] text-stone-700 dark:text-[#cccccc] text-xs font-semibold transition-colors"
          >
            취소
          </button>
          <button
            onClick={handleApply}
            className="px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-bold transition-all shadow-xs"
          >
            적용
          </button>
        </div>
      </div>
    </div>
  );
};
