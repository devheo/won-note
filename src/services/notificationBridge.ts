import { isElectron, isTauri } from '../utils/platformBridge';

export type AppNotificationPermission = 'granted' | 'denied' | 'default';

export function isAppNotificationSupported(): boolean {
  return isTauri() || isElectron() || (typeof window !== 'undefined' && 'Notification' in window);
}

export async function getAppNotificationPermission(): Promise<AppNotificationPermission> {
  if (isElectron()) return 'granted';
  if (isTauri()) {
    try {
      const notif = await import('@tauri-apps/plugin-notification');
      return (await notif.isPermissionGranted()) ? 'granted' : 'default';
    } catch (err) {
      console.warn('[NotificationBridge] Could not read native notification permission:', err);
      return 'denied';
    }
  }
  if (typeof window === 'undefined' || !('Notification' in window)) return 'denied';
  return Notification.permission;
}

export async function requestAppNotificationPermission(): Promise<AppNotificationPermission> {
  if (isElectron()) return 'granted';
  if (isTauri()) {
    try {
      const notif = await import('@tauri-apps/plugin-notification');
      return await notif.requestPermission();
    } catch (err) {
      console.warn('[NotificationBridge] Could not request native notification permission:', err);
      return 'denied';
    }
  }
  if (typeof window === 'undefined' || !('Notification' in window)) return 'denied';
  try {
    return await Notification.requestPermission();
  } catch (err) {
    console.error('[NotificationBridge] Could not request web notification permission:', err);
    return 'denied';
  }
}

export interface AppNotificationOptions {
  icon?: string;
  body?: string;
  tag?: string;
  silent?: boolean;
}

/**
 * Unified OS & Web Desktop Notification Bridge
 * - tauri_app: Uses @tauri-apps/plugin-notification for OS Notification Center popups.
 * - client_web / server: Uses Web Notification API (new Notification()).
 */
export async function sendAppNotification(
  title: string,
  body: string = '',
  options: AppNotificationOptions = {}
): Promise<boolean> {
  if (isElectron()) {
    try {
      await window.wonNoteElectron?.notify(title, body);
      return true;
    } catch (err) {
      console.warn('[NotificationBridge] Electron notification failed:', err);
      return false;
    }
  }
  if (isTauri()) {
    try {
      const notif = await import('@tauri-apps/plugin-notification');
      if (await notif.isPermissionGranted()) {
        notif.sendNotification({
          title,
          body,
          icon: options.icon,
        });
        return true;
      }
      return false;
    } catch (err) {
      console.warn('[NotificationBridge] Tauri notification failed, falling back to Web Notification:', err);
    }
  }

  // Web Browser Fallback
  if (typeof window !== 'undefined' && 'Notification' in window) {
    try {
      if (Notification.permission === 'granted') {
        new Notification(title, {
          body,
          icon: options.icon || '/assets/icon.png',
          tag: options.tag,
          silent: options.silent,
        });
        return true;
      } else if (Notification.permission !== 'denied') {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
          new Notification(title, {
            body,
            icon: options.icon || '/assets/icon.png',
            tag: options.tag,
            silent: options.silent,
          });
          return true;
        }
      }
    } catch (err) {
      console.error('[NotificationBridge] Web notification error:', err);
    }
  }

  return false;
}
