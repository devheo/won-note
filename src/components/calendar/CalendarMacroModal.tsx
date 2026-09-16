import React, { useState, useMemo } from 'react';
import {
  X,
  Zap,
  Repeat,
  RotateCcw,
  MoveRight,
  ClipboardPaste,
  FileDown,
  FileUp,
  Trash2,
  Check,
  Calendar,
  Clock,
  Sparkles,
  AlertCircle,
  Tag,
  HelpCircle,
} from 'lucide-react';
import { CalendarEvent, CalendarCategory, CalendarMacroType } from '../../types';
import { generateIcsContent, parseIcsContent, downloadIcsFile } from '../../utils/icsHelper';
import { formatLocalDate } from '../../utils/dateColumnUtils';

interface CalendarMacroModalProps {
  isOpen: boolean;
  onClose: () => void;
  events: CalendarEvent[];
  onAddEvents: (newEvents: CalendarEvent[]) => void;
  onUpdateEvents: (updatedEvents: CalendarEvent[]) => void;
  onDeleteEvents: (eventIds: string[]) => void;
  activeTableName?: string;
}

const SHIFT_PRESETS = [
  { id: '4shift', name: '4교대 (주간 - 야간 - 비번 - 휴무)', cycle: ['주간 근무', '야간 근무', '비번', '휴무'] },
  { id: '3shift', name: '3교대 (데이 - 이브닝 - 나이트)', cycle: ['데이 (Day)', '이브닝 (Evening)', '나이트 (Night)'] },
  { id: '2duty', name: '2교대 당직 (당직 - 비번)', cycle: ['당직 근무', '비번 휴무'] },
  { id: 'weekday', name: '평일 오전/오후 격주 순환', cycle: ['오전 근무 (09:00~14:00)', '오후 근무 (14:00~19:00)'] },
];

export const CalendarMacroModal: React.FC<CalendarMacroModalProps> = ({
  isOpen,
  onClose,
  events,
  onAddEvents,
  onUpdateEvents,
  onDeleteEvents,
  activeTableName,
}) => {
  const [activeTab, setActiveTab] = useState<CalendarMacroType>('recurring');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // --- MACRO 1: Recurring Events Batch Generator ---
  const [recTitle, setRecTitle] = useState('정기 주간 회의');
  const [recCategory, setRecCategory] = useState<CalendarCategory>('meeting');
  const [recPattern, setRecPattern] = useState<'daily' | 'weekly' | 'biweekly' | 'monthly'>('weekly');
  const [recDaysOfWeek, setRecDaysOfWeek] = useState<number[]>([1]); // 1 = Mon
  const [recExcludeWeekends, setRecExcludeWeekends] = useState(true);
  const [recMonthlyDay, setRecMonthlyDay] = useState(25);
  const [recStartDate, setRecStartDate] = useState(() => formatLocalDate(new Date()));
  const [recMonths, setRecMonths] = useState(3);
  const [recIsAllDay, setRecIsAllDay] = useState(false);
  const [recStartTime, setRecStartTime] = useState('10:00');
  const [recEndTime, setRecEndTime] = useState('11:00');

  // Calculate preview for recurring
  const recurringPreview = useMemo(() => {
    const list: CalendarEvent[] = [];
    if (!recTitle.trim() || !recStartDate) return list;

    const start = new Date(recStartDate);
    const end = new Date(start);
    end.setMonth(end.getMonth() + recMonths);

    const cur = new Date(start);
    let count = 0;
    const maxCount = 500; // Safeguard

    while (cur <= end && count < maxCount) {
      const dayOfWeek = cur.getDay(); // 0 = Sun, 6 = Sat
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      let shouldAdd = false;

      if (recPattern === 'daily') {
        if (!recExcludeWeekends || !isWeekend) shouldAdd = true;
      } else if (recPattern === 'weekly') {
        if (recDaysOfWeek.includes(dayOfWeek)) shouldAdd = true;
      } else if (recPattern === 'biweekly') {
        const diffWeeks = Math.floor((cur.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000));
        if (diffWeeks % 2 === 0 && recDaysOfWeek.includes(dayOfWeek)) shouldAdd = true;
      } else if (recPattern === 'monthly') {
        if (cur.getDate() === recMonthlyDay) {
          shouldAdd = true;
        }
      }

      if (shouldAdd) {
        const y = cur.getFullYear();
        const m = String(cur.getMonth() + 1).padStart(2, '0');
        const d = String(cur.getDate()).padStart(2, '0');
        const dateStr = `${y}-${m}-${d}`;

        list.push({
          id: 'rec_' + Date.now() + '_' + count,
          title: recTitle.trim(),
          startDate: dateStr,
          endDate: dateStr,
          isAllDay: recIsAllDay,
          startTime: recIsAllDay ? undefined : recStartTime,
          endTime: recIsAllDay ? undefined : recEndTime,
          category: recCategory,
          priority: 'normal',
          completed: false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        count++;
      }

      cur.setDate(cur.getDate() + 1);
    }
    return list;
  }, [recTitle, recCategory, recPattern, recDaysOfWeek, recExcludeWeekends, recMonthlyDay, recStartDate, recMonths, recIsAllDay, recStartTime, recEndTime]);

  const handleExecuteRecurring = () => {
    if (recurringPreview.length === 0) {
      alert('생성할 일정이 없습니다. 설정을 확인해주세요.');
      return;
    }
    onAddEvents(recurringPreview);
    showToast(`✓ 반복 일정 ${recurringPreview.length}개가 캘린더에 일괄 생성되었습니다.`);
  };

  // --- MACRO 2: Shift / Rotation Schedule Generator ---
  const [shiftPreset, setShiftPreset] = useState('4shift');
  const [customCycleText, setCustomCycleText] = useState('주간 근무, 야간 근무, 비번, 휴무');
  const [shiftWorkerName, setShiftWorkerName] = useState('근무조');
  const [shiftStartDate, setShiftStartDate] = useState(() => formatLocalDate(new Date()));
  const [shiftDurationDays, setShiftDurationDays] = useState(60); // 60 days default

  const shiftPreview = useMemo(() => {
    const list: CalendarEvent[] = [];
    let cycle: string[] = [];
    if (shiftPreset === 'custom') {
      cycle = customCycleText.split(',').map((s) => s.trim()).filter(Boolean);
    } else {
      const p = SHIFT_PRESETS.find((sp) => sp.id === shiftPreset);
      cycle = p ? p.cycle : ['근무'];
    }

    if (cycle.length === 0 || !shiftStartDate) return list;

    const start = new Date(shiftStartDate);
    for (let i = 0; i < shiftDurationDays; i++) {
      const cur = new Date(start);
      cur.setDate(cur.getDate() + i);

      const shiftName = cycle[i % cycle.length];
      const y = cur.getFullYear();
      const m = String(cur.getMonth() + 1).padStart(2, '0');
      const d = String(cur.getDate()).padStart(2, '0');
      const dateStr = `${y}-${m}-${d}`;

      // Pick category based on shift type
      let cat: CalendarCategory = 'work';
      if (shiftName.includes('휴무') || shiftName.includes('비번')) cat = 'personal';
      else if (shiftName.includes('야간') || shiftName.includes('당직')) cat = 'urgent';

      const title = shiftWorkerName.trim() ? `[${shiftWorkerName.trim()}] ${shiftName}` : shiftName;

      list.push({
        id: 'shift_' + Date.now() + '_' + i,
        title,
        startDate: dateStr,
        endDate: dateStr,
        isAllDay: true,
        category: cat,
        priority: 'normal',
        completed: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
    return list;
  }, [shiftPreset, customCycleText, shiftWorkerName, shiftStartDate, shiftDurationDays]);

  const handleExecuteShift = () => {
    if (shiftPreview.length === 0) return;
    onAddEvents(shiftPreview);
    showToast(`✓ ${shiftDurationDays}일치 교대 근무표 ${shiftPreview.length}개가 캘린더에 등록되었습니다.`);
  };

  // --- MACRO 3: Batch Date Shift (+/- N Days) ---
  const [shiftDaysCount, setShiftDaysCount] = useState(7);
  const [shiftDirection, setShiftDirection] = useState<'forward' | 'backward'>('forward');
  const [shiftFilterCategory, setShiftFilterCategory] = useState<string>('all');

  const shiftTargetEvents = useMemo(() => {
    return events.filter((e) => {
      if (shiftFilterCategory === 'all') return true;
      return e.category === shiftFilterCategory;
    });
  }, [events, shiftFilterCategory]);

  const handleExecuteDateShift = () => {
    if (shiftTargetEvents.length === 0) {
      alert('이동할 대상 일정이 없습니다.');
      return;
    }

    const delta = shiftDirection === 'forward' ? shiftDaysCount : -shiftDaysCount;
    const pad = (n: number) => String(n).padStart(2, '0');

    const updated = shiftTargetEvents.map((evt) => {
      const s = new Date(evt.startDate);
      s.setDate(s.getDate() + delta);
      const newStart = `${s.getFullYear()}-${pad(s.getMonth() + 1)}-${pad(s.getDate())}`;

      let newEnd = newStart;
      if (evt.endDate) {
        const e = new Date(evt.endDate);
        e.setDate(e.getDate() + delta);
        newEnd = `${e.getFullYear()}-${pad(e.getMonth() + 1)}-${pad(e.getDate())}`;
      }

      return {
        ...evt,
        startDate: newStart,
        endDate: newEnd,
        updatedAt: Date.now(),
      };
    });

    onUpdateEvents(updated);
    showToast(`✓ ${updated.length}개 일정의 날짜가 ${delta > 0 ? `+${delta}` : delta}일 일괄 이동되었습니다.`);
  };

  // --- MACRO 4: Text / Excel Bulk Paste Import ---
  const [pastedText, setPastedText] = useState('');
  
  const parsedPasteEvents = useMemo(() => {
    if (!pastedText.trim()) return [];
    const lines = pastedText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const result: CalendarEvent[] = [];

    lines.forEach((line, idx) => {
      // Split by tab, pipe, or comma (tab is default for Excel copying)
      let parts = line.split('\t');
      if (parts.length < 2) parts = line.split('|');
      if (parts.length < 2) parts = line.split(',');

      parts = parts.map((p) => p.trim());
      if (parts.length === 0) return;

      // Extract date (check if first or second item looks like YYYY-MM-DD or MM-DD)
      let date = '';
      let time = '';
      let title = '';
      let location = '';

      const dateRegex = /\b(\d{4}[-/.]\d{1,2}[-/.]\d{1,2})\b/;
      const timeRegex = /\b(\d{1,2}:\d{2})\b/;

      for (const part of parts) {
        if (!date && dateRegex.test(part)) {
          const match = part.match(dateRegex);
          if (match) {
            date = match[1].replace(/[/.]/g, '-');
            // Normalize zero pads
            const [y, m, d] = date.split('-');
            date = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
          }
        } else if (!time && timeRegex.test(part)) {
          const match = part.match(timeRegex);
          if (match) time = match[1];
        } else if (!title) {
          title = part;
        } else if (!location) {
          location = part;
        }
      }

      // If no explicit date was matched, use today
      if (!date) {
        date = formatLocalDate(new Date());
      }
      if (!title) {
        title = parts[0] || `일정 ${idx + 1}`;
      }

      result.push({
        id: 'paste_' + Date.now() + '_' + idx,
        title,
        startDate: date,
        endDate: date,
        isAllDay: !time,
        startTime: time || undefined,
        location: location || undefined,
        category: 'work',
        priority: 'normal',
        completed: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    return result;
  }, [pastedText]);

  const handleExecutePasteImport = () => {
    if (parsedPasteEvents.length === 0) {
      alert('파싱된 일정이 없습니다. 날짜와 제목이 포함된 텍스트를 붙여넣어주세요.');
      return;
    }
    onAddEvents(parsedPasteEvents);
    setPastedText('');
    showToast(`✓ ${parsedPasteEvents.length}개 일정이 일괄 등록되었습니다.`);
  };

  // --- MACRO 5: ICS Export / Import ---
  const handleExportIcs = () => {
    if (events.length === 0) {
      alert('내보낼 일정이 없습니다.');
      return;
    }
    const title = activeTableName ? `${activeTableName} 캘린더` : 'WonBee Calendar';
    const icsString = generateIcsContent(events, title);
    downloadIcsFile(`${title.replace(/\s+/g, '_')}_${formatLocalDate(new Date())}`, icsString);
    showToast(`✓ ${events.length}개 일정이 담긴 표준 iCalendar(.ics) 파일이 다운로드되었습니다.`);
  };

  const handleImportIcsFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const imported = parseIcsContent(text);
        if (imported.length === 0) {
          alert('유효한 iCalendar (.ics) 일정 데이터를 찾을 수 없습니다.');
          return;
        }
        onAddEvents(imported);
        showToast(`✓ .ics 파일에서 ${imported.length}개의 일정을 성공적으로 불러왔습니다.`);
      } catch (err) {
        alert('ICS 파일을 파싱하는 중 오류가 발생했습니다.');
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset
  };

  // --- MACRO 6: Cleanup ---
  const [cleanDays, setCleanDays] = useState(60);
  const [cleanCompletedOnly, setCleanCompletedOnly] = useState(false);

  const cleanupTargetEvents = useMemo(() => {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - cleanDays);
    const cutoffStr = formatLocalDate(cutoffDate);

    return events.filter((e) => {
      if (e.startDate >= cutoffStr) return false;
      if (cleanCompletedOnly && !e.completed) return false;
      return true;
    });
  }, [events, cleanDays, cleanCompletedOnly]);

  const handleExecuteCleanup = () => {
    if (cleanupTargetEvents.length === 0) {
      alert('정리 조건에 해당하는 지난 일정이 없습니다.');
      return;
    }
    if (confirm(`기준일 이전의 지난 일정 ${cleanupTargetEvents.length}개를 캘린더에서 영구 삭제하시겠습니까?`)) {
      onDeleteEvents(cleanupTargetEvents.map((e) => e.id));
      showToast(`✓ 지난 일정 ${cleanupTargetEvents.length}개가 안전하게 정리되었습니다.`);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      id="calendar-macro-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        id="calendar-macro-modal"
        className="w-full max-w-2xl bg-white dark:bg-[#1e1e1e] border border-stone-200 dark:border-[#333333] rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Toast */}
        {toastMessage && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-stone-900/90 dark:bg-stone-100 text-white dark:text-stone-900 px-4 py-2 rounded-xl text-xs font-bold shadow-xl flex items-center gap-2 backdrop-blur-sm animate-in fade-in zoom-in-95 duration-150">
            <Check className="w-4 h-4 text-emerald-400 dark:text-emerald-600" />
            <span>{toastMessage}</span>
          </div>
        )}

        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-stone-100 dark:border-[#2a2a2a] flex items-center justify-between bg-stone-50/70 dark:bg-[#252525]/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2">
                캘린더 매크로 도구함
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20 font-medium">
                  100% 오프라인 자동화
                </span>
              </h3>
              <p className="text-xs text-stone-500 dark:text-stone-400">
                반복 업무 대량 생성, 교대 근무표 자동 배정, 일정 일괄 이동 및 .ics 파일 연동
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-[#2e2e2e] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1 px-6 py-2 bg-stone-100/70 dark:bg-[#232323] border-b border-stone-200/80 dark:border-[#333333] overflow-x-auto custom-scrollbar">
          <button
            type="button"
            onClick={() => setActiveTab('recurring')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap ${
              activeTab === 'recurring'
                ? 'bg-white dark:bg-[#333333] text-stone-900 dark:text-white shadow-2xs font-bold text-amber-600 dark:text-amber-400'
                : 'text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200'
            }`}
          >
            <Repeat className="w-3.5 h-3.5" />
            <span>반복 일정 대량 생성</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('shift')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap ${
              activeTab === 'shift'
                ? 'bg-white dark:bg-[#333333] text-stone-900 dark:text-white shadow-2xs font-bold text-amber-600 dark:text-amber-400'
                : 'text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200'
            }`}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>교대/순환 근무표</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('date_shift')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap ${
              activeTab === 'date_shift'
                ? 'bg-white dark:bg-[#333333] text-stone-900 dark:text-white shadow-2xs font-bold text-amber-600 dark:text-amber-400'
                : 'text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200'
            }`}
          >
            <MoveRight className="w-3.5 h-3.5" />
            <span>일정 일괄 이동</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('bulk_text')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap ${
              activeTab === 'bulk_text'
                ? 'bg-white dark:bg-[#333333] text-stone-900 dark:text-white shadow-2xs font-bold text-amber-600 dark:text-amber-400'
                : 'text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200'
            }`}
          >
            <ClipboardPaste className="w-3.5 h-3.5" />
            <span>엑셀/텍스트 붙여넣기</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('ics_sync')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap ${
              activeTab === 'ics_sync'
                ? 'bg-white dark:bg-[#333333] text-stone-900 dark:text-white shadow-2xs font-bold text-amber-600 dark:text-amber-400'
                : 'text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200'
            }`}
          >
            <FileDown className="w-3.5 h-3.5" />
            <span>.ics 파일 백업/연동</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('cleanup')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap ${
              activeTab === 'cleanup'
                ? 'bg-white dark:bg-[#333333] text-stone-900 dark:text-white shadow-2xs font-bold text-amber-600 dark:text-amber-400'
                : 'text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200'
            }`}
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>지난 일정 정리</span>
          </button>
        </div>

        {/* Tab Content Body */}
        <div className="p-6 text-xs overflow-y-auto max-h-[68vh] space-y-4">
          {/* TAB 1: RECURRING BATCH GENERATOR */}
          {activeTab === 'recurring' && (
            <div className="space-y-4">
              <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-start gap-2.5">
                <Sparkles className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <p className="text-amber-900 dark:text-amber-200 leading-relaxed">
                  매일, 매주 특정 요일, 또는 매월 지정일에 정기적으로 열리는 회의·업무 일정을 원하는 기간만큼 캘린더에 수십~수백 개를 한 번에 자동 등록합니다.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-stone-700 dark:text-stone-300 mb-1">일정 제목</label>
                  <input
                    type="text"
                    value={recTitle}
                    onChange={(e) => setRecTitle(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-stone-300 dark:border-[#383838] bg-white dark:bg-[#282828] text-stone-800 dark:text-stone-200 font-medium"
                    placeholder="예: 주간 스프린트 회의, 데이터 정산"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-stone-700 dark:text-stone-300 mb-1">카테고리</label>
                  <select
                    value={recCategory}
                    onChange={(e) => setRecCategory(e.target.value as CalendarCategory)}
                    className="w-full px-3 py-2 rounded-lg border border-stone-300 dark:border-[#383838] bg-white dark:bg-[#282828] text-stone-800 dark:text-stone-200"
                  >
                    <option value="meeting">회의/미팅</option>
                    <option value="work">업무</option>
                    <option value="personal">개인/일상</option>
                    <option value="deadline">마감/중요</option>
                    <option value="urgent">긴급</option>
                  </select>
                </div>
              </div>

              {/* Repeat Pattern */}
              <div className="p-3.5 rounded-xl border border-stone-200 dark:border-[#333333] bg-stone-50/60 dark:bg-[#252525]/60 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-stone-800 dark:text-stone-200">반복 주기 (규칙)</span>
                  <div className="flex items-center gap-1 bg-stone-200 dark:bg-[#303030] p-0.5 rounded-lg">
                    <button
                      type="button"
                      onClick={() => setRecPattern('daily')}
                      className={`px-2.5 py-1 rounded-md ${recPattern === 'daily' ? 'bg-white dark:bg-[#404040] font-bold shadow-2xs' : 'text-stone-500'}`}
                    >
                      매일
                    </button>
                    <button
                      type="button"
                      onClick={() => setRecPattern('weekly')}
                      className={`px-2.5 py-1 rounded-md ${recPattern === 'weekly' ? 'bg-white dark:bg-[#404040] font-bold shadow-2xs' : 'text-stone-500'}`}
                    >
                      매주
                    </button>
                    <button
                      type="button"
                      onClick={() => setRecPattern('biweekly')}
                      className={`px-2.5 py-1 rounded-md ${recPattern === 'biweekly' ? 'bg-white dark:bg-[#404040] font-bold shadow-2xs' : 'text-stone-500'}`}
                    >
                      격주
                    </button>
                    <button
                      type="button"
                      onClick={() => setRecPattern('monthly')}
                      className={`px-2.5 py-1 rounded-md ${recPattern === 'monthly' ? 'bg-white dark:bg-[#404040] font-bold shadow-2xs' : 'text-stone-500'}`}
                    >
                      매월
                    </button>
                  </div>
                </div>

                {/* Weekly / Biweekly Day of Week Selectors */}
                {(recPattern === 'weekly' || recPattern === 'biweekly') && (
                  <div>
                    <span className="text-[11px] text-stone-500 dark:text-stone-400 block mb-1">반복 요일 선택 (다중 선택 가능):</span>
                    <div className="flex items-center gap-1.5">
                      {[
                        { day: 1, label: '월' },
                        { day: 2, label: '화' },
                        { day: 3, label: '수' },
                        { day: 4, label: '목' },
                        { day: 5, label: '금' },
                        { day: 6, label: '토' },
                        { day: 0, label: '일' },
                      ].map((item) => {
                        const isSelected = recDaysOfWeek.includes(item.day);
                        return (
                          <button
                            key={item.day}
                            type="button"
                            onClick={() => {
                              if (isSelected) {
                                if (recDaysOfWeek.length > 1) {
                                  setRecDaysOfWeek(recDaysOfWeek.filter((d) => d !== item.day));
                                }
                              } else {
                                setRecDaysOfWeek([...recDaysOfWeek, item.day]);
                              }
                            }}
                            className={`w-8 h-8 rounded-lg font-bold text-xs transition-colors ${
                              isSelected
                                ? 'bg-amber-500 text-stone-950 shadow-2xs'
                                : 'bg-white dark:bg-[#303030] border border-stone-200 dark:border-[#383838] text-stone-600 dark:text-stone-300 hover:border-amber-400'
                            }`}
                          >
                            {item.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Daily Exclude Weekend */}
                {recPattern === 'daily' && (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={recExcludeWeekends}
                      onChange={(e) => setRecExcludeWeekends(e.target.checked)}
                      className="rounded text-amber-500"
                    />
                    <span className="text-stone-700 dark:text-stone-300 font-medium">주말(토/일) 제외하고 평일만 생성</span>
                  </label>
                )}

                {/* Monthly Day */}
                {recPattern === 'monthly' && (
                  <div className="flex items-center gap-2">
                    <span>매월</span>
                    <input
                      type="number"
                      min={1}
                      max={31}
                      value={recMonthlyDay}
                      onChange={(e) => setRecMonthlyDay(parseInt(e.target.value, 10) || 1)}
                      className="w-16 px-2 py-1 rounded border border-stone-300 dark:border-[#383838] bg-white dark:bg-[#282828] text-center font-bold"
                    />
                    <span>일에 반복 생성</span>
                  </div>
                )}
              </div>

              {/* Range & Time */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-stone-700 dark:text-stone-300 mb-1">시작일</label>
                  <input
                    type="date"
                    value={recStartDate}
                    onChange={(e) => setRecStartDate(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg border border-stone-300 dark:border-[#383838] bg-white dark:bg-[#282828]"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-stone-700 dark:text-stone-300 mb-1">생성 기간</label>
                  <select
                    value={recMonths}
                    onChange={(e) => setRecMonths(parseInt(e.target.value, 10))}
                    className="w-full px-3 py-1.5 rounded-lg border border-stone-300 dark:border-[#383838] bg-white dark:bg-[#282828]"
                  >
                    <option value={1}>1개월치</option>
                    <option value={3}>3개월치 (분기)</option>
                    <option value={6}>6개월치 (반기)</option>
                    <option value={12}>1년치</option>
                  </select>
                </div>
              </div>

              {/* Time */}
              <div className="flex items-center gap-4 pt-1">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={recIsAllDay}
                    onChange={(e) => setRecIsAllDay(e.target.checked)}
                    className="rounded text-amber-500"
                  />
                  <span className="font-semibold text-stone-700 dark:text-stone-300">종일 일정</span>
                </label>
                {!recIsAllDay && (
                  <div className="flex items-center gap-2">
                    <input
                      type="time"
                      value={recStartTime}
                      onChange={(e) => setRecStartTime(e.target.value)}
                      className="px-2 py-1 rounded border border-stone-300 dark:border-[#383838] bg-white dark:bg-[#282828] font-mono"
                    />
                    <span>~</span>
                    <input
                      type="time"
                      value={recEndTime}
                      onChange={(e) => setRecEndTime(e.target.value)}
                      className="px-2 py-1 rounded border border-stone-300 dark:border-[#383838] bg-white dark:bg-[#282828] font-mono"
                    />
                  </div>
                )}
              </div>

              {/* Action Banner */}
              <div className="pt-3 border-t border-stone-200 dark:border-[#2a2a2a] flex items-center justify-between">
                <span className="font-medium text-stone-500">
                  생성 예정 일정:{' '}
                  <strong className="text-amber-600 dark:text-amber-400 text-sm">{recurringPreview.length}</strong>개
                </span>
                <button
                  type="button"
                  onClick={handleExecuteRecurring}
                  disabled={recurringPreview.length === 0}
                  className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-stone-950 font-bold flex items-center gap-2 shadow-sm transition-all"
                >
                  <Zap className="w-4 h-4" />
                  <span>반복 일정 일괄 생성 매크로 실행</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: SHIFT ROTATION SCHEDULE */}
          {activeTab === 'shift' && (
            <div className="space-y-4">
              <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl flex items-start gap-2.5">
                <RotateCcw className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                <p className="text-blue-900 dark:text-blue-200 leading-relaxed">
                  병원, 관제 센터, 당직실, 생산 라인 등에서 순환하는 2/3/4교대 근무 패턴을 캘린더에 수개월치 한 번에 자동 배치합니다.
                </p>
              </div>

              <div>
                <label className="block font-semibold text-stone-700 dark:text-stone-300 mb-1">순환 프리셋 선택</label>
                <div className="grid grid-cols-2 gap-2">
                  {SHIFT_PRESETS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setShiftPreset(p.id)}
                      className={`p-2.5 rounded-xl border text-left transition-all ${
                        shiftPreset === p.id
                          ? 'border-blue-500 bg-blue-500/10 dark:bg-blue-500/20 text-blue-900 dark:text-blue-200 font-bold'
                          : 'border-stone-200 dark:border-[#383838] bg-white dark:bg-[#252525] text-stone-700 dark:text-stone-300 hover:border-blue-400'
                      }`}
                    >
                      <div className="text-xs font-semibold">{p.name}</div>
                      <div className="text-[10px] text-stone-400 dark:text-stone-500 mt-0.5 truncate">
                        {p.cycle.join(' → ')}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-stone-700 dark:text-stone-300 mb-1">담당자 / 팀 명칭</label>
                  <input
                    type="text"
                    value={shiftWorkerName}
                    onChange={(e) => setShiftWorkerName(e.target.value)}
                    placeholder="예: 1조, 김철수, 당직"
                    className="w-full px-3 py-1.5 rounded-lg border border-stone-300 dark:border-[#383838] bg-white dark:bg-[#282828]"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-stone-700 dark:text-stone-300 mb-1">시작일</label>
                  <input
                    type="date"
                    value={shiftStartDate}
                    onChange={(e) => setShiftStartDate(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg border border-stone-300 dark:border-[#383838] bg-white dark:bg-[#282828]"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-stone-700 dark:text-stone-300 mb-1">생성 일수</label>
                  <select
                    value={shiftDurationDays}
                    onChange={(e) => setShiftDurationDays(parseInt(e.target.value, 10))}
                    className="w-full px-3 py-1.5 rounded-lg border border-stone-300 dark:border-[#383838] bg-white dark:bg-[#282828]"
                  >
                    <option value={30}>30일치</option>
                    <option value={60}>60일치 (2개월)</option>
                    <option value={90}>90일치 (분기)</option>
                    <option value={180}>180일치 (반기)</option>
                  </select>
                </div>
              </div>

              {/* Action */}
              <div className="pt-3 border-t border-stone-200 dark:border-[#2a2a2a] flex items-center justify-between">
                <span className="text-stone-500 font-medium">
                  생성될 근무 일정:{' '}
                  <strong className="text-blue-600 dark:text-blue-400 text-sm">{shiftPreview.length}</strong>개
                </span>
                <button
                  type="button"
                  onClick={handleExecuteShift}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold flex items-center gap-2 shadow-sm transition-all"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>교대 근무표 일괄 배정 실행</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: DATE SHIFT MACRO */}
          {activeTab === 'date_shift' && (
            <div className="space-y-4">
              <div className="p-3 bg-purple-500/10 border border-purple-500/20 rounded-xl flex items-start gap-2.5">
                <MoveRight className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0 mt-0.5" />
                <p className="text-purple-900 dark:text-purple-200 leading-relaxed">
                  프로젝트 일정이나 행사 일정이 연기되거나 앞당겨졌을 때, 등록된 모든 일정(또는 특정 카테고리)의 날짜를 클릭 한 번에 +N일 / -N일 일괄 이동시킵니다.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-stone-700 dark:text-stone-300 mb-1">대상 일정 범위</label>
                  <select
                    value={shiftFilterCategory}
                    onChange={(e) => setShiftFilterCategory(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-stone-300 dark:border-[#383838] bg-white dark:bg-[#282828]"
                  >
                    <option value="all">전체 일정 ({events.length}개)</option>
                    <option value="work">업무 일정만</option>
                    <option value="meeting">회의 일정만</option>
                    <option value="deadline">마감 일정만</option>
                    <option value="personal">개인 일정만</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-stone-700 dark:text-stone-300 mb-1">이동 방향</label>
                  <select
                    value={shiftDirection}
                    onChange={(e) => setShiftDirection(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-lg border border-stone-300 dark:border-[#383838] bg-white dark:bg-[#282828]"
                  >
                    <option value="forward">뒤로 연기 (+N일)</option>
                    <option value="backward">앞으로 당기기 (-N일)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-stone-700 dark:text-stone-300 mb-1">이동 일수</label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min={1}
                      max={365}
                      value={shiftDaysCount}
                      onChange={(e) => setShiftDaysCount(parseInt(e.target.value, 10) || 1)}
                      className="w-full px-3 py-2 rounded-lg border border-stone-300 dark:border-[#383838] bg-white dark:bg-[#282828] text-center font-bold"
                    />
                    <span className="shrink-0 text-stone-500">일</span>
                  </div>
                </div>
              </div>

              {/* Preview Notice */}
              <div className="p-3 rounded-xl border border-stone-200 dark:border-[#333333] bg-stone-50 dark:bg-[#252525] text-stone-600 dark:text-stone-300 text-xs">
                💡 대상 일정 <strong>{shiftTargetEvents.length}</strong>개의 날짜가{' '}
                <strong className="text-purple-600 dark:text-purple-400 font-mono">
                  {shiftDirection === 'forward' ? `+${shiftDaysCount}일` : `-${shiftDaysCount}일`}
                </strong>{' '}
                일괄 조정됩니다.
              </div>

              <div className="pt-3 border-t border-stone-200 dark:border-[#2a2a2a] flex items-center justify-end">
                <button
                  type="button"
                  onClick={handleExecuteDateShift}
                  disabled={shiftTargetEvents.length === 0}
                  className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold flex items-center gap-2 shadow-sm transition-all"
                >
                  <MoveRight className="w-4 h-4" />
                  <span>날짜 일괄 이동 매크로 실행</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 4: TEXT / EXCEL PASTE IMPORT */}
          {activeTab === 'bulk_text' && (
            <div className="space-y-4">
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-start gap-2.5">
                <ClipboardPaste className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <p className="text-emerald-900 dark:text-emerald-200 leading-relaxed">
                  엑셀(Excel), 구글 스프레드시트, 또는 메모장에 작성된 표를 복사해서 아래에 붙여넣으면 날짜·시간·제목을 자동 파싱하여 캘린더에 일괄 등록합니다.
                </p>
              </div>

              <div>
                <label className="block font-semibold text-stone-700 dark:text-stone-300 mb-1">
                  데이터 붙여넣기 (Ctrl+V)
                </label>
                <textarea
                  rows={5}
                  value={pastedText}
                  onChange={(e) => setPastedText(e.target.value)}
                  placeholder={`예시 (탭, 쉼표, 파이프 구분 지원):\n2026-09-20\t14:00\t주간 기획 회의\t본사 4층\n2026-09-22\t10:30\t고객사 미팅\n2026-09-25\t신규 기능 배포\t온라인`}
                  className="w-full p-3 rounded-xl border border-stone-300 dark:border-[#383838] bg-white dark:bg-[#282828] text-stone-800 dark:text-stone-200 font-mono text-xs resize-none custom-scrollbar"
                />
              </div>

              {/* Parsed Preview Table */}
              {parsedPasteEvents.length > 0 && (
                <div className="space-y-2">
                  <span className="font-semibold text-stone-700 dark:text-stone-300">
                    인식된 일정 목록 ({parsedPasteEvents.length}개):
                  </span>
                  <div className="max-h-40 overflow-y-auto rounded-xl border border-stone-200 dark:border-[#333333] divide-y divide-stone-100 dark:divide-[#2e2e2e]">
                    {parsedPasteEvents.slice(0, 10).map((evt, idx) => (
                      <div key={idx} className="p-2 flex items-center justify-between text-xs bg-white dark:bg-[#242424]">
                        <span className="font-medium text-stone-800 dark:text-stone-200 truncate max-w-xs">{evt.title}</span>
                        <div className="flex items-center gap-2 text-stone-500 font-mono text-[11px]">
                          <span>{evt.startDate}</span>
                          {evt.startTime && <span className="text-amber-600">{evt.startTime}</span>}
                        </div>
                      </div>
                    ))}
                    {parsedPasteEvents.length > 10 && (
                      <div className="p-2 text-center text-stone-400 bg-stone-50 dark:bg-[#202020] text-[11px]">
                        외 {parsedPasteEvents.length - 10}개의 일정이 더 있습니다.
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="pt-3 border-t border-stone-200 dark:border-[#2a2a2a] flex items-center justify-end">
                <button
                  type="button"
                  onClick={handleExecutePasteImport}
                  disabled={parsedPasteEvents.length === 0}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold flex items-center gap-2 shadow-sm transition-all"
                >
                  <Check className="w-4 h-4" />
                  <span>{parsedPasteEvents.length}개 일정 일괄 등록하기</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 5: ICS EXPORT / IMPORT */}
          {activeTab === 'ics_sync' && (
            <div className="space-y-4">
              <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-start gap-2.5">
                <FileDown className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <p className="text-amber-900 dark:text-amber-200 leading-relaxed">
                  표준 iCalendar (.ics) 파일 형식으로 완벽하게 호환됩니다. 오프라인 파일 형태로 아웃룩(Outlook), 애플 캘린더, 구글 캘린더와 데이터를 자유롭게 주고받을 수 있습니다.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Export Card */}
                <div className="p-4 rounded-2xl border border-stone-200 dark:border-[#383838] bg-white dark:bg-[#252525] flex flex-col justify-between space-y-3">
                  <div>
                    <h4 className="font-bold text-stone-800 dark:text-stone-200 flex items-center gap-1.5 mb-1">
                      <FileDown className="w-4 h-4 text-amber-500" />
                      캘린더 .ics 파일로 내보내기
                    </h4>
                    <p className="text-[11px] text-stone-500 dark:text-stone-400">
                      현재 등록된 모든 일정({events.length}개)을 표준 .ics 캘린더 파일로 PC에 저장합니다.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleExportIcs}
                    className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold flex items-center justify-center gap-2 shadow-sm transition-all"
                  >
                    <FileDown className="w-4 h-4" />
                    <span>.ics 파일 다운로드</span>
                  </button>
                </div>

                {/* Import Card */}
                <div className="p-4 rounded-2xl border border-stone-200 dark:border-[#383838] bg-white dark:bg-[#252525] flex flex-col justify-between space-y-3">
                  <div>
                    <h4 className="font-bold text-stone-800 dark:text-stone-200 flex items-center gap-1.5 mb-1">
                      <FileUp className="w-4 h-4 text-blue-500" />
                      외부 .ics 캘린더 파일 가져오기
                    </h4>
                    <p className="text-[11px] text-stone-500 dark:text-stone-400">
                      외부에서 다운로드한 .ics 캘린더 파일을 불러와 원비 캘린더에 안전하게 추가합니다.
                    </p>
                  </div>
                  <label className="w-full py-2.5 rounded-xl border border-blue-500 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 font-bold flex items-center justify-center gap-2 cursor-pointer transition-all">
                    <FileUp className="w-4 h-4" />
                    <span>.ics 파일 선택...</span>
                    <input type="file" accept=".ics" onChange={handleImportIcsFile} className="hidden" />
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* TAB 6: CLEANUP */}
          {activeTab === 'cleanup' && (
            <div className="space-y-4">
              <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-start gap-2.5">
                <Trash2 className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                <p className="text-rose-900 dark:text-rose-200 leading-relaxed">
                  일정 데이터가 너무 많아졌을 때, N일 이전의 지난 과거 일정을 한 번에 정리하여 캘린더를 깔끔하고 가볍게 유지합니다.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-stone-700 dark:text-stone-300 mb-1">정리 기준 기간</label>
                  <select
                    value={cleanDays}
                    onChange={(e) => setCleanDays(parseInt(e.target.value, 10))}
                    className="w-full px-3 py-2 rounded-lg border border-stone-300 dark:border-[#383838] bg-white dark:bg-[#282828]"
                  >
                    <option value={30}>30일 이전의 모든 지난 일정</option>
                    <option value={60}>60일 (2달) 이전의 지난 일정</option>
                    <option value={90}>90일 (분기) 이전의 지난 일정</option>
                    <option value={180}>180일 (반기) 이전의 지난 일정</option>
                    <option value={365}>1년 이전의 지난 일정</option>
                  </select>
                </div>
                <div className="flex items-center pt-5">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={cleanCompletedOnly}
                      onChange={(e) => setCleanCompletedOnly(e.target.checked)}
                      className="rounded text-rose-500"
                    />
                    <span className="font-semibold text-stone-700 dark:text-stone-300">완료(체크)된 일정만 정리</span>
                  </label>
                </div>
              </div>

              <div className="p-3.5 rounded-xl border border-rose-200 dark:border-rose-900/40 bg-rose-50/50 dark:bg-rose-950/20 text-rose-800 dark:text-rose-300 flex items-center justify-between">
                <span>
                  정리 대상 일정: <strong>{cleanupTargetEvents.length}</strong>개
                </span>
                <button
                  type="button"
                  onClick={handleExecuteCleanup}
                  disabled={cleanupTargetEvents.length === 0}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-bold flex items-center gap-1.5 shadow-sm transition-all"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>지난 일정 일괄 정리 실행</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 border-t border-stone-100 dark:border-[#2a2a2a] bg-stone-50/60 dark:bg-[#222222] flex items-center justify-between text-xs text-stone-500">
          <span>💡 매크로 실행 시 작업 내용은 브라우저 로컬 저장소에 즉시 안전하게 보관됩니다.</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg border border-stone-300 dark:border-[#383838] hover:bg-stone-100 dark:hover:bg-[#2e2e2e] text-stone-700 dark:text-stone-200 font-semibold transition-colors"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
};
