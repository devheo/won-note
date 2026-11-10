import { randomUUID } from 'node:crypto';
import { authQuery, authRun } from './db';
import { chatAttachmentsUseS3, deleteChatS3Object, getChatS3Object, putChatS3Object } from './chatS3';

export type ChatUser = { id: string; email: string; displayName: string };
export type ChatConversation = { id: string; type: 'direct' | 'group'; title: string; createdAt: number; members: ChatUser[] };
export type ChatMessage = {
  id: string; conversationId: string; senderId: string; senderName: string; text: string; createdAt: number;
  isDeleted?: boolean;
  attachment?: { id: string; filename: string; mimeType: string; size: number };
  document?: { id: string; title: string };
};

export function initChatStorage() {
  authRun(`CREATE TABLE IF NOT EXISTS chat_conversations(id TEXT PRIMARY KEY,type TEXT NOT NULL,title TEXT NOT NULL,created_at INTEGER NOT NULL)`);
  authRun(`CREATE TABLE IF NOT EXISTS chat_members(conversation_id TEXT NOT NULL,user_id TEXT NOT NULL,joined_at INTEGER NOT NULL,PRIMARY KEY(conversation_id,user_id))`);
  authRun(`CREATE TABLE IF NOT EXISTS chat_messages(id TEXT PRIMARY KEY,conversation_id TEXT NOT NULL,sender_id TEXT NOT NULL,text TEXT NOT NULL,created_at INTEGER NOT NULL,attachment_id TEXT,document_id TEXT,document_title TEXT)`);
  const msgColumns = authQuery<any>('PRAGMA table_info(chat_messages)');
  if (!msgColumns.some(column => column.name === 'is_deleted')) authRun('ALTER TABLE chat_messages ADD COLUMN is_deleted INTEGER DEFAULT 0');
  authRun(`CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation ON chat_messages(conversation_id,created_at DESC)`);
  authRun(`CREATE TABLE IF NOT EXISTS chat_attachments(id TEXT PRIMARY KEY,conversation_id TEXT NOT NULL,uploader_id TEXT NOT NULL,filename TEXT NOT NULL,mime_type TEXT NOT NULL,size INTEGER NOT NULL,content BLOB NOT NULL,created_at INTEGER NOT NULL)`);
  const attachmentColumns = authQuery<any>('PRAGMA table_info(chat_attachments)');
  if (!attachmentColumns.some(column => column.name === 'storage_key')) authRun('ALTER TABLE chat_attachments ADD COLUMN storage_key TEXT');
}

export function listChatUsers(): ChatUser[] {
  return authQuery<any>(`SELECT id,email,display_name FROM auth_users WHERE status='active' ORDER BY lower(display_name),lower(email)`)
    .map(user => ({ id: user.id, email: user.email, displayName: user.display_name || user.email }));
}

export function isChatMember(conversationId: string, userId: string) {
  return authQuery('SELECT 1 AS allowed FROM chat_members WHERE conversation_id=? AND user_id=?', [conversationId, userId]).length > 0;
}

function membersFor(conversationId: string): ChatUser[] {
  return authQuery<any>(`SELECT u.id,u.email,u.display_name FROM chat_members m JOIN auth_users u ON u.id=m.user_id WHERE m.conversation_id=? AND u.status='active' ORDER BY lower(u.display_name),lower(u.email)`, [conversationId])
    .map(user => ({ id: user.id, email: user.email, displayName: user.display_name || user.email }));
}

export function listChatConversations(userId: string): ChatConversation[] {
  return authQuery<any>(`SELECT c.id,c.type,c.title,c.created_at FROM chat_conversations c JOIN chat_members m ON m.conversation_id=c.id WHERE m.user_id=? ORDER BY COALESCE((SELECT MAX(created_at) FROM chat_messages WHERE conversation_id=c.id),c.created_at) DESC`, [userId])
    .map(row => {
      const members = membersFor(row.id);
      const other = members.find(member => member.id !== userId);
      const title = row.type === 'direct' && (!row.title || row.title === '새 그룹 대화') ? other?.displayName || '1:1 대화' : row.title || '새 그룹 대화';
      return { id: row.id, type: row.type, title, createdAt: row.created_at, members };
    });
}

export function createChatConversation(userId: string, type: 'direct' | 'group', title: string, memberIds: string[]) {
  const members = [...new Set([...memberIds, userId])];
  if (type === 'direct' && members.length !== 2) throw new Error('1:1 대화는 두 명을 선택해 주세요.');
  if (type === 'group' && members.length < 2) throw new Error('그룹 대화 구성원을 선택해 주세요.');
  if (members.length > 100) throw new Error('대화 구성원은 100명까지 추가할 수 있습니다.');
  const activeIds = new Set(listChatUsers().map(user => user.id));
  if (members.some(id => !activeIds.has(id))) throw new Error('사용할 수 없는 계정이 포함되어 있습니다.');
  if (type === 'direct') {
    const existing = listChatConversations(userId).find(conversation => conversation.type === 'direct' && conversation.members.length === 2 && members.every(id => conversation.members.some(member => member.id === id)));
    if (existing) return existing;
  } else {
    const memberSet = new Set(members);
    const existing = listChatConversations(userId).find(conversation =>
      conversation.type === 'group' &&
      conversation.members.length === memberSet.size &&
      conversation.members.every(member => memberSet.has(member.id))
    );
    if (existing) return existing;
  }
  const id = randomUUID();
  const now = Date.now();
  authRun('INSERT INTO chat_conversations(id,type,title,created_at) VALUES(?,?,?,?)', [id, type, type === 'direct' ? '' : (title || '').trim().slice(0, 100) || '새 그룹 대화', now]);
  members.forEach(memberId => authRun('INSERT INTO chat_members(conversation_id,user_id,joined_at) VALUES(?,?,?)', [id, memberId, now]));
  return { id, type, title: type === 'direct' ? '' : (title || '').trim().slice(0, 100) || '새 그룹 대화', createdAt: now, members: membersFor(id) } as ChatConversation;
}

export function updateChatConversation(conversationId: string, userId: string, title: string, memberIds: string[]) {
  if (!isChatMember(conversationId, userId)) throw new Error('대화 참여자만 방을 관리할 수 있습니다.');
  const conversation = authQuery<any>('SELECT type FROM chat_conversations WHERE id=?', [conversationId])[0];
  if (!conversation || conversation.type !== 'group') throw new Error('그룹 대화만 관리할 수 있습니다.');
  const cleanTitle = String(title || '').trim().slice(0, 100);
  if (!cleanTitle) throw new Error('대화방 이름을 입력해 주세요.');
  const members = [...new Set([...memberIds, userId])];
  if (members.length < 2 || members.length > 100) throw new Error('그룹 대화 구성원은 2명 이상 100명 이하로 설정해 주세요.');
  const activeIds = new Set(listChatUsers().map(user => user.id));
  if (members.some(id => !activeIds.has(id))) throw new Error('사용할 수 없는 계정이 포함되어 있습니다.');
  const currentIds = authQuery<any>('SELECT user_id FROM chat_members WHERE conversation_id=?', [conversationId]).map(row => row.user_id as string);
  authRun('UPDATE chat_conversations SET title=? WHERE id=?', [cleanTitle, conversationId]);
  currentIds.filter(id => !members.includes(id)).forEach(id => authRun('DELETE FROM chat_members WHERE conversation_id=? AND user_id=?', [conversationId, id]));
  members.filter(id => !currentIds.includes(id)).forEach(id => authRun('INSERT INTO chat_members(conversation_id,user_id,joined_at) VALUES(?,?,?)', [conversationId, id, Date.now()]));
  return { previousMemberIds: currentIds, conversation: listChatConversations(userId).find(item => item.id === conversationId)! };
}

export function renameChatConversation(conversationId: string, userId: string, title: string) {
  if (!isChatMember(conversationId, userId)) throw new Error('대화 참여자만 방 제목을 변경할 수 있습니다.');
  const cleanTitle = String(title || '').trim().slice(0, 100);
  if (!cleanTitle) throw new Error('대화방 이름을 입력해 주세요.');
  authRun('UPDATE chat_conversations SET title=? WHERE id=?', [cleanTitle, conversationId]);
  return listChatConversations(userId).find(item => item.id === conversationId)!;
}

export async function leaveChatConversation(conversationId: string, userId: string) {
  if (!isChatMember(conversationId, userId)) throw new Error('대화 참여자가 아닙니다.');
  authRun('DELETE FROM chat_members WHERE conversation_id=? AND user_id=?', [conversationId, userId]);
  const remaining = authQuery<any>('SELECT COUNT(*) AS count FROM chat_members WHERE conversation_id=?', [conversationId])[0]?.count || 0;
  if (!remaining) {
    const storageKeys = authQuery<any>('SELECT storage_key FROM chat_attachments WHERE conversation_id=? AND storage_key IS NOT NULL', [conversationId]).map(row => row.storage_key as string);
    await Promise.all(storageKeys.map(deleteChatS3Object));
    authRun('DELETE FROM chat_messages WHERE conversation_id=?', [conversationId]);
    authRun('DELETE FROM chat_attachments WHERE conversation_id=?', [conversationId]);
    authRun('DELETE FROM chat_conversations WHERE id=?', [conversationId]);
  }
}

export function listChatMessages(conversationId: string, userId: string, limit = 100): ChatMessage[] {
  if (!isChatMember(conversationId, userId)) throw new Error('대화 참여자만 메시지를 볼 수 있습니다.');
  const safeLimit = Math.min(Math.max(Math.floor(limit), 1), 100);
  return authQuery<any>(`SELECT m.id,m.conversation_id,m.sender_id,m.text,m.created_at,m.attachment_id,m.document_id,m.document_title,m.is_deleted,u.display_name,u.email,a.filename,a.mime_type,a.size FROM chat_messages m JOIN auth_users u ON u.id=m.sender_id LEFT JOIN chat_attachments a ON a.id=m.attachment_id WHERE m.conversation_id=? ORDER BY m.created_at DESC LIMIT ?`, [conversationId, safeLimit])
    .reverse().map(row => ({
      id: row.id, conversationId: row.conversation_id, senderId: row.sender_id,
      senderName: row.display_name || row.email, text: row.text, createdAt: row.created_at,
      isDeleted: Boolean(row.is_deleted),
      ...(row.attachment_id && !row.is_deleted ? { attachment: { id: row.attachment_id, filename: row.filename, mimeType: row.mime_type, size: row.size } } : {}),
      ...(row.document_id && !row.is_deleted ? { document: { id: row.document_id, title: row.document_title || row.document_id } } : {}),
    }));
}

export function createChatMessage(conversationId: string, userId: string, text: string, attachmentId?: string, document?: { id: string; title: string }) {
  if (!isChatMember(conversationId, userId)) throw new Error('대화 참여자만 메시지를 보낼 수 있습니다.');
  const messageText = String(text || '').trim().slice(0, 10000);
  if (!messageText && !attachmentId && !document) throw new Error('메시지 내용을 입력해 주세요.');
  if (attachmentId && !authQuery('SELECT 1 FROM chat_attachments WHERE id=? AND conversation_id=? AND uploader_id=?', [attachmentId, conversationId, userId]).length) throw new Error('첨부 파일을 확인할 수 없습니다.');
  let sharedDocument: { id: string; title: string } | undefined;
  if (document) {
    if (!document.id) throw new Error('공유할 문서 정보가 올바르지 않습니다.');
    const stored = authQuery<any>("SELECT value FROM workspace_meta WHERE key='documents'")[0]?.value;
    let docs: Record<string, { title?: string }> = {};
    try { docs = typeof stored === 'string' ? JSON.parse(stored) : {}; } catch { /* corrupted metadata cannot be shared */ }
    const saved = docs[document.id];
    if (!saved) throw new Error('공유할 문서를 찾을 수 없습니다.');
    sharedDocument = { id: document.id, title: String(saved.title || document.id) };
  }
  const id = randomUUID();
  authRun('INSERT INTO chat_messages(id,conversation_id,sender_id,text,created_at,attachment_id,document_id,document_title) VALUES(?,?,?,?,?,?,?,?)', [id, conversationId, userId, messageText, Date.now(), attachmentId || null, sharedDocument?.id || null, sharedDocument?.title || null]);
  return listChatMessages(conversationId, userId, 1)[0];
}

export async function saveChatAttachment(conversationId: string, userId: string, filename: string, mimeType: string, content: Uint8Array) {
  if (!isChatMember(conversationId, userId)) throw new Error('대화 참여자만 파일을 첨부할 수 있습니다.');
  if (!content.byteLength || content.byteLength > 20 * 1024 * 1024) throw new Error('첨부 파일은 20MB 이하로 선택해 주세요.');
  const id = randomUUID();
  const safeName = filename.replace(/[\\/\u0000-\u001f]/g, '_').slice(0, 180) || 'attachment';
  const safeMime = mimeType.slice(0, 120) || 'application/octet-stream';
  const storageKey = chatAttachmentsUseS3() ? `chat/${conversationId}/${id}` : null;
  if (storageKey) await putChatS3Object(storageKey, content, safeMime);
  try {
    authRun('INSERT INTO chat_attachments(id,conversation_id,uploader_id,filename,mime_type,size,content,created_at,storage_key) VALUES(?,?,?,?,?,?,?,?,?)', [id, conversationId, userId, safeName, safeMime, content.byteLength, storageKey ? new Uint8Array() : content, Date.now(), storageKey]);
  } catch (error) {
    if (storageKey) await deleteChatS3Object(storageKey).catch(() => {});
    throw error;
  }
  return { id, filename: safeName, mimeType: safeMime, size: content.byteLength };
}

export async function getChatAttachment(id: string, userId: string) {
  const row = authQuery<any>('SELECT a.* FROM chat_attachments a JOIN chat_members m ON m.conversation_id=a.conversation_id WHERE a.id=? AND m.user_id=?', [id, userId])[0];
  if (!row) return null;
  const content = row.storage_key ? await getChatS3Object(row.storage_key) : row.content as Uint8Array;
  return { filename: row.filename, mimeType: row.mime_type, content };
}

export function deleteChatMessage(messageId: string, userId: string, scope: 'everyone' | 'me') {
  const msg = authQuery<any>('SELECT sender_id FROM chat_messages WHERE id=?', [messageId])[0];
  if (!msg) return;
  if (scope === 'everyone') {
    if (msg.sender_id !== userId) throw new Error('자신이 보낸 메시지만 모두에게서 삭제할 수 있습니다.');
    authRun('UPDATE chat_messages SET text=?, attachment_id=NULL, document_id=NULL, document_title=NULL, is_deleted=1 WHERE id=?', ['사용자에 의해 삭제된 메시지입니다.', messageId]);
  }
}
