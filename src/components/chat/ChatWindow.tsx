import React, { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { ArrowDownToLine, Bell, BellOff, FileText, MessageCircle, Paperclip, Plus, Send, Users, X } from 'lucide-react';
import { useChatNotifications } from '../../hooks/useChatNotifications';
import { CLIENT_CHAT_CHANNEL, getClientChatAttachment, listClientChatMessages, newClientChatId, saveClientChatAttachment, saveClientChatMessage, type ClientChatMessage } from '../../services/storage/clientChatStore';
import { wonbeeDexieDB } from '../../services/storage/dexieDb';

type ChatUser = { id: string; email: string; displayName: string };
type Conversation = { id: string; type: 'direct' | 'group'; title: string; members: ChatUser[] };
type SharedFile = { id: string; filename: string; mimeType: string; size: number };
type SharedDocument = { id: string; title: string };
type Message = { id: string; conversationId: string; senderId: string; senderName: string; text: string; createdAt: number; attachment?: SharedFile; document?: SharedDocument };
type Presence = { userId: string; name: string; status: 'online' | 'away' | 'offline' };

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: 'include', ...init });
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
  const [selectedDocument, setDocument] = useState<SharedDocument | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [groupTitle, setGroupTitle] = useState('');
  const [groupMembers, setGroupMembers] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const socketRef = useRef<Socket | null>(null);
  const localChannelRef = useRef<BroadcastChannel | null>(null);
  const currentUserRef = useRef(currentUser);
  currentUserRef.current = currentUser;
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeConversation = conversations.find(conversation => conversation.id === activeId);
  const { permission: notificationPermission, notificationsEnabled, setNotificationsEnabled, supported: notificationsSupported } = useChatNotifications(isClientMode ? '__local__' : currentUser?.id || null);

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
    const socket = io({ withCredentials: true, transports: ['websocket', 'polling'] });
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
    socket.on('chat:message', (message: Message) => setMessages(previous => message.conversationId === activeIdRef.current && !previous.some(item => item.id === message.id) ? [...previous, message] : previous));
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
    void api<Message[]>(`/api/chat/conversations/${encodeURIComponent(activeId)}/messages`)
      .then(next => { if (!disposed) setMessages(current => [...new Map([...next, ...current].map(message => [message.id, message])).values()].filter(message => message.conversationId === activeId)); })
      .catch(reason => { if (!disposed) setError(reason instanceof Error ? reason.message : '메시지를 불러오지 못했습니다.'); });
    return () => { disposed = true; };
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
      const socket = socketRef.current;
      if (!socket?.connected) throw new Error('실시간 연결이 끊겼습니다. 잠시 후 다시 시도해 주세요.');
      socket.emit('chat:send', { conversationId: activeId, text: draft, attachmentId, document: selectedDocument || undefined }, (result: { ok: boolean; message?: Message; error?: string }) => {
        if (!result.ok) { setError(result.error || '메시지를 보내지 못했습니다.'); return; }
        if (result.message) setMessages(previous => previous.some(item => item.id === result.message!.id) ? previous : [...previous, result.message!]);
        setDraft(''); setFile(null); setDocument(null);
      });
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
      <div className="flex-1 overflow-auto p-2">{conversations.map(conversation => <button key={conversation.id} onClick={() => setActiveId(conversation.id)} className={`mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left ${activeId === conversation.id ? 'bg-indigo-50 text-indigo-950 dark:bg-indigo-950/50 dark:text-indigo-100' : 'hover:bg-stone-100 dark:hover:bg-stone-800'}`}><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-stone-200 text-stone-600 dark:bg-stone-700 dark:text-stone-200">{conversation.type === 'group' ? <Users size={17}/> : (conversation.title[0] || '?')}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{conversation.title}</span><span className="block truncate text-[11px] text-stone-500">{conversation.type === 'group' ? `${conversation.members.length}명 그룹` : conversation.members.find(member => member.id !== currentUser.id)?.email}</span></span>{conversation.type === 'direct' && <i className={`h-2 w-2 rounded-full ${presence[conversation.members.find(member => member.id !== currentUser.id)?.id || ''] === 'online' ? 'bg-emerald-500' : presence[conversation.members.find(member => member.id !== currentUser.id)?.id || ''] === 'away' ? 'bg-amber-400' : 'bg-stone-300'}`}/>}</button>)}{!conversations.length && <p className="p-4 text-center text-xs text-stone-500">아직 대화가 없습니다. + 버튼으로 대화를 시작하세요.</p>}</div>
      <footer className="border-t border-stone-200 px-4 py-3 text-[11px] text-stone-500 dark:border-stone-800">{isClientMode ? "이 대화는 이 브라우저의 로컬 저장소에 보관됩니다." : "접속 상태는 heartbeat로 동기화됩니다."}</footer>
    </aside>
    <section className="flex min-w-0 flex-1 flex-col">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-stone-200 bg-white px-6 dark:border-stone-800 dark:bg-stone-900"><div><h1 className="font-semibold">{activeConversation?.title || '대화를 선택하세요'}</h1>{activeConversation && <p className="text-xs text-stone-500">{activeConversation.members.map(member => member.displayName).join(' · ')}</p>}</div><div className="flex items-center gap-2">{notificationsSupported && <button onClick={async () => { const next = await setNotificationsEnabled(!notificationsEnabled); if (!notificationsEnabled && next === 'denied') setError('알림이 차단되어 있습니다. 브라우저 또는 OS 설정에서 WonNote 알림을 허용해 주세요.'); }} aria-pressed={notificationsEnabled} title={notificationPermission === 'denied' && !notificationsEnabled ? '알림 차단됨 — 브라우저 또는 OS 설정에서 허용해 주세요' : notificationsEnabled ? '새 메시지 알림 끄기' : '새 메시지 알림 켜기'} className={`rounded-lg p-2 hover:bg-stone-100 dark:hover:bg-stone-800 ${notificationsEnabled && notificationPermission === 'granted' ? 'text-indigo-600' : 'text-stone-500'}`}>{notificationsEnabled ? <Bell size={18}/> : <BellOff size={18}/>}</button>}<button onClick={() => window.close()} title="채팅 창 닫기" className="rounded-lg p-2 text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"><X size={18}/></button></div></header>
      {error && <div className="flex items-center justify-between bg-rose-50 px-5 py-2 text-xs text-rose-800 dark:bg-rose-950/40 dark:text-rose-200">{error}<button onClick={() => setError('')}><X size={14}/></button></div>}
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-auto p-6">{messages.map(message => <article key={message.id} className={`flex ${message.senderId === currentUser.id ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[min(75%,720px)] rounded-2xl px-4 py-3 shadow-sm ${message.senderId === currentUser.id ? 'bg-indigo-600 text-white' : 'border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900'}`}><div className={`mb-1 flex items-center gap-2 text-[11px] ${message.senderId === currentUser.id ? 'text-indigo-100' : 'text-stone-500'}`}><b>{message.senderName}</b><time>{new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></div>{message.text && <p className="whitespace-pre-wrap break-words text-sm">{message.text}</p>}{message.attachment && <a className={`mt-2 flex items-center gap-2 rounded-lg p-2 text-sm underline ${message.senderId === currentUser.id ? 'bg-indigo-700' : 'bg-stone-100 dark:bg-stone-800'}`} href={isClientMode ? `#${message.attachment.id}` : `/api/chat/attachments/${encodeURIComponent(message.attachment.id)}`} onClick={isClientMode ? event => { event.preventDefault(); void downloadLocalAttachment(message.attachment!.id); } : undefined}><ArrowDownToLine size={16}/><span className="truncate">{message.attachment.filename}</span><small>({(message.attachment.size / 1024 / 1024).toFixed(1)} MB)</small></a>}{message.document && <button onClick={() => { localStorage.setItem('wonbee_active_doc_id', message.document!.id); window.open('/', '_blank', 'noopener'); }} className={`mt-2 flex items-center gap-2 rounded-lg p-2 text-sm underline ${message.senderId === currentUser.id ? 'bg-indigo-700' : 'bg-stone-100 dark:bg-stone-800'}`}><FileText size={16}/>{message.document.title} 열기</button>}</div></article>)}{activeConversation && !messages.length && <p className="pt-10 text-center text-sm text-stone-400">첫 메시지를 보내 대화를 시작하세요.</p>}</div>
      <form onSubmit={sendMessage} className="border-t border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900">{(file || selectedDocument) && <div className="mb-2 flex items-center gap-2 text-xs text-stone-600 dark:text-stone-300">{file ? <Paperclip size={14}/> : <FileText size={14}/>}<span className="truncate">{file?.name || selectedDocument?.title}</span><button type="button" onClick={() => { setFile(null); setDocument(null); }} title="첨부 취소"><X size={14}/></button></div>}<div className="flex items-end gap-2"><label title="파일 첨부" className="cursor-pointer rounded-lg p-2 text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"><Paperclip size={19}/><input type="file" className="hidden" onChange={event => { const chosen = event.target.files?.[0]; if (chosen) { if (chosen.size > 20 * 1024 * 1024) setError('첨부 파일은 20MB 이하로 선택해 주세요.'); else { setFile(chosen); setDocument(null); } event.target.value = ''; } }}/></label><select title="문서 공유" value={selectedDocument?.id || ''} onChange={event => { const selected = documents.find(item => item.id === event.target.value) || null; setDocument(selected); setFile(null); }} className="max-w-48 rounded-lg border border-stone-300 bg-transparent px-2 py-2 text-xs dark:border-stone-700"><option value="">문서 공유</option>{documents.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select><textarea value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void sendMessage(event); } }} rows={1} placeholder="메시지를 입력하세요 (Enter 전송, Shift+Enter 줄바꿈)" className="max-h-32 min-h-10 flex-1 resize-y rounded-xl border border-stone-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-indigo-500 dark:border-stone-700"/><button disabled={!activeId || (!draft.trim() && !file && !selectedDocument)} title="전송" className="rounded-xl bg-indigo-600 p-2.5 text-white disabled:opacity-40"><Send size={18}/></button></div></form>
    </section>
  </main>;
}
