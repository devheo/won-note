import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { authEnabled, getSocketUser } from './auth';
import { createChatMessage, isChatMember, listChatConversations } from './chat';

type ConnectedUser = { id: string; name: string; email: string; role: string };
type Presence = { userId: string; name: string; status: 'online' | 'away' | 'offline'; lastSeen: number };

export function attachChatSocket(httpServer: HttpServer) {
  const allowedOrigins = (process.env.AUTH_ALLOWED_ORIGINS || '').split(',').map(origin => origin.trim()).filter(Boolean);
  const io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => {
        if (!origin) {
          callback(null, true);
          return;
        }
        try {
          const parsed = new URL(origin);
          const hostname = parsed.hostname;
          if (
            hostname === 'localhost' ||
            hostname === '127.0.0.1' ||
            hostname.startsWith('10.') ||
            hostname.startsWith('192.168.') ||
            hostname.startsWith('172.') ||
            allowedOrigins.includes(origin) ||
            !authEnabled()
          ) {
            callback(null, true);
          } else {
            callback(new Error('허용되지 않은 채팅 연결 주소입니다.'));
          }
        } catch {
          callback(null, true);
        }
      },
      credentials: true,
    },
    maxHttpBufferSize: 1024 * 1024,
  });
  const socketUsers = new Map<string, ConnectedUser>();
  const presence = new Map<string, Presence>();
  const lastHeartbeat = new Map<string, number>();

  io.use((socket, next) => {
    const origin = socket.handshake.headers.origin;
    const requestHost = socket.handshake.headers.host;
    let sameOrigin = false;
    try {
      if (origin) {
        const parsed = new URL(origin);
        const hostname = parsed.hostname;
        if (
          hostname === 'localhost' ||
          hostname === '127.0.0.1' ||
          hostname.startsWith('10.') ||
          hostname.startsWith('192.168.') ||
          hostname.startsWith('172.')
        ) {
          sameOrigin = true;
        }
      }
      if (!sameOrigin) {
        sameOrigin = Boolean(origin && requestHost && new URL(origin).host === requestHost);
      }
    } catch { }

    if (authEnabled() && origin && !allowedOrigins.includes(origin) && !sameOrigin) {
      return next(new Error('허용되지 않은 채팅 연결 주소입니다.'));
    }
    const user = getSocketUser(socket.request.headers.cookie);
    if (user) {
      socket.data.user = { id: user.id, name: user.display_name || user.email, email: user.email, role: user.role } satisfies ConnectedUser;
    } else {
      socket.data.user = null;
    }
    next();
  });

  const updatePresence = (user: ConnectedUser, status: Presence['status']) => {
    const value = { userId: user.id, name: user.name, status, lastSeen: Date.now() };
    presence.set(user.id, value);
    io.emit('presence:update', value);
  };

  io.on('connection', socket => {
    const user = socket.data.user as ConnectedUser | null;
    if (!user) return;
    socketUsers.set(socket.id, user);
    socket.join(`user:${user.id}`);
    lastHeartbeat.set(socket.id, Date.now());
    socket.join(listChatConversations(user.id).map(conversation => `conversation:${conversation.id}`));
    socket.emit('presence:snapshot', Array.from(presence.values()));
    updatePresence(user, 'online');

    socket.on('presence:heartbeat', () => {
      lastHeartbeat.set(socket.id, Date.now());
    });
    socket.on('presence:set', (status: unknown) => {
      if (status === 'away' || status === 'online') updatePresence(user, status);
      lastHeartbeat.set(socket.id, Date.now());
    });
    socket.on('chat:join', (conversationId: string, acknowledge?: (result: { ok: boolean; error?: string }) => void) => {
      if (typeof conversationId !== 'string' || !isChatMember(conversationId, user.id)) {
        acknowledge?.({ ok: false, error: '대화 참여자만 입장할 수 있습니다.' });
        return;
      }
      socket.join(`conversation:${conversationId}`);
      acknowledge?.({ ok: true });
    });
    socket.on('chat:send', (payload: any, acknowledge?: (result: { ok: boolean; message?: unknown; error?: string }) => void) => {
      try {
        if (!payload || typeof payload.conversationId !== 'string' || typeof payload.text !== 'string') throw new Error('메시지 형식이 올바르지 않습니다.');
        const message = createChatMessage(payload.conversationId, user.id, payload.text, typeof payload.attachmentId === 'string' ? payload.attachmentId : undefined, payload.document);
        io.to(`conversation:${payload.conversationId}`).emit('chat:message', message);
        acknowledge?.({ ok: true, message });
      } catch (error) {
        acknowledge?.({ ok: false, error: error instanceof Error ? error.message : '메시지를 보내지 못했습니다.' });
      }
    });
    socket.on('disconnect', () => {
      socketUsers.delete(socket.id);
      lastHeartbeat.delete(socket.id);
      if (![...socketUsers.values()].some(active => active.id === user.id)) updatePresence(user, 'offline');
    });
  });

  const watchdog = setInterval(() => {
    const now = Date.now();
    for (const [socketId, user] of socketUsers) {
      const last = lastHeartbeat.get(socketId) || now;
      if (now - last > 70_000 && presence.get(user.id)?.status === 'online') updatePresence(user, 'away');
    }
  }, 15_000);
  io.on('close', () => clearInterval(watchdog));
  return io;
}
