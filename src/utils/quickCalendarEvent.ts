import type { CalendarCategory, CalendarEvent } from '../types';
import { formatLocalDate } from './dateColumnUtils';

/** Parses practical Korean quick-add phrases such as "내일 오후 2시 기획 회의". */
export function parseQuickCalendarEvent(input: string, baseDate = new Date()): CalendarEvent | null {
  let remaining = input.trim();
  if (!remaining) return null;

  let date = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate());
  const explicitDate = remaining.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (explicitDate) {
    const [, year, month, day] = explicitDate;
    date = new Date(Number(year), Number(month) - 1, Number(day));
    if (date.getFullYear() !== Number(year) || date.getMonth() !== Number(month) - 1 || date.getDate() !== Number(day)) return null;
    remaining = remaining.replace(explicitDate[0], ' ');
  } else {
    const relativeDate = remaining.match(/오늘|내일|모레/);
    if (relativeDate) {
      date.setDate(date.getDate() + (relativeDate[0] === '내일' ? 1 : relativeDate[0] === '모레' ? 2 : 0));
      remaining = remaining.replace(relativeDate[0], ' ');
    }
  }

  let startTime: string | undefined;
  const koreanTime = remaining.match(/(오전|오후)\s*(\d{1,2})(?:\s*시)?(?:\s*(\d{1,2})\s*분?)?/);
  const clockTime = koreanTime ? null : remaining.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (koreanTime) {
    let hour = Number(koreanTime[2]) % 12;
    if (koreanTime[1] === '오후') hour += 12;
    const minute = Number(koreanTime[3] || 0);
    if (minute > 59) return null;
    startTime = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    remaining = remaining.replace(koreanTime[0], ' ');
  } else if (clockTime) {
    startTime = `${String(Number(clockTime[1])).padStart(2, '0')}:${clockTime[2]}`;
    remaining = remaining.replace(clockTime[0], ' ');
  }

  const title = remaining.replace(/\s+/g, ' ').replace(/^[\s,·-]+|[\s,·-]+$/g, '').trim();
  if (!title) return null;
  const category: CalendarCategory = /회의|미팅|면담/.test(title) ? 'meeting' : /마감|제출|기한/.test(title) ? 'deadline' : /병원|개인|운동/.test(title) ? 'personal' : 'work';
  const startDate = formatLocalDate(date);
  const [hour, minute] = (startTime || '09:00').split(':').map(Number);
  const end = new Date(date);
  end.setHours(hour + 1, minute, 0, 0);
  const endTime = `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`;
  const now = Date.now();

  return {
    id: `evt_${now}_${Math.random().toString(36).slice(2, 7)}`,
    title,
    startDate,
    endDate: startDate,
    startTime,
    endTime: startTime ? endTime : undefined,
    isAllDay: !startTime,
    category,
    priority: 'normal',
    completed: false,
    createdAt: now,
    updatedAt: now,
  };
}
