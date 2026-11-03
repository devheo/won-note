import { isTauri } from '../utils/platformBridge';

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
  if (isTauri()) {
    try {
      const notif = await import(/* @vite-ignore */ '@tauri-apps/plugin-notification');
      let granted = await notif.isPermissionGranted();

      if (!granted) {
        const permission = await notif.requestPermission();
        granted = permission === 'granted';
      }

      if (granted) {
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
