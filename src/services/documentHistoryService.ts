import { fetchBridge } from './httpBridge';
import { wonbeeDexieDB, type DexieDocumentHistory } from './storage/dexieDb';

export type DocumentHistoryEntry = DexieDocumentHistory;

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID();
    } catch (_) {}
  }
  return 'hist_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 9);
}

export async function saveHistorySnapshot(input: Omit<DocumentHistoryEntry, 'id' | 'createdAt'> & { serverMode: boolean; tableId?: string }): Promise<DocumentHistoryEntry> {
  const entry: DocumentHistoryEntry = { ...input, id: generateUUID(), createdAt: Date.now() };
  await wonbeeDexieDB.saveDocumentHistory(entry, 50);
  if (input.serverMode) {
    try {
      const response = await fetchBridge('/api/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemKey: input.itemKey, tableId: input.tableId, title: input.title, content: input.content }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json() as DocumentHistoryEntry;
    } catch (error) {
      console.warn('[DocumentHistory] Server snapshot failed; the local snapshot is retained.', error);
    }
  }
  return entry;
}

export async function loadHistory(itemKey: string, serverMode: boolean, tableId?: string, query = ''): Promise<DocumentHistoryEntry[]> {
  if (serverMode) {
    try {
      const params = new URLSearchParams({ itemKey, limit: '100' });
      if (tableId) params.set('tableId', tableId);
      if (query.trim()) params.set('q', query.trim());
      const response = await fetchBridge(`/api/history?${params.toString()}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json() as { entries?: DocumentHistoryEntry[] };
      return payload.entries || [];
    } catch (error) {
      console.warn('[DocumentHistory] Server history unavailable; showing local snapshots.', error);
    }
  }
  return wonbeeDexieDB.searchDocumentHistory(query, itemKey, 100);
}
