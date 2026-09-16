import { useState, useEffect, useCallback, useMemo } from 'react';
import { CalendarEvent, WorkspaceData } from '../types';
import {
  calculateReminderTimestamp,
  playNotificationChime,
  showDesktopNotification,
} from '../utils/calendarNotification';
import { formatLocalDate } from '../utils/dateColumnUtils';

interface UseCalendarRemindersProps {
  workspace: WorkspaceData;
  activeTableId: string | null;
}

export function useCalendarReminders({ workspace, activeTableId }: UseCalendarRemindersProps) {
  const [activeAlarmEvent, setActiveAlarmEvent] = useState<CalendarEvent | null>(null);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem('wonbee_calendar_sound_enabled') !== 'false';
    } catch {
      return true;
    }
  });

  const handleToggleSound = useCallback((enabled: boolean) => {
    setSoundEnabled(enabled);
    try {
      localStorage.setItem('wonbee_calendar_sound_enabled', enabled ? 'true' : 'false');
    } catch (e) {
      console.error(e);
    }
  }, []);

  // Collect all events with reminders across all tables
  const getAllReminderEvents = useCallback((): { event: CalendarEvent; tableId: string }[] => {
    const list: { event: CalendarEvent; tableId: string }[] = [];
    if (!workspace || !workspace.tables) return list;

    Object.keys(workspace.tables).forEach((tblId) => {
      try {
        const stored = localStorage.getItem(`wonbee_calendar_events_${tblId}`);
        if (stored) {
          const parsed: CalendarEvent[] = JSON.parse(stored);
          parsed.forEach((evt) => {
            if (evt.reminder?.enabled && evt.reminder.offset !== 'none') {
              list.push({ event: evt, tableId: tblId });
            }
          });
        }
      } catch (err) {
        // Ignore parse error
      }
    });

    return list;
  }, [workspace]);

  // Periodic Reminder Checker
  useEffect(() => {
    const checkReminders = () => {
      const now = Date.now();
      const eventsWithReminders = getAllReminderEvents();

      for (const { event, tableId } of eventsWithReminders) {
        if (event.completed) continue;

        const remTime = calculateReminderTimestamp(event);
        if (!remTime) continue;

        // Trigger if reminder time has arrived within the last 15 minutes
        if (remTime <= now && remTime > now - 15 * 60 * 1000) {
          const firedKey = `wonbee_fired_${event.id}_${remTime}`;
          const isFired = sessionStorage.getItem(firedKey);

          if (!isFired) {
            sessionStorage.setItem(firedKey, 'true');

            // 1. Play Sound
            if (soundEnabled && event.reminder?.sound !== false) {
              playNotificationChime(0.6);
            }

            // 2. Desktop Notification
            const timeDesc = event.isAllDay ? '오늘 종일 일정' : `${event.startDate} ${event.startTime || ''}`;
            showDesktopNotification(`[WonBee 일정 알림] ${event.title}`, {
              body: `${timeDesc}${event.location ? ` | 장소: ${event.location}` : ''}`,
              tag: `wonbee_evt_${event.id}`,
            });

            // 3. In-App Toast
            setActiveAlarmEvent(event);
            break; // Show one at a time
          }
        }
      }
    };

    // Check immediately
    checkReminders();

    // Loop every 12 seconds
    const interval = setInterval(checkReminders, 12000);
    return () => clearInterval(interval);
  }, [getAllReminderEvents, soundEnabled]);

  // Dismiss current alarm toast
  const dismissAlarm = useCallback(() => {
    setActiveAlarmEvent(null);
  }, []);

  // Snooze alarm by N minutes
  const snoozeAlarm = useCallback(
    (event: CalendarEvent, minutes: number) => {
      setActiveAlarmEvent(null);
      const snoozeUntil = Date.now() + minutes * 60 * 1000;

      // Update in stored events
      if (workspace && workspace.tables) {
        Object.keys(workspace.tables).forEach((tblId) => {
          try {
            const key = `wonbee_calendar_events_${tblId}`;
            const stored = localStorage.getItem(key);
            if (stored) {
              const events: CalendarEvent[] = JSON.parse(stored);
              const idx = events.findIndex((e) => e.id === event.id);
              if (idx !== -1) {
                events[idx] = {
                  ...events[idx],
                  reminder: {
                    ...events[idx].reminder!,
                    snoozeUntil,
                  },
                };
                localStorage.setItem(key, JSON.stringify(events));
              }
            }
          } catch (e) {
            console.error('Failed to snooze event:', e);
          }
        });
      }
    },
    [workspace]
  );

  // Today's reminder count
  const todayReminders = useMemo(() => {
    const todayStr = formatLocalDate(new Date());
    return getAllReminderEvents().filter(({ event }) => event.startDate === todayStr);
  }, [getAllReminderEvents]);

  return {
    activeAlarmEvent,
    dismissAlarm,
    snoozeAlarm,
    soundEnabled,
    handleToggleSound,
    todayRemindersCount: todayReminders.length,
    allReminderEvents: getAllReminderEvents,
  };
}
