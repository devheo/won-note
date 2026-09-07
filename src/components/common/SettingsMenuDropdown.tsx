import React, { useState, useRef, useEffect } from 'react';
import {
  Settings,
  ChevronDown,
  Sun,
  Moon,
  Zap,
  Database,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Sliders,
  Check,
  Sparkles,
} from 'lucide-react';

interface SettingsMenuDropdownProps {
  isDarkMode: boolean;
  onToggleTheme: (darkMode: boolean) => void;
  onOpenSpeedSettings: () => void;
  onOpenServerSettings?: () => void;
  useServer?: boolean;
  zoomLevel?: number;
  onChangeZoom?: (newZoom: number) => void;
}

export const SettingsMenuDropdown: React.FC<SettingsMenuDropdownProps> = ({
  isDarkMode,
  onToggleTheme,
  onOpenSpeedSettings,
  onOpenServerSettings,
  useServer = false,
  zoomLevel = 100,
  onChangeZoom,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      window.addEventListener('mousedown', handleClickOutside);
    }
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  return (
    <div className="relative inline-block" ref={menuRef}>
      {/* Settings Menu Trigger Button (Matched with File tab) */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
          isOpen
            ? 'bg-amber-500 text-stone-950 shadow-sm border-amber-500'
            : 'bg-stone-100 dark:bg-[#282828] hover:bg-stone-200 dark:hover:bg-[#333333] text-stone-700 dark:text-[#e0e0e0] border border-stone-200 dark:border-[#383838]'
        }`}
        title="환경 설정 (테마, 속도 및 성능 최적화, 서버 설정)"
      >
        <Settings className={`w-3.5 h-3.5 ${isOpen ? 'text-stone-950' : 'text-stone-600 dark:text-stone-300'}`} />
        <span>설정</span>
        <ChevronDown className={`w-3 h-3 transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Settings Dropdown Popover Window */}
      {isOpen && (
        <div className="absolute left-0 mt-1.5 w-76 rounded-xl bg-white dark:bg-[#202020] border border-stone-200/90 dark:border-[#383838] shadow-2xl p-2 z-50 text-xs text-stone-700 dark:text-[#cccccc] animate-in fade-in slide-in-from-top-1 duration-150 select-none">
          {/* Header Title */}
          <div className="px-2 py-1.5 mb-1.5 border-b border-stone-100 dark:border-[#2c2c2c] flex items-center justify-between">
            <span className="font-bold text-xs text-stone-900 dark:text-[#f0f0f0] flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-amber-500" />
              애플리케이션 설정
            </span>
            <span className="text-[10px] text-stone-400 dark:text-[#777777]">환경 설정</span>
          </div>

          {/* Section 1: Light / Dark Theme Mode */}
          <div className="mb-2 p-2 rounded-lg bg-stone-50 dark:bg-[#181818] border border-stone-200/70 dark:border-[#2f2f2f]">
            <div className="text-[10px] font-bold text-stone-500 dark:text-[#888888] uppercase tracking-wider mb-2 flex items-center justify-between">
              <span>화면 테마</span>
              <span className="text-[10px] font-normal text-stone-400 dark:text-[#777777]">
                현재: {isDarkMode ? '다크 모드' : '라이트 모드'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-1.5 bg-stone-200/70 dark:bg-[#252525] p-1 rounded-lg">
              {/* Light Mode Button */}
              <button
                type="button"
                onClick={() => {
                  onToggleTheme(false);
                }}
                className={`py-1.5 px-2 rounded-md font-semibold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  !isDarkMode
                    ? 'bg-white text-stone-900 shadow-2xs font-bold'
                    : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-white'
                }`}
              >
                <Sun className={`w-3.5 h-3.5 ${!isDarkMode ? 'text-amber-500' : 'text-stone-400'}`} />
                <span>라이트</span>
                {!isDarkMode && <Check className="w-3 h-3 text-amber-500 ml-auto" />}
              </button>

              {/* Dark Mode Button */}
              <button
                type="button"
                onClick={() => {
                  onToggleTheme(true);
                }}
                className={`py-1.5 px-2 rounded-md font-semibold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  isDarkMode
                    ? 'bg-[#333333] text-amber-300 shadow-2xs font-bold'
                    : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-white'
                }`}
              >
                <Moon className={`w-3.5 h-3.5 ${isDarkMode ? 'text-amber-400' : 'text-stone-400'}`} />
                <span>다크</span>
                {isDarkMode && <Check className="w-3 h-3 text-amber-400 ml-auto" />}
              </button>
            </div>
          </div>

          {/* Section 2: Speed / Performance Settings */}
          <div className="mb-2">
            <div className="px-2 py-1 text-[10px] font-bold text-stone-400 dark:text-[#888888] uppercase tracking-wider">
              성능 및 동작
            </div>

            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                onOpenSpeedSettings();
              }}
              className="w-full px-2.5 py-2 rounded-lg text-left hover:bg-amber-50/70 dark:hover:bg-amber-950/20 text-stone-800 dark:text-[#eeeeee] flex items-center gap-2.5 transition-colors border border-transparent hover:border-amber-200 dark:hover:border-amber-900/40 group cursor-pointer"
            >
              <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 group-hover:bg-amber-500 group-hover:text-stone-950 transition-colors">
                <Zap className="w-4 h-4 fill-current" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-xs flex items-center justify-between">
                  <span>속도 설정 (성능 최적화)</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 font-mono">
                    Speed
                  </span>
                </div>
                <div className="text-[11px] text-stone-500 dark:text-[#888888] truncate mt-0.5">
                  대용량 렌더링, 이미지 탐지, 디바운스 조절
                </div>
              </div>
            </button>
          </div>

          {/* Section 3: Server & Storage Mode */}
          {onOpenServerSettings && (
            <div className="mb-2">
              <div className="px-2 py-1 text-[10px] font-bold text-stone-400 dark:text-[#888888] uppercase tracking-wider">
                저장소 환경
              </div>

              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  onOpenServerSettings();
                }}
                className="w-full px-2.5 py-2 rounded-lg text-left hover:bg-stone-100 dark:hover:bg-[#2c2c2c] text-stone-800 dark:text-[#eeeeee] flex items-center gap-2.5 transition-colors group cursor-pointer"
              >
                <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 group-hover:bg-blue-500 group-hover:text-white transition-colors">
                  <Database className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-xs flex items-center justify-between">
                    <span>서버 모드 설정</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded font-mono font-medium ${
                      useServer
                        ? 'bg-blue-100 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300'
                        : 'bg-stone-200 dark:bg-[#333333] text-stone-600 dark:text-[#aaaaaa]'
                    }`}>
                      {useServer ? 'Server API' : 'IndexedDB'}
                    </span>
                  </div>
                  <div className="text-[11px] text-stone-500 dark:text-[#888888] truncate mt-0.5">
                    {useServer ? '외부 서버 및 REST API 연동 중' : '브라우저 로컬 저장소 우선 사용'}
                  </div>
                </div>
              </button>
            </div>
          )}

          {/* Section 4: Zoom Level Controls */}
          {onChangeZoom && (
            <div className="pt-2 border-t border-stone-100 dark:border-[#2d2d2d] flex items-center justify-between px-1">
              <span className="text-[11px] font-medium text-stone-500 dark:text-[#888888]">
                화면 배율: <strong className="text-stone-800 dark:text-[#dddddd]">{zoomLevel}%</strong>
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onChangeZoom(Math.max(50, zoomLevel - 10))}
                  disabled={zoomLevel <= 50}
                  className="p-1 rounded hover:bg-stone-100 dark:hover:bg-[#333333] text-stone-600 dark:text-stone-300 disabled:opacity-30 cursor-pointer"
                  title="화면 축소 (-10%)"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onChangeZoom(100)}
                  className="px-1.5 py-0.5 rounded text-[10px] hover:bg-stone-100 dark:hover:bg-[#333333] text-stone-600 dark:text-stone-300 font-mono cursor-pointer"
                  title="기본 배율 100%로 리셋"
                >
                  100%
                </button>
                <button
                  type="button"
                  onClick={() => onChangeZoom(Math.min(150, zoomLevel + 10))}
                  disabled={zoomLevel >= 150}
                  className="p-1 rounded hover:bg-stone-100 dark:hover:bg-[#333333] text-stone-600 dark:text-stone-300 disabled:opacity-30 cursor-pointer"
                  title="화면 확대 (+10%)"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
