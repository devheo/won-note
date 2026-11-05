import { getAppNotificationPermission, isAppNotificationSupported, sendAppNotification } from '../services/notificationBridge';

export type ChatNotificationMessage = { id: string; senderId: string; senderName: string; text: string; attachment?: { filename: string }; document?: { title: string } };
export const CHAT_NOTIFICATIONS_PREFERENCE_KEY = 'wonbee_chat_notifications_enabled';

/** Avoid duplicate desktop toasts when both the workspace and chat popup sockets hear a message. */
export async function notifyChatMessage(message: ChatNotificationMessage, conversationTitle: string) {
  try { if (localStorage.getItem(CHAT_NOTIFICATIONS_PREFERENCE_KEY) === 'false') return false; } catch { /* Continue with the default enabled preference. */ }
  if (!isAppNotificationSupported() || await getAppNotificationPermission() !== 'granted') return false;
  try {
    const key = 'wonbee_chat_notification_recent_ids';
    const recent: string[] = JSON.parse(localStorage.getItem(key) || '[]');
    if (recent.includes(message.id)) return false;
    localStorage.setItem(key, JSON.stringify([...recent.slice(-99), message.id]));
  } catch { /* Storage may be disabled; the notification itself can still be shown. */ }
  const detail = message.text.trim() || (message.attachment ? `파일: ${message.attachment.filename}` : message.document ? `문서: ${message.document.title}` : '새 메시지가 도착했습니다.');
  return sendAppNotification(conversationTitle, `${message.senderName}: ${detail.slice(0, 180)}`, { tag: `chat-${message.id}` });
}
