export type ClientChatMessage = {
  id: string;
  conversationId: 'self';
  senderId: 'local-self';
  senderName: string;
  text: string;
  createdAt: number;
  attachment?: { id: string; filename: string; mimeType: string; size: number };
  document?: { id: string; title: string };
};

type StoredAttachment = { id: string; blob: Blob; filename: string; mimeType: string; size: number };
const DATABASE_NAME = 'wonbee_client_chat';
const DATABASE_VERSION = 1;
export const newClientChatId = () => globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains('messages')) database.createObjectStore('messages', { keyPath: 'id' });
      if (!database.objectStoreNames.contains('attachments')) database.createObjectStore('attachments', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('로컬 채팅 저장소를 열지 못했습니다.'));
  });
}

export async function listClientChatMessages(): Promise<ClientChatMessage[]> {
  const database = await openDatabase();
  try {
    const rows = await new Promise<ClientChatMessage[]>((resolve, reject) => {
      const request = database.transaction('messages', 'readonly').objectStore('messages').getAll();
      request.onsuccess = () => resolve(request.result as ClientChatMessage[]);
      request.onerror = () => reject(request.error);
    });
    return rows.sort((a, b) => a.createdAt - b.createdAt);
  } finally { database.close(); }
}

export async function saveClientChatMessage(message: ClientChatMessage): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const request = database.transaction('messages', 'readwrite').objectStore('messages').put(message);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } finally { database.close(); }
}

export async function saveClientChatAttachment(file: File): Promise<ClientChatMessage['attachment']> {
  const attachment: StoredAttachment = { id: newClientChatId(), blob: file, filename: file.name, mimeType: file.type || 'application/octet-stream', size: file.size };
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const request = database.transaction('attachments', 'readwrite').objectStore('attachments').put(attachment);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } finally { database.close(); }
  return { id: attachment.id, filename: attachment.filename, mimeType: attachment.mimeType, size: attachment.size };
}

export async function getClientChatAttachment(id: string): Promise<StoredAttachment | null> {
  const database = await openDatabase();
  try {
    return await new Promise<StoredAttachment | null>((resolve, reject) => {
      const request = database.transaction('attachments', 'readonly').objectStore('attachments').get(id);
      request.onsuccess = () => resolve((request.result as StoredAttachment | undefined) || null);
      request.onerror = () => reject(request.error);
    });
  } finally { database.close(); }
}

export const CLIENT_CHAT_CHANNEL = 'wonbee-client-chat';
