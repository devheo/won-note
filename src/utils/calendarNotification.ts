import { CalendarEvent, ReminderOffset, CalendarReminder } from '../types';

/**
 * Web Audio API synthesizer for clean, offline chime sound
 * Works 100% offline without downloading external audio files.
 */
let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  try {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        audioCtx = new AudioContextClass();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  } catch (err) {
    console.warn('Web Audio API not supported or blocked:', err);
    return null;
  }
}

/**
 * Plays a pleasant 3-tone notification chime (C5 -> E5 -> G5)
 */
export function playNotificationChime(volume = 0.5): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  // Notes: C5 (523.25Hz), E5 (659.25Hz), G5 (783.99Hz), C6 (1046.50Hz)
  const notes = [
    { freq: 523.25, time: 0.0, dur: 0.28 },
    { freq: 659.25, time: 0.12, dur: 0.32 },
    { freq: 783.99, time: 0.24, dur: 0.38 },
    { freq: 1046.5, time: 0.36, dur: 0.65 },
  ];

  notes.forEach(({ freq, time, dur }) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now + time);

    // Envelope
    gain.gain.setValueAtTime(0.001, now + time);
    gain.gain.exponentialRampToValueAtTime(volume * 0.4, now + time + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + time + dur);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now + time);
    osc.stop(now + time + dur);
  });
}

/**
 * Convert reminder offset string to minutes
 */
export function getReminderOffsetMinutes(offset?: ReminderOffset): number {
  switch (offset) {
    case 'on_time':
      return 0;
    case '5m':
      return 5;
    case '10m':
      return 10;
    case '15m':
      return 15;
    case '30m':
      return 30;
    case '1h':
      return 60;
    case '2h':
      return 120;
    case '1d':
      return 1440;
    default:
      return -1;
  }
}

/**
 * Human-readable label for reminder offset
 */
export function getReminderOffsetLabel(offset?: ReminderOffset): string {
  switch (offset) {
    case 'on_time':
      return '정시 (시작 시간)';
    case '5m':
      return '5분 전';
    case '10m':
      return '10분 전';
    case '15m':
      return '15분 전';
    case '30m':
      return '30분 전';
    case '1h':
      return '1시간 전';
    case '2h':
      return '2시간 전';
    case '1d':
      return '1일 전 (24시간 전)';
    case 'none':
    default:
      return '알림 없음';
  }
}

/**
 * Computes exact timestamp (ms) when reminder should fire
 */
export function calculateReminderTimestamp(event: CalendarEvent): number | null {
  if (!event.reminder || !event.reminder.enabled || event.reminder.offset === 'none') {
    return null;
  }

  // If snoozed, check snooze timestamp
  if (event.reminder.snoozeUntil && event.reminder.snoozeUntil > 0) {
    return event.reminder.snoozeUntil;
  }

  const offsetMin = getReminderOffsetMinutes(event.reminder.offset);
  if (offsetMin < 0) return null;

  // Build target event start Date
  const dateParts = event.startDate.split('-').map((v) => parseInt(v, 10));
  if (dateParts.length !== 3) return null;

  const [year, month, day] = dateParts;
  let hour = 9;
  let minute = 0;

  if (!event.isAllDay && event.startTime) {
    const timeParts = event.startTime.split(':').map((v) => parseInt(v, 10));
    if (timeParts.length >= 2) {
      hour = timeParts[0];
      minute = timeParts[1];
    }
  }

  const eventTime = new Date(year, month - 1, day, hour, minute, 0, 0).getTime();
  const reminderTime = eventTime - offsetMin * 60 * 1000;
  return reminderTime;
}

/**
 * Browser Desktop Notification API helper
 */
export function isBrowserNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function getBrowserNotificationPermission(): NotificationPermission {
  if (!isBrowserNotificationSupported()) return 'denied';
  return Notification.permission;
}

export async function requestBrowserNotificationPermission(): Promise<NotificationPermission> {
  if (!isBrowserNotificationSupported()) return 'denied';
  try {
    const permission = await Notification.requestPermission();
    return permission;
  } catch (err) {
    console.error('Error requesting notification permission:', err);
    return 'denied';
  }
}

export function showDesktopNotification(
  title: string,
  options?: {
    body?: string;
    tag?: string;
    icon?: string;
    onClick?: () => void;
  }
): boolean {
  if (!isBrowserNotificationSupported() || Notification.permission !== 'granted') {
    return false;
  }

  try {
    const notif = new Notification(title, {
      body: options?.body,
      tag: options?.tag,
      icon: options?.icon || '/favicon.ico',
      badge: '/favicon.ico',
    });

    if (options?.onClick) {
      notif.onclick = () => {
        window.focus();
        options.onClick?.();
        notif.close();
      };
    }
    return true;
  } catch (err) {
    console.warn('Failed to display desktop notification:', err);
    return false;
  }
}
