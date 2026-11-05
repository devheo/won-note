import { useEffect, useState } from 'react';
import * as Y from 'yjs';
import { wonbeeDexieDB } from '../services/storage/dexieDb';

/** Restores a local Yjs snapshot before the editor seeds initial content, then keeps a debounced offline copy. */
export function usePersistedYDoc(doc: Y.Doc, storageKey: string) {
  const [readyStorageKey, setReadyStorageKey] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    let saveTimer: ReturnType<typeof setTimeout> | undefined;
    const handleUpdate = () => {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        void wonbeeDexieDB.saveCollaborationDoc(storageKey, Y.encodeStateAsUpdate(doc)).catch(error => {
          console.warn('[WonNote] Could not persist local collaboration state:', error);
        });
      }, 250);
    };

    doc.on('update', handleUpdate);
    void wonbeeDexieDB.loadCollaborationDoc(storageKey).then(update => {
      if (disposed) return;
      if (update?.length) Y.applyUpdate(doc, update, 'local-restore');
      setReadyStorageKey(storageKey);
    }).catch(error => {
      console.warn('[WonNote] Could not restore local collaboration state:', error);
      if (!disposed) setReadyStorageKey(storageKey);
    });

    return () => {
      disposed = true;
      doc.off('update', handleUpdate);
      if (saveTimer) clearTimeout(saveTimer);
      void wonbeeDexieDB.saveCollaborationDoc(storageKey, Y.encodeStateAsUpdate(doc)).catch(error => {
        console.warn('[WonNote] Could not flush local collaboration state:', error);
      });
    };
  }, [doc, storageKey]);

  return readyStorageKey === storageKey;
}
