import { useCallback, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { getAppNotificationPermission, isAppNotificationSupported, requestAppNotificationPermission, type AppNotificationPermission } from '../services/notificationBridge';
import { CHAT_NOTIFICATIONS_PREFERENCE_KEY, notifyChatMessage } from '../utils/chatNotifications';
import { CLIENT_CHAT_CHANNEL } from '../services/storage/clientChatStore';

import { resolveApiUrl, fetchBridge } from '../services/httpBridge';

type Conversation = { id: string; title: string; members: Array<{ id: string }> };
type Message = { id: string; conversationId: string; senderId: string; senderName: string; text: string; attachment?: { filename: string }; document?: { title: string } };

export function useChatNotifications(userId: string | null) {
  const [permission, setPermission] = useState<AppNotificationPermission>('default');
  const [notificationsEnabled, setNotificationsEnabledState] = useState(() => {
    try { return localStorage.getItem(CHAT_NOTIFICATIONS_PREFERENCE_KEY) !== 'false'; } catch { return true; }
  });

  useEffect(() => {
    let disposed = false;
    if (!userId) return;
    const syncPermission = () => { void getAppNotificationPermission().then(value => { if (!disposed) setPermission(value); }); };
    syncPermission();
    window.addEventListener('focus', syncPermission);
    const syncPreference = (event: StorageEvent) => {
      if (event.key === CHAT_NOTIFICATIONS_PREFERENCE_KEY) setNotificationsEnabledState(event.newValue !== 'false');
    };
    window.addEventListener('storage', syncPreference);
    if (userId === '__local__') {
      if (typeof BroadcastChannel === 'undefined') return () => { disposed = true; window.removeEventListener('focus', syncPermission); window.removeEventListener('storage', syncPreference); };
      const channel = new BroadcastChannel(CLIENT_CHAT_CHANNEL);
      channel.onmessage = event => {
        const message = event.data?.message as Message | undefined;
        let chatWindowFocused = false;
        try { chatWindowFocused = localStorage.getItem('wonbee_chat_window_focused') === 'true'; } catch { /* Treat unavailable storage as inactive. */ }
        if (!message || chatWindowFocused) return;
        void notifyChatMessage(message, '나에게');
      };
      return () => { disposed = true; window.removeEventListener('focus', syncPermission); window.removeEventListener('storage', syncPreference); channel.close(); };
    }
    const socket = io(resolveApiUrl(''), { withCredentials: true });
    const titles = new Map<string, string>();
    const joinConversations = () => {
      void fetchBridge(resolveApiUrl('/api/chat/conversations'), { credentials: 'include' }).then(response => response.ok ? response.json() as Promise<Conversation[]> : []).then(items => {
        if (!disposed) items.forEach(conversation => { titles.set(conversation.id, conversation.title); socket.emit('chat:join', conversation.id); });
      }).catch(() => {});
    };
    socket.on('connect', joinConversations);
    socket.on('chat:conversation-created', (conversation: Conversation) => {
      if (!conversation.members.some(member => member.id === userId)) return;
      titles.set(conversation.id, conversation.title);
      socket.emit('chat:join', conversation.id);
    });
    socket.on('chat:message', (message: Message) => {
      let chatWindowFocused = false;
      try { chatWindowFocused = localStorage.getItem('wonbee_chat_window_focused') === 'true'; } catch { /* Treat inaccessible storage as an inactive chat window. */ }
      if (message.senderId === userId || chatWindowFocused) return;
      try {
        const preferences = JSON.parse(localStorage.getItem(`wonbee_chat_room_preferences:${userId}`) || '{}');
        const room = preferences[message.conversationId];
        if (room?.muted || room?.notifications === false) return;
      } catch { /* Use default notification behavior if preferences cannot be read. */ }
      const conversation = titles.get(message.conversationId) || 'WonNote 새 메시지';
      void notifyChatMessage(message, conversation);
    });
    return () => { disposed = true; window.removeEventListener('focus', syncPermission); window.removeEventListener('storage', syncPreference); socket.disconnect(); };
  }, [userId]);

  const setNotificationsEnabled = useCallback(async (enabled: boolean) => {
    if (!enabled) {
      setNotificationsEnabledState(false);
      try { localStorage.setItem(CHAT_NOTIFICATIONS_PREFERENCE_KEY, 'false'); } catch { /* State remains disabled for this window. */ }
      return permission;
    }
    if (!isAppNotificationSupported()) return 'denied' as const;
    const currentPermission = await getAppNotificationPermission();
    const next = currentPermission === 'granted' ? currentPermission : await requestAppNotificationPermission();
    setPermission(next);
    const allowed = next === 'granted';
    setNotificationsEnabledState(allowed);
    try { localStorage.setItem(CHAT_NOTIFICATIONS_PREFERENCE_KEY, String(allowed)); } catch { /* State remains active for this window. */ }
    return next;
  }, [permission]);

  return { permission, notificationsEnabled, setNotificationsEnabled, supported: isAppNotificationSupported() };
}
