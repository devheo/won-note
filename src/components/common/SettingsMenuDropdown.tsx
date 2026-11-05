import React, { useState, useRef, useEffect } from 'react';
import type { AppThemeMode } from '../../constants/themes';
import { createPortal } from 'react-dom';
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
  Shield,
} from 'lucide-react';
import { API_PATHS } from '../../constants/api';
import { APP_EVENTS } from '../../constants/events';
import { fetchBridge } from '../../services/httpBridge';

export type { AppThemeMode } from '../../constants/themes';

interface SettingsMenuDropdownProps {
  theme: AppThemeMode;
  onSelectTheme: (theme: AppThemeMode) => void;
  onOpenSpeedSettings: () => void;
  onOpenServerSettings?: () => void;
  useServer?: boolean;
  zoomLevel?: number;
  onChangeZoom?: (newZoom: number) => void;
  iconOnly?: boolean;
  aiEnabled: boolean;
  onToggleAi: (enabled: boolean) => void;
}

export const SettingsMenuDropdown: React.FC<SettingsMenuDropdownProps> = ({
  theme,
  onSelectTheme,
  onOpenSpeedSettings,
  onOpenServerSettings,
  useServer = false,
  zoomLevel = 100,
  onChangeZoom,
  iconOnly = false,
  aiEnabled,
  onToggleAi,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const [isMaster, setIsMaster] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const portalRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen || !useServer) {
      if (!useServer) setIsMaster(false);
      return;
    }
    let cancelled = false;
    fetchBridge(API_PATHS.auth.me)
      .then(response => response.json())
      .then((result: { enabled?: boolean; user?: { role?: string } | null }) => {
        if (!cancelled) setIsMaster(Boolean(result.enabled && result.user?.role === 'master'));
      })
      .catch(() => { if (!cancelled) setIsMaster(false); });
    return () => { cancelled = true; };
  }, [isOpen, useServer]);

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const clickedMenu = menuRef.current && menuRef.current.contains(target);
      const clickedPortal = portalRef.current && portalRef.current.contains(target);
      if (!clickedMenu && !clickedPortal) {
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
        onClick={(e) => {
          if (!isOpen) {
            const rect = e.currentTarget.getBoundingClientRect();
            setAnchorRect(rect);
          }
          setIsOpen(!isOpen);
        }}
        className={
          iconOnly
            ? `p-1.5 rounded-lg text-xs font-semibold flex items-center justify-center transition-all cursor-pointer ${
                isOpen
                  ? 'bg-amber-500 text-stone-950 shadow-sm'
                  : 'bg-stone-100 hover:bg-stone-200 dark:bg-[#282828] dark:hover:bg-[#333333] text-stone-600 dark:text-[#cccccc] border border-stone-200 dark:border-[#383838]'
              }`
            : `px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                isOpen
                  ? 'bg-amber-500 text-stone-950 shadow-sm border-amber-500'
                  : 'bg-stone-100 dark:bg-[#282828] hover:bg-stone-200 dark:hover:bg-[#333333] text-stone-700 dark:text-[#e0e0e0] border border-stone-200 dark:border-[#383838]'
              }`
        }
        title="환경 설정 (테마, 속도 및 성능 최적화, 서버 설정)"
      >
        <Settings className={`w-3.5 h-3.5 ${isOpen && !iconOnly ? 'text-stone-950' : 'text-stone-600 dark:text-stone-300'}`} />
        {!iconOnly && (
          <>
            <span>설정</span>
            <ChevronDown className={`w-3 h-3 transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`} />
          </>
        )}
      </button>

      {/* Settings Dropdown Popover Window via Portal */}
      {isOpen && anchorRect && createPortal(
        <div
          ref={portalRef}
          style={{
            position: 'fixed',
            top: `${anchorRect.bottom + 4}px`,
            left: `${Math.min(anchorRect.left, window.innerWidth - 320)}px`,
            width: '304px',
            zIndex: 999999,
          }}
          className="rounded-xl bg-white dark:bg-[#202020] border border-stone-200/90 dark:border-[#383838] shadow-2xl p-2 z-50 text-xs text-stone-700 dark:text-[#cccccc] animate-in fade-in zoom-in-95 duration-150 select-none"
        >
          {/* Header Title */}
          <div className="px-2 py-1.5 mb-1.5 border-b border-stone-100 dark:border-[#2c2c2c] flex items-center justify-between">
            <span className="font-bold text-xs text-stone-900 dark:text-[#f0f0f0] flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-amber-500" />
              애플리케이션 설정
            </span>
            <span className="text-[10px] text-stone-400 dark:text-[#777777]">환경 설정</span>
          </div>

          {/* Section 1: Multi-Theme Mode Selector (Light & Dark Framework Themes) */}
          <div className="mb-2 p-2 rounded-lg bg-stone-50 dark:bg-[#181818] border border-stone-200/70 dark:border-[#2f2f2f] space-y-2">
            <div className="text-[10px] font-bold text-stone-500 dark:text-[#888888] uppercase tracking-wider flex items-center justify-between">
              <span>화면 테마 (Multi-Theme Palette)</span>
              <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 font-mono">
                {theme}
              </span>
            </div>

            {/* Light Themes Group */}
            <div>
              <div className="text-[9px] font-bold text-stone-500 dark:text-[#888888] uppercase mb-1">
                ☀️ 라이트 테마 (Light Mode)
              </div>
              <div className="grid grid-cols-2 gap-1 bg-stone-200/70 dark:bg-[#252525] p-1 rounded-lg text-xs">
                {[
                  { id: 'light' as const, label: '☀️ 원비 라이트' },
                  { id: 'material-light' as const, label: '🎨 마티리얼 라이트' },
                  { id: 'bootstrap-light' as const, label: '🅱️ 부트스트랩' },
                  { id: 'warm-light' as const, label: '🪵 웜 파스텔' },
                ].map((t) => {
                  const isSelected = theme === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => onSelectTheme(t.id)}
                      className={`py-1 px-1.5 rounded-md font-semibold text-[11px] flex items-center justify-between transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-amber-500 text-stone-950 shadow-2xs font-bold'
                          : 'text-stone-700 dark:text-stone-300 hover:text-stone-900 dark:hover:text-white bg-white/60 dark:bg-[#2a2a2a]'
                      }`}
                    >
                      <span className="truncate">{t.label}</span>
                      {isSelected && <Check className="w-3 h-3 text-stone-950 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Dark Themes Group */}
            <div>
              <div className="text-[9px] font-bold text-stone-500 dark:text-[#888888] uppercase mb-1">
                🌙 다크 테마 (Dark Mode)
              </div>
              <div className="grid grid-cols-2 gap-1 bg-stone-200/70 dark:bg-[#252525] p-1 rounded-lg text-xs">
                {[
                  { id: 'dark-soft' as const, label: '🌙 소프트 다크' },
                  { id: 'dark-warm' as const, label: '🪵 웜 차콜' },
                  { id: 'dark-hard' as const, label: '⚫ 딥 블랙' },
                  { id: 'material-you' as const, label: '🎨 Material You' },
                  { id: 'bootstrap-dark' as const, label: '🅱️ 부트스트랩 다크' },
                  { id: 'material-design' as const, label: '📐 마티리얼 다크' },
                ].map((t) => {
                  const isSelected = theme === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => onSelectTheme(t.id)}
                      className={`py-1 px-1.5 rounded-md font-semibold text-[11px] flex items-center justify-between transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-amber-500 text-stone-950 shadow-2xs font-bold'
                          : 'text-stone-700 dark:text-stone-300 hover:text-stone-900 dark:hover:text-white bg-white/60 dark:bg-[#2a2a2a]'
                      }`}
                    >
                      <span className="truncate">{t.label}</span>
                      {isSelected && <Check className="w-3 h-3 text-stone-950 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Section: AI Assistant & Data Modifier ON/OFF */}
          <div className="mb-2 p-2 rounded-lg bg-stone-50 dark:bg-[#181818] border border-stone-200/70 dark:border-[#2f2f2f]">
            <div className="text-[10px] font-bold text-stone-500 dark:text-[#888888] uppercase tracking-wider mb-2 flex items-center justify-between">
              <span className="flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-amber-500" />
                AI 어시스턴트 & 데이터 수정
              </span>
              <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${aiEnabled ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' : 'bg-stone-200 dark:bg-stone-800 text-stone-500'}`}>
                {aiEnabled ? 'ON' : 'OFF'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-1.5 bg-stone-200/70 dark:bg-[#252525] p-1 rounded-lg">
              <button
                type="button"
                onClick={() => onToggleAi(true)}
                className={`py-1.5 px-2 rounded-md font-semibold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  aiEnabled
                    ? 'bg-emerald-600 text-white shadow-2xs font-bold'
                    : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-white'
                }`}
              >
                <span>AI 켜기 (ON)</span>
                {aiEnabled && <Check className="w-3 h-3 ml-auto" />}
              </button>

              <button
                type="button"
                onClick={() => onToggleAi(false)}
                className={`py-1.5 px-2 rounded-md font-semibold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  !aiEnabled
                    ? 'bg-rose-600 text-white shadow-2xs font-bold'
                    : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-white'
                }`}
              >
                <span>AI 끄기 (OFF)</span>
                {!aiEnabled && <Check className="w-3 h-3 ml-auto" />}
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

          {useServer && isMaster && (
            <div className="mb-2 border-t border-stone-100 pt-2 dark:border-[#2d2d2d]">
              <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-stone-400 dark:text-[#888888]">관리</div>
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  window.dispatchEvent(new Event(APP_EVENTS.openAdminConsole));
                }}
                className="group flex w-full items-center gap-2.5 rounded-lg border border-transparent px-2.5 py-2 text-left text-stone-800 transition-colors hover:border-amber-200 hover:bg-amber-50/70 dark:text-[#eeeeee] dark:hover:border-amber-900/40 dark:hover:bg-amber-950/20"
              >
                <div className="rounded-lg bg-stone-900 p-1.5 text-white transition-colors group-hover:bg-amber-500 group-hover:text-stone-950 dark:bg-stone-700"><Shield className="h-4 w-4"/></div>
                <div><div className="text-xs font-semibold">관리자 화면</div><div className="mt-0.5 text-[11px] text-stone-500 dark:text-[#888888]">계정·그룹·보드·접속 기록 관리</div></div>
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
        </div>,
        document.body
      )}
    </div>
  );
};
