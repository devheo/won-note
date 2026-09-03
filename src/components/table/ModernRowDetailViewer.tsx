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
  FileSpreadsheet,
  Download,
  Trash2,
  Edit3,
  Sparkles,
  Pin,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Expand,
  ChevronDown,
  Image as ImageIcon,
  StickyNote,
} from 'lucide-react';
import { detectLanguage } from '../../utils/codeHighlighter';
import { CodeBlockViewer } from '../common/CodeBlockViewer';
import { cleanTextValue, extractFirstImageSrc } from '../../utils/textSanitizer';
import { SelectOrCustomInput } from '../common/SelectOrCustomInput';
import { ImageLightboxModal } from '../common/ImageLightboxModal';
import { getAllStickersFromRow, STICKER_COLOR_MAP } from '../../utils/stickerUtils';
import {
  isUpdateDateColumn,
  findUpdateDateColumn,
  formatDateTime,
} from '../../utils/dateColumnUtils';
import {
  downloadRowsAsCsv,
  downloadRowsAsTxt,
  copyRowsAsCsv,
  copyRowsAsTxt,
} from '../../utils/exportUtils';

interface ModernRowDetailViewerProps {
  isOpen: boolean;
  onClose: () => void;
  row: TableRow | null;
  columns: TableColumn[];
  tableName: string;
  totalRows: number;
  currentIndex: number;
  onNavigate: (newIndex: number) => void;
  onOpenRichEditor: (row: TableRow, targetColId?: string) => void;
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
  const [copiedFormat, setCopiedFormat] = useState<string | null>(null);
  const [editingColId, setEditingColId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<any>('');
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [widthMode, setWidthMode] = useState<WidthMode>(() => {
    return (localStorage.getItem('wonbee_popup_width_mode') as WidthMode) || 'standard';
  });

  const handleSetWidthMode = (mode: WidthMode) => {
    setWidthMode(mode);
    localStorage.setItem('wonbee_popup_width_mode', mode);
  };
  const [lightboxImg, setLightboxImg] = useState<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const exportMenuRef = useRef<HTMLDivElement | null>(null);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);

  // Close export menu when clicking outside
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setIsExportMenuOpen(false);
      }
    };
    if (isExportMenuOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isExportMenuOpen]);

  // Reset editing state whenever row changes
  useEffect(() => {
    setEditingColId(null);
    setEditValue('');
    setCopiedFormat(null);
    setIsExportMenuOpen(false);
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

  const allStickers = getAllStickersFromRow(row, columns);

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
    setCopiedFormat('JSON');
    setTimeout(() => {
      setCopiedAll(false);
      setCopiedFormat(null);
    }, 1800);
  };

  // Copy row as CSV
  const handleCopyCsv = async () => {
    await copyRowsAsCsv(columns, [row]);
    setCopiedFormat('CSV');
    setTimeout(() => setCopiedFormat(null), 1800);
  };

  // Copy row as TXT
  const handleCopyTxt = async () => {
    await copyRowsAsTxt(tableName, columns, [row]);
    setCopiedFormat('TXT');
    setTimeout(() => setCopiedFormat(null), 1800);
  };

  // Download row as CSV
  const handleDownloadCsv = () => {
    downloadRowsAsCsv(primaryTitle || tableName, columns, [row]);
  };

  // Download row as TXT
  const handleDownloadTxt = () => {
    downloadRowsAsTxt(tableName, columns, [row]);
  };

  // Commit field edit in viewer
  const handleSaveField = (colId: string) => {
    const targetCol = columns.find((c) => c.id === colId);
    const cleaned =
      typeof editValue === 'string' && targetCol?.type !== 'richText'
        ? cleanTextValue(editValue)
        : editValue;

    const updateCol = findUpdateDateColumn(columns);
    const nowFormatted = formatDateTime(new Date());

    const nextData = {
      ...row.data,
      [colId]: cleaned,
    };

    if (isUpdateDateColumn(targetCol)) {
      // User manually updated the update date column: respect input or fall back to current time if cleared
      nextData[colId] = cleaned || nowFormatted;
    } else if (updateCol && updateCol.id !== colId) {
      // User modified another column: auto update to current datetime (년월일 시분)
      nextData[updateCol.id] = nowFormatted;
    }

    const updated: TableRow = {
      ...row,
      data: nextData,
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
              {/* Zoom Controls (Scales all text, badges, and fields) */}
              <div className="hidden sm:flex items-center gap-1 bg-stone-100 dark:bg-[#1a1a1a] px-2 py-1 rounded-xl border border-stone-200 dark:border-[#333333]">
                <button
                  onClick={() => setZoomLevel((z) => Math.max(z - 10, 70))}
                  className="p-1 hover:bg-stone-200 dark:hover:bg-[#2e2e2e] rounded text-stone-500 dark:text-stone-300 transition-colors"
                  title="본문 글자 및 데이터 영역 축소 (-10%)"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setZoomLevel(100)}
                  className="text-[11px] font-mono font-bold text-stone-700 dark:text-stone-300 min-w-[36px] text-center hover:text-amber-500 transition-colors"
                  title="클릭하여 기본 크기(100%)로 복원"
                >
                  {zoomLevel}%
                </button>
                <button
                  onClick={() => setZoomLevel((z) => Math.min(z + 10, 160))}
                  className="p-1 hover:bg-stone-200 dark:hover:bg-[#2e2e2e] rounded text-stone-500 dark:text-stone-300 transition-colors"
                  title="본문 글자 및 데이터 영역 확대 (+10%)"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
                {zoomLevel !== 100 && (
                  <button
                    onClick={() => setZoomLevel(100)}
                    className="p-0.5 ml-0.5 rounded text-amber-500 hover:bg-stone-200 dark:hover:bg-[#2e2e2e] transition-colors"
                    title="100%로 초기화"
                  >
                    <RotateCcw className="w-3 h-3" />
                  </button>
                )}
              </div>

              {/* Width Mode Toggle */}
              <div className="flex items-center gap-1 bg-stone-100 dark:bg-[#1a1a1a] p-0.5 rounded-xl border border-stone-200 dark:border-[#333333]">
                <button
                  onClick={() => handleSetWidthMode('standard')}
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
                  onClick={() => handleSetWidthMode('wide')}
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
                  onClick={() => handleSetWidthMode(widthMode === 'full' ? 'standard' : 'full')}
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

          {/* Main Body with Working CSS Zoom */}
          <div
            ref={scrollContainerRef}
            className="flex-1 overflow-y-auto p-5 space-y-5 custom-scrollbar"
            style={{ zoom: `${zoomLevel}%` }}
          >
            {/* 1. Fields Grid */}
            <div className="p-4 rounded-xl bg-stone-50/70 dark:bg-[#242424] border border-stone-200/80 dark:border-[#333333]">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3 border-b border-stone-200/60 dark:border-[#333333] pb-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-bold text-stone-800 dark:text-[#eeeeee] uppercase tracking-wider flex items-center gap-1.5">
                    <span>열 필드 데이터 목록</span>
                    <span className="text-[10px] text-stone-400 font-normal">({columns.length}개)</span>
                  </h3>
                  <span className="text-[11px] px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 font-medium">
                    💡 항목 더블 클릭 시 리치에디터 즉시 편집
                  </span>
                </div>

                {/* Compact Export & Copy Dropdown Menu */}
                <div className="relative" ref={exportMenuRef}>
                  <button
                    onClick={() => setIsExportMenuOpen((prev) => !prev)}
                    className={`px-2.5 py-1 rounded-lg border text-[11px] font-medium flex items-center gap-1.5 transition-all ${
                      copiedFormat
                        ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 border-emerald-300 dark:border-emerald-700 font-semibold'
                        : isExportMenuOpen
                        ? 'bg-amber-500 text-stone-950 border-amber-500 font-semibold shadow-xs'
                        : 'bg-white dark:bg-[#1a1a1a] text-stone-600 dark:text-[#cccccc] hover:text-stone-900 dark:hover:text-white border-stone-200 dark:border-[#3a3a3a] hover:bg-stone-50 dark:hover:bg-[#2a2a2a]'
                    }`}
                    title="이 행 데이터 내보내기 / 복사 (CSV, TXT, JSON)"
                  >
                    {copiedFormat ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-500 animate-in zoom-in-75 duration-150" />
                        <span>{copiedFormat} 복사 완료!</span>
                      </>
                    ) : (
                      <>
                        <Download className="w-3.5 h-3.5 text-stone-500 dark:text-[#aaaaaa]" />
                        <span>내보내기 / 복사</span>
                        <ChevronDown
                          className={`w-3 h-3 text-stone-400 transition-transform duration-150 ${
                            isExportMenuOpen ? 'rotate-180' : ''
                          }`}
                        />
                      </>
                    )}
                  </button>

                  {isExportMenuOpen && (
                    <div className="absolute right-0 top-full mt-1.5 w-48 bg-white dark:bg-[#202020] rounded-xl shadow-xl border border-stone-200 dark:border-[#383838] p-1.5 z-30 animate-in fade-in zoom-in-95 duration-100 text-xs divide-y divide-stone-100 dark:divide-[#2e2e2e]">
                      <div className="pb-1 space-y-0.5">
                        <div className="px-2 py-1 text-[10px] font-bold text-stone-400 dark:text-[#888888] uppercase tracking-wider">
                          파일 다운로드
                        </div>
                        <button
                          onClick={() => {
                            handleDownloadCsv();
                            setIsExportMenuOpen(false);
                          }}
                          className="w-full px-2 py-1.5 text-left text-stone-700 dark:text-[#cccccc] hover:bg-emerald-50 dark:hover:bg-emerald-950/40 hover:text-emerald-600 dark:hover:text-emerald-400 rounded-lg flex items-center gap-2 transition-colors font-medium"
                        >
                          <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500" />
                          <span>CSV 파일 (.csv)</span>
                        </button>
                        <button
                          onClick={() => {
                            handleDownloadTxt();
                            setIsExportMenuOpen(false);
                          }}
                          className="w-full px-2 py-1.5 text-left text-stone-700 dark:text-[#cccccc] hover:bg-blue-50 dark:hover:bg-blue-950/40 hover:text-blue-600 dark:hover:text-blue-400 rounded-lg flex items-center gap-2 transition-colors font-medium"
                        >
                          <FileText className="w-3.5 h-3.5 text-blue-500" />
                          <span>TXT 파일 (.txt)</span>
                        </button>
                      </div>

                      <div className="pt-1 space-y-0.5">
                        <div className="px-2 py-1 text-[10px] font-bold text-stone-400 dark:text-[#888888] uppercase tracking-wider">
                          클립보드 복사
                        </div>
                        <button
                          onClick={() => {
                            handleCopyCsv();
                            setIsExportMenuOpen(false);
                          }}
                          className="w-full px-2 py-1.5 text-left text-stone-700 dark:text-[#cccccc] hover:bg-stone-100 dark:hover:bg-[#2c2c2c] rounded-lg flex items-center gap-2 transition-colors"
                        >
                          <Copy className="w-3.5 h-3.5 text-stone-400" />
                          <span>CSV 형식 복사</span>
                        </button>
                        <button
                          onClick={() => {
                            handleCopyTxt();
                            setIsExportMenuOpen(false);
                          }}
                          className="w-full px-2 py-1.5 text-left text-stone-700 dark:text-[#cccccc] hover:bg-stone-100 dark:hover:bg-[#2c2c2c] rounded-lg flex items-center gap-2 transition-colors"
                        >
                          <Copy className="w-3.5 h-3.5 text-stone-400" />
                          <span>TXT 형식 복사</span>
                        </button>
                        <button
                          onClick={() => {
                            handleCopyAll();
                            setIsExportMenuOpen(false);
                          }}
                          className="w-full px-2 py-1.5 text-left text-stone-700 dark:text-[#cccccc] hover:bg-amber-50 dark:hover:bg-amber-950/40 hover:text-amber-600 dark:hover:text-amber-400 rounded-lg flex items-center gap-2 transition-colors"
                        >
                          <Copy className="w-3.5 h-3.5 text-amber-500" />
                          <span>JSON 복사</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {columns.map((col) => {
                  const val = row.data[col.id];
                  const isEditing = editingColId === col.id;
                  const isCopied = copiedKey === col.id;
                  const rawString = typeof val === 'object' ? JSON.stringify(val) : String(val ?? '');
                  const imgUrl = extractFirstImageSrc(rawString);

                  const isSelectOrStatus = col.type === 'status' || col.type === 'select';
                  const isRichOrLong =
                    col.type === 'richText' ||
                    col.type === 'code' ||
                    rawString.length > 80 ||
                    rawString.includes('<table') ||
                    rawString.includes('<img');

                  return (
                    <div
                      key={col.id}
                      onDoubleClick={(e) => {
                        // If clicking input or button, ignore
                        const target = e.target as HTMLElement;
                        if (target.tagName === 'INPUT' || target.tagName === 'BUTTON' || target.closest('button') || target.closest('input') || isEditing) return;
                        if (isSelectOrStatus) {
                          setEditingColId(col.id);
                          setEditValue(cleanTextValue(val));
                        } else {
                          onOpenRichEditor(row, col.id);
                          onClose();
                        }
                      }}
                      title={isSelectOrStatus ? "더블 클릭하여 상태/선택값 텍스트 수정" : "더블 클릭하면 리치에디터에서 전체 내용을 편리하게 수정할 수 있습니다"}
                      className={`p-3 rounded-xl bg-white dark:bg-[#1b1b1b] border border-stone-200 dark:border-[#333333] group/field transition-all cursor-pointer hover:border-amber-400 dark:hover:border-amber-600/70 ${
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
                          {isUpdateDateColumn(col) && (
                            <span
                              className="text-[10px] px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-600 dark:text-purple-400 font-bold flex items-center gap-0.5"
                              title="데이터 수정 시 년월일 시분으로 자동 갱신되는 열입니다 (직접 입력도 가능)"
                            >
                              <Clock className="w-2.5 h-2.5" /> 자동 갱신
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

                          {/* Edit button: status, select, and updateDate use inline editing; other columns open Rich Editor */}
                          {isSelectOrStatus || isUpdateDateColumn(col) ? (
                            <>
                              {!isEditing && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingColId(col.id);
                                    setEditValue(cleanTextValue(val));
                                  }}
                                  className="p-1 rounded text-stone-400 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-stone-200/50 dark:hover:bg-[#333333]"
                                  title={isUpdateDateColumn(col) ? '일시 직접 수정 또는 현재 일시 기입' : '상태/선택값 텍스트 수정'}
                                >
                                  <Edit3 className="w-3 h-3" />
                                </button>
                              )}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onOpenRichEditor(row, col.id);
                                  onClose();
                                }}
                                className="p-1 rounded text-stone-400 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-stone-200/50 dark:hover:bg-[#333333]"
                                title="서식 에디터(리치에디터) 열기"
                              >
                                <Maximize2 className="w-3 h-3" />
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onOpenRichEditor(row, col.id);
                                onClose();
                              }}
                              className="p-1 rounded text-stone-400 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-stone-200/50 dark:hover:bg-[#333333]"
                              title="리치 에디터로 전체 수정"
                            >
                              <Edit3 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Field Value */}
                      {isEditing && (isSelectOrStatus || col.type === 'checkbox' || isUpdateDateColumn(col)) ? (
                        <div className="mt-2 space-y-2">
                          {isSelectOrStatus ? (
                            <SelectOrCustomInput
                              autoFocus
                              size="md"
                              value={editValue}
                              options={col.options}
                              placeholder="선택 안 함 (직접 텍스트 입력 가능)"
                              onChange={(newVal) => setEditValue(newVal)}
                            />
                          ) : isUpdateDateColumn(col) ? (
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                autoFocus
                                value={editValue}
                                placeholder="YYYY-MM-DD HH:mm (비워둘 시 현재일시 자동)"
                                onChange={(e) => setEditValue(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleSaveField(col.id);
                                  if (e.key === 'Escape') setEditingColId(null);
                                }}
                                className="flex-1 bg-white dark:bg-[#202020] border border-amber-500 rounded-lg px-2.5 py-1.5 text-xs text-stone-900 dark:text-[#ffffff] outline-none"
                              />
                              <button
                                type="button"
                                onClick={() => setEditValue(formatDateTime(new Date()))}
                                className="px-2.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold rounded-lg text-xs whitespace-nowrap shadow-xs flex items-center gap-1"
                                title="현재 일시로 즉시 기입"
                              >
                                <Clock className="w-3 h-3" />
                                지금 시간
                              </button>
                            </div>
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
                          ) : null}

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
                               strVal.includes('wonbee-sticker') ||
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

            {/* Sticky Notes (OneNote Style) */}
            {allStickers.length > 0 && (
              <div className="p-4 rounded-xl bg-amber-500/5 dark:bg-amber-500/10 border border-amber-200/80 dark:border-amber-900/40">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-bold text-stone-800 dark:text-[#eeeeee] uppercase tracking-wider flex items-center gap-1.5">
                    <Pin className="w-3.5 h-3.5 text-amber-500 fill-current" />
                    부착된 원노트 스티커 메모 ({allStickers.length}개)
                  </h3>
                  <button
                    type="button"
                    onClick={() => {
                      onOpenRichEditor(row);
                      onClose();
                    }}
                    className="text-[11px] text-amber-700 dark:text-amber-400 hover:underline flex items-center gap-1 font-medium"
                  >
                    <Edit3 className="w-3 h-3" />
                    에디터에서 스티커 관리 &gt;
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {allStickers.map((stk) => {
                    const colorStyle = STICKER_COLOR_MAP[stk.color || 'amber'] || STICKER_COLOR_MAP.amber;
                    return (
                      <div
                        key={stk.id}
                        onClick={() => {
                          onOpenRichEditor(row, stk.columnId);
                          onClose();
                        }}
                        title="클릭하여 에디터에서 이 스티커 내용 수정"
                        className={`p-3.5 rounded-xl border shadow-sm space-y-1.5 relative cursor-pointer transition-transform hover:scale-[1.02] ${colorStyle.bg} ${colorStyle.border} ${colorStyle.text}`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-xs flex items-center gap-1.5">
                            {stk.isPinned ? <Pin className="w-3 h-3 fill-current text-amber-600 dark:text-amber-400" /> : <StickyNote className="w-3 h-3 opacity-70" />}
                            {stk.title}
                          </span>
                          {stk.completed && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-semibold">
                              ✓ 완료
                            </span>
                          )}
                        </div>
                        {stk.content && (
                          <p className="text-[11px] whitespace-pre-wrap leading-relaxed opacity-95">
                            {stk.content}
                          </p>
                        )}
                        {stk.columnName && (
                          <div className="pt-1.5 border-t border-black/10 dark:border-white/10 text-[10px] opacity-70 flex items-center justify-between">
                            <span>위치: {stk.columnName}</span>
                            <span className="text-[9px] hover:underline">에디터 열기 &gt;</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
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
                onClick={() => {
                  onOpenRichEditor(row, editingColId || undefined);
                  onClose();
                }}
                className="px-3 py-1.5 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/50 text-amber-800 dark:text-amber-300 border border-amber-300/80 dark:border-amber-800/60 font-semibold rounded-lg text-xs flex items-center gap-1.5 transition-colors"
                title="에디터에서 원노트 스티커 메모 추가 및 편집"
              >
                <Pin className="w-3.5 h-3.5 fill-current text-amber-500" />
                <span>원노트 스티커 {allStickers.length > 0 ? `(${allStickers.length})` : '추가'}</span>
              </button>
              <button
                onClick={handleClose}
                className="px-4 py-1.5 bg-stone-200/80 dark:bg-[#333333] hover:bg-stone-300 dark:hover:bg-[#404040] text-stone-700 dark:text-[#eeeeee] font-semibold rounded-lg text-xs transition-colors"
              >
                닫기 (ESC)
              </button>
              <button
                onClick={() => {
                  onOpenRichEditor(row, editingColId || undefined);
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
