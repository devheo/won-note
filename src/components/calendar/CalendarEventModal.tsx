import React, { useState, useEffect } from 'react';
import { X, Calendar, Clock, MapPin, AlignLeft, Flag, Check, Trash2, Tag, Bell, Volume2, Sparkles } from 'lucide-react';
import { CalendarEvent, CalendarCategory, ReminderOffset, CalendarReminder } from '../../types';
import { playNotificationChime } from '../../utils/calendarNotification';
import { formatLocalDate } from '../../utils/dateColumnUtils';

interface CalendarEventModalProps {
  isOpen: boolean;
  onClose: () => void;
  event: Partial<CalendarEvent> | null;
  onSave: (event: CalendarEvent) => void;
  onDelete?: (eventId: string) => void;
  initialDate?: string;
  initialHour?: number;
}

const CATEGORY_CONFIG: Record<CalendarCategory, { label: string; color: string; bg: string; border: string }> = {
  work: { label: '업무', color: 'text-blue-700 dark:text-blue-300', bg: 'bg-blue-500/15', border: 'border-blue-500/30' },
  meeting: { label: '회의/미팅', color: 'text-purple-700 dark:text-purple-300', bg: 'bg-purple-500/15', border: 'border-purple-500/30' },
  personal: { label: '개인/일상', color: 'text-emerald-700 dark:text-emerald-300', bg: 'bg-emerald-500/15', border: 'border-emerald-500/30' },
  deadline: { label: '마감/중요', color: 'text-amber-700 dark:text-amber-300', bg: 'bg-amber-500/15', border: 'border-amber-500/30' },
  urgent: { label: '긴급', color: 'text-rose-700 dark:text-rose-300', bg: 'bg-rose-500/15', border: 'border-rose-500/30' },
  etc: { label: '기타', color: 'text-stone-700 dark:text-stone-300', bg: 'bg-stone-500/15', border: 'border-stone-500/30' },
};

export const CalendarEventModal: React.FC<CalendarEventModalProps> = ({
  isOpen,
  onClose,
  event,
  onSave,
  onDelete,
  initialDate,
  initialHour,
}) => {
  const [title, setTitle] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [isAllDay, setIsAllDay] = useState(true);
  const [category, setCategory] = useState<CalendarCategory>('work');
  const [priority, setPriority] = useState<'low' | 'normal' | 'high' | 'urgent'>('normal');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [completed, setCompleted] = useState(false);
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderOffset, setReminderOffset] = useState<ReminderOffset>('10m');
  const [reminderSound, setReminderSound] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setConfirmDelete(false);
      const todayStr = formatLocalDate(new Date());
      if (event && event.id) {
        // Edit existing
        setTitle(event.title || '');
        setStartDate(event.startDate || todayStr);
        setEndDate(event.endDate || event.startDate || todayStr);
        setStartTime(event.startTime || '09:00');
        setEndTime(event.endTime || '10:00');
        setIsAllDay(event.isAllDay ?? true);
        setCategory(event.category || 'work');
        setPriority(event.priority || 'normal');
        setLocation(event.location || '');
        setDescription(event.description || '');
        setCompleted(event.completed ?? false);
        setReminderEnabled(event.reminder?.enabled ?? false);
        setReminderOffset(event.reminder?.offset ?? '10m');
        setReminderSound(event.reminder?.sound ?? true);
      } else {
        // Create new
        const defaultDate = initialDate || todayStr;
        setTitle('');
        setStartDate(defaultDate);
        setEndDate(defaultDate);
        if (initialHour !== undefined) {
          const hStr = String(initialHour).padStart(2, '0');
          const nextHStr = String((initialHour + 1) % 24).padStart(2, '0');
          setStartTime(`${hStr}:00`);
          setEndTime(`${nextHStr}:00`);
          setIsAllDay(false);
        } else {
          setStartTime('09:00');
          setEndTime('10:00');
          setIsAllDay(true);
        }
        setCategory('work');
        setPriority('normal');
        setLocation('');
        setDescription('');
        setCompleted(false);
        setReminderEnabled(false);
        setReminderOffset('10m');
        setReminderSound(true);
      }
    }
  }, [isOpen, event, initialDate, initialHour]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const newEvent: CalendarEvent = {
      id: event?.id || 'evt_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      tableRowId: event?.tableRowId,
      title: title.trim(),
      startDate: startDate || formatLocalDate(new Date()),
      endDate: endDate || startDate || formatLocalDate(new Date()),
      startTime: isAllDay ? undefined : startTime,
      endTime: isAllDay ? undefined : endTime,
      isAllDay,
      category,
      priority,
      location: location.trim() || undefined,
      description: description.trim() || undefined,
      completed,
      reminder: reminderEnabled
        ? {
            enabled: true,
            offset: reminderOffset,
            sound: reminderSound,
            snoozeUntil: event?.reminder?.snoozeUntil,
          }
        : undefined,
      createdAt: event?.createdAt || Date.now(),
      updatedAt: Date.now(),
    };

    onSave(newEvent);
    onClose();
  };

  const isEditing = Boolean(event?.id);

  return (
    <div
      id="calendar-event-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        id="calendar-event-modal"
        className="w-full max-w-lg bg-white dark:bg-[#1e1e1e] border border-stone-200 dark:border-[#333333] rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-stone-100 dark:border-[#2a2a2a] flex items-center justify-between bg-stone-50/60 dark:bg-[#252525]/50">
          <div className="flex items-center gap-2.5">
            <div className={`w-3.5 h-3.5 rounded-full ${CATEGORY_CONFIG[category].bg} border ${CATEGORY_CONFIG[category].border}`} />
            <h3 className="text-base font-bold text-stone-900 dark:text-stone-100">
              {isEditing ? '일정 수정' : '새 일정 등록'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-[#2e2e2e] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs overflow-y-auto max-h-[78vh]">
          {/* Title input */}
          <div>
            <label className="block text-stone-700 dark:text-stone-300 font-semibold mb-1">
              일정 제목 <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              autoFocus
              placeholder="예: 주간 기획 회의, 고객사 미팅, 기능 배포..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl border border-stone-300 dark:border-[#383838] bg-white dark:bg-[#282828] text-stone-900 dark:text-stone-100 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500"
            />
          </div>

          {/* Date & All Day Toggle */}
          <div className="p-3.5 rounded-xl bg-stone-50 dark:bg-[#252525] border border-stone-200/80 dark:border-[#333333] space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-stone-700 dark:text-stone-300 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-amber-500" />
                일시 설정
              </span>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isAllDay}
                  onChange={(e) => setIsAllDay(e.target.checked)}
                  className="rounded text-amber-500 focus:ring-amber-500 w-3.5 h-3.5"
                />
                <span className="text-stone-600 dark:text-stone-300 font-medium">종일 (All Day)</span>
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-[11px] text-stone-500 dark:text-stone-400 block mb-1">시작일</span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    if (!endDate || e.target.value > endDate) {
                      setEndDate(e.target.value);
                    }
                  }}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-stone-300 dark:border-[#3a3a3a] bg-white dark:bg-[#282828] text-stone-800 dark:text-stone-200"
                />
              </div>
              <div>
                <span className="text-[11px] text-stone-500 dark:text-stone-400 block mb-1">종료일</span>
                <input
                  type="date"
                  value={endDate}
                  min={startDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-stone-300 dark:border-[#3a3a3a] bg-white dark:bg-[#282828] text-stone-800 dark:text-stone-200"
                />
              </div>
            </div>

            {!isAllDay && (
              <div className="grid grid-cols-2 gap-3 pt-1 border-t border-stone-200/60 dark:border-[#333333]">
                <div>
                  <span className="text-[11px] text-stone-500 dark:text-stone-400 block mb-1 flex items-center gap-1">
                    <Clock className="w-3 h-3" /> 시작 시간
                  </span>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-stone-300 dark:border-[#3a3a3a] bg-white dark:bg-[#282828] text-stone-800 dark:text-stone-200 font-mono"
                  />
                </div>
                <div>
                  <span className="text-[11px] text-stone-500 dark:text-stone-400 block mb-1 flex items-center gap-1">
                    <Clock className="w-3 h-3" /> 종료 시간
                  </span>
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-stone-300 dark:border-[#3a3a3a] bg-white dark:bg-[#282828] text-stone-800 dark:text-stone-200 font-mono"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Category & Priority */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-stone-700 dark:text-stone-300 font-semibold mb-1 flex items-center gap-1">
                <Tag className="w-3 h-3 text-stone-400" />
                카테고리 (분류)
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as CalendarCategory)}
                className="w-full px-3 py-1.5 rounded-lg border border-stone-300 dark:border-[#383838] bg-white dark:bg-[#282828] text-stone-800 dark:text-stone-200 font-medium"
              >
                {Object.entries(CATEGORY_CONFIG).map(([key, conf]) => (
                  <option key={key} value={key}>
                    {conf.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-stone-700 dark:text-stone-300 font-semibold mb-1 flex items-center gap-1">
                <Flag className="w-3 h-3 text-stone-400" />
                중요도
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as any)}
                className="w-full px-3 py-1.5 rounded-lg border border-stone-300 dark:border-[#383838] bg-white dark:bg-[#282828] text-stone-800 dark:text-stone-200 font-medium"
              >
                <option value="normal">보통</option>
                <option value="high">높음 (중요)</option>
                <option value="urgent">긴급 (최우선)</option>
                <option value="low">낮음</option>
              </select>
            </div>
          </div>

          {/* Location */}
          <div>
            <label className="block text-stone-700 dark:text-stone-300 font-semibold mb-1 flex items-center gap-1">
              <MapPin className="w-3 h-3 text-stone-400" />
              장소 / 회의실 / 링크 (선택)
            </label>
            <input
              type="text"
              placeholder="예: 본사 4층 회의실, 온라인 Zoom..."
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-full px-3 py-1.5 rounded-lg border border-stone-300 dark:border-[#383838] bg-white dark:bg-[#282828] text-stone-800 dark:text-stone-200"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-stone-700 dark:text-stone-300 font-semibold mb-1 flex items-center gap-1">
              <AlignLeft className="w-3 h-3 text-stone-400" />
              상세 메모 / 안건 (선택)
            </label>
            <textarea
              rows={3}
              placeholder="회의 안건, 준비물, 관련 메모 등을 자유롭게 입력하세요..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-stone-300 dark:border-[#383838] bg-white dark:bg-[#282828] text-stone-800 dark:text-stone-200 resize-none custom-scrollbar"
            />
          </div>

          {/* Reminder Settings Card */}
          <div className="p-3.5 rounded-xl bg-amber-500/5 dark:bg-amber-500/10 border border-amber-500/25 space-y-3">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={reminderEnabled}
                  onChange={(e) => setReminderEnabled(e.target.checked)}
                  className="rounded text-amber-500 focus:ring-amber-500 w-4 h-4"
                />
                <span className="font-bold text-stone-800 dark:text-stone-200 flex items-center gap-1.5 text-xs">
                  <Bell className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                  일정 사전 알림 (Reminder)
                </span>
              </label>
              {reminderEnabled && (
                <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-500/15 px-2 py-0.5 rounded-full">
                  활성화됨
                </span>
              )}
            </div>

            {reminderEnabled && (
              <div className="pt-2 border-t border-amber-500/20 space-y-2.5 animate-in fade-in duration-150">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 items-center">
                  <div>
                    <span className="text-[11px] text-stone-600 dark:text-stone-300 block mb-1 font-medium">
                      알림 시점
                    </span>
                    <select
                      value={reminderOffset}
                      onChange={(e) => setReminderOffset(e.target.value as ReminderOffset)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-stone-300 dark:border-[#3a3a3a] bg-white dark:bg-[#282828] text-stone-800 dark:text-stone-200 font-medium"
                    >
                      <option value="5m">5분 전 (추천)</option>
                      <option value="10m">10분 전</option>
                      <option value="15m">15분 전</option>
                      <option value="30m">30분 전</option>
                      <option value="1h">1시간 전</option>
                      <option value="2h">2시간 전</option>
                      <option value="1d">1일 전 (24시간 전)</option>
                      <option value="on_time">정시 (시작 시간)</option>
                    </select>
                  </div>

                  <div>
                    <span className="text-[11px] text-stone-600 dark:text-stone-300 block mb-1 font-medium">
                      사운드 알림
                    </span>
                    <div className="flex items-center justify-between gap-1 p-1 bg-white dark:bg-[#282828] border border-stone-300 dark:border-[#3a3a3a] rounded-lg px-2 py-1">
                      <label className="flex items-center gap-1.5 cursor-pointer text-[11px] font-medium text-stone-700 dark:text-stone-200">
                        <input
                          type="checkbox"
                          checked={reminderSound}
                          onChange={(e) => setReminderSound(e.target.checked)}
                          className="rounded text-amber-500 focus:ring-amber-500 w-3.5 h-3.5"
                        />
                        <Volume2 className="w-3 h-3 text-stone-400" />
                        소리 재생
                      </label>
                      <button
                        type="button"
                        onClick={() => playNotificationChime(0.6)}
                        title="알림음 미리듣기"
                        className="text-[10px] text-amber-600 dark:text-amber-400 hover:text-amber-700 font-semibold px-1.5 py-0.5 rounded hover:bg-amber-500/10 transition-colors"
                      >
                        미리듣기
                      </button>
                    </div>
                  </div>
                </div>

                <p className="text-[10px] text-stone-500 dark:text-stone-400 leading-relaxed">
                  💡 알림 시점에 인앱 팝업 알림창과 브라우저 데스크톱 알림으로 알려드리며, 다시 알림(Snooze)을 선택할 수 있습니다.
                </p>
              </div>
            )}
          </div>

          {/* Completed Checkbox */}
          {isEditing && (
            <label className="flex items-center gap-2 p-2.5 rounded-xl border border-stone-200 dark:border-[#333333] hover:bg-stone-50 dark:hover:bg-[#252525] transition-colors cursor-pointer">
              <input
                type="checkbox"
                checked={completed}
                onChange={(e) => setCompleted(e.target.checked)}
                className="w-4 h-4 rounded text-amber-500 focus:ring-amber-500"
              />
              <span className="font-semibold text-stone-700 dark:text-stone-300">이 일정을 완료 상태로 표시</span>
            </label>
          )}

          {/* Buttons */}
          <div className="pt-3 border-t border-stone-100 dark:border-[#2a2a2a] flex items-center justify-between gap-2">
            {isEditing && onDelete ? (
              confirmDelete ? (
                <div className="flex items-center gap-1.5 bg-rose-50 dark:bg-rose-950/40 p-1 px-2.5 rounded-xl border border-rose-200 dark:border-rose-900/50">
                  <span className="text-xs font-bold text-rose-700 dark:text-rose-300">정말 삭제할까요?</span>
                  <button
                    type="button"
                    onClick={() => {
                      console.log('[CalendarEventModal] Confirmed delete for event:', event.id);
                      onDelete(event.id!);
                      onClose();
                    }}
                    className="px-2.5 py-1 text-xs rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold transition-colors shadow-sm"
                  >
                    삭제 확인
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="px-2 py-1 text-xs rounded-lg text-stone-600 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-800 font-medium"
                  >
                    취소
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="px-3 py-2 rounded-xl text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 font-semibold flex items-center gap-1.5 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>삭제</span>
                </button>
              )
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl border border-stone-300 dark:border-[#383838] hover:bg-stone-100 dark:hover:bg-[#2e2e2e] text-stone-600 dark:text-stone-300 font-semibold transition-colors"
              >
                취소
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold transition-colors shadow-sm flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>{isEditing ? '수정 완료' : '일정 등록'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
