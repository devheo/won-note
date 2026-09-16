/**
 * WonBee (원비) - 100% Offline iCalendar (.ics) Generator & Parser
 * Complies with RFC 5545 format without external dependencies.
 */

import { CalendarEvent, CalendarCategory } from '../types';

/**
 * Generates an iCalendar (.ics) string from an array of CalendarEvents
 */
export function generateIcsContent(events: CalendarEvent[], calendarTitle = 'WonBee Calendar'): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const now = new Date();
  const dtStamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//WonBee Workspace//KR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcsText(calendarTitle)}`,
    'X-WR-TIMEZONE:Asia/Seoul',
  ];

  events.forEach((evt) => {
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${evt.id}@wonbee.offline`);
    lines.push(`DTSTAMP:${dtStamp}`);

    if (evt.isAllDay) {
      const cleanStart = evt.startDate.replace(/-/g, '');
      // For all day events, DTEND is non-inclusive in ICS RFC 5545, so add 1 day
      const endD = new Date(evt.endDate || evt.startDate);
      endD.setDate(endD.getDate() + 1);
      const cleanEnd = `${endD.getFullYear()}${pad(endD.getMonth() + 1)}${pad(endD.getDate())}`;

      lines.push(`DTSTART;VALUE=DATE:${cleanStart}`);
      lines.push(`DTEND;VALUE=DATE:${cleanEnd}`);
    } else {
      const startT = (evt.startTime || '09:00').replace(':', '') + '00';
      const endT = (evt.endTime || '10:00').replace(':', '') + '00';
      const cleanStart = evt.startDate.replace(/-/g, '');
      const cleanEnd = (evt.endDate || evt.startDate).replace(/-/g, '');

      lines.push(`DTSTART:${cleanStart}T${startT}`);
      lines.push(`DTEND:${cleanEnd}T${endT}`);
    }

    lines.push(`SUMMARY:${escapeIcsText(evt.title)}`);
    if (evt.description) {
      lines.push(`DESCRIPTION:${escapeIcsText(evt.description)}`);
    }
    if (evt.location) {
      lines.push(`LOCATION:${escapeIcsText(evt.location)}`);
    }
    lines.push(`CATEGORIES:${evt.category.toUpperCase()}`);
    if (evt.completed) {
      lines.push('STATUS:COMPLETED');
    }
    lines.push('END:VEVENT');
  });

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '');
}

function unescapeIcsText(text: string): string {
  return text
    .replace(/\\n/g, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

/**
 * Parses an iCalendar (.ics) string into an array of CalendarEvents
 */
export function parseIcsContent(icsContent: string): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  const lines = icsContent.split(/\r?\n/);
  
  // Unfold folded lines (RFC 5545 specifies that lines starting with space or tab are continuations)
  const unfolded: string[] = [];
  for (const rawLine of lines) {
    if ((rawLine.startsWith(' ') || rawLine.startsWith('\t')) && unfolded.length > 0) {
      unfolded[unfolded.length - 1] += rawLine.slice(1);
    } else if (rawLine.trim()) {
      unfolded.push(rawLine.trim());
    }
  }

  let inEvent = false;
  let curEvent: Partial<CalendarEvent> = {};

  for (const line of unfolded) {
    if (line === 'BEGIN:VEVENT') {
      inEvent = true;
      curEvent = {
        id: 'evt_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        category: 'work',
        isAllDay: true,
        priority: 'normal',
        completed: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      continue;
    }

    if (line === 'END:VEVENT') {
      if (inEvent && curEvent.title && curEvent.startDate) {
        if (!curEvent.endDate) curEvent.endDate = curEvent.startDate;
        events.push(curEvent as CalendarEvent);
      }
      inEvent = false;
      curEvent = {};
      continue;
    }

    if (!inEvent) continue;

    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;

    const rawKey = line.slice(0, colonIdx);
    const value = line.slice(colonIdx + 1);
    const key = rawKey.split(';')[0].toUpperCase();

    if (key === 'SUMMARY') {
      curEvent.title = unescapeIcsText(value);
    } else if (key === 'DESCRIPTION') {
      curEvent.description = unescapeIcsText(value);
    } else if (key === 'LOCATION') {
      curEvent.location = unescapeIcsText(value);
    } else if (key === 'CATEGORIES') {
      const cat = value.toLowerCase();
      if (cat.includes('meet') || cat.includes('회의')) curEvent.category = 'meeting';
      else if (cat.includes('person') || cat.includes('개인')) curEvent.category = 'personal';
      else if (cat.includes('dead') || cat.includes('마감')) curEvent.category = 'deadline';
      else if (cat.includes('urgent') || cat.includes('긴급')) curEvent.category = 'urgent';
      else curEvent.category = 'work';
    } else if (key === 'DTSTART') {
      const isDateOnly = rawKey.includes('VALUE=DATE');
      if (isDateOnly || value.length === 8) {
        // YYYYMMDD
        const y = value.slice(0, 4);
        const m = value.slice(4, 6);
        const d = value.slice(6, 8);
        curEvent.startDate = `${y}-${m}-${d}`;
        curEvent.isAllDay = true;
      } else if (value.includes('T')) {
        // YYYYMMDDTHHMMSS
        const [datePart, timePart] = value.split('T');
        const y = datePart.slice(0, 4);
        const m = datePart.slice(4, 6);
        const d = datePart.slice(6, 8);
        curEvent.startDate = `${y}-${m}-${d}`;
        curEvent.startTime = `${timePart.slice(0, 2)}:${timePart.slice(2, 4)}`;
        curEvent.isAllDay = false;
      }
    } else if (key === 'DTEND') {
      const isDateOnly = rawKey.includes('VALUE=DATE');
      if (isDateOnly || value.length === 8) {
        const y = value.slice(0, 4);
        const m = value.slice(4, 6);
        const d = value.slice(6, 8);
        // If it was non-inclusive end date, subtract 1 day if start and end are multi-day
        const dObj = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
        dObj.setDate(dObj.getDate() - 1);
        const pad = (n: number) => String(n).padStart(2, '0');
        curEvent.endDate = `${dObj.getFullYear()}-${pad(dObj.getMonth() + 1)}-${pad(dObj.getDate())}`;
      } else if (value.includes('T')) {
        const [datePart, timePart] = value.split('T');
        const y = datePart.slice(0, 4);
        const m = datePart.slice(4, 6);
        const d = datePart.slice(6, 8);
        curEvent.endDate = `${y}-${m}-${d}`;
        curEvent.endTime = `${timePart.slice(0, 2)}:${timePart.slice(2, 4)}`;
      }
    } else if (key === 'STATUS' && value.toUpperCase() === 'COMPLETED') {
      curEvent.completed = true;
    }
  }

  return events;
}

/**
 * Triggers a native browser file download for the given ICS string
 */
export function downloadIcsFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename.endsWith('.ics') ? filename : `${filename}.ics`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
