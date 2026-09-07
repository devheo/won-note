import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Search,
  Table as TableIcon,
  Plus,
  Moon,
  Sun,
  Layers,
  FileSpreadsheet,
  ClipboardPaste,
  Download,
  RotateCcw,
  Zap,
  ArrowRight,
  Sparkles,
  Pin,
  Maximize2,
  Edit3,
} from 'lucide-react';
import { WorkspaceData, TableDocument, TableRow } from '../../types';
import { cleanTextValue } from '../../utils/textSanitizer';
import { getAllStickersFromRow } from '../../utils/stickerUtils';

interface CommandPaletteModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspace: WorkspaceData;
  activeTable: TableDocument | null;
  onSelectTable: (tableId: string) => void;
  onOpenAddRowModal: () => void;
  onToggleViewMode?: () => void;
  currentViewMode?: 'table' | 'kanban';
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
  onOpenDataPortability: () => void;
  onOpenTextPaste: () => void;
  onOpenUniversalImport: () => void;
  onAddNewTable: () => void;
  onResetZoom: () => void;
  onOpenRowDetail: (row: TableRow, index: number) => void;
  onOpenRowEditor: (row: TableRow) => void;
}

interface PaletteItem {
  id: string;
  category: 'action' | 'table' | 'row';
  categoryLabel: string;
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  badge?: string;
  onSelect: () => void;
}

export const CommandPaletteModal: React.FC<CommandPaletteModalProps> = ({
  isOpen,
  onClose,
  workspace,
  activeTable,
  onSelectTable,
  onOpenAddRowModal,
  onToggleViewMode,
  currentViewMode = 'table',
  isDarkMode,
  onToggleDarkMode,
  onOpenDataPortability,
  onOpenTextPaste,
  onOpenUniversalImport,
  onAddNewTable,
  onResetZoom,
  onOpenRowDetail,
  onOpenRowEditor,
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  // Build list of actionable items
  const items: PaletteItem[] = useMemo(() => {
    const list: PaletteItem[] = [];
    const q = query.trim().toLowerCase();

    // 1. Quick Actions
    const quickActions: PaletteItem[] = [
      {
        id: 'act_add_row',
        category: 'action',
        categoryLabel: '빠른 작업',
        title: '새 행 추가 (현재 테이블)',
        subtitle: activeTable ? `테이블: ${activeTable.title}` : '테이블에 새 행 삽입',
        icon: <Plus className="w-4 h-4 text-amber-500" />,
        badge: 'Enter',
        onSelect: () => {
          onOpenAddRowModal();
          onClose();
        },
      },
      ...(onToggleViewMode
        ? [
            {
              id: 'act_toggle_view',
              category: 'action' as const,
              categoryLabel: '빠른 작업',
              title: currentViewMode === 'table' ? '칸반 보드 뷰로 전환' : '표(테이블) 뷰로 전환',
              subtitle:
                currentViewMode === 'table'
                  ? '상태별 카드 드래그 앤 드롭 보드 보기'
                  : '스프레드시트 그리드 표로 보기',
              icon: <Layers className="w-4 h-4 text-amber-500" />,
              badge: currentViewMode === 'table' ? '칸반' : '그리드',
              onSelect: () => {
                onToggleViewMode();
                onClose();
              },
            },
          ]
        : []),
      {
        id: 'act_theme',
        category: 'action',
        categoryLabel: '빠른 작업',
        title: isDarkMode ? '라이트 테마 모드로 전환' : '다크 테마 모드로 전환',
        subtitle: isDarkMode ? '밝고 선명한 테마 적용' : '눈이 편안한 다크 모드 적용',
        icon: isDarkMode ? (
          <Sun className="w-4 h-4 text-amber-500" />
        ) : (
          <Moon className="w-4 h-4 text-amber-400" />
        ),
        badge: isDarkMode ? 'Light' : 'Dark',
        onSelect: () => {
          onToggleDarkMode();
          onClose();
        },
      },
      {
        id: 'act_new_table',
        category: 'action',
        categoryLabel: '빠른 작업',
        title: '새 테이블 만들기',
        subtitle: '워크스페이스에 새 데이터 테이블 생성',
        icon: <TableIcon className="w-4 h-4 text-blue-500" />,
        onSelect: () => {
          onAddNewTable();
          onClose();
        },
      },
      {
        id: 'act_universal_import',
        category: 'action',
        categoryLabel: '빠른 작업',
        title: 'CSV / 엑셀 / JSON 데이터 일괄 가져오기',
        subtitle: '파일 업로드 또는 새 테이블로 자동 변환',
        icon: <FileSpreadsheet className="w-4 h-4 text-emerald-500" />,
        onSelect: () => {
          onOpenUniversalImport();
          onClose();
        },
      },
      {
        id: 'act_text_paste',
        category: 'action',
        categoryLabel: '빠른 작업',
        title: '클립보드 표 텍스트 빠른 붙여넣기',
        subtitle: '웹/엑셀에서 복사한 탭/쉼표 텍스트 행으로 삽입',
        icon: <ClipboardPaste className="w-4 h-4 text-purple-500" />,
        onSelect: () => {
          onOpenTextPaste();
          onClose();
        },
      },
      {
        id: 'act_data_portability',
        category: 'action',
        categoryLabel: '빠른 작업',
        title: '워크스페이스 데이터 백업 / 복원 (ZIP, JSON)',
        subtitle: '전체 데이터 내보내기 및 버전 백업 관리',
        icon: <Download className="w-4 h-4 text-indigo-500" />,
        onSelect: () => {
          onOpenDataPortability();
          onClose();
        },
      },
      {
        id: 'act_reset_zoom',
        category: 'action',
        categoryLabel: '빠른 작업',
        title: '화면 배율 리셋 (100%)',
        subtitle: '워크스페이스 캔버스 줌 배율 초기화',
        icon: <RotateCcw className="w-4 h-4 text-stone-400" />,
        badge: '100%',
        onSelect: () => {
          onResetZoom();
          onClose();
        },
      },
    ];

    // Filter quick actions if query exists
    quickActions.forEach((act) => {
      if (!q || act.title.toLowerCase().includes(q) || act.subtitle?.toLowerCase().includes(q)) {
        list.push(act);
      }
    });

    // 2. Tables Switcher
    const tableEntries = Object.values(workspace.tables || {});
    tableEntries.forEach((tbl) => {
      if (!q || tbl.title.toLowerCase().includes(q)) {
        const isActive = activeTable?.id === tbl.id;
        list.push({
          id: `tbl_${tbl.id}`,
          category: 'table',
          categoryLabel: '테이블 이동',
          title: tbl.title,
          subtitle: `행 ${tbl.rows?.length || 0}개 • 열 ${tbl.columns?.length || 0}개`,
          icon: <TableIcon className="w-4 h-4 text-amber-500" />,
          badge: isActive ? '현재 활성' : '이동',
          onSelect: () => {
            onSelectTable(tbl.id);
            onClose();
          },
        });
      }
    });

    // 3. Row Search in Active Table (if user typed something)
    if (q && activeTable && activeTable.rows.length > 0) {
      const primaryCol =
        activeTable.columns.find((c) => c.isPrimaryKey || c.type === 'text') || activeTable.columns[0];
      let rowMatchCount = 0;

      for (let i = 0; i < activeTable.rows.length; i++) {
        if (rowMatchCount >= 10) break; // Limit top 10 row matches
        const row = activeTable.rows[i];
        const rawTitle = primaryCol ? row.data[primaryCol.id] : '';
        const cleanTitle = cleanTextValue(rawTitle) || `행 #${i + 1}`;

        // Check if row matches search
        let isMatch = cleanTitle.toLowerCase().includes(q);
        if (!isMatch) {
          for (const col of activeTable.columns) {
            const val = row.data[col.id];
            if (val && String(val).toLowerCase().includes(q)) {
              isMatch = true;
              break;
            }
          }
        }

        if (isMatch) {
          rowMatchCount++;
          const stickers = getAllStickersFromRow(row, activeTable.columns);
          list.push({
            id: `row_${row.id}`,
            category: 'row',
            categoryLabel: '현재 테이블 행 검색',
            title: cleanTitle,
            subtitle: stickers.length > 0 ? `📌 스티커 ${stickers.length}개 부착됨` : undefined,
            icon: <Maximize2 className="w-4 h-4 text-blue-500" />,
            badge: `#${i + 1}`,
            onSelect: () => {
              onOpenRowDetail(row, i);
              onClose();
            },
          });
        }
      }
    }

    return list;
  }, [
    query,
    workspace.tables,
    activeTable,
    isDarkMode,
    currentViewMode,
    onToggleViewMode,
    onToggleDarkMode,
    onOpenAddRowModal,
    onAddNewTable,
    onOpenUniversalImport,
    onOpenTextPaste,
    onOpenDataPortability,
    onResetZoom,
    onSelectTable,
    onOpenRowDetail,
    onClose,
  ]);

  // Reset selected index when items change
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1 < items.length ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 >= 0 ? prev - 1 : items.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (items[selectedIndex]) {
        items[selectedIndex].onSelect();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  // Scroll active item into view
  useEffect(() => {
    if (listRef.current) {
      const activeEl = listRef.current.querySelector(`[data-index="${selectedIndex}"]`);
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-start justify-center pt-24 px-4 select-none animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-white dark:bg-[#1e1e1e] border border-stone-200 dark:border-[#383838] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[580px] animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search Header Bar */}
        <div className="px-4 py-3.5 border-b border-stone-200 dark:border-[#303030] flex items-center gap-3 bg-stone-50/70 dark:bg-[#252525]/70">
          <Search className="w-5 h-5 text-amber-500 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder="테이블 전환, 행 검색, 빠른 작업 입력... (↑↓ 탐색, ↵ 실행)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-transparent text-sm text-stone-900 dark:text-white placeholder:text-stone-400 dark:placeholder:text-[#777777] outline-none font-medium"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="text-stone-400 hover:text-stone-600 dark:hover:text-white text-xs px-1.5 py-0.5 rounded"
            >
              ✕
            </button>
          )}
          <kbd className="px-2 py-0.5 rounded bg-stone-200/70 dark:bg-[#333333] text-[10px] font-mono text-stone-500 dark:text-[#aaaaaa] border border-stone-300/80 dark:border-[#444444]">
            ESC
          </kbd>
        </div>

        {/* Results List */}
        <div ref={listRef} className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
          {items.length === 0 ? (
            <div className="py-12 text-center text-stone-400 dark:text-[#777777] text-xs">
              일치하는 항목이 없습니다.
            </div>
          ) : (
            (() => {
              let currentCat = '';
              return items.map((item, idx) => {
                const isSelected = idx === selectedIndex;
                const showCatHeader = item.categoryLabel !== currentCat;
                if (showCatHeader) {
                  currentCat = item.categoryLabel;
                }

                return (
                  <React.Fragment key={item.id}>
                    {showCatHeader && (
                      <div className="px-3 pt-2.5 pb-1 text-[10px] font-bold text-stone-400 dark:text-[#777777] uppercase tracking-wider">
                        {item.categoryLabel}
                      </div>
                    )}
                    <div
                      data-index={idx}
                      onClick={() => item.onSelect()}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      className={`px-3 py-2.5 rounded-xl flex items-center justify-between gap-3 cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-amber-500 text-stone-950 font-semibold shadow-2xs'
                          : 'hover:bg-stone-100 dark:hover:bg-[#282828] text-stone-800 dark:text-[#dddddd]'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div
                          className={`p-1.5 rounded-lg flex-shrink-0 ${
                            isSelected
                              ? 'bg-stone-950 text-amber-400'
                              : 'bg-stone-100 dark:bg-[#2c2c2c] text-stone-600 dark:text-[#bbbbbb]'
                          }`}
                        >
                          {item.icon}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div
                            className={`text-xs truncate ${
                              isSelected ? 'text-stone-950 font-bold' : 'text-stone-800 dark:text-[#f0f0f0]'
                            }`}
                          >
                            {item.title}
                          </div>
                          {item.subtitle && (
                            <div
                              className={`text-[11px] truncate ${
                                isSelected
                                  ? 'text-stone-800'
                                  : 'text-stone-400 dark:text-[#888888]'
                              }`}
                            >
                              {item.subtitle}
                            </div>
                          )}
                        </div>
                      </div>

                      {item.badge && (
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-md font-mono flex-shrink-0 font-bold ${
                            isSelected
                              ? 'bg-stone-950 text-amber-300'
                              : 'bg-stone-100 dark:bg-[#2f2f2f] text-stone-500 dark:text-[#aaaaaa] border border-stone-200/60 dark:border-[#383838]'
                          }`}
                        >
                          {item.badge}
                        </span>
                      )}
                    </div>
                  </React.Fragment>
                );
              });
            })()
          )}
        </div>

        {/* Footer Shortcut Navigation Info */}
        <div className="px-4 py-2 bg-stone-50 dark:bg-[#1a1a1a] border-t border-stone-200 dark:border-[#303030] flex items-center justify-between text-[11px] text-stone-500 dark:text-[#888888]">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-white dark:bg-[#282828] border border-stone-200 dark:border-[#383838] rounded text-[10px] font-mono shadow-2xs">
                ↑↓
              </kbd>
              이동
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-white dark:bg-[#282828] border border-stone-200 dark:border-[#383838] rounded text-[10px] font-mono shadow-2xs">
                ↵
              </kbd>
              선택
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-white dark:bg-[#282828] border border-stone-200 dark:border-[#383838] rounded text-[10px] font-mono shadow-2xs">
                ESC
              </kbd>
              닫기
            </span>
          </div>
          <span className="text-[10px] text-stone-400">
            총 {items.length}개 검색결과
          </span>
        </div>
      </div>
    </div>
  );
};
