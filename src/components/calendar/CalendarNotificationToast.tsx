import React from 'react';
import { Bell, Clock, MapPin, X, AlertCircle, CheckCircle, RotateCcw } from 'lucide-react';
import { CalendarEvent, CalendarCategory } from '../../types';

interface CalendarNotificationToastProps {
  event: CalendarEvent;
  onDismiss: () => void;
  onSnooze: (minutes: number) => void;
  onOpenEvent: () => void;
}

const CATEGORY_CONFIG: Record<CalendarCategory, { label: string; color: string; bg: string }> = {
  work: { label: '업무', color: 'text-blue-700 dark:text-blue-300', bg: 'bg-blue-500/15' },
  meeting: { label: '회의/미팅', color: 'text-purple-700 dark:text-purple-300', bg: 'bg-purple-500/15' },
  personal: { label: '개인/일상', color: 'text-emerald-700 dark:text-emerald-300', bg: 'bg-emerald-500/15' },
  deadline: { label: '마감/중요', color: 'text-amber-700 dark:text-amber-300', bg: 'bg-amber-500/15' },
  urgent: { label: '긴급', color: 'text-rose-700 dark:text-rose-300', bg: 'bg-rose-500/15' },
  etc: { label: '기타', color: 'text-stone-700 dark:text-stone-300', bg: 'bg-stone-500/15' },
};

export const CalendarNotificationToast: React.FC<CalendarNotificationToastProps> = ({
  event,
  onDismiss,
  onSnooze,
  onOpenEvent,
}) => {
  const cat = CATEGORY_CONFIG[event.category] || CATEGORY_CONFIG.etc;

  return (
    <div
      id={`calendar-notification-toast-${event.id}`}
      className="fixed top-5 right-5 z-[9999] w-[92vw] max-w-sm sm:max-w-md bg-white dark:bg-[#202020] border-2 border-amber-500/80 rounded-2xl shadow-2xl shadow-amber-950/20 overflow-hidden animate-in slide-in-from-top-4 duration-200"
      role="alert"
    >
      {/* Top accent banner */}
      <div className="bg-amber-500 px-4 py-1.5 flex items-center justify-between text-stone-950">
        <div className="flex items-center gap-2 text-xs font-bold">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-stone-900 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-stone-950"></span>
          </span>
          <Bell className="w-3.5 h-3.5 fill-current" />
          <span>캘린더 일정 알림</span>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="p-1 -mr-1 rounded hover:bg-amber-600 transition-colors text-stone-950 font-bold"
          title="닫기"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Body */}
      <div className="p-4 space-y-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cat.bg} ${cat.color}`}>
              {cat.label}
            </span>
            {event.priority === 'urgent' && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-600 dark:text-rose-400">
                🚨 긴급
              </span>
            )}
            {event.priority === 'high' && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400">
                ⭐ 중요
              </span>
            )}
          </div>
          <h4 className="text-sm font-bold text-stone-900 dark:text-stone-100 line-clamp-2 leading-snug">
            {event.title}
          </h4>
        </div>

        {/* Time and location */}
        <div className="space-y-1 text-xs text-stone-600 dark:text-stone-300 bg-stone-50 dark:bg-[#282828] p-2.5 rounded-xl border border-stone-200/60 dark:border-[#333333]">
          <div className="flex items-center gap-1.5 font-medium">
            <Clock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <span>
              {event.startDate}
              {!event.isAllDay && event.startTime && ` ${event.startTime}`}
              {event.isAllDay && ' (종일)'}
            </span>
          </div>
          {event.location && (
            <div className="flex items-center gap-1.5 text-stone-500 dark:text-stone-400">
              <MapPin className="w-3.5 h-3.5 text-stone-400 shrink-0" />
              <span className="truncate">{event.location}</span>
            </div>
          )}
          {event.description && (
            <p className="text-[11px] text-stone-500 dark:text-stone-400 line-clamp-2 pt-1 border-t border-stone-200/50 dark:border-[#383838]">
              {event.description}
            </p>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap items-center justify-between gap-1.5 pt-1">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onSnooze(5)}
              className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-stone-100 dark:bg-[#2c2c2c] hover:bg-stone-200 dark:hover:bg-[#383838] text-stone-700 dark:text-stone-200 transition-colors flex items-center gap-1"
              title="5분 뒤 다시 알림"
            >
              <RotateCcw className="w-3 h-3 text-stone-400" />
              <span>5분 후 다시 알림</span>
            </button>
            <button
              type="button"
              onClick={() => onSnooze(15)}
              className="px-2 py-1.5 rounded-lg text-xs font-semibold bg-stone-100 dark:bg-[#2c2c2c] hover:bg-stone-200 dark:hover:bg-[#383838] text-stone-700 dark:text-stone-200 transition-colors hidden sm:inline-block"
              title="15분 뒤 다시 알림"
            >
              15분 후
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onOpenEvent}
              className="px-3 py-1.5 rounded-lg text-xs font-bold text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-colors"
            >
              일정 확인
            </button>
            <button
              type="button"
              onClick={onDismiss}
              className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-400 text-stone-950 transition-colors shadow-xs flex items-center gap-1"
            >
              <CheckCircle className="w-3.5 h-3.5" />
              <span>확인</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
