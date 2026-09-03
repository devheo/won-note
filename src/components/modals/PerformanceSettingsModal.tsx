import React from 'react';
import {
  Zap,
  X,
  Gauge,
  Image as ImageIcon,
  MessageSquare,
  Pin,
  Search,
  Check,
  RotateCcw,
} from 'lucide-react';
import {
  PerformanceOptions,
  DEFAULT_PERFORMANCE_OPTIONS,
} from '../../types/performance';
import { TableColumn } from '../../types';

interface PerformanceSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  options: PerformanceOptions;
  onChangeOptions: (newOptions: PerformanceOptions) => void;
  columns: TableColumn[];
}

export const PerformanceSettingsModal: React.FC<PerformanceSettingsModalProps> = ({
  isOpen,
  onClose,
  options,
  onChangeOptions,
  columns,
}) => {
  if (!isOpen) return null;

  const handleToggle = (key: keyof PerformanceOptions) => {
    onChangeOptions({
      ...options,
      [key]: !options[key],
    });
  };

  const handleResetToDefaults = () => {
    onChangeOptions({ ...DEFAULT_PERFORMANCE_OPTIONS });
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-[#1e1e1e] border border-stone-200 dark:border-[#383838] rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden text-stone-800 dark:text-[#f0f0f0]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-stone-200 dark:border-[#333333] flex items-center justify-between bg-stone-50 dark:bg-[#252525]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400">
              <Zap className="w-5 h-5 fill-current" />
            </div>
            <div>
              <h3 className="font-bold text-base flex items-center gap-2">
                테이블 속도 & 성능 최적화 설정
              </h3>
              <p className="text-xs text-stone-500 dark:text-[#999999] mt-0.5">
                대용량 데이터 조회 및 실시간 검색 속도를 극대화하는 옵션을 관리합니다.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-200/60 dark:hover:bg-[#333333] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar text-xs">
          {/* Option 1: Skip Image Detection on Plain Text */}
          <div
            onClick={() => handleToggle('skipImageDetectionOnPlainText')}
            className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-start justify-between gap-3 ${
              options.skipImageDetectionOnPlainText
                ? 'bg-amber-50/70 dark:bg-amber-950/20 border-amber-300 dark:border-amber-800/60'
                : 'bg-stone-50/60 dark:bg-[#242424] border-stone-200 dark:border-[#333333]'
            }`}
          >
            <div className="flex items-start gap-2.5">
              <div
                className={`p-1.5 rounded-lg mt-0.5 ${
                  options.skipImageDetectionOnPlainText
                    ? 'bg-amber-500 text-stone-950'
                    : 'bg-stone-200 dark:bg-[#333333] text-stone-500'
                }`}
              >
                <ImageIcon className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-stone-900 dark:text-[#ffffff]">
                    일반 텍스트 셀 이미지 자동 탐지 제거
                  </span>
                  {options.skipImageDetectionOnPlainText && (
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500 text-stone-950 font-bold">
                      추천 (고속)
                    </span>
                  )}
                </div>
                <p className="text-stone-500 dark:text-[#999999] mt-1 leading-relaxed">
                  전용 이미지 열이 아닌 일반 텍스트 셀에서는 무거운 Base64/이미지 정규식 감지 연산을 생략합니다.
                  대용량 테이블 스크롤 및 렌더링 속도가 크게 향상됩니다.
                </p>
              </div>
            </div>
            <input
              type="checkbox"
              checked={options.skipImageDetectionOnPlainText}
              onChange={() => {}}
              className="mt-1 rounded accent-amber-500 cursor-pointer flex-shrink-0"
            />
          </div>

          {/* Option 2: Tooltip Only for Rich Text */}
          <div
            onClick={() => handleToggle('tooltipOnlyRichText')}
            className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-start justify-between gap-3 ${
              options.tooltipOnlyRichText
                ? 'bg-amber-50/70 dark:bg-amber-950/20 border-amber-300 dark:border-amber-800/60'
                : 'bg-stone-50/60 dark:bg-[#242424] border-stone-200 dark:border-[#333333]'
            }`}
          >
            <div className="flex items-start gap-2.5">
              <div
                className={`p-1.5 rounded-lg mt-0.5 ${
                  options.tooltipOnlyRichText
                    ? 'bg-amber-500 text-stone-950'
                    : 'bg-stone-200 dark:bg-[#333333] text-stone-500'
                }`}
              >
                <MessageSquare className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-stone-900 dark:text-[#ffffff]">
                    호버 팝오버를 리치 텍스트 열에만 제한 (경량 모드)
                  </span>
                  {!options.tooltipOnlyRichText ? (
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-bold">
                      모든 잘린 셀 팝오버 ON
                    </span>
                  ) : (
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500 text-stone-950 font-bold">
                      경량 제한 모드
                    </span>
                  )}
                </div>
                <p className="text-stone-500 dark:text-[#999999] mt-1 leading-relaxed">
                  비활성화 시(기본) 내용이 잘리거나 여러 줄인 모든 셀에서 마우스 호버 시 상세 미리보기 팝오버를 띄웁니다.
                  체크 시 서식이 있는 리치 텍스트 열에서만 팝오버를 띄우고 일반 텍스트 셀은 기본 툴팁으로 전환됩니다.
                </p>
              </div>
            </div>
            <input
              type="checkbox"
              checked={options.tooltipOnlyRichText}
              onChange={() => {}}
              className="mt-1 rounded accent-amber-500 cursor-pointer flex-shrink-0"
            />
          </div>

          {/* Option 3: Lazy Sticker Count */}
          <div
            onClick={() => handleToggle('lazyStickerCount')}
            className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-start justify-between gap-3 ${
              options.lazyStickerCount
                ? 'bg-amber-50/70 dark:bg-amber-950/20 border-amber-300 dark:border-amber-800/60'
                : 'bg-stone-50/60 dark:bg-[#242424] border-stone-200 dark:border-[#333333]'
            }`}
          >
            <div className="flex items-start gap-2.5">
              <div
                className={`p-1.5 rounded-lg mt-0.5 ${
                  options.lazyStickerCount
                    ? 'bg-amber-500 text-stone-950'
                    : 'bg-stone-200 dark:bg-[#333333] text-stone-500'
                }`}
              >
                <Pin className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-stone-900 dark:text-[#ffffff]">
                    원노트 스티커 메모 실시간 전수 집계 최적화
                  </span>
                  {options.lazyStickerCount && (
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500 text-stone-950 font-bold">
                      추천 (지연 계산)
                    </span>
                  )}
                </div>
                <p className="text-stone-500 dark:text-[#999999] mt-1 leading-relaxed">
                  상단 버튼의 총 스티커 개수를 매 렌더링마다 전수 조사하지 않고, 스티커 필터를 클릭하거나 필요할 때만 계산하여
                  불필요한 전체 행 HTML 루프 순회를 제거합니다.
                </p>
              </div>
            </div>
            <input
              type="checkbox"
              checked={options.lazyStickerCount}
              onChange={() => {}}
              className="mt-1 rounded accent-amber-500 cursor-pointer flex-shrink-0"
            />
          </div>

          {/* Option 4: Search Debounce & Scope */}
          <div className="p-3.5 rounded-xl border bg-stone-50/60 dark:bg-[#242424] border-stone-200 dark:border-[#333333] space-y-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-amber-500 text-stone-950">
                <Search className="w-4 h-4" />
              </div>
              <div>
                <span className="font-bold text-sm text-stone-900 dark:text-[#ffffff]">
                  실시간 검색 지연(디바운스) 및 대상 설정
                </span>
                <p className="text-[11px] text-stone-500 dark:text-[#999999]">
                  한글 타이핑 도중 끊김(버벅임) 현상을 없애고 검색 대상 범위를 조절합니다.
                </p>
              </div>
            </div>

            {/* Debounce Setting */}
            <div className="bg-white dark:bg-[#1b1b1b] p-3 rounded-lg border border-stone-200/80 dark:border-[#333333] flex items-center justify-between">
              <div>
                <span className="font-semibold text-stone-800 dark:text-[#e0e0e0]">
                  검색 디바운스 시간
                </span>
                <p className="text-[11px] text-stone-500 dark:text-[#888888]">
                  입력 후 {options.searchDebounceMs}ms 대기 후 검색 실행
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                {[150, 180, 200, 250].map((ms) => (
                  <button
                    key={ms}
                    type="button"
                    onClick={() => onChangeOptions({ ...options, searchDebounceMs: ms })}
                    className={`px-2.5 py-1 rounded-md text-xs font-mono font-semibold transition-colors ${
                      options.searchDebounceMs === ms
                        ? 'bg-amber-500 text-stone-950 font-bold'
                        : 'bg-stone-100 dark:bg-[#2a2a2a] text-stone-600 dark:text-stone-300 hover:bg-stone-200'
                    }`}
                  >
                    {ms}ms
                  </button>
                ))}
              </div>
            </div>

            {/* Search Target Mode */}
            <div className="bg-white dark:bg-[#1b1b1b] p-3 rounded-lg border border-stone-200/80 dark:border-[#333333] space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-stone-800 dark:text-[#e0e0e0]">
                  검색 대상 열 모드
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onChangeOptions({ ...options, searchTargetMode: 'all' })}
                    className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
                      options.searchTargetMode === 'all'
                        ? 'bg-amber-500 text-stone-950 font-bold'
                        : 'bg-stone-100 dark:bg-[#2a2a2a] text-stone-600 dark:text-stone-300 hover:bg-stone-200'
                    }`}
                  >
                    전체 열 검색 (기본)
                  </button>
                  <button
                    type="button"
                    onClick={() => onChangeOptions({ ...options, searchTargetMode: 'primary' })}
                    className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
                      options.searchTargetMode === 'primary'
                        ? 'bg-amber-500 text-stone-950 font-bold'
                        : 'bg-stone-100 dark:bg-[#2a2a2a] text-stone-600 dark:text-stone-300 hover:bg-stone-200'
                    }`}
                  >
                    대표 열만 검색 (초고속)
                  </button>
                </div>
              </div>

              {options.searchTargetMode === 'primary' && (
                <div className="pt-2 border-t border-stone-100 dark:border-[#2a2a2a] flex items-center justify-between gap-2">
                  <span className="text-[11px] text-stone-500 dark:text-[#999999]">
                    지정 대표 열:
                  </span>
                  <select
                    value={options.primarySearchColId || columns[0]?.id || ''}
                    onChange={(e) =>
                      onChangeOptions({ ...options, primarySearchColId: e.target.value })
                    }
                    className="bg-stone-50 dark:bg-[#242424] border border-stone-300 dark:border-[#444444] rounded px-2 py-1 text-xs text-stone-800 dark:text-[#f0f0f0] outline-none"
                  >
                    {columns.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.type})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 bg-stone-50 dark:bg-[#252525] border-t border-stone-200 dark:border-[#333333] flex items-center justify-between">
          <button
            type="button"
            onClick={handleResetToDefaults}
            className="flex items-center gap-1 text-xs text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>기본 권장 설정 복원</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-sm transition-all"
          >
            <Check className="w-3.5 h-3.5" />
            <span>설정 완료</span>
          </button>
        </div>
      </div>
    </div>
  );
};
