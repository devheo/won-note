import React, { useRef, useState } from 'react';
import type { TableDocument, TreeItem, WonNoteDocument } from '../types';
import { packItem, unpackItem, materializeItem, packFolder, unpackFolder, materializeFolder, EXCHANGE_LIMIT, type SharedFolder } from '../utils/itemExchange';
import { currentNoteContent } from '../services/noteEditorBridge';
import { wonbeeDexieDB } from '../services/storage/dexieDb';
import { noteImageDataUrl } from '../utils/noteImageAssets';
import { fetchBridge } from '../services/httpBridge';

export type ReceivedItem = ReturnType<typeof materializeItem>;
const wonnoteFilename = (name: string) => `${name.trim().replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/g, '').slice(0, 100) || 'WON 노트'}.wonnote`;
export function useItemExchange(
  tree: TreeItem[],
  documents: Record<string, WonNoteDocument>,
  tables: Record<string, TableDocument>,
  onImport?: (item: ReceivedItem) => Promise<void | { discardLocalAssets: boolean }>,
  onImportFolder?: (folder: ReturnType<typeof materializeFolder>) => Promise<void | { discardLocalAssets: boolean }>,
) {
  const latest = useRef({ tree, documents, tables, onImport, onImportFolder });
  latest.current = { tree, documents, tables, onImport, onImportFolder };
  const input = useRef<HTMLInputElement>(null),
    locked = useRef(false);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [error, setError] = useState(false);
  const [pending, setPending] = useState<Awaited<ReturnType<typeof unpackItem>> | SharedFolder | null>(null);
  const [importParentId, setImportParentId] = useState<string | null>(null);
  const report = (message: string, error = false) => {
    setMessage(message);
    setError(error);
  };
  const lock = () => {
    locked.current = true;
    setBusy(true);
  };
  const unlock = () => {
    locked.current = false;
    setBusy(false);
  };
  const exportItem = async (itemId: string) => {
    if (locked.current) return;
    lock();
    report('교환 파일을 만드는 중…');
    try {
      const state = latest.current,
        treeItem = state.tree.find((item) => item.id === itemId);
      if (treeItem?.type === 'folder') {
        const subtree = new Set<string>([itemId]);
        let changed = true;
        while (changed) {
          changed = false;
          for (const child of state.tree) if (child.parentId && subtree.has(child.parentId) && !subtree.has(child.id)) { subtree.add(child.id); changed = true; }
        }
        const folderTree = state.tree.filter((item) => subtree.has(item.id));
        const documents = Object.fromEntries(folderTree.filter((item) => item.type === 'document' && state.documents[item.id]).map((item) => {
          const note = state.documents[item.id]; return [item.id, { ...note, content: currentNoteContent(item.id, note.content) }];
        }));
        const tables = Object.fromEntries(folderTree.filter((item) => item.type === 'table' && state.tables[item.id]).map((item) => [item.id, state.tables[item.id]]));
        const events: Record<string, any[]> = {}, layouts: Record<string, Record<string, unknown>> = {};
        for (const tableId of Object.keys(tables)) {
          events[tableId] = JSON.parse(localStorage.getItem(`wonbee_calendar_events_${tableId}`) || '[]');
          layouts[tableId] = JSON.parse(localStorage.getItem(`wonbee_memo_board_layout_${tableId}`) || '{}');
          if (localStorage.getItem('wonbee_use_server') !== 'false') {
            const response = await fetchBridge(`/api/events?tableId=${encodeURIComponent(tableId)}`);
            if (!response.ok) throw new Error('폴더 안 테이블의 일정 정보를 읽을 수 없습니다.');
            events[tableId] = await response.json();
          }
        }
        const bytes = await packFolder({ kind: 'folder', root: treeItem, tree: folderTree, documents, tables, events, layouts }, async (ref) => {
          const dataUrl = await noteImageDataUrl(ref.startsWith('/api/') || ref.startsWith('http') ? `asset://${ref.split('/').pop()}` : ref);
          if (!dataUrl) throw new Error('폴더 안의 이미지 파일을 읽을 수 없습니다.');
          const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/)!;
          return { mime: match[1], bytes: Uint8Array.from(atob(match[2]), (c) => c.charCodeAt(0)) };
        });
        const url = URL.createObjectURL(bytes), anchor = document.createElement('a');
        anchor.href = url; anchor.download = wonnoteFilename(treeItem.title); anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 30000);
        report(`“${treeItem.title}” 폴더와 하위 항목 ${Math.max(0, folderTree.length - 1)}개를 교환 파일로 내보냈습니다.`);
        return;
      }
      const note = state.documents[itemId],
        table = state.tables[itemId];
      if (!treeItem || (!note && !table)) throw new Error('전달할 항목이 없습니다.');
      const item = note ? { ...note, content: currentNoteContent(note.id, note.content) } : table;
      let events = [],
        layouts = {};
      if (table) {
        events = JSON.parse(localStorage.getItem(`wonbee_calendar_events_${itemId}`) || '[]');
        layouts = JSON.parse(localStorage.getItem(`wonbee_memo_board_layout_${itemId}`) || '{}');
        if (localStorage.getItem('wonbee_use_server') !== 'false') {
          const response = await fetchBridge(`/api/events?tableId=${encodeURIComponent(itemId)}`);
          if (!response.ok) throw new Error('테이블의 일정 정보를 읽을 수 없습니다.');
          events = await response.json();
        }
      }
      const bytes = await packItem(
        { kind: note ? 'document' : 'table', item, tree: treeItem, events, layouts },
        async (ref) => {
          let dataUrl = await noteImageDataUrl(
            ref.startsWith('/api/') || ref.startsWith('http') ? `asset://${ref.split('/').pop()}` : ref,
          );
          if (!dataUrl) throw new Error('전달할 첨부 이미지를 읽을 수 없습니다.');
          const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/)!;
          return { mime: match[1], bytes: Uint8Array.from(atob(match[2]), (c) => c.charCodeAt(0)) };
        },
      );
      const blob = new Blob([new Uint8Array(bytes).buffer], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob),
        anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = wonnoteFilename(item.title);
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      report('교환 파일을 내보냈습니다. 파일을 받는 쪽에서 가져오면 새 사본으로 추가됩니다.');
    } catch (e) {
      report((e as Error).message, true);
    } finally {
      unlock();
    }
  };
  const chooseImport = (parentId: string | null = null) => {
    if (!locked.current && !pending) { setImportParentId(parentId); input.current?.click(); }
  };
  const inspect = async (file?: File) => {
    if (!file || locked.current) return;
    lock();
    report('교환 파일을 확인하는 중…');
    try {
      if (file.size > EXCHANGE_LIMIT) throw new Error('250MB 이하의 교환 파일을 선택해주세요.');
      const bytes = new Uint8Array(await file.arrayBuffer());
      try { setPending(await unpackFolder(bytes)); }
      catch { setPending(await unpackItem(bytes)); }
      report('');
    } catch (e) {
      report((e as Error).message, true);
    } finally {
      unlock();
    }
  };
  const apply = async () => {
    if (!pending || locked.current) return;
    lock();
    const received = pending.kind === 'folder' ? materializeFolder(pending, importParentId) : materializeItem(pending, importParentId);
    try {
      if (received.kind === 'folder' ? !latest.current.onImportFolder : !latest.current.onImport) throw new Error('가져오기 기능을 사용할 수 없습니다.');
      await wonbeeDexieDB.assets.bulkPut(
        received.assets.map((asset) => ({
          id: asset.id,
          blob: new Blob([new Uint8Array(asset.bytes).buffer], { type: asset.mime }),
          filename: `${asset.id}.${asset.mime.split('/')[1]}`,
          mime_type: asset.mime,
          created_at: Date.now(),
          is_dirty: 1,
        })),
      );
      const result = received.kind === 'folder'
        ? await latest.current.onImportFolder!(received)
        : await latest.current.onImport!(received);
      if (result && result.discardLocalAssets)
        await wonbeeDexieDB.assets.bulkDelete(received.assets.map((asset) => asset.id));
      setPending(null);
      setImportParentId(null);
      report(received.kind === 'folder'
        ? `“${received.root.title}” 폴더와 하위 항목을 추가했습니다.`
        : `“${received.item.title}”을 새 항목으로 추가했습니다.`);
    } catch (e) {
      await wonbeeDexieDB.assets.bulkDelete(received.assets.map((asset) => asset.id));
      report((e as Error).message, true);
    } finally {
      unlock();
    }
  };
  const ui = (
    <>
      <input
        type="file"
        ref={input}
        accept=".wonnote"
        aria-label="교환 파일 선택"
        className="hidden"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = '';
          void inspect(file);
        }}
      />
      {message && (
        <div
          role={error ? 'alert' : 'status'}
          className="fixed right-4 bottom-10 z-[11000] max-w-md rounded-xl border bg-white dark:bg-stone-900 p-4 text-xs shadow-xl"
        >
          {message}
          {!busy && (
            <button type="button" aria-label="교환 알림 닫기" className="ml-3 underline" onClick={() => report('')}>
              닫기
            </button>
          )}
        </div>
      )}
      {pending && (
        <div className="fixed inset-0 z-[11002] flex items-center justify-center bg-black/40 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="exchange-title"
            className="w-full max-w-md rounded-2xl bg-white dark:bg-stone-900 p-6 shadow-xl text-sm"
          >
            <h2 id="exchange-title" className="text-lg font-bold">
              교환 파일 가져오기
            </h2>
            <p className="mt-3 break-all">{pending.kind === 'folder' ? pending.root.title : pending.item.title}</p>
            <p className="mt-2">
              {pending.kind === 'folder'
                ? `하위 항목 ${pending.tree.length - 1}개 · 노트 ${Object.keys(pending.documents).length}개 · 테이블 ${Object.keys(pending.tables).length}개`
                : `${pending.kind === 'document' ? '노트' : `테이블 · ${(pending.item as TableDocument).rows.length}행`} · 이미지 ${pending.assets.length}개`}
            </p>
            <p className="mt-3 text-stone-500">
              기존 항목은 유지하고 새 ID의 사본으로 추가합니다. 폴더는 하위 구조를 유지합니다.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => setPending(null)}
                className="rounded border px-4 py-2"
              >
                취소
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void apply()}
                className="rounded bg-amber-500 px-4 py-2 font-bold text-stone-950"
              >
                새 사본으로 가져오기
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
  return { busy, exportItem, chooseImport, ui };
}
