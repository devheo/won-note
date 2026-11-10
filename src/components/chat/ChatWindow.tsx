import React, { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { ArrowDownToLine, Bell, BellOff, CheckCheck, FileText, LogOut, MessageCircle, Paperclip, Plus, Send, Settings2, Star, Users, VolumeX, X, ZoomIn, ZoomOut, Copy, Edit2, Trash2 } from 'lucide-react';
import { useChatNotifications } from '../../hooks/useChatNotifications';
import { CLIENT_CHAT_CHANNEL, getClientChatAttachment, listClientChatMessages, newClientChatId, saveClientChatAttachment, saveClientChatMessage, type ClientChatMessage } from '../../services/storage/clientChatStore';
import { wonbeeDexieDB } from '../../services/storage/dexieDb';
import { API_PATHS } from '../../constants/api';
import { resolveApiUrl, fetchBridge } from '../../services/httpBridge';

type ChatUser = { id: string; email: string; displayName: string };
type Conversation = { id: string; type: 'direct' | 'group'; title: string; members: ChatUser[] };
type SharedFile = { id: string; filename: string; mimeType: string; size: number };
type SharedDocument = { id: string; title: string };
type Message = { id: string; conversationId: string; senderId: string; senderName: string; text: string; createdAt: number; isDeleted?: boolean; attachment?: SharedFile; document?: SharedDocument };
type Presence = { userId: string; name: string; status: 'online' | 'away' | 'offline' };
type RoomPreference = { favorite?: boolean; notifications?: boolean; muted?: boolean; readAt?: number; lastMessageAt?: number };
type RoomPreferences = Record<string, RoomPreference>;
const roomPrefsKey = (userId: string) => `wonbee_chat_room_preferences:${userId}`;

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const targetUrl = resolveApiUrl(url);
  const response = await fetchBridge(targetUrl, { credentials: 'include', ...init });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `요청 실패 (${response.status})`);
  }
  return response.json();
}

export default function ChatWindow() {
  const isClientMode = new URLSearchParams(window.location.search).get('chatMode') === 'client';
  const [currentUser, setCurrentUser] = useState<{ id: string; displayName: string } | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [people, setPeople] = useState<ChatUser[]>([]);
  const [documents, setDocuments] = useState<SharedDocument[]>([]);
  const [activeId, setActiveId] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [presence, setPresence] = useState<Record<string, Presence['status']>>({});
  const [draft, setDraft] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [draggingFile, setDraggingFile] = useState(false);
  const [imagePreview, setImagePreview] = useState<{ src: string; filename: string } | null>(null);
  const [imageZoom, setImageZoom] = useState(1);
  const [selectedDocument, setDocument] = useState<SharedDocument | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [messageContextMenu, setMessageContextMenu] = useState<{ x: number; y: number; message: Message } | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);

  useEffect(() => {
    const handleGlobalClick = () => {
      if (messageContextMenu) setMessageContextMenu(null);
    };
    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, [messageContextMenu]);
  const [groupTitle, setGroupTitle] = useState('');
  const [groupMembers, setGroupMembers] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [manageOpen, setManageOpen] = useState(false);
  const [manageTitle, setManageTitle] = useState('');
  const [manageMembers, setManageMembers] = useState<string[]>([]);
  const [roomPreferences, setRoomPreferences] = useState<RoomPreferences>({});
  const [contextMenu, setContextMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const socketRef = useRef<Socket | null>(null);
  const localChannelRef = useRef<BroadcastChannel | null>(null);
  const currentUserRef = useRef(currentUser);
  currentUserRef.current = currentUser;
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeConversation = conversations.find(conversation => conversation.id === activeId);
  const contextConversation = conversations.find(conversation => conversation.id === contextMenu?.id);
  const { permission: notificationPermission, notificationsEnabled, setNotificationsEnabled, supported: notificationsSupported } = useChatNotifications(isClientMode ? '__local__' : currentUser?.id || null);

  useEffect(() => {
    if (!currentUser) return;
    try { setRoomPreferences(JSON.parse(localStorage.getItem(roomPrefsKey(currentUser.id)) || '{}')); } catch { setRoomPreferences({}); }
  }, [currentUser?.id]);

  const updateRoomPreference = (id: string, update: RoomPreference) => {
    setRoomPreferences(previous => {
      const next = { ...previous, [id]: { ...previous[id], ...update } };
      try { if (currentUserRef.current) localStorage.setItem(roomPrefsKey(currentUserRef.current.id), JSON.stringify(next)); } catch { /* Preferences remain active for this window. */ }
      return next;
    });
  };

  const refresh = useCallback(async () => {
    const [session, nextConversations, nextPeople, nextDocuments] = await Promise.all([
      api<{ enabled: boolean; user: { id: string; displayName: string } | null }>('/api/auth/me'),
      api<Conversation[]>('/api/chat/conversations'),
      api<ChatUser[]>('/api/chat/users'),
      api<SharedDocument[]>('/api/chat/documents'),
    ]);
    if (!session.user) throw new Error('채팅을 사용하려면 서버에 로그인해 주세요.');
    setCurrentUser(session.user);
    setConversations(nextConversations);
    setPeople(nextPeople);
    setDocuments(nextDocuments);
    setActiveId(previous => nextConversations.some(conversation => conversation.id === previous) ? previous : nextConversations[0]?.id || '');
  }, []);

  useEffect(() => {
    let disposed = false;
    if (isClientMode) {
      setCurrentUser({ id: 'local-self', displayName: '나' });
      setConversations([{ id: 'self', type: 'direct', title: '나에게', members: [{ id: 'local-self', email: '', displayName: '나' }] }]);
      setActiveId('self');
      const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CLIENT_CHAT_CHANNEL) : null;
      localChannelRef.current = channel;
      if (channel) channel.onmessage = event => {
        const message = event.data?.message as ClientChatMessage | undefined;
        if (!message || message.conversationId !== 'self') return;
        setMessages(previous => previous.some(item => item.id === message.id) ? previous : [...previous, message]);
      };
      void Promise.all([listClientChatMessages(), wonbeeDexieDB.loadWorkspace()])
        .then(([nextMessages, workspace]) => {
          if (disposed) return;
          setMessages(nextMessages);
          setDocuments(Object.values(workspace.documents || {}).map(document => ({ id: document.id, title: document.title })));
        })
        .catch(reason => setError(reason instanceof Error ? reason.message : '로컬 채팅을 불러오지 못했습니다.'))
        .finally(() => { if (!disposed) setLoading(false); });
      return () => { disposed = true; channel?.close(); localChannelRef.current = null; };
    }
    void refresh().catch(reason => { if (!disposed) setError(reason instanceof Error ? reason.message : '채팅 정보를 불러오지 못했습니다.'); }).finally(() => { if (!disposed) setLoading(false); });
    // Keep Socket.IO's polling-first transport so it can connect through
    // proxies that reject WebSocket handshakes, then upgrade when available.
    const socket = io(resolveApiUrl(''), { withCredentials: true });
    socketRef.current = socket;
    socket.on('connect', () => { setError(''); socket.emit('presence:heartbeat'); });
    socket.on('connect_error', reason => setError(reason.message || '실시간 채팅 서버에 연결하지 못했습니다.'));
    socket.on('presence:snapshot', (items: Presence[]) => setPresence(Object.fromEntries(items.map(item => [item.userId, item.status]))));
    socket.on('presence:update', (item: Presence) => setPresence(previous => ({ ...previous, [item.userId]: item.status })));
    socket.on('chat:conversation-created', (conversation: Conversation) => {
      if (!conversation.members.some(member => member.id === currentUserRef.current?.id)) return;
      socket.emit('chat:join', conversation.id);
      void refresh().catch(reason => setError(reason instanceof Error ? reason.message : '대화 목록을 갱신하지 못했습니다.'));
    });
    socket.on('chat:conversation-updated', () => { void refresh().catch(() => {}); });
    socket.on('chat:conversation-left', () => { void refresh().catch(() => {}); });
    socket.on('chat:message', (message: Message) => {
      if (message.senderId !== currentUserRef.current?.id) updateRoomPreference(message.conversationId, { lastMessageAt: message.createdAt });
      setMessages(previous => message.conversationId === activeIdRef.current && !previous.some(item => item.id === message.id) ? [...previous, message] : previous);
    });
    const heartbeat = window.setInterval(() => socket.emit('presence:heartbeat'), 20_000);
    const onVisibility = () => socket.emit('presence:set', window.document.visibilityState === 'visible' ? 'online' : 'away');
    window.document.addEventListener('visibilitychange', onVisibility);
    return () => { disposed = true; window.clearInterval(heartbeat); window.document.removeEventListener('visibilitychange', onVisibility); socket.disconnect(); socketRef.current = null; };
  }, [isClientMode, refresh]);

  useEffect(() => {
    if (isClientMode) return;
    if (!activeId) { setMessages([]); return; }
    let disposed = false;
    setMessages([]);
    socketRef.current?.emit('chat:join', activeId, (result: { ok: boolean; error?: string }) => { if (!result.ok) setError(result.error || '대화에 입장하지 못했습니다.'); });
    const loadMessages = (showError: boolean) => api<Message[]>(`/api/chat/conversations/${encodeURIComponent(activeId)}/messages`)
      .then(next => { if (!disposed) setMessages(current => [...new Map([...current, ...next].map(message => [message.id, message])).values()].filter(message => message.conversationId === activeId).sort((a, b) => a.createdAt - b.createdAt)); })
      .catch(reason => { if (showError && !disposed) setError(reason instanceof Error ? reason.message : '메시지를 불러오지 못했습니다.'); });
    void loadMessages(true);
    const poll = window.setInterval(() => { void loadMessages(false); }, 4000);
    return () => { disposed = true; window.clearInterval(poll); };
  }, [activeId, isClientMode]);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }); }, [messages]);

  useEffect(() => {
    const setFocused = (focused: boolean) => { try { localStorage.setItem('wonbee_chat_window_focused', String(focused)); } catch { /* Optional coordination between app windows. */ } };
    const onFocus = () => setFocused(true);
    const onBlur = () => setFocused(false);
    const onClose = () => setFocused(false);
    if (window.document.hasFocus()) onFocus(); else onBlur();
    window.addEventListener('focus', onFocus);
    window.addEventListener('blur', onBlur);
    window.addEventListener('pagehide', onClose);
    return () => { window.removeEventListener('focus', onFocus); window.removeEventListener('blur', onBlur); window.removeEventListener('pagehide', onClose); onClose(); };
  }, []);

  const createConversation = async (type: 'direct' | 'group', memberIds: string[], title = '') => {
    try {
      setError('');
      const conversation = await api<Conversation>('/api/chat/conversations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, memberIds, title }) });
      await refresh();
      setActiveId(conversation.id);
      setComposeOpen(false); setGroupTitle(''); setGroupMembers([]);
    } catch (reason) { setError(reason instanceof Error ? reason.message : '대화방을 만들지 못했습니다.'); }
  };

  const saveConversationSettings = async () => {
    if (!activeConversation) return;
    try {
      setError('');
      const route = API_PATHS.chat.conversationMembersPattern.replace(':id', encodeURIComponent(activeConversation.id));
      await api<Conversation>(route, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: manageTitle, memberIds: manageMembers }) });
      await refresh();
      setManageOpen(false);
    } catch (reason) { setError(reason instanceof Error ? reason.message : '대화방 설정을 저장하지 못했습니다.'); }
  };

  const leaveConversation = async () => {
    if (!activeConversation || !window.confirm(`“${activeConversation.title}” 대화방에서 나갈까요?`)) return;
    try {
      setError('');
      const route = API_PATHS.chat.conversationPattern.replace(':id', encodeURIComponent(activeConversation.id));
      await api(route, { method: 'DELETE' });
      setManageOpen(false);
      await refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : '대화방에서 나가지 못했습니다.'); }
  };

  const renameRoomFromMenu = async (conversation: Conversation) => {
    const title = window.prompt('새 채팅방 제목을 입력하세요.', conversation.title);
    if (title === null || !title.trim()) return;
    try {
      await api(API_PATHS.chat.conversationPattern.replace(':id', encodeURIComponent(conversation.id)), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }) });
      await refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : '방 제목을 변경하지 못했습니다.'); }
  };

  const leaveRoom = async (conversation: Conversation) => {
    if (!window.confirm(`“${conversation.title}” 대화방에서 나갈까요?`)) return;
    try {
      await api(API_PATHS.chat.conversationPattern.replace(':id', encodeURIComponent(conversation.id)), { method: 'DELETE' });
      setContextMenu(null);
      await refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : '대화방에서 나가지 못했습니다.'); }
  };

  const markRoomRead = (id: string) => { updateRoomPreference(id, { readAt: Date.now() }); setContextMenu(null); };
  const openRoom = (id: string) => { setActiveId(id); markRoomRead(id); setContextMenu(null); };
  const orderedConversations = [...conversations].sort((a, b) => Number(Boolean(roomPreferences[b.id]?.favorite)) - Number(Boolean(roomPreferences[a.id]?.favorite)));

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener('click', close);
    window.addEventListener('scroll', close, true);
    return () => { window.removeEventListener('click', close); window.removeEventListener('scroll', close, true); };
  }, [contextMenu]);

  const sendMessage = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!activeId || (!draft.trim() && !file && !selectedDocument)) return;
    try {
      setError('');
      if (isClientMode) {
        const attachment = file ? await saveClientChatAttachment(file) : undefined;
        const message: ClientChatMessage = {
          id: newClientChatId(), conversationId: 'self', senderId: 'local-self', senderName: '나', text: draft.trim(), createdAt: Date.now(),
          ...(attachment ? { attachment } : {}), ...(selectedDocument ? { document: selectedDocument } : {}),
        };
        await saveClientChatMessage(message);
        setMessages(previous => [...previous, message]);
        localChannelRef.current?.postMessage({ type: 'chat:message', message });
        setDraft(''); setFile(null); setDocument(null);
        return;
      }
      let attachmentId: string | undefined;
      if (file) {
        const query = new URLSearchParams({ conversationId: activeId, filename: file.name, mimeType: file.type || 'application/octet-stream' });
        const attachment = await api<SharedFile>(`/api/chat/attachments?${query}`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: file });
        attachmentId = attachment.id;
      }
      const message = await api<Message>(`/api/chat/conversations/${encodeURIComponent(activeId)}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: draft, attachmentId, document: selectedDocument || undefined }),
      });
      setMessages(previous => previous.some(item => item.id === message.id) ? previous : [...previous, message]);
      setDraft(''); setFile(null); setDocument(null);
    } catch (reason) { setError(reason instanceof Error ? reason.message : '메시지를 보내지 못했습니다.'); }
  };

  const downloadLocalAttachment = async (attachmentId: string) => {
    try {
      const attachment = await getClientChatAttachment(attachmentId);
      if (!attachment) throw new Error('첨부 파일을 찾을 수 없습니다.');
      const url = URL.createObjectURL(attachment.blob);
      const link = window.document.createElement('a');
      link.href = url; link.download = attachment.filename; link.click();
      URL.revokeObjectURL(url);
    } catch (reason) { setError(reason instanceof Error ? reason.message : '파일을 내려받지 못했습니다.'); }
  };

  if (loading) return <div className="grid h-screen place-items-center bg-stone-50 text-sm text-stone-500">채팅을 준비하고 있습니다…</div>;
  if (!currentUser) return <div className="grid h-screen place-items-center bg-stone-50 p-6"><div className="max-w-md rounded-2xl bg-white p-8 text-center shadow"><MessageCircle className="mx-auto mb-3 text-indigo-600"/><h1 className="text-lg font-semibold">WonNote 채팅</h1><p className="mt-2 text-sm text-stone-600">{error || '서버 로그인 후 이용할 수 있습니다.'}</p><button onClick={() => window.close()} className="mt-5 rounded-lg bg-stone-900 px-4 py-2 text-sm text-white">창 닫기</button></div></div>;

  return <main className="flex h-screen min-h-0 bg-stone-50 text-stone-900 dark:bg-stone-950 dark:text-stone-100">
    <aside className="flex w-80 shrink-0 flex-col border-r border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900">
      <header className="flex items-center justify-between border-b border-stone-200 px-4 py-4 dark:border-stone-800"><div><div className="flex items-center gap-2 font-semibold"><MessageCircle size={18} className="text-indigo-600"/>WonNote 채팅</div><div className="mt-1 text-xs text-stone-500">{currentUser.displayName}</div></div>{!isClientMode && <button onClick={() => setComposeOpen(value => !value)} title="새 대화" className="rounded-lg p-2 text-indigo-700 hover:bg-indigo-50 dark:hover:bg-indigo-950"><Plus size={18}/></button>}</header>
      {composeOpen && <section className="border-b border-stone-200 p-3 dark:border-stone-800">
        <h2 className="mb-2 text-sm font-semibold">새 1:1 대화</h2><div className="max-h-32 space-y-1 overflow-auto">{people.map(person => <button key={person.id} onClick={() => void createConversation('direct', [person.id])} className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm hover:bg-stone-100 dark:hover:bg-stone-800"><span>{person.displayName}</span><span className="text-[10px] text-stone-500">{presence[person.id] || 'offline'}</span></button>)}</div>
        <div className="mt-3 border-t border-stone-200 pt-3 dark:border-stone-800"><label className="mb-1 block text-xs font-medium">그룹 대화 이름</label><input value={groupTitle} onChange={event => setGroupTitle(event.target.value)} placeholder="예: 제품팀" className="w-full rounded-lg border border-stone-300 bg-transparent px-2 py-1.5 text-sm dark:border-stone-700"/><div className="my-2 max-h-28 space-y-1 overflow-auto">{people.map(person => <label key={person.id} className="flex items-center gap-2 text-xs"><input type="checkbox" checked={groupMembers.includes(person.id)} onChange={event => setGroupMembers(previous => event.target.checked ? [...previous, person.id] : previous.filter(id => id !== person.id))}/>{person.displayName}</label>)}</div><button onClick={() => void createConversation('group', groupMembers, groupTitle)} disabled={groupMembers.length === 0} className="w-full rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">그룹 대화 만들기</button></div>
      </section>}
      <div className="flex-1 overflow-auto p-2">{orderedConversations.map(conversation => <button key={conversation.id} onClick={() => openRoom(conversation.id)} onContextMenu={event => { event.preventDefault(); setContextMenu({ id: conversation.id, x: Math.min(event.clientX, window.innerWidth - 260), y: Math.min(event.clientY, window.innerHeight - 330) }); }} className={`mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left ${activeId === conversation.id ? 'bg-indigo-50 text-indigo-950 dark:bg-indigo-950/50 dark:text-indigo-100' : 'hover:bg-stone-100 dark:hover:bg-stone-800'}`}><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-stone-200 text-stone-600 dark:bg-stone-700 dark:text-stone-200">{conversation.type === 'group' ? <Users size={17}/> : (conversation.title[0] || '?')}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{conversation.title}</span><span className="block truncate text-[11px] text-stone-500">{conversation.type === 'group' ? `${conversation.members.length}명 그룹` : conversation.members.find(member => member.id !== currentUser.id)?.email}</span></span>{roomPreferences[conversation.id]?.favorite && <Star size={14} className="fill-amber-400 text-amber-500"/>}{roomPreferences[conversation.id]?.muted && <VolumeX size={14} className="text-stone-400"/>}{(roomPreferences[conversation.id]?.lastMessageAt || 0) > (roomPreferences[conversation.id]?.readAt || 0) && activeId !== conversation.id && <i className="h-2 w-2 rounded-full bg-indigo-500"/>}{conversation.type === 'direct' && <i className={`h-2 w-2 rounded-full ${presence[conversation.members.find(member => member.id !== currentUser.id)?.id || ''] === 'online' ? 'bg-emerald-500' : presence[conversation.members.find(member => member.id !== currentUser.id)?.id || ''] === 'away' ? 'bg-amber-400' : 'bg-stone-300'}`}/>}</button>)}{!conversations.length && <p className="p-4 text-center text-xs text-stone-500">아직 대화가 없습니다. + 버튼으로 대화를 시작하세요.</p>}</div>
      {contextMenu && contextConversation && <div className="fixed z-[200] w-56 rounded-xl border border-stone-200 bg-white p-1.5 shadow-xl dark:border-stone-700 dark:bg-stone-900" style={{ left: contextMenu.x, top: contextMenu.y }} onClick={event => event.stopPropagation()}>{[
        ['방 입장하기', () => openRoom(contextConversation.id)],
        ['방 제목 변경하기', () => { setContextMenu(null); void renameRoomFromMenu(contextConversation); }],
        [roomPreferences[contextConversation.id]?.favorite ? '즐겨찾기 해제' : '즐겨찾기 추가', () => { updateRoomPreference(contextConversation.id, { favorite: !roomPreferences[contextConversation.id]?.favorite }); setContextMenu(null); }],
        [roomPreferences[contextConversation.id]?.notifications === false ? '알림 켜기' : '알림 끄기', () => { updateRoomPreference(contextConversation.id, { notifications: roomPreferences[contextConversation.id]?.notifications === false }); setContextMenu(null); }],
        ['읽음으로 표시', () => markRoomRead(contextConversation.id)],
        [roomPreferences[contextConversation.id]?.muted ? '무음 해제' : '무음으로 설정하기', () => { updateRoomPreference(contextConversation.id, { muted: !roomPreferences[contextConversation.id]?.muted }); setContextMenu(null); }],
        ['채팅방 떠나기', () => { setContextMenu(null); void leaveRoom(contextConversation); }],
      ].map(([label, action]) => <button key={String(label)} onClick={action as () => void} className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-stone-100 dark:hover:bg-stone-800">{String(label)}</button>)}</div>}
      <footer className="border-t border-stone-200 px-4 py-3 text-[11px] text-stone-500 dark:border-stone-800">{isClientMode ? "이 대화는 이 브라우저의 로컬 저장소에 보관됩니다." : "접속 상태는 heartbeat로 동기화됩니다."}</footer>
    </aside>
    <section className="relative flex min-w-0 flex-1 flex-col" onDragOver={event => { if (event.dataTransfer.types.includes('Files')) { event.preventDefault(); setDraggingFile(true); } }} onDragLeave={event => { if (event.currentTarget === event.target) setDraggingFile(false); }} onDrop={event => { event.preventDefault(); setDraggingFile(false); const dropped = event.dataTransfer.files?.[0]; if (!dropped) return; if (dropped.size > 20 * 1024 * 1024) { setError('첨부 파일은 20MB 이하로 선택해 주세요.'); return; } setFile(dropped); setDocument(null); }}>
      {draggingFile && <div className="pointer-events-none absolute inset-3 z-20 grid place-items-center rounded-2xl border-2 border-dashed border-indigo-500 bg-indigo-500/10 text-sm font-semibold text-indigo-700 dark:text-indigo-200">파일을 놓아 첨부하세요 (최대 20MB)</div>}
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-stone-200 bg-white px-6 dark:border-stone-800 dark:bg-stone-900"><div><h1 className="font-semibold">{activeConversation?.title || '대화를 선택하세요'}</h1>{activeConversation && <p className="text-xs text-stone-500">{activeConversation.members.map(member => member.displayName).join(' · ')}</p>}</div><div className="flex items-center gap-2">{activeConversation && !isClientMode && <button onClick={() => { setManageTitle(activeConversation.title); setManageMembers(activeConversation.members.map(member => member.id)); setManageOpen(true); }} title="대화방 관리" aria-label="대화방 관리" className="rounded-lg p-2 text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"><Settings2 size={18}/></button>}{notificationsSupported && <button onClick={async () => { const next = await setNotificationsEnabled(!notificationsEnabled); if (!notificationsEnabled && next === 'denied') setError('알림이 차단되어 있습니다. 브라우저 또는 OS 설정에서 WonNote 알림을 허용해 주세요.'); }} aria-pressed={notificationsEnabled} title={notificationPermission === 'denied' && !notificationsEnabled ? '알림 차단됨 — 브라우저 또는 OS 설정에서 허용해 주세요' : notificationsEnabled ? '새 메시지 알림 끄기' : '새 메시지 알림 켜기'} className={`rounded-lg p-2 hover:bg-stone-100 dark:hover:bg-stone-800 ${notificationsEnabled && notificationPermission === 'granted' ? 'text-indigo-600' : 'text-stone-500'}`}>{notificationsEnabled ? <Bell size={18}/> : <BellOff size={18}/>}</button>}<button onClick={() => {}} title="채팅창 유지" aria-label="채팅창 유지" className="rounded-lg p-2 text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 cursor-default"><X size={18}/></button></div></header>
      {error && <div className="flex items-center justify-between bg-rose-50 px-5 py-2 text-xs text-rose-800 dark:bg-rose-950/40 dark:text-rose-200">{error}<button onClick={() => setError('')}><X size={14}/></button></div>}
      {imagePreview && <div className="fixed inset-0 z-[300] flex items-center justify-center overflow-auto bg-black/90 p-4 sm:p-10" onClick={() => setImagePreview(null)} onWheel={event => { event.preventDefault(); event.stopPropagation(); setImageZoom(value => Math.min(4, Math.max(0.5, value + (event.deltaY < 0 ? 0.2 : -0.2)))); }}><button onClick={() => setImagePreview(null)} aria-label="이미지 닫기" className="fixed right-5 top-5 z-10 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"><X size={24}/></button><div className="flex min-h-full min-w-full flex-col items-center justify-center" onClick={event => event.stopPropagation()}><img src={imagePreview.src} alt={imagePreview.filename} style={{ transform: `scale(${imageZoom})` }} className="max-h-[82vh] max-w-[92vw] rounded-lg object-contain shadow-2xl transition-transform duration-100"/><p className="mt-3 text-sm text-white">{imagePreview.filename}</p><div className="fixed bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-stone-900/90 p-2 text-white shadow-xl"><button onClick={() => setImageZoom(value => Math.max(0.5, value - 0.25))} title="축소" aria-label="축소" className="rounded-full p-2 hover:bg-white/15"><ZoomOut size={18}/></button><button onClick={() => setImageZoom(1)} title="배율 초기화" className="min-w-14 rounded px-2 py-1 text-sm tabular-nums hover:bg-white/15">{Math.round(imageZoom * 100)}%</button><button onClick={() => setImageZoom(value => Math.min(4, value + 0.25))} title="확대" aria-label="확대" className="rounded-full p-2 hover:bg-white/15"><ZoomIn size={18}/></button></div></div></div>}
      {manageOpen && activeConversation && <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onMouseDown={event => { if (event.target === event.currentTarget) setManageOpen(false); }}><section className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl dark:bg-stone-900"><header className="mb-4 flex items-center justify-between"><h2 className="text-lg font-semibold">대화방 관리</h2><button onClick={() => setManageOpen(false)} aria-label="닫기" className="rounded-lg p-2 hover:bg-stone-100 dark:hover:bg-stone-800"><X size={17}/></button></header>{activeConversation.type === 'group' && <><label className="mb-3 block text-sm">대화방 이름<input maxLength={100} value={manageTitle} onChange={event => setManageTitle(event.target.value)} className="mt-1 w-full rounded-lg border border-stone-300 bg-transparent px-3 py-2 dark:border-stone-700"/></label><h3 className="mb-2 text-sm font-medium">구성원</h3><div className="mb-4 max-h-56 space-y-1 overflow-auto rounded-lg border border-stone-200 p-2 dark:border-stone-700">{people.map(person => <label key={person.id} className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-stone-50 dark:hover:bg-stone-800"><input type="checkbox" checked={manageMembers.includes(person.id)} onChange={event => setManageMembers(previous => event.target.checked ? [...previous, person.id] : previous.filter(id => id !== person.id))}/><span>{person.displayName}</span><small className="ml-auto text-stone-500">{person.email}</small></label>)}</div><p className="mb-4 text-xs text-stone-500">내 계정은 구성원에 자동 포함됩니다. 그룹은 최소 2명이어야 합니다.</p><button onClick={() => void saveConversationSettings()} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">변경사항 저장</button></>}<div className="mt-4 border-t border-stone-200 pt-4 dark:border-stone-700"><button onClick={() => void leaveConversation()} className="inline-flex items-center gap-2 rounded-lg border border-rose-200 px-3 py-2 text-sm text-rose-700 hover:bg-rose-50 dark:border-rose-900 dark:text-rose-300 dark:hover:bg-rose-950/30"><LogOut size={16}/>대화방 나가기</button></div></section></div>}
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-auto p-6">
        {messages.map((message, index) => {
          const prevMessage = messages[index - 1];
          const currDate = new Date(message.createdAt).toDateString();
          const prevDate = prevMessage ? new Date(prevMessage.createdAt).toDateString() : null;
          const showDateDivider = currDate !== prevDate;

          const readAt = roomPreferences[activeId]?.readAt || 0;
          const isFirstUnread = readAt > 0 && message.createdAt > readAt && (!prevMessage || prevMessage.createdAt <= readAt);

          const isMe = message.senderId === currentUser.id;
          const timeStr = new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

          return (
            <React.Fragment key={message.id}>
              {showDateDivider && (
                <div className="flex justify-center my-3 w-full">
                  <span className="px-3 py-1 rounded-full bg-stone-200/70 dark:bg-stone-800 text-stone-500 dark:text-stone-400 text-[11px] font-medium">
                    {new Date(message.createdAt).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })}
                  </span>
                </div>
              )}

              {isFirstUnread && (
                <div className="flex justify-center my-3 w-full">
                  <span className="px-3.5 py-1 rounded-full bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 text-[11px] font-bold border border-indigo-500/20">
                    여기서부터 읽지 않은 메시지입니다.
                  </span>
                </div>
              )}

              {message.isDeleted ? (
                <div className="flex justify-center my-2 w-full">
                  <span className="px-3 py-1 rounded-full bg-stone-200/80 dark:bg-stone-800 text-stone-500 dark:text-stone-400 text-[11px] font-medium tracking-tight">
                    사용자에 의해 삭제된 메시지입니다.
                  </span>
                </div>
              ) : (
                <article
                  onContextMenu={(event) => {
                    if (isMe) {
                      event.preventDefault();
                      event.stopPropagation();
                      setMessageContextMenu({
                        x: Math.min(event.clientX, window.innerWidth - 220),
                        y: Math.min(event.clientY, window.innerHeight - 200),
                        message,
                      });
                    }
                  }}
                  className={`flex items-end gap-1.5 w-full ${isMe ? 'justify-end' : 'justify-start'}`}
                >
                  {isMe && (
                    <time className="text-[10px] text-stone-400 dark:text-stone-500 shrink-0 pb-0.5 tabular-nums">
                      {timeStr}
                    </time>
                  )}

                  <div className={`max-w-[min(75%,720px)] rounded-2xl px-4 py-3 shadow-sm ${isMe ? 'bg-indigo-600 text-white rounded-br-xs' : 'border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900 rounded-bl-xs'}`}>
                    {!isMe && (
                      <div className="mb-1 text-[11px] font-bold text-stone-500 dark:text-stone-400">
                        {message.senderName}
                      </div>
                    )}
                    {message.text && <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{message.text}</p>}
                    {message.attachment && ((message.attachment.mimeType || '').startsWith('image/') ? (
                      <a
                        href={isClientMode ? `#${message.attachment.id}` : resolveApiUrl(`/api/chat/attachments/${encodeURIComponent(message.attachment.id)}`)}
                        onClick={event => {
                          event.preventDefault();
                          if (isClientMode) void downloadLocalAttachment(message.attachment!.id);
                          else setImagePreview({ src: resolveApiUrl(`/api/chat/attachments/${encodeURIComponent(message.attachment!.id)}?inline=1`), filename: message.attachment!.filename });
                        }}
                        className="mt-2 block"
                      >
                        <img
                          src={isClientMode ? undefined : resolveApiUrl(`/api/chat/attachments/${encodeURIComponent(message.attachment.id)}?inline=1`)}
                          alt={message.attachment.filename || '이미지'}
                          title="이미지 크게 보기"
                          onError={(e) => {
                            const target = e.currentTarget;
                            target.onerror = null;
                            target.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="160" height="120" viewBox="0 0 24 24" fill="none" stroke="%239ca3af" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>';
                          }}
                          className="max-h-80 max-w-full cursor-zoom-in rounded-lg object-contain bg-stone-100 dark:bg-stone-800"
                        />
                        <span className="mt-1 flex items-center gap-1 text-xs underline">
                          <ArrowDownToLine size={14}/>{message.attachment.filename || '첨부파일'}
                        </span>
                      </a>
                    ) : (
                      <a
                        className={`mt-2 flex items-center gap-2 rounded-lg p-2 text-sm underline ${isMe ? 'bg-indigo-700' : 'bg-stone-100 dark:bg-stone-800'}`}
                        href={isClientMode ? `#${message.attachment.id}` : resolveApiUrl(`/api/chat/attachments/${encodeURIComponent(message.attachment.id)}`)}
                        onClick={isClientMode ? event => { event.preventDefault(); void downloadLocalAttachment(message.attachment!.id); } : undefined}
                      >
                        <ArrowDownToLine size={16}/>
                        <span className="truncate">{message.attachment.filename || '첨부파일'}</span>
                        <small>({(message.attachment.size / 1024 / 1024).toFixed(1)} MB)</small>
                      </a>
                    ))}
                    {message.document && (
                      <button
                        onClick={() => {
                          localStorage.setItem('wonbee_active_doc_id', message.document!.id);
                          window.open('/', '_blank', 'noopener');
                        }}
                        className={`mt-2 flex items-center gap-2 rounded-lg p-2 text-sm underline ${isMe ? 'bg-indigo-700' : 'bg-stone-100 dark:bg-stone-800'}`}
                      >
                        <FileText size={16}/>
                        {message.document.title} 열기
                      </button>
                    )}
                  </div>

                  {!isMe && (
                    <time className="text-[10px] text-stone-400 dark:text-stone-500 shrink-0 pb-0.5 tabular-nums">
                      {timeStr}
                    </time>
                  )}
                </article>
              )}
            </React.Fragment>
          );
        })}
        {activeConversation && !messages.length && <p className="pt-10 text-center text-sm text-stone-400">첫 메시지를 보내 대화를 시작하세요.</p>}
      </div>

      {messageContextMenu && (
        <div
          className="fixed z-[99999] w-48 bg-white dark:bg-stone-900 rounded-xl shadow-2xl border border-stone-200 dark:border-stone-700 py-1 text-xs font-medium text-stone-700 dark:text-stone-200 animate-in fade-in zoom-in-95 duration-100"
          style={{ top: messageContextMenu.y, left: messageContextMenu.x }}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(messageContextMenu.message.text);
              setMessageContextMenu(null);
            }}
            className="w-full px-3 py-2 text-left hover:bg-stone-100 dark:hover:bg-stone-800 flex items-center gap-2 cursor-pointer transition-colors"
          >
            <Copy size={13} className="text-amber-500" />
            <span>복사</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setDraft(messageContextMenu.message.text);
              setEditingMessageId(messageContextMenu.message.id);
              setMessageContextMenu(null);
            }}
            className="w-full px-3 py-2 text-left hover:bg-stone-100 dark:hover:bg-stone-800 flex items-center gap-2 cursor-pointer transition-colors"
          >
            <Edit2 size={13} className="text-sky-500" />
            <span>수정</span>
          </button>
          <div className="my-1 border-t border-stone-100 dark:border-stone-800" />
          <button
            type="button"
            onClick={async () => {
              const msgId = messageContextMenu.message.id;
              setMessageContextMenu(null);
              setMessages((prev) => prev.filter((m) => m.id !== msgId));
              if (!isClientMode) {
                try {
                  await api(`/api/chat/messages/${encodeURIComponent(msgId)}?scope=everyone`, { method: 'DELETE' });
                } catch (err) {
                  console.warn('Failed to delete message for everyone:', err);
                }
              }
            }}
            className="w-full px-3 py-2 text-left hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600 dark:text-rose-400 flex items-center gap-2 cursor-pointer transition-colors"
          >
            <Trash2 size={13} />
            <span>모두에게서 삭제</span>
          </button>
          <button
            type="button"
            onClick={async () => {
              const msgId = messageContextMenu.message.id;
              setMessageContextMenu(null);
              setMessages((prev) => prev.filter((m) => m.id !== msgId));
              if (!isClientMode) {
                try {
                  await api(`/api/chat/messages/${encodeURIComponent(msgId)}?scope=me`, { method: 'DELETE' });
                } catch (err) {
                  console.warn('Failed to delete message for me:', err);
                }
              }
            }}
            className="w-full px-3 py-2 text-left hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600 dark:text-rose-400 flex items-center gap-2 cursor-pointer transition-colors"
          >
            <Trash2 size={13} />
            <span>나에게만 삭제</span>
          </button>
        </div>
      )}
      <form onSubmit={sendMessage} className="border-t border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900">{(file || selectedDocument) && <div className="mb-2 flex items-center gap-2 text-xs text-stone-600 dark:text-stone-300">{file ? <Paperclip size={14}/> : <FileText size={14}/>}<span className="truncate">{file?.name || selectedDocument?.title}</span><button type="button" onClick={() => { setFile(null); setDocument(null); }} title="첨부 취소"><X size={14}/></button></div>}<div className="flex items-end gap-2"><label title="파일 첨부" className="cursor-pointer rounded-lg p-2 text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"><Paperclip size={19}/><input type="file" className="hidden" onChange={event => { const chosen = event.target.files?.[0]; if (chosen) { if (chosen.size > 20 * 1024 * 1024) setError('첨부 파일은 20MB 이하로 선택해 주세요.'); else { setFile(chosen); setDocument(null); } event.target.value = ''; } }}/></label><select title="문서 공유" value={selectedDocument?.id || ''} onChange={event => { const selected = documents.find(item => item.id === event.target.value) || null; setDocument(selected); setFile(null); }} className="max-w-48 rounded-lg border border-stone-300 bg-transparent px-2 py-2 text-xs dark:border-stone-700"><option value="">문서 공유</option>{documents.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select><textarea value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void sendMessage(event); } }} rows={1} placeholder="메시지를 입력하세요 (Enter 전송, Shift+Enter 줄바꿈)" className="max-h-32 min-h-10 flex-1 resize-y rounded-xl border border-stone-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-indigo-500 dark:border-stone-700"/><button disabled={!activeId || (!draft.trim() && !file && !selectedDocument)} title="전송" className="rounded-xl bg-indigo-600 p-2.5 text-white disabled:opacity-40"><Send size={18}/></button></div></form>
    </section>
  </main>;
}
