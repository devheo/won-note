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
} from 'lucide-react';
import { CalendarEvent } from '../../types';
import {
  isBrowserNotificationSupported,
  getBrowserNotificationPermission,
  requestBrowserNotificationPermission,
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
  const [permission, setPermission] = useState<NotificationPermission>(getBrowserNotificationPermission());

  useEffect(() => {
    if (isOpen) {
      setPermission(getBrowserNotificationPermission());
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleRequestPermission = async () => {
    const res = await requestBrowserNotificationPermission();
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
          {/* Browser Desktop Notification Status */}
          {isBrowserNotificationSupported() && (
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-white dark:bg-[#2a2a2a] border border-stone-200/80 dark:border-[#383838]">
              <div className="flex items-center gap-2">
                {permission === 'granted' ? (
                  <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
                ) : (
                  <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0" />
                )}
                <div>
                  <span className="font-semibold text-stone-800 dark:text-stone-200 block text-[11px]">
                    브라우저 데스크톱 알림
                  </span>
                  <span className="text-[10px] text-stone-500 dark:text-stone-400">
                    {permission === 'granted'
                      ? '활성화됨 (백그라운드에서도 수신)'
                      : permission === 'denied'
                      ? '브라우저 설정에서 차단됨'
                      : '권한 승인 필요'}
                  </span>
                </div>
              </div>
              {permission !== 'granted' && (
                <button
                  type="button"
                  onClick={handleRequestPermission}
                  className="px-2.5 py-1 text-[11px] font-bold bg-amber-500 hover:bg-amber-400 text-stone-950 rounded-lg transition-colors shadow-xs"
                >
                  허용하기
                </button>
              )}
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
          💡 WonBee는 100% 오프라인 브라우저 타이머로 정확하게 일정 알림을 제공합니다.
        </div>
      </div>
    </div>
  );
};
