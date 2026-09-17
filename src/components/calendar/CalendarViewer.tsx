import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Plus,
  Zap,
  Clock,
  MapPin,
  CheckCircle2,
  Circle,
  Search,
  Filter,
  Layers,
  Table as TableIcon,
  AlertCircle,
  MoreHorizontal,
  FileSpreadsheet,
  Bell,
} from 'lucide-react';
import { TableDocument, TableRow, TableColumn, CalendarEvent, CalendarCategory } from '../../types';
import { CalendarEventModal } from './CalendarEventModal';
import { CalendarMacroModal } from './CalendarMacroModal';
import { CalendarNotificationCenter } from './CalendarNotificationCenter';
import { getKoreanHoliday } from '../../utils/koreanHolidays';
import { formatLocalDate } from '../../utils/dateColumnUtils';

interface CalendarViewerProps {
  table: TableDocument;
  rows: TableRow[];
  onUpdateTable: (updatedTable: TableDocument) => void;
  onOpenRowDetail: (row: TableRow, index: number) => void;
  onOpenRowEditor: (row: TableRow, colId?: string) => void;
}

const CATEGORY_STYLES: Record<CalendarCategory, { label: string; chipBg: string; text: string; dot: string }> = {
  work: { label: '업무', chipBg: 'bg-blue-50 dark:bg-blue-950/50 border-blue-200 dark:border-blue-800/60', text: 'text-blue-700 dark:text-blue-300', dot: 'bg-blue-500' },
  meeting: { label: '회의/미팅', chipBg: 'bg-purple-50 dark:bg-purple-950/50 border-purple-200 dark:border-purple-800/60', text: 'text-purple-700 dark:text-purple-300', dot: 'bg-purple-500' },
  personal: { label: '개인/일상', chipBg: 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800/60', text: 'text-emerald-700 dark:text-emerald-300', dot: 'bg-emerald-500' },
  deadline: { label: '마감/중요', chipBg: 'bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-800/60', text: 'text-amber-700 dark:text-amber-300', dot: 'bg-amber-500' },
  urgent: { label: '긴급', chipBg: 'bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-800/60', text: 'text-rose-700 dark:text-rose-300', dot: 'bg-rose-500' },
  etc: { label: '기타', chipBg: 'bg-stone-50 dark:bg-stone-800/50 border-stone-200 dark:border-stone-700', text: 'text-stone-700 dark:text-stone-300', dot: 'bg-stone-400' },
};

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export const CalendarViewer: React.FC<CalendarViewerProps> = ({
  table,
  rows,
  onUpdateTable,
  onOpenRowDetail,
  onOpenRowEditor,
}) => {
  // Current Navigation Date
  const [currentDate, setCurrentDate] = useState<Date>(() => new Date());
  const [viewType, setViewType] = useState<'month' | 'week' | 'day' | 'agenda'>('month');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Modals
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [isMacroModalOpen, setIsMacroModalOpen] = useState(false);
  const [isNotificationCenterOpen, setIsNotificationCenterOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem('wonbee_calendar_sound_enabled') !== 'false';
    } catch {
      return true;
    }
  });
  const [selectedEvent, setSelectedEvent] = useState<Partial<CalendarEvent> | null>(null);
  const [initialModalDate, setInitialModalDate] = useState<string | undefined>(undefined);
  const [initialModalHour, setInitialModalHour] = useState<number | undefined>(undefined);

  // More events popover for month view
  const [moreEventsDate, setMoreEventsDate] = useState<string | null>(null);

  // Storage key for standalone calendar events
  const storageKey = `wonbee_calendar_events_${table.id}`;

  const [storedEvents, setStoredEvents] = useState<CalendarEvent[]>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const saveStoredEvents = (newEvents: CalendarEvent[]) => {
    setStoredEvents(newEvents);
    try {
      localStorage.setItem(storageKey, JSON.stringify(newEvents));
    } catch (err) {
      console.error('Failed to save calendar events:', err);
    }
  };

  // Find date columns in the active table
  const dateColumns = useMemo(() => {
    return table.columns.filter((col) => {
      if (col.type === 'date') return true;
      const lower = col.name.toLowerCase();
      return (
        lower.includes('일자') ||
        lower.includes('날짜') ||
        lower.includes('마감') ||
        lower.includes('시작') ||
        lower.includes('일시') ||
        lower.includes('수정') ||
        lower.includes('date') ||
        lower.includes('time') ||
        lower.includes('due')
      );
    });
  }, [table.columns]);

  // Primary text column for title
  const primaryTitleCol = useMemo(() => {
    return table.columns.find((c) => c.isPrimaryKey) || table.columns.find((c) => c.type === 'text') || table.columns[0];
  }, [table.columns]);

  // Map table rows to calendar events
  const tableRowEvents = useMemo<CalendarEvent[]>(() => {
    if (dateColumns.length === 0) return [];
    const dateCol = dateColumns[0]; // Use first date column as primary event anchor
    const events: CalendarEvent[] = [];

    rows.forEach((r) => {
      const rawDate = r.data[dateCol.id];
      if (!rawDate || typeof rawDate !== 'string') return;

      // Extract YYYY-MM-DD
      const dateMatch = rawDate.match(/\b(\d{4}[-/.]\d{1,2}[-/.]\d{1,2})\b/);
      if (!dateMatch) return;

      const [y, m, d] = dateMatch[1].replace(/[/.]/g, '-').split('-');
      const formattedDate = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;

      // Check if time is included (HH:mm)
      const timeMatch = rawDate.match(/\b(\d{1,2}:\d{2})\b/);
      const startTime = timeMatch ? timeMatch[1] : undefined;

      const title = (primaryTitleCol ? r.data[primaryTitleCol.id] : '') || `항목 #${r.id.slice(0, 4)}`;

      // Infer category from status or tags if any
      let category: CalendarCategory = 'work';
      const statusVal = Object.values(r.data).find(
        (v) => typeof v === 'string' && (v.includes('완료') || v.includes('진행') || v.includes('대기') || v.includes('긴급'))
      );
      if (typeof statusVal === 'string') {
        if (statusVal.includes('긴급')) category = 'urgent';
        else if (statusVal.includes('완료')) category = 'personal';
      }

      events.push({
        id: `row_evt_${r.id}`,
        tableRowId: r.id,
        title: String(title),
        startDate: formattedDate,
        endDate: formattedDate,
        isAllDay: !startTime,
        startTime,
        category,
        completed: Boolean(r.data['completed'] || (typeof statusVal === 'string' && statusVal.includes('완료'))),
        createdAt: r.createdAt || Date.now(),
        updatedAt: r.updatedAt || Date.now(),
      });
    });

    return events;
  }, [rows, dateColumns, primaryTitleCol]);

  // Combined events: Table row events + Standalone calendar events
  const allEvents = useMemo(() => {
    const combined = [...storedEvents];
    // Add row events if not duplicate
    tableRowEvents.forEach((tre) => {
      if (!combined.some((ce) => ce.tableRowId === tre.tableRowId && ce.startDate === tre.startDate)) {
        combined.push(tre);
      }
    });
    return combined;
  }, [storedEvents, tableRowEvents]);

  // Count of events with active reminders
  const remindersCount = useMemo(() => {
    return allEvents.filter((e) => e.reminder?.enabled && e.reminder.offset !== 'none').length;
  }, [allEvents]);

  // Filtered events based on search and category
  const filteredEvents = useMemo(() => {
    return allEvents.filter((evt) => {
      if (selectedCategory !== 'all' && evt.category !== selectedCategory) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          evt.title.toLowerCase().includes(q) ||
          (evt.location && evt.location.toLowerCase().includes(q)) ||
          (evt.description && evt.description.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [allEvents, selectedCategory, searchQuery]);

  // Navigation handlers
  const handlePrev = () => {
    const d = new Date(currentDate);
    if (viewType === 'month') {
      d.setMonth(d.getMonth() - 1);
    } else if (viewType === 'week') {
      d.setDate(d.getDate() - 7);
    } else {
      d.setDate(d.getDate() - 1);
    }
    setCurrentDate(d);
  };

  const handleNext = () => {
    const d = new Date(currentDate);
    if (viewType === 'month') {
      d.setMonth(d.getMonth() + 1);
    } else if (viewType === 'week') {
      d.setDate(d.getDate() + 7);
    } else {
      d.setDate(d.getDate() + 1);
    }
    setCurrentDate(d);
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  // Event handlers
  const handleSaveEvent = (saved: CalendarEvent) => {
    // If it's a table row linked event, update the table row title/date as well!
    if (saved.tableRowId) {
      const rowIndex = rows.findIndex((r) => r.id === saved.tableRowId);
      if (rowIndex !== -1) {
        const row = rows[rowIndex];
        const newData = { ...row.data };
        if (primaryTitleCol) newData[primaryTitleCol.id] = saved.title;
        if (dateColumns.length > 0) {
          const dateVal = saved.startTime ? `${saved.startDate} ${saved.startTime}` : saved.startDate;
          newData[dateColumns[0].id] = dateVal;
        }
        const updatedRows = [...table.rows];
        const updatedRow = { ...row, data: newData, updatedAt: Date.now() };
        updatedRows[rowIndex] = updatedRow;
        onUpdateTable({
          ...table,
          rows: updatedRows,
          updatedAt: Date.now(),
        });
      }
    }

    const existingIdx = storedEvents.findIndex((e) => e.id === saved.id);
    let updated: CalendarEvent[];
    if (existingIdx !== -1) {
      updated = [...storedEvents];
      updated[existingIdx] = saved;
    } else {
      updated = [saved, ...storedEvents];
    }
    saveStoredEvents(updated);
  };

  const handleDeleteEvent = (eventId: string) => {
    // Check if event is linked to a table row
    let targetRowId: string | undefined;
    if (eventId.startsWith('row_evt_')) {
      targetRowId = eventId.replace('row_evt_', '');
    } else {
      const foundInStored = storedEvents.find((e) => e.id === eventId);
      if (foundInStored?.tableRowId) {
        targetRowId = foundInStored.tableRowId;
      }
    }

    if (targetRowId) {
      const updatedRows = table.rows.filter((r) => r.id !== targetRowId);
      onUpdateTable({
        ...table,
        rows: updatedRows,
        updatedAt: Date.now(),
      });
    }

    const updated = storedEvents.filter((e) => e.id !== eventId && e.tableRowId !== targetRowId);
    saveStoredEvents(updated);
  };

  // Macro bulk actions
  const handleAddMacroEvents = (newEvents: CalendarEvent[]) => {
    const updated = [...newEvents, ...storedEvents];
    saveStoredEvents(updated);
  };

  const handleUpdateMacroEvents = (updatedEvents: CalendarEvent[]) => {
    const map = new Map(updatedEvents.map((e) => [e.id, e]));
    const updated = storedEvents.map((e) => (map.has(e.id) ? map.get(e.id)! : e));
    saveStoredEvents(updated);
  };

  const handleDeleteMacroEvents = (eventIds: string[]) => {
    const set = new Set(eventIds);
    // Find all table row IDs to delete from macro bulk actions
    const tableRowIdsToDelete = new Set<string>();
    eventIds.forEach((id) => {
      if (id.startsWith('row_evt_')) {
        tableRowIdsToDelete.add(id.replace('row_evt_', ''));
      }
    });
    storedEvents.forEach((e) => {
      if (set.has(e.id) && e.tableRowId) {
        tableRowIdsToDelete.add(e.tableRowId);
      }
    });

    if (tableRowIdsToDelete.size > 0) {
      const updatedRows = table.rows.filter((r) => !tableRowIdsToDelete.has(r.id));
      onUpdateTable({
        ...table,
        rows: updatedRows,
        updatedAt: Date.now(),
      });
    }

    const updated = storedEvents.filter((e) => !set.has(e.id) && (!e.tableRowId || !tableRowIdsToDelete.has(e.tableRowId)));
    saveStoredEvents(updated);
  };

  // Open modal for new event on specific date & hour
  const handleOpenAddEvent = (dateStr?: string, hour?: number) => {
    setSelectedEvent(null);
    setInitialModalDate(dateStr);
    setInitialModalHour(hour);
    setIsEventModalOpen(true);
  };

  // Open modal for editing existing event
  const handleOpenEditEvent = (evt: CalendarEvent) => {
    setSelectedEvent(evt);
    setIsEventModalOpen(true);
  };

  // Date Formatting for Header Title
  const headerDateTitle = useMemo(() => {
    const y = currentDate.getFullYear();
    const m = currentDate.getMonth() + 1;
    if (viewType === 'month') {
      return `${y}년 ${m}월`;
    }
    if (viewType === 'week') {
      const d = new Date(currentDate);
      const dayOfWeek = d.getDay();
      const start = new Date(d);
      start.setDate(d.getDate() - dayOfWeek);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      return `${start.getFullYear()}년 ${start.getMonth() + 1}월 ${start.getDate()}일 ~ ${end.getMonth() + 1}월 ${end.getDate()}일`;
    }
    if (viewType === 'day') {
      return `${y}년 ${m}월 ${currentDate.getDate()}일 (${WEEKDAYS[currentDate.getDay()]}요일)`;
    }
    return `${y}년 ${m}월 일정 아젠다`;
  }, [currentDate, viewType]);

  // Month Grid Calculation
  const monthDays = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);

    const startDayOfWeek = firstDayOfMonth.getDay(); // 0 = Sun
    const totalDays = lastDayOfMonth.getDate();

    const days: { dateStr: string; dayNum: number; isCurrentMonth: boolean; isToday: boolean; holiday: any }[] = [];
    const todayStr = formatLocalDate(new Date());

    // Prev month padding
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const dNum = prevMonthLastDay - i;
      const prevDate = new Date(year, month - 1, dNum);
      const dateStr = formatLocalDate(prevDate);
      days.push({
        dateStr,
        dayNum: dNum,
        isCurrentMonth: false,
        isToday: dateStr === todayStr,
        holiday: getKoreanHoliday(dateStr),
      });
    }

    // Current month days
    for (let i = 1; i <= totalDays; i++) {
      const curDate = new Date(year, month, i);
      const dateStr = formatLocalDate(curDate);
      days.push({
        dateStr,
        dayNum: i,
        isCurrentMonth: true,
        isToday: dateStr === todayStr,
        holiday: getKoreanHoliday(dateStr),
      });
    }

    // Next month padding to fill complete weeks (35 or 42 cells)
    const remaining = (7 - (days.length % 7)) % 7;
    for (let i = 1; i <= remaining; i++) {
      const nextDate = new Date(year, month + 1, i);
      const dateStr = formatLocalDate(nextDate);
      days.push({
        dateStr,
        dayNum: i,
        isCurrentMonth: false,
        isToday: dateStr === todayStr,
        holiday: getKoreanHoliday(dateStr),
      });
    }

    return days;
  }, [currentDate]);

  // Week Days Calculation
  const weekDays = useMemo(() => {
    const d = new Date(currentDate);
    const dayOfWeek = d.getDay();
    const sunday = new Date(d);
    sunday.setDate(d.getDate() - dayOfWeek);

    const todayStr = formatLocalDate(new Date());

    return Array.from({ length: 7 }).map((_, idx) => {
      const cur = new Date(sunday);
      cur.setDate(sunday.getDate() + idx);
      const dateStr = formatLocalDate(cur);
      return {
        date: cur,
        dateStr,
        dayNum: cur.getDate(),
        dayLabel: WEEKDAYS[idx],
        isToday: dateStr === todayStr,
        holiday: getKoreanHoliday(dateStr),
      };
    });
  }, [currentDate]);

  // Scroll week/day grid to 08:00 AM on initial load
  const timeGridContainerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (timeGridContainerRef.current && (viewType === 'week' || viewType === 'day')) {
      // 8 AM = 8 * 60px
      timeGridContainerRef.current.scrollTop = 480;
    }
  }, [viewType]);

  return (
    <div id="calendar-viewer-container" className="flex-1 h-screen flex flex-col overflow-hidden bg-white dark:bg-[#181818] select-none transition-colors">
      {/* 1. Calendar Header Toolbar */}
      <div className="px-4 sm:px-6 py-2.5 border-b border-stone-200/80 dark:border-[#333333] bg-stone-50/70 dark:bg-[#1e1e1e]/60 flex items-center justify-between gap-3 flex-wrap">
        {/* Navigation & Current Period */}
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <div className="flex items-center bg-stone-200/70 dark:bg-[#252525] p-0.5 rounded-xl border border-stone-200/80 dark:border-[#383838]">
            <button
              type="button"
              onClick={handleToday}
              className="px-2.5 py-1 text-xs font-bold text-stone-700 dark:text-stone-200 hover:bg-white dark:hover:bg-[#333333] rounded-lg transition-colors"
            >
              오늘
            </button>
            <div className="w-[1px] h-3 bg-stone-300 dark:bg-[#383838] mx-0.5" />
            <button
              type="button"
              onClick={handlePrev}
              className="p-1 text-stone-600 dark:text-stone-300 hover:bg-white dark:hover:bg-[#333333] rounded-lg transition-colors"
              title="이전"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleNext}
              className="p-1 text-stone-600 dark:text-stone-300 hover:bg-white dark:hover:bg-[#333333] rounded-lg transition-colors"
              title="다음"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <h2 className="text-base sm:text-lg font-bold text-stone-900 dark:text-white flex items-center gap-2">
            <CalendarIcon className="w-4 h-4 text-amber-500" />
            <span>{headerDateTitle}</span>
          </h2>
        </div>

        {/* View Mode Switcher (Month / Week / Day / Agenda) & Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* View Type Toggle */}
          <div className="flex items-center bg-stone-200/70 dark:bg-[#252525] p-0.5 rounded-xl border border-stone-200/80 dark:border-[#383838]">
            <button
              type="button"
              onClick={() => setViewType('month')}
              className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all ${
                viewType === 'month'
                  ? 'bg-white dark:bg-[#333333] text-stone-900 dark:text-white shadow-2xs font-bold'
                  : 'text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200'
              }`}
            >
              월간
            </button>
            <button
              type="button"
              onClick={() => setViewType('week')}
              className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all ${
                viewType === 'week'
                  ? 'bg-white dark:bg-[#333333] text-stone-900 dark:text-white shadow-2xs font-bold'
                  : 'text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200'
              }`}
            >
              주간
            </button>
            <button
              type="button"
              onClick={() => setViewType('day')}
              className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all ${
                viewType === 'day'
                  ? 'bg-white dark:bg-[#333333] text-stone-900 dark:text-white shadow-2xs font-bold'
                  : 'text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200'
              }`}
            >
              일간
            </button>
            <button
              type="button"
              onClick={() => setViewType('agenda')}
              className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all ${
                viewType === 'agenda'
                  ? 'bg-white dark:bg-[#333333] text-stone-900 dark:text-white shadow-2xs font-bold'
                  : 'text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200'
              }`}
            >
              목록
            </button>
          </div>

          {/* Search Box */}
          <div className="relative w-36 sm:w-44">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400" />
            <input
              type="text"
              placeholder="일정 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-2.5 py-1 text-xs rounded-xl border border-stone-200 dark:border-[#383838] bg-white dark:bg-[#252525] text-stone-800 dark:text-stone-200 focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
          </div>

          {/* ⚡ Calendar Macro Button */}
          <button
            type="button"
            onClick={() => setIsMacroModalOpen(true)}
            className="px-3 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-xs font-bold flex items-center gap-1.5 transition-all shadow-2xs"
            title="반복 일정, 교대 근무표, 날짜 일괄 이동, .ics 연동 매크로 도구함 열기"
          >
            <Zap className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
            <span>캘린더 매크로</span>
          </button>

          {/* 🔔 Calendar Notification Center Button */}
          <button
            type="button"
            onClick={() => setIsNotificationCenterOpen(true)}
            className="relative p-1.5 px-2.5 rounded-xl bg-stone-100 dark:bg-[#252525] hover:bg-stone-200 dark:hover:bg-[#303030] border border-stone-200 dark:border-[#383838] text-stone-700 dark:text-stone-300 text-xs font-bold flex items-center gap-1.5 transition-all shadow-2xs"
            title="일정 알림 센터 (알림 설정, 효과음 테스트, 예정된 알림)"
          >
            <Bell className="w-3.5 h-3.5 text-amber-500" />
            <span className="hidden sm:inline">알림</span>
            {remindersCount > 0 && (
              <span className="bg-amber-500 text-stone-950 font-extrabold text-[10px] min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center shadow-xs">
                {remindersCount}
              </span>
            )}
          </button>

          {/* + Add Event Button */}
          <button
            type="button"
            onClick={() => handleOpenAddEvent()}
            className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>일정 추가</span>
          </button>
        </div>
      </div>

      {/* 2. Category Filter Bar */}
      <div className="px-4 sm:px-6 py-1.5 border-b border-stone-100 dark:border-[#2a2a2a] bg-stone-50/40 dark:bg-[#1a1a1a] flex items-center justify-between gap-2 overflow-x-auto custom-scrollbar">
        <div className="flex items-center gap-1.5 text-xs">
          <span className="text-stone-400 text-[11px] mr-1 flex items-center gap-1">
            <Filter className="w-3 h-3" /> 필터:
          </span>
          <button
            type="button"
            onClick={() => setSelectedCategory('all')}
            className={`px-2 py-0.5 rounded-full text-[11px] font-semibold transition-all ${
              selectedCategory === 'all'
                ? 'bg-stone-900 dark:bg-white text-white dark:text-stone-900 shadow-2xs'
                : 'text-stone-500 hover:bg-stone-200 dark:hover:bg-[#2c2c2c]'
            }`}
          >
            전체 ({allEvents.length})
          </button>
          {Object.entries(CATEGORY_STYLES).map(([key, conf]) => {
            const count = allEvents.filter((e) => e.category === key).length;
            const isSelected = selectedCategory === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setSelectedCategory(isSelected ? 'all' : key)}
                className={`px-2 py-0.5 rounded-full text-[11px] font-semibold flex items-center gap-1 transition-all ${
                  isSelected
                    ? `${conf.chipBg} ${conf.text} border font-bold shadow-2xs`
                    : 'text-stone-500 hover:bg-stone-100 dark:hover:bg-[#282828]'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${conf.dot}`} />
                <span>{conf.label}</span>
                <span className="opacity-60 text-[10px]">({count})</span>
              </button>
            );
          })}
        </div>

        {dateColumns.length > 0 && (
          <div className="text-[11px] text-stone-400 flex items-center gap-1 shrink-0">
            <FileSpreadsheet className="w-3 h-3 text-emerald-500" />
            <span>테이블 연동 날짜 컬럼: <strong className="text-stone-600 dark:text-stone-300">{dateColumns[0].name}</strong></span>
          </div>
        )}
      </div>

      {/* 3. Main Calendar Views */}
      <div className="flex-1 overflow-auto relative">
        {/* ============================================================ */}
        {/* 3-A. MONTH VIEW                                              */}
        {/* ============================================================ */}
        {viewType === 'month' && (
          <div className="h-full flex flex-col min-w-[720px]">
            {/* Weekday Header Row */}
            <div className="grid grid-cols-7 border-b border-stone-200 dark:border-[#333333] bg-stone-50/80 dark:bg-[#222222]">
              {WEEKDAYS.map((w, idx) => (
                <div
                  key={w}
                  className={`py-2 text-center text-xs font-bold ${
                    idx === 0 ? 'text-rose-500' : idx === 6 ? 'text-blue-500' : 'text-stone-600 dark:text-stone-300'
                  }`}
                >
                  {w}
                </div>
              ))}
            </div>

            {/* 7-column Calendar Days Grid */}
            <div className="flex-1 grid grid-cols-7 auto-rows-fr divide-x divide-y divide-stone-100 dark:divide-[#262626] border-b border-stone-200 dark:border-[#333333]">
              {monthDays.map((day, idx) => {
                const dayOfWeek = idx % 7;
                const isSunday = dayOfWeek === 0;
                const isSaturday = dayOfWeek === 6;

                // Events on this day
                const dayEvents = filteredEvents.filter((e) => {
                  return e.startDate <= day.dateStr && day.dateStr <= (e.endDate || e.startDate);
                });

                return (
                  <div
                    key={`month-cell-${day.dateStr}-${idx}`}
                    onClick={() => handleOpenAddEvent(day.dateStr)}
                    className={`min-h-[96px] p-1.5 flex flex-col group relative transition-colors cursor-pointer ${
                      day.isCurrentMonth
                        ? 'bg-white dark:bg-[#181818] hover:bg-stone-50/70 dark:hover:bg-[#202020]'
                        : 'bg-stone-50/50 dark:bg-[#141414]/80 text-stone-400 dark:text-stone-600'
                    }`}
                  >
                    {/* Date Header in Cell */}
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1">
                        <span
                          className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold ${
                            day.isToday
                              ? 'bg-amber-500 text-stone-950 font-black shadow-xs'
                              : isSunday || day.holiday?.isHoliday
                              ? 'text-rose-500 font-bold'
                              : isSaturday
                              ? 'text-blue-500 font-bold'
                              : 'text-stone-700 dark:text-stone-300'
                          }`}
                        >
                          {day.dayNum}
                        </span>

                        {day.holiday && (
                          <span
                            className="text-[10px] font-medium text-rose-500 truncate max-w-[85px]"
                            title={day.holiday.name}
                          >
                            {day.holiday.name}
                          </span>
                        )}
                      </div>

                      {/* Quick Add Button on Cell Hover */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenAddEvent(day.dateStr);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 text-stone-400 hover:text-amber-500 hover:bg-amber-500/10 rounded-md transition-all"
                        title="이 날짜에 새 일정 추가"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Day Events Chips List */}
                    <div className="flex-1 space-y-1 overflow-hidden">
                      {dayEvents.slice(0, 3).map((evt) => {
                        const style = CATEGORY_STYLES[evt.category] || CATEGORY_STYLES.etc;
                        return (
                          <div
                            key={evt.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (evt.tableRowId) {
                                // If row linked, give quick choice to edit
                                handleOpenEditEvent(evt);
                              } else {
                                handleOpenEditEvent(evt);
                              }
                            }}
                            className={`px-1.5 py-0.5 rounded-md text-[11px] border flex items-center gap-1 truncate font-medium cursor-pointer transition-transform hover:scale-[1.01] ${
                              style.chipBg
                            } ${style.text} ${evt.completed ? 'line-through opacity-60' : ''}`}
                            title={`${evt.title} (${evt.startTime || '종일'})`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${style.dot}`} />
                            {evt.startTime && <span className="font-mono text-[10px] shrink-0">{evt.startTime}</span>}
                            <span className="truncate">{evt.title}</span>
                            {evt.reminder?.enabled && evt.reminder.offset !== 'none' && (
                              <Bell className="w-2.5 h-2.5 text-amber-500 shrink-0 ml-auto" />
                            )}
                          </div>
                        );
                      })}

                      {dayEvents.length > 3 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setMoreEventsDate(day.dateStr);
                          }}
                          className="w-full text-left text-[10px] text-stone-500 hover:text-amber-600 font-semibold px-1 py-0.5 rounded hover:bg-stone-100 dark:hover:bg-[#282828] transition-colors"
                        >
                          +{dayEvents.length - 3}개 더보기
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* 3-B. WEEK VIEW (TIMETABLE)                                   */}
        {/* ============================================================ */}
        {viewType === 'week' && (
          <div ref={timeGridContainerRef} className="h-full overflow-y-auto min-w-[850px] flex flex-col custom-scrollbar">
            {/* Week Header */}
            <div className="sticky top-0 z-20 grid grid-cols-8 border-b border-stone-200 dark:border-[#333333] bg-stone-50/95 dark:bg-[#1e1e1e]/95 backdrop-blur-xs">
              <div className="py-2.5 text-center text-xs font-bold text-stone-400 border-r border-stone-200 dark:border-[#333333]">
                시간
              </div>
              {weekDays.map((day, idx) => (
                <div
                  key={`week-hdr-${day.dateStr}-${idx}`}
                  className={`py-2 text-center border-r border-stone-200 dark:border-[#333333] ${
                    day.isToday ? 'bg-amber-500/10' : ''
                  }`}
                >
                  <div
                    className={`text-[11px] font-bold ${
                      idx === 0 ? 'text-rose-500' : idx === 6 ? 'text-blue-500' : 'text-stone-500'
                    }`}
                  >
                    {day.dayLabel}
                  </div>
                  <div
                    className={`text-sm font-bold mt-0.5 inline-flex items-center justify-center w-6 h-6 rounded-full ${
                      day.isToday ? 'bg-amber-500 text-stone-950 font-black' : 'text-stone-800 dark:text-stone-200'
                    }`}
                  >
                    {day.dayNum}
                  </div>
                  {day.holiday && <div className="text-[10px] text-rose-500 truncate px-1">{day.holiday.name}</div>}
                </div>
              ))}
            </div>

            {/* All-Day Events Strip */}
            <div className="grid grid-cols-8 border-b border-stone-200 dark:border-[#333333] bg-stone-100/50 dark:bg-[#1c1c1c] min-h-[36px]">
              <div className="p-2 text-[10px] font-bold text-stone-400 text-center border-r border-stone-200 dark:border-[#333333]">
                종일
              </div>
              {weekDays.map((day, idx) => {
                const allDayEvts = filteredEvents.filter(
                  (e) => e.isAllDay && e.startDate <= day.dateStr && day.dateStr <= (e.endDate || e.startDate)
                );
                return (
                  <div
                    key={`allday-${day.dateStr}-${idx}`}
                    onClick={() => handleOpenAddEvent(day.dateStr)}
                    className="p-1 border-r border-stone-200 dark:border-[#333333] space-y-1 cursor-pointer hover:bg-stone-100/70 dark:hover:bg-[#252525]"
                  >
                    {allDayEvts.map((evt) => {
                      const style = CATEGORY_STYLES[evt.category] || CATEGORY_STYLES.etc;
                      return (
                        <div
                          key={evt.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenEditEvent(evt);
                          }}
                          className={`px-1.5 py-0.5 rounded text-[10px] border truncate font-medium ${style.chipBg} ${style.text}`}
                        >
                          {evt.title}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>

            {/* 24-Hour Time Grid */}
            <div className="flex-1 relative grid grid-cols-8">
              {/* Hour Labels Column */}
              <div className="border-r border-stone-200 dark:border-[#333333] bg-stone-50/50 dark:bg-[#1a1a1a]">
                {Array.from({ length: 24 }).map((_, hour) => (
                  <div
                    key={hour}
                    className="h-[60px] border-b border-stone-200/60 dark:border-[#2a2a2a] pr-2 text-right text-[11px] font-mono text-stone-400 -translate-y-2.5"
                  >
                    {String(hour).padStart(2, '0')}:00
                  </div>
                ))}
              </div>

              {/* 7 Day Columns */}
              {weekDays.map((day, idx) => {
                // Time-specific events
                const dayTimeEvents = filteredEvents.filter(
                  (e) => !e.isAllDay && e.startDate <= day.dateStr && day.dateStr <= (e.endDate || e.startDate)
                );

                return (
                  <div
                    key={`timecol-${day.dateStr}-${idx}`}
                    className="relative border-r border-stone-200 dark:border-[#333333] divide-y divide-stone-100 dark:divide-[#252525]"
                  >
                    {Array.from({ length: 24 }).map((_, hour) => (
                      <div
                        key={hour}
                        onClick={() => handleOpenAddEvent(day.dateStr, hour)}
                        className="h-[60px] hover:bg-amber-500/5 cursor-pointer transition-colors"
                      />
                    ))}

                    {/* Render Time Event Cards */}
                    {dayTimeEvents.map((evt) => {
                      const [sh, sm] = (evt.startTime || '09:00').split(':').map((v) => parseInt(v, 10) || 0);
                      const [eh, em] = (evt.endTime || '10:00').split(':').map((v) => parseInt(v, 10) || 0);

                      const startMin = sh * 60 + sm;
                      const endMin = Math.max(startMin + 30, eh * 60 + em);
                      const duration = endMin - startMin;

                      const topPx = (startMin / 60) * 60; // 1 min = 1px
                      const heightPx = Math.max(26, (duration / 60) * 60);

                      const style = CATEGORY_STYLES[evt.category] || CATEGORY_STYLES.etc;

                      return (
                        <div
                          key={evt.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenEditEvent(evt);
                          }}
                          style={{ top: `${topPx}px`, height: `${heightPx}px` }}
                          className={`absolute left-1 right-1 p-1.5 rounded-lg border shadow-xs overflow-hidden cursor-pointer transition-all hover:ring-2 hover:ring-amber-500/50 hover:z-10 ${
                            style.chipBg
                          } ${style.text}`}
                        >
                          <div className="font-bold text-[11px] truncate flex items-center gap-1">
                            <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                            <span className="truncate">{evt.title}</span>
                            {evt.reminder?.enabled && evt.reminder.offset !== 'none' && (
                              <Bell className="w-2.5 h-2.5 text-amber-500 shrink-0 ml-auto" />
                            )}
                          </div>
                          <div className="text-[10px] opacity-80 font-mono">
                            {evt.startTime} ~ {evt.endTime || ''}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* 3-C. DAY VIEW                                                */}
        {/* ============================================================ */}
        {viewType === 'day' && (
          <div ref={timeGridContainerRef} className="h-full overflow-y-auto max-w-4xl mx-auto p-4 custom-scrollbar">
            <div className="rounded-2xl border border-stone-200 dark:border-[#333333] bg-white dark:bg-[#1e1e1e] overflow-hidden shadow-sm">
              <div className="p-4 border-b border-stone-200 dark:border-[#333333] bg-stone-50 dark:bg-[#252525] flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-stone-900 dark:text-white">
                    {currentDate.getFullYear()}년 {currentDate.getMonth() + 1}월 {currentDate.getDate()}일
                  </h3>
                  <span className="text-xs text-stone-500">{WEEKDAYS[currentDate.getDay()]}요일 상세 시간표</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleOpenAddEvent(formatLocalDate(currentDate))}
                  className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>새 일정 추가</span>
                </button>
              </div>

              {/* Day Time Grid */}
              <div className="relative divide-y divide-stone-100 dark:divide-[#2a2a2a]">
                {Array.from({ length: 24 }).map((_, hour) => {
                  const dateStr = formatLocalDate(currentDate);
                  const hourEvents = filteredEvents.filter((e) => {
                    if (e.startDate !== dateStr) return false;
                    if (e.isAllDay) return false;
                    const sh = parseInt((e.startTime || '09:00').split(':')[0], 10);
                    return sh === hour;
                  });

                  return (
                    <div
                      key={hour}
                      onClick={() => handleOpenAddEvent(dateStr, hour)}
                      className="min-h-[56px] p-2 flex items-start gap-4 hover:bg-stone-50 dark:hover:bg-[#222222] cursor-pointer transition-colors"
                    >
                      <span className="w-14 text-xs font-mono font-bold text-stone-400 pt-0.5">
                        {String(hour).padStart(2, '0')}:00
                      </span>
                      <div className="flex-1 flex flex-wrap gap-2">
                        {hourEvents.map((evt) => {
                          const style = CATEGORY_STYLES[evt.category] || CATEGORY_STYLES.etc;
                          return (
                            <div
                              key={evt.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenEditEvent(evt);
                              }}
                              className={`px-3 py-1.5 rounded-xl border flex items-center gap-2 text-xs font-semibold ${style.chipBg} ${style.text}`}
                            >
                              <span className={`w-2 h-2 rounded-full ${style.dot}`} />
                              <span>{evt.title}</span>
                              <span className="font-mono text-[11px] opacity-75">
                                {evt.startTime} ~ {evt.endTime}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* 3-D. AGENDA VIEW                                             */}
        {/* ============================================================ */}
        {viewType === 'agenda' && (
          <div className="h-full overflow-y-auto max-w-4xl mx-auto p-4 sm:p-6 custom-scrollbar space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-stone-500">
                총 <strong>{filteredEvents.length}</strong>개의 일정이 등록되어 있습니다.
              </span>
              <button
                type="button"
                onClick={() => handleOpenAddEvent()}
                className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>새 일정 추가</span>
              </button>
            </div>

            {filteredEvents.length === 0 ? (
              <div className="p-12 text-center rounded-2xl border border-dashed border-stone-300 dark:border-[#383838] text-stone-400">
                <CalendarIcon className="w-10 h-10 mx-auto mb-2 opacity-50" />
                <h4 className="font-bold text-stone-600 dark:text-stone-300">표시할 일정이 없습니다</h4>
                <p className="text-xs mt-1">새 일정을 등록하거나 캘린더 매크로를 사용하여 대량으로 생성해보세요.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredEvents
                  .slice()
                  .sort((a, b) => a.startDate.localeCompare(b.startDate))
                  .map((evt) => {
                    const style = CATEGORY_STYLES[evt.category] || CATEGORY_STYLES.etc;
                    return (
                      <div
                        key={evt.id}
                        onClick={() => handleOpenEditEvent(evt)}
                        className="p-4 rounded-2xl border border-stone-200 dark:border-[#333333] bg-white dark:bg-[#1e1e1e] hover:shadow-md transition-all flex items-start justify-between gap-4 cursor-pointer"
                      >
                        <div className="space-y-1.5 flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold border ${style.chipBg} ${style.text}`}>
                              {style.label}
                            </span>
                            <h4 className={`text-sm font-bold text-stone-900 dark:text-stone-100 flex items-center gap-1.5 ${evt.completed ? 'line-through opacity-50' : ''}`}>
                              <span>{evt.title}</span>
                              {evt.reminder?.enabled && evt.reminder.offset !== 'none' && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                                  <Bell className="w-2.5 h-2.5" /> 알림
                                </span>
                              )}
                            </h4>
                          </div>

                          <div className="flex items-center gap-4 text-xs text-stone-500 dark:text-stone-400 font-mono">
                            <span className="flex items-center gap-1">
                              <CalendarIcon className="w-3.5 h-3.5 text-amber-500" />
                              {evt.startDate} {evt.endDate && evt.endDate !== evt.startDate ? `~ ${evt.endDate}` : ''}
                            </span>
                            {!evt.isAllDay && evt.startTime && (
                              <span className="flex items-center gap-1">
                                <Clock className="w-3.5 h-3.5 text-blue-500" />
                                {evt.startTime} {evt.endTime ? `~ ${evt.endTime}` : ''}
                              </span>
                            )}
                            {evt.location && (
                              <span className="flex items-center gap-1 font-sans">
                                <MapPin className="w-3.5 h-3.5 text-rose-500" />
                                {evt.location}
                              </span>
                            )}
                          </div>

                          {evt.description && (
                            <p className="text-xs text-stone-600 dark:text-stone-400 line-clamp-2 pt-1 font-sans">
                              {evt.description}
                            </p>
                          )}
                        </div>

                        {evt.tableRowId && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              const rIdx = rows.findIndex((r) => r.id === evt.tableRowId);
                              if (rIdx !== -1) {
                                onOpenRowDetail(rows[rIdx], rIdx);
                              }
                            }}
                            className="px-2.5 py-1 rounded-lg border border-stone-200 dark:border-[#383838] hover:bg-stone-100 dark:hover:bg-[#282828] text-[11px] font-semibold text-stone-600 dark:text-stone-300 shrink-0 flex items-center gap-1"
                          >
                            <TableIcon className="w-3 h-3 text-amber-500" />
                            <span>행 상세 보기</span>
                          </button>
                        )}
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 4. More Events Popover Modal (Month View "+N개 더보기") */}
      {moreEventsDate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/50 backdrop-blur-xs"
          onClick={() => setMoreEventsDate(null)}
        >
          <div
            className="w-full max-w-sm bg-white dark:bg-[#1e1e1e] border border-stone-200 dark:border-[#333333] rounded-2xl shadow-2xl p-4 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-stone-100 dark:border-[#2a2a2a]">
              <h4 className="font-bold text-sm text-stone-800 dark:text-stone-200">
                {moreEventsDate} 일정 목록
              </h4>
              <button
                type="button"
                onClick={() => setMoreEventsDate(null)}
                className="p-1 rounded text-stone-400 hover:text-stone-700"
              >
                닫기
              </button>
            </div>
            <div className="max-h-60 overflow-y-auto space-y-1.5 custom-scrollbar">
              {filteredEvents
                .filter((e) => e.startDate <= moreEventsDate && moreEventsDate <= (e.endDate || e.startDate))
                .map((evt) => {
                  const style = CATEGORY_STYLES[evt.category] || CATEGORY_STYLES.etc;
                  return (
                    <div
                      key={evt.id}
                      onClick={() => {
                        setMoreEventsDate(null);
                        handleOpenEditEvent(evt);
                      }}
                      className={`p-2 rounded-xl border text-xs cursor-pointer font-medium ${style.chipBg} ${style.text}`}
                    >
                      <div className="font-bold truncate">{evt.title}</div>
                      <div className="text-[10px] opacity-75 font-mono">{evt.startTime || '종일'}</div>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      )}

      {/* 5. Calendar Event Modal (Create / Edit) */}
      <CalendarEventModal
        isOpen={isEventModalOpen}
        onClose={() => setIsEventModalOpen(false)}
        event={selectedEvent}
        onSave={handleSaveEvent}
        onDelete={handleDeleteEvent}
        initialDate={initialModalDate}
        initialHour={initialModalHour}
      />

      {/* 6. Calendar Macro Modal */}
      <CalendarMacroModal
        isOpen={isMacroModalOpen}
        onClose={() => setIsMacroModalOpen(false)}
        events={allEvents}
        onAddEvents={handleAddMacroEvents}
        onUpdateEvents={handleUpdateMacroEvents}
        onDeleteEvents={handleDeleteMacroEvents}
        activeTableName={table.title}
      />

      {/* 7. Calendar Notification Center */}
      <CalendarNotificationCenter
        isOpen={isNotificationCenterOpen}
        onClose={() => setIsNotificationCenterOpen(false)}
        events={allEvents}
        soundEnabled={soundEnabled}
        onToggleSound={(enabled) => {
          setSoundEnabled(enabled);
          try {
            localStorage.setItem('wonbee_calendar_sound_enabled', enabled ? 'true' : 'false');
          } catch (e) {
            console.error(e);
          }
        }}
        onOpenEvent={handleOpenEditEvent}
        onSnoozeEvent={(evt, mins) => {
          const snoozeUntil = Date.now() + mins * 60 * 1000;
          const updatedEvt: CalendarEvent = {
            ...evt,
            reminder: {
              ...evt.reminder!,
              snoozeUntil,
            },
          };
          handleSaveEvent(updatedEvt);
        }}
      />
    </div>
  );
};
