import { useCallback, useEffect, useMemo, useState } from 'react';
import { loadHistory, saveHistorySnapshot } from '../services/documentHistoryService';

export function useDocumentHistory(itemKey: string, title: string, content: string, serverMode: boolean, tableId?: string) {
  const [isOpen, setIsOpen] = useState(false);
  const [revision, setRevision] = useState(0);
  const recordNow = useCallback(async (contentOverride?: string) => {
    const snapshotContent = contentOverride ?? content;
    if (!snapshotContent.trim()) return;
    await saveHistorySnapshot({ itemKey, title, content: snapshotContent, author: '사용자', serverMode, tableId });
    setRevision(value => value + 1);
  }, [itemKey, title, content, serverMode, tableId]);

  useEffect(() => {
    if (!content.trim()) return;
    const timer = setTimeout(() => {
      void saveHistorySnapshot({ itemKey, title, content, author: '사용자', serverMode, tableId }).then(() => setRevision(value => value + 1));
    }, content.length > 250_000 ? 30_000 : 15_000);
    return () => clearTimeout(timer);
  }, [itemKey, title, content, serverMode, tableId]);

  const panelProps = useMemo(() => ({ itemKey, title, serverMode, tableId, revision }), [itemKey, title, serverMode, tableId, revision]);
  return { isOpen, setIsOpen: setIsOpen, recordNow, panelProps, loadHistory };
}
