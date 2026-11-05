import React, { useState, useEffect } from 'react';
import {
  Bell,
  Volume2,
  VolumeX,
  CheckCircle,
  Clock,
  RotateCcw,
  ShieldCheck,
  ShieldAlert,
  Calendar,
  X,
  Lock,
  RefreshCw,
} from 'lucide-react';
import { CalendarEvent } from '../../types';
import { isElectron, isTauri } from '../../utils/platformBridge';
import {
  AppNotificationPermission,
  getAppNotificationPermission,
  isAppNotificationSupported,
  requestAppNotificationPermission,
} from '../../services/notificationBridge';
import {
  playNotificationChime,
  getReminderOffsetLabel,
} from '../../utils/calendarNotification';
import { formatLocalDate } from '../../utils/dateColumnUtils';

interface CalendarNotificationCenterProps {
  isOpen: boolean;
  onClose: () => void;
  events: CalendarEvent[];
  soundEnabled: boolean;
  onToggleSound: (enabled: boolean) => void;
  onOpenEvent: (event: CalendarEvent) => void;
  onSnoozeEvent: (event: CalendarEvent, minutes: number) => void;
}

export const CalendarNotificationCenter: React.FC<CalendarNotificationCenterProps> = ({
  isOpen,
  onClose,
  events,
  soundEnabled,
  onToggleSound,
  onOpenEvent,
  onSnoozeEvent,
}) => {
  const [permission, setPermission] = useState<AppNotificationPermission>('default');
  const [showDeniedGuide, setShowDeniedGuide] = useState<boolean>(false);
  const [guideBrowserTab, setGuideBrowserTab] = useState<'chrome' | 'edge' | 'safari'>('chrome');
  const [guidePathMode, setGuidePathMode] = useState<'addressBar' | 'settingsMenu'>('addressBar');

  useEffect(() => {
    if (isOpen) {
      void getAppNotificationPermission().then(setPermission);
      setShowDeniedGuide(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleRequestPermission = async () => {
    const res = await requestAppNotificationPermission();
    setPermission(res);
  };

  // Find events with reminders
  const reminderEvents = events.filter((e) => e.reminder?.enabled && e.reminder.offset !== 'none');
  const todayStr = formatLocalDate(new Date());

  const todayReminders = reminderEvents.filter((e) => e.startDate === todayStr);
  const otherReminders = reminderEvents.filter((e) => e.startDate !== todayStr);

  return (
    <div
      id="calendar-notification-center-backdrop"
      className="fixed inset-0 z-50 flex items-start justify-end p-4 sm:p-6 bg-stone-950/20 backdrop-blur-xs animate-in fade-in duration-100"
      onClick={onClose}
    >
      <div
        id="calendar-notification-center"
        className="w-full max-w-sm sm:max-w-md mt-12 bg-white dark:bg-[#202020] border border-stone-200 dark:border-[#333333] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-stone-100 dark:border-[#2b2b2b] flex items-center justify-between bg-stone-50/80 dark:bg-[#252525]/80">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <Bell className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100">일정 알림 센터</h3>
              <p className="text-[11px] text-stone-500 dark:text-stone-400">
                총 {reminderEvents.length}개 일정에 알림 설정됨
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-[#2e2e2e] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Global Alert Controls */}
        <div className="p-4 border-b border-stone-100 dark:border-[#2b2b2b] bg-stone-50/40 dark:bg-[#222222] space-y-2.5 text-xs">
          {(isTauri() || isElectron()) && (
            <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-[10px] leading-relaxed text-amber-800 dark:text-amber-300">
              창 닫기는 트레이로 숨기는 동작입니다. 트레이 메뉴에서 앱을 종료하면 예약 알림도 중지됩니다.
            </p>
          )}
          {/* Native OS / browser notification permission */}
          {isAppNotificationSupported() && (
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-white dark:bg-[#2a2a2a] border border-stone-200/80 dark:border-[#383838]">
              <div className="flex items-center gap-2">
                {permission === 'granted' ? (
                  <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
                ) : permission === 'denied' ? (
                  <ShieldAlert className="w-4 h-4 text-rose-500 shrink-0" />
                ) : (
                  <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0" />
                )}
                <div>
                  <span className="font-semibold text-stone-800 dark:text-stone-200 block text-[11px]">
                    {isTauri() || isElectron() ? 'OS 데스크톱 알림' : '브라우저 데스크톱 알림'}
                  </span>
                  <span className="text-[10px] text-stone-500 dark:text-stone-400">
                    {permission === 'granted'
                      ? isTauri() || isElectron() ? '창을 닫아도 트레이에서 일정 알림 계속 수신' : '앱이 열려 있거나 백그라운드일 때 알림 수신'
                      : permission === 'denied'
                      ? '브라우저 보안 설정으로 차단됨'
                      : '권한 승인 필요'}
                  </span>
                </div>
              </div>

              {permission === 'denied' && !isTauri() && !isElectron() ? (
                <button
                  type="button"
                  onClick={() => setShowDeniedGuide(true)}
                  className="px-2.5 py-1 text-[11px] font-bold bg-rose-500/15 hover:bg-rose-500/25 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-800 rounded-lg transition-colors cursor-pointer shrink-0"
                >
                  차단 해제 방법
                </button>
              ) : permission !== 'granted' ? (
                <button
                  type="button"
                  onClick={handleRequestPermission}
                  className="px-2.5 py-1 text-[11px] font-bold bg-amber-500 hover:bg-amber-400 text-stone-950 rounded-lg transition-colors shadow-xs cursor-pointer shrink-0"
                >
                  OS 알림 허용
                </button>
              ) : null}
            </div>
          )}

          {/* Sound toggle & preview */}
          <div className="flex items-center justify-between p-2.5 rounded-xl bg-white dark:bg-[#2a2a2a] border border-stone-200/80 dark:border-[#383838]">
            <div className="flex items-center gap-2">
              {soundEnabled ? (
                <Volume2 className="w-4 h-4 text-amber-500 shrink-0" />
              ) : (
                <VolumeX className="w-4 h-4 text-stone-400 shrink-0" />
              )}
              <div>
                <span className="font-semibold text-stone-800 dark:text-stone-200 block text-[11px]">
                  알림 효과음 재생
                </span>
                <span className="text-[10px] text-stone-500 dark:text-stone-400">
                  {soundEnabled ? 'Web Audio 차임벨 켜짐' : '무음 모드'}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => playNotificationChime(0.6)}
                className="px-2 py-1 text-[10px] font-medium text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-[#333333] rounded-lg transition-colors border border-stone-200 dark:border-[#383838]"
              >
                소리 테스트
              </button>
              <button
                type="button"
                onClick={() => onToggleSound(!soundEnabled)}
                className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-colors ${
                  soundEnabled
                    ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300 hover:bg-amber-500/30'
                    : 'bg-stone-200 dark:bg-[#383838] text-stone-700 dark:text-stone-300'
                }`}
              >
                {soundEnabled ? '켜짐' : '꺼짐'}
              </button>
            </div>
          </div>
        </div>

        {/* Reminders List */}
        <div className="p-4 space-y-3 overflow-y-auto custom-scrollbar flex-1 text-xs">
          {reminderEvents.length === 0 ? (
            <div className="py-10 text-center space-y-2">
              <div className="w-10 h-10 rounded-full bg-stone-100 dark:bg-[#2a2a2a] text-stone-400 flex items-center justify-center mx-auto">
                <Bell className="w-5 h-5" />
              </div>
              <p className="text-stone-600 dark:text-stone-300 font-medium">설정된 알림이 없습니다.</p>
              <p className="text-[11px] text-stone-400 leading-relaxed max-w-xs mx-auto">
                캘린더에서 일정을 추가하거나 수정할 때 [일정 사전 알림]을 켜서 원하는 시간에 알림을 설정해 보세요.
              </p>
            </div>
          ) : (
            <>
              {/* Today's reminders */}
              {todayReminders.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-[11px] font-bold text-amber-700 dark:text-amber-400 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    오늘의 알림 ({todayReminders.length})
                  </span>
                  <div className="space-y-1.5">
                    {todayReminders.map((evt) => (
                      <div
                        key={evt.id}
                        className="p-2.5 rounded-xl border border-stone-200 dark:border-[#333333] hover:border-amber-500/50 bg-white dark:bg-[#252525] transition-all flex items-center justify-between gap-2"
                      >
                        <div
                          className="min-w-0 flex-1 cursor-pointer"
                          onClick={() => {
                            onOpenEvent(evt);
                            onClose();
                          }}
                        >
                          <h5 className="font-bold text-stone-800 dark:text-stone-200 truncate hover:text-amber-600">
                            {evt.title}
                          </h5>
                          <div className="flex items-center gap-2 text-[10px] text-stone-500 dark:text-stone-400 mt-0.5">
                            <span>{evt.startTime || '종일'}</span>
                            <span>•</span>
                            <span className="text-amber-600 dark:text-amber-400 font-semibold">
                              {getReminderOffsetLabel(evt.reminder?.offset)}
                            </span>
                            {evt.reminder?.snoozeUntil && evt.reminder.snoozeUntil > Date.now() && (
                              <span className="text-purple-600 dark:text-purple-400 font-semibold flex items-center gap-0.5">
                                <RotateCcw className="w-2.5 h-2.5" /> 스누즈 중
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => onSnoozeEvent(evt, 10)}
                            title="10분 뒤 다시 알림"
                            className="p-1 rounded text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-[#333333]"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Other Upcoming reminders */}
              {otherReminders.length > 0 && (
                <div className="space-y-1.5 pt-2">
                  <span className="text-[11px] font-bold text-stone-500 dark:text-stone-400 flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    예정된 알림 ({otherReminders.length})
                  </span>
                  <div className="space-y-1.5">
                    {otherReminders.slice(0, 10).map((evt) => (
                      <div
                        key={evt.id}
                        className="p-2.5 rounded-xl border border-stone-200 dark:border-[#333333] hover:border-amber-500/50 bg-white dark:bg-[#252525] transition-all flex items-center justify-between gap-2 cursor-pointer"
                        onClick={() => {
                          onOpenEvent(evt);
                          onClose();
                        }}
                      >
                        <div className="min-w-0 flex-1">
                          <h5 className="font-medium text-stone-800 dark:text-stone-200 truncate hover:text-amber-600">
                            {evt.title}
                          </h5>
                          <div className="flex items-center gap-2 text-[10px] text-stone-500 dark:text-stone-400 mt-0.5">
                            <span>{evt.startDate}</span>
                            {evt.startTime && <span>{evt.startTime}</span>}
                            <span>•</span>
                            <span>{getReminderOffsetLabel(evt.reminder?.offset)}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer info */}
        <div className="p-3 border-t border-stone-100 dark:border-[#2b2b2b] bg-stone-50/60 dark:bg-[#252525]/60 text-center text-[10px] text-stone-400">
        </div>
      </div>

      {/* Browser Notification Denied Guide Modal */}
      {showDeniedGuide && (
        <div
          className="fixed inset-0 z-[999999] flex items-center justify-center p-4 bg-stone-950/60 backdrop-blur-xs animate-in fade-in duration-100"
          onClick={() => setShowDeniedGuide(false)}
        >
          <div
            className="bg-white dark:bg-stone-900 rounded-2xl shadow-2xl border border-stone-200 dark:border-stone-800 w-full max-w-lg p-5 space-y-3.5 animate-in zoom-in-95 duration-150 text-stone-900 dark:text-stone-100"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-stone-200 dark:border-stone-800 pb-3">
              <div className="flex items-center gap-2 font-bold text-sm text-stone-900 dark:text-stone-100">
                <div className="p-1.5 rounded-lg bg-rose-500/15 text-rose-600 dark:text-rose-400">
                  <Lock className="w-4 h-4" />
                </div>
                <span>브라우저 알림 차단 해제 가이드</span>
              </div>
              <button
                type="button"
                onClick={() => setShowDeniedGuide(false)}
                className="p-1 rounded-lg text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Guide Alert Banner */}
            <p className="bg-amber-500/10 p-2.5 rounded-xl border border-amber-500/20 text-amber-800 dark:text-amber-300 font-medium text-[11px] leading-relaxed">
              🔒 사용자가 알림 권한을 거부한 경우, 브라우저 보안 방침상 스크립트로 권한 요청 창을 다시 띄울 수 없습니다. 이용 중이신 브라우저 종류를 선택하여 차단을 해제해 주세요.
            </p>

            {/* Browser Selection Tabs */}
            <div className="flex items-center gap-1 bg-stone-100 dark:bg-stone-800 p-1 rounded-xl text-xs font-bold">
              {[
                { id: 'chrome' as const, label: '🌐 Chrome' },
                { id: 'edge' as const, label: '🌊 Edge' },
                { id: 'safari' as const, label: '🧭 Safari' },
              ].map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setGuideBrowserTab(b.id)}
                  className={`flex-1 py-1.5 rounded-lg transition-all cursor-pointer ${
                    guideBrowserTab === b.id
                      ? 'bg-amber-500 text-stone-950 shadow-xs'
                      : 'text-stone-600 dark:text-stone-400 hover:text-stone-900'
                  }`}
                >
                  {b.label}
                </button>
              ))}
            </div>

            {/* Path Mode Toggle (Address Bar vs Settings Menu) */}
            {guideBrowserTab !== 'safari' && (
              <div className="flex items-center justify-between text-[11px] px-1 pt-0.5 font-semibold">
                <span className="text-stone-500">진입 경로 선택:</span>
                <div className="flex bg-stone-200 dark:bg-stone-800 p-0.5 rounded-lg text-[10px]">
                  <button
                    type="button"
                    onClick={() => setGuidePathMode('addressBar')}
                    className={`px-2.5 py-0.5 rounded transition-all cursor-pointer ${
                      guidePathMode === 'addressBar'
                        ? 'bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 font-bold'
                        : 'text-stone-600 dark:text-stone-400'
                    }`}
                  >
                    주소창 아이콘 (빠른 경로)
                  </button>
                  <button
                    type="button"
                    onClick={() => setGuidePathMode('settingsMenu')}
                    className={`px-2.5 py-0.5 rounded transition-all cursor-pointer ${
                      guidePathMode === 'settingsMenu'
                        ? 'bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 font-bold'
                        : 'text-stone-600 dark:text-stone-400'
                    }`}
                  >
                    브라우저 설정 메뉴 직접 진입
                  </button>
                </div>
              </div>
            )}

            {/* Step-by-Step Guide Content */}
            <div className="space-y-2 text-xs text-stone-600 dark:text-stone-300 font-sans pt-1">
              {guideBrowserTab === 'chrome' && guidePathMode === 'addressBar' && (
                <>
                  <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-stone-50 dark:bg-stone-800/60 border border-stone-200/80 dark:border-stone-700/60">
                    <div className="w-5 h-5 rounded-full bg-amber-500 text-stone-950 font-bold text-[11px] flex items-center justify-center shrink-0 mt-0.5">1</div>
                    <div>
                      <strong className="text-stone-900 dark:text-stone-100 block text-xs">주소창 맨 좌측 아이콘 클릭</strong>
                      <span className="text-[11px] text-stone-500 dark:text-stone-400">
                        브라우저 상단 URL 주소창 맨 좌측의 <strong>[자물쇠 🔒 / 주의 요함 ⚠️ / 사이트 설정 🎛️]</strong> 아이콘을 클릭합니다.
                      </span>
                    </div>
                  </div>
                  <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-stone-50 dark:bg-stone-800/60 border border-stone-200/80 dark:border-stone-700/60">
                    <div className="w-5 h-5 rounded-full bg-amber-500 text-stone-950 font-bold text-[11px] flex items-center justify-center shrink-0 mt-0.5">2</div>
                    <div>
                      <strong className="text-stone-900 dark:text-stone-100 block text-xs">알림 항목 '허용'으로 변경</strong>
                      <span className="text-[11px] text-stone-500 dark:text-stone-400">
                        팝업창의 <strong>'알림'</strong> 항목을 <strong>'허용(Allow)'</strong>으로 변경합니다 (또는 '사이트 설정' 진입 후 알림 허용).
                      </span>
                    </div>
                  </div>
                </>
              )}

              {guideBrowserTab === 'chrome' && guidePathMode === 'settingsMenu' && (
                <>
                  <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-stone-50 dark:bg-stone-800/60 border border-stone-200/80 dark:border-stone-700/60">
                    <div className="w-5 h-5 rounded-full bg-amber-500 text-stone-950 font-bold text-[11px] flex items-center justify-center shrink-0 mt-0.5">1</div>
                    <div>
                      <strong className="text-stone-900 dark:text-stone-100 block text-xs">Chrome 설정 진입 (Alt+E)</strong>
                      <span className="text-[11px] text-stone-500 dark:text-stone-400">
                        우측 상단 메뉴 <strong>'⋮'</strong> 클릭 ➔ <strong>'설정'</strong> (단축키: Alt+E)을 클릭합니다.
                      </span>
                    </div>
                  </div>
                  <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-stone-50 dark:bg-stone-800/60 border border-stone-200/80 dark:border-stone-700/60">
                    <div className="w-5 h-5 rounded-full bg-amber-500 text-stone-950 font-bold text-[11px] flex items-center justify-center shrink-0 mt-0.5">2</div>
                    <div>
                      <strong className="text-stone-900 dark:text-stone-100 block text-xs">사이트 알림 권한 진입</strong>
                      <span className="text-[11px] text-stone-500 dark:text-stone-400">
                        <strong>'개인정보 보호 및 보안'</strong> ➔ <strong>'사이트 설정'</strong> ➔ <strong>'알림'</strong> 메뉴를 선택합니다.
                      </span>
                    </div>
                  </div>
                  <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-stone-50 dark:bg-stone-800/60 border border-stone-200/80 dark:border-stone-700/60">
                    <div className="w-5 h-5 rounded-full bg-amber-500 text-stone-950 font-bold text-[11px] flex items-center justify-center shrink-0 mt-0.5">3</div>
                    <div>
                      <strong className="text-stone-900 dark:text-stone-100 block text-xs">현재 사이트 알림 '허용' 변경</strong>
                      <span className="text-[11px] text-stone-500 dark:text-stone-400">
                        '알림 전송이 허용되지 않음' 목록에서 해당 사이트 주소를 찾아 <strong>'허용'</strong>으로 변경합니다.
                      </span>
                    </div>
                  </div>
                </>
              )}

              {guideBrowserTab === 'edge' && guidePathMode === 'addressBar' && (
                <>
                  <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-stone-50 dark:bg-stone-800/60 border border-stone-200/80 dark:border-stone-700/60">
                    <div className="w-5 h-5 rounded-full bg-amber-500 text-stone-950 font-bold text-[11px] flex items-center justify-center shrink-0 mt-0.5">1</div>
                    <div>
                      <strong className="text-stone-900 dark:text-stone-100 block text-xs">주소창 맨 좌측 아이콘 클릭</strong>
                      <span className="text-[11px] text-stone-500 dark:text-stone-400">
                        브라우저 상단 URL 주소창 맨 좌측의 <strong>[자물쇠 🔒 / 주의 요함 ⚠️]</strong> 아이콘을 클릭합니다.
                      </span>
                    </div>
                  </div>
                  <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-stone-50 dark:bg-stone-800/60 border border-stone-200/80 dark:border-stone-700/60">
                    <div className="w-5 h-5 rounded-full bg-amber-500 text-stone-950 font-bold text-[11px] flex items-center justify-center shrink-0 mt-0.5">2</div>
                    <div>
                      <strong className="text-stone-900 dark:text-stone-100 block text-xs">'이 사이트에 대한 권한' ➔ 알림 '허용'</strong>
                      <span className="text-[11px] text-stone-500 dark:text-stone-400">
                        <strong>'이 사이트에 대한 권한'</strong>을 누르고 <strong>'알림'</strong> 항목을 <strong>'허용'</strong>으로 변경합니다.
                      </span>
                    </div>
                  </div>
                </>
              )}

              {guideBrowserTab === 'edge' && guidePathMode === 'settingsMenu' && (
                <>
                  <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-stone-50 dark:bg-stone-800/60 border border-stone-200/80 dark:border-stone-700/60">
                    <div className="w-5 h-5 rounded-full bg-amber-500 text-stone-950 font-bold text-[11px] flex items-center justify-center shrink-0 mt-0.5">1</div>
                    <div>
                      <strong className="text-stone-900 dark:text-stone-100 block text-xs">Edge 설정 진입</strong>
                      <span className="text-[11px] text-stone-500 dark:text-stone-400">
                        우측 상단 메뉴 <strong>'...'</strong> 클릭 ➔ <strong>'설정'</strong>을 클릭합니다.
                      </span>
                    </div>
                  </div>
                  <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-stone-50 dark:bg-stone-800/60 border border-stone-200/80 dark:border-stone-700/60">
                    <div className="w-5 h-5 rounded-full bg-amber-500 text-stone-950 font-bold text-[11px] flex items-center justify-center shrink-0 mt-0.5">2</div>
                    <div>
                      <strong className="text-stone-900 dark:text-stone-100 block text-xs">쿠키 및 사이트 권한 진입</strong>
                      <span className="text-[11px] text-stone-500 dark:text-stone-400">
                        <strong>'쿠키 및 사이트 권한'</strong> ➔ <strong>'알림'</strong>을 클릭합니다.
                      </span>
                    </div>
                  </div>
                  <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-stone-50 dark:bg-stone-800/60 border border-stone-200/80 dark:border-stone-700/60">
                    <div className="w-5 h-5 rounded-full bg-amber-500 text-stone-950 font-bold text-[11px] flex items-center justify-center shrink-0 mt-0.5">3</div>
                    <div>
                      <strong className="text-stone-900 dark:text-stone-100 block text-xs">차단 목록에서 '허용' 변경</strong>
                      <span className="text-[11px] text-stone-500 dark:text-stone-400">
                        차단 목록에서 해당 사이트를 찾아 <strong>'허용'</strong>으로 변경합니다.
                      </span>
                    </div>
                  </div>
                </>
              )}

              {guideBrowserTab === 'safari' && (
                <>
                  <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-stone-50 dark:bg-stone-800/60 border border-stone-200/80 dark:border-stone-700/60">
                    <div className="w-5 h-5 rounded-full bg-amber-500 text-stone-950 font-bold text-[11px] flex items-center justify-center shrink-0 mt-0.5">1</div>
                    <div>
                      <strong className="text-stone-900 dark:text-stone-100 block text-xs">Safari 설정 진입 (Cmd + ,)</strong>
                      <span className="text-[11px] text-stone-500 dark:text-stone-400">
                        맥 상단 메뉴바 <strong>[Safari]</strong> ➔ <strong>[설정... (Cmd + ,)]</strong>을 클릭합니다.
                      </span>
                    </div>
                  </div>
                  <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-stone-50 dark:bg-stone-800/60 border border-stone-200/80 dark:border-stone-700/60">
                    <div className="w-5 h-5 rounded-full bg-amber-500 text-stone-950 font-bold text-[11px] flex items-center justify-center shrink-0 mt-0.5">2</div>
                    <div>
                      <strong className="text-stone-900 dark:text-stone-100 block text-xs">웹 사이트 탭 ➔ 알림 메뉴 선택</strong>
                      <span className="text-[11px] text-stone-500 dark:text-stone-400">
                        상단 <strong>[웹 사이트]</strong> 탭 ➔ 좌측 목록에서 <strong>[알림]</strong>을 선택합니다.
                      </span>
                    </div>
                  </div>
                  <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-stone-50 dark:bg-stone-800/60 border border-stone-200/80 dark:border-stone-700/60">
                    <div className="w-5 h-5 rounded-full bg-amber-500 text-stone-950 font-bold text-[11px] flex items-center justify-center shrink-0 mt-0.5">3</div>
                    <div>
                      <strong className="text-stone-900 dark:text-stone-100 block text-xs">현재 사이트 '허용' 변경</strong>
                      <span className="text-[11px] text-stone-500 dark:text-stone-400">
                        우측 사이트 목록에서 현재 사이트 상태를 <strong>'허용'</strong>으로 변경합니다.
                      </span>
                    </div>
                  </div>
                </>
              )}

              <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 dark:text-emerald-300">
                <div className="w-5 h-5 rounded-full bg-emerald-500 text-stone-950 font-bold text-[11px] flex items-center justify-center shrink-0 mt-0.5">✓</div>
                <div>
                  <strong className="block text-xs font-bold">페이지 새로고침 (F5) 실행</strong>
                  <span className="text-[11px]">
                    권한 변경 후 아래의 <strong>'페이지 새로고침'</strong> 버튼을 누르면 알림 권한이 즉시 적용됩니다.
                  </span>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="pt-2 border-t border-stone-200 dark:border-stone-800 flex items-center justify-end gap-2 text-xs">
              <button
                type="button"
                onClick={() => setShowDeniedGuide(false)}
                className="px-3.5 py-1.5 rounded-xl border border-stone-200 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-600 dark:text-stone-300 font-medium cursor-pointer"
              >
                닫기
              </button>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="px-4 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold shadow-xs flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>페이지 새로고침 (F5)</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
