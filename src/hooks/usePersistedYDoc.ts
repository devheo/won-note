import { useEffect, useState } from 'react';
import * as Y from 'yjs';
import { wonbeeDexieDB } from '../services/storage/dexieDb';

const PERSIST_DEBOUNCE_MS = 750;
const COMPACT_AFTER_UPDATES = 80;
const COMPACT_IDLE_MS = 15_000;

/** Restore a local Yjs snapshot + update log, then persist incremental updates offline. */
export function usePersistedYDoc(doc: Y.Doc, storageKey: string) {
  const [readyStorageKey, setReadyStorageKey] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    let saveTimer: ReturnType<typeof setTimeout> | undefined;
    let compactTimer: ReturnType<typeof setTimeout> | undefined;
    let writes = Promise.resolve();
    let pendingUpdates: Uint8Array[] = [];
    let updatesSinceCompact = 0;

    const enqueue = (operation: () => Promise<void>) => {
      writes = writes.then(operation).catch(error => {
        console.warn('[WonNote] Could not persist local collaboration state:', error);
      });
      return writes;
    };

    const flush = () => {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = undefined;
      if (!pendingUpdates.length) return writes;
      const batch = pendingUpdates;
      pendingUpdates = [];
      updatesSinceCompact += batch.length;
      const merged = Y.mergeUpdates(batch);
      return enqueue(() => wonbeeDexieDB.appendCollaborationUpdate(storageKey, merged));
    };

    const compact = () => {
      if (compactTimer) clearTimeout(compactTimer);
      compactTimer = undefined;
      return flush().then(() => enqueue(async () => {
        const snapshot = Y.encodeStateAsUpdate(doc);
        await wonbeeDexieDB.compactCollaborationUpdates(storageKey, snapshot);
        updatesSinceCompact = 0;
      }));
    };

    const schedulePersist = () => {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        void flush();
        if (updatesSinceCompact >= COMPACT_AFTER_UPDATES) void compact();
        else {
          if (compactTimer) clearTimeout(compactTimer);
          compactTimer = setTimeout(() => { void compact(); }, COMPACT_IDLE_MS);
        }
      }, PERSIST_DEBOUNCE_MS);
    };

    const handleUpdate = (update: Uint8Array, origin: unknown) => {
      if (origin === 'local-restore' || disposed) return;
      pendingUpdates.push(update);
      schedulePersist();
    };

    doc.on('update', handleUpdate);
    void (async () => {
      try {
        const [snapshot, updates] = await Promise.all([
          wonbeeDexieDB.loadCollaborationDoc(storageKey),
          wonbeeDexieDB.loadCollaborationUpdates(storageKey),
        ]);
        if (disposed) return;
        if (snapshot?.length) Y.applyUpdate(doc, snapshot, 'local-restore');
        for (const update of updates) Y.applyUpdate(doc, update, 'local-restore');
      } catch (error) {
        console.warn('[WonNote] Could not restore local collaboration state:', error);
      } finally {
        if (!disposed) setReadyStorageKey(storageKey);
      }
    })();

    return () => {
      disposed = true;
      doc.off('update', handleUpdate);
      if (saveTimer) clearTimeout(saveTimer);
      if (compactTimer) clearTimeout(compactTimer);
      // Flush only accumulated deltas; avoid serializing the complete document on every edit/unmount.
      if (pendingUpdates.length) {
        const batch = pendingUpdates;
        pendingUpdates = [];
        const merged = Y.mergeUpdates(batch);
        void enqueue(() => wonbeeDexieDB.appendCollaborationUpdate(storageKey, merged));
      }
    };
  }, [doc, storageKey]);

  return readyStorageKey === storageKey;
}
