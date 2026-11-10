import { authQuery, authRun, getAdminRowImages, deleteRowImage } from './db';
import { chatAttachmentsUseS3, deleteChatS3Object } from './chatS3';

export interface AdminFileItem {
  id: string;
  fileType: 'chat_attachment' | 'row_image';
  filename: string;
  mimeType: string;
  size: number;
  createdAt: number;
  storageType: 's3' | 'local' | 'sqlite';
  uploaderName?: string;
  downloadUrl: string;
  tableId?: string;
}

/**
 * Lists all uploaded files (chat attachments & table row images) for Master Admin Console.
 */
export async function listAdminFiles(): Promise<AdminFileItem[]> {
  const items: AdminFileItem[] = [];
  const mode = process.env.CHAT_ATTACHMENT_STORAGE?.trim().toLowerCase() || 'sqlite';

  // 1. Chat attachments (from auth_db / chat_attachments table)
  try {
    const chatRows = authQuery<any>(
      `SELECT a.id, a.conversation_id, a.uploader_id, a.filename, a.mime_type, a.size, a.created_at, a.storage_key, u.display_name, u.email
       FROM chat_attachments a
       LEFT JOIN auth_users u ON u.id = a.uploader_id
       ORDER BY a.created_at DESC`
    );

    for (const r of chatRows) {
      let storageType: 's3' | 'local' | 'sqlite' = 'sqlite';
      if (r.storage_key) {
        storageType = mode === 'local' ? 'local' : 's3';
      }
      items.push({
        id: r.id,
        fileType: 'chat_attachment',
        filename: r.filename || 'chat_attachment',
        mimeType: r.mime_type || 'application/octet-stream',
        size: Number(r.size) || 0,
        createdAt: Number(r.created_at) || Date.now(),
        storageType,
        uploaderName: r.display_name || r.email || '채팅 참여자',
        downloadUrl: `/api/chat/attachments/${r.id}`,
      });
    }
  } catch (err) {
    console.warn('[AdminFiles] Failed querying chat_attachments:', err);
  }

  // 2. Row images & Editor Assets (from main SQLite dbInstance row_images table)
  try {
    const imageRows = getAdminRowImages();
    const userMap = new Map<string, string>();

    try {
      const users = authQuery<any>('SELECT id, display_name, email FROM auth_users');
      users.forEach((u) => userMap.set(u.id, u.display_name || u.email));
    } catch (_) {}

    for (const r of imageRows) {
      const uploader = r.owner_id ? userMap.get(r.owner_id) : undefined;
      items.push({
        id: r.id,
        fileType: 'row_image',
        filename: `${r.id}.png`,
        mimeType: r.mime_type || 'image/png',
        size: r.size || 0,
        createdAt: r.created_at || Date.now(),
        storageType: 'sqlite',
        uploaderName: uploader || '에디터/테이블 작성자',
        downloadUrl: `/api/assets/${r.id}`,
        tableId: r.table_id,
      });
    }
  } catch (err) {
    console.warn('[AdminFiles] Failed querying row_images:', err);
  }

  return items.sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Deletes an uploaded file (chat attachment or row image) by ID.
 */
export async function deleteAdminFile(id: string, fileType?: string): Promise<boolean> {
  if (!id) return false;

  // Try chat attachment deletion
  const chatAtt = authQuery<any>('SELECT * FROM chat_attachments WHERE id = ?', [id])[0];
  if (chatAtt) {
    if (chatAtt.storage_key && chatAttachmentsUseS3()) {
      await deleteChatS3Object(chatAtt.storage_key).catch(() => {});
    }
    authRun('DELETE FROM chat_attachments WHERE id = ?', [id]);
    return true;
  }

  // Try row image deletion
  return deleteRowImage(id);
}
