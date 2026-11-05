import React, { useEffect, useMemo, useState } from 'react';
import { Clock3, RotateCcw, Search, X } from 'lucide-react';
import type { DocumentHistoryEntry } from '../../services/documentHistoryService';
import { loadHistory } from '../../services/documentHistoryService';

interface Props {
  itemKey: string;
  title: string;
  serverMode: boolean;
  tableId?: string;
  currentContent: string;
  revision: number;
  onClose: () => void;
  onRestore: (content: string) => void;
}

const toPlainText = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/\s+/g, ' ').trim();

export const DocumentHistoryPanel: React.FC<Props> = ({ itemKey, title, serverMode, tableId, currentContent, revision, onClose, onRestore }) => {
  const [entries, setEntries] = useState<DocumentHistoryEntry[]>([]);
  const [selected, setSelected] = useState<DocumentHistoryEntry | null>(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const currentText = useMemo(() => toPlainText(currentContent), [currentContent]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    const timer = setTimeout(() => {
      void loadHistory(itemKey, serverMode, tableId, query).then(items => {
        if (!active) return;
        setEntries(items);
        setSelected(current => current && items.some(item => item.id === current.id) ? current : items[0] || null);
      }).finally(() => { if (active) setLoading(false); });
    }, query ? 250 : 0);
    return () => { active = false; clearTimeout(timer); };
  }, [itemKey, serverMode, tableId, query, revision]);

  const restore = () => {
    if (!selected || !window.confirm(`“${new Date(selected.createdAt).toLocaleString()}” 버전으로 복원할까요? 현재 내용은 새 이력으로 보관됩니다.`)) return;
    onRestore(selected.content);
  };

  return <div className="fixed inset-0 z-[13000] flex justify-end bg-black/25" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <aside className="flex h-full w-full max-w-3xl flex-col border-l border-stone-200 bg-white shadow-2xl dark:border-stone-700 dark:bg-stone-900" aria-label={`${title} 문서 이력`}>
      <header className="flex items-center justify-between border-b border-stone-200 px-5 py-4 dark:border-stone-700"><div className="flex items-center gap-3"><span className="rounded-xl bg-indigo-100 p-2 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"><Clock3 size={18} /></span><div><h2 className="text-base font-bold text-stone-900 dark:text-stone-100">문서 이력</h2><p className="text-xs text-stone-500">{title} · {serverMode ? '사내 서버 이력' : '이 기기에 저장된 이력'}</p></div></div><button type="button" aria-label="이력 닫기" onClick={onClose} className="rounded-lg p-2 text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"><X size={18} /></button></header>
      <div className="flex min-h-0 flex-1">
        <section className="flex w-72 shrink-0 flex-col border-r border-stone-200 dark:border-stone-700">
          <label className="m-3 flex items-center gap-2 rounded-lg border border-stone-200 px-3 py-2 dark:border-stone-700"><Search size={14} className="text-stone-400" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="이력 내용 검색" className="min-w-0 flex-1 bg-transparent text-xs outline-none" /></label>
          <div className="flex-1 overflow-y-auto px-2 pb-3">{loading && <p className="p-3 text-xs text-stone-400">이력을 불러오는 중…</p>}{!loading && entries.length === 0 && <p className="p-3 text-xs leading-5 text-stone-500">저장된 이력이 없습니다. 내용을 편집하면 자동으로 기록됩니다.</p>}{entries.map(entry => <button key={entry.id} type="button" onClick={() => setSelected(entry)} className={`mb-1 w-full rounded-lg p-3 text-left ${selected?.id === entry.id ? 'bg-indigo-50 ring-1 ring-indigo-300 dark:bg-indigo-950/40 dark:ring-indigo-800' : 'hover:bg-stone-50 dark:hover:bg-stone-800'}`}><span className="block text-xs font-semibold text-stone-800 dark:text-stone-100">{new Date(entry.createdAt).toLocaleString()}</span><span className="mt-1 block line-clamp-2 text-[11px] text-stone-500">{toPlainText(entry.content).slice(0, 150) || '내용 없음'}</span></button>)}</div>
        </section>
        <section className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3 dark:border-stone-700"><h3 className="text-xs font-bold text-stone-700 dark:text-stone-200">선택한 버전 미리보기</h3>{selected && <button type="button" onClick={restore} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-500"><RotateCcw size={13} />이 버전 복원</button>}</div>
          <div className="grid min-h-0 flex-1 grid-rows-2 divide-y divide-stone-200 dark:divide-stone-700"><div className="overflow-auto p-4"><div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-stone-400">선택 버전 {selected ? `· ${new Date(selected.createdAt).toLocaleString()}` : ''}</div><pre className="whitespace-pre-wrap break-words font-sans text-xs leading-5 text-stone-700 dark:text-stone-300">{selected ? toPlainText(selected.content) : '왼쪽에서 버전을 선택하세요.'}</pre></div><div className="overflow-auto p-4"><div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-stone-400">현재 버전</div><pre className="whitespace-pre-wrap break-words font-sans text-xs leading-5 text-stone-700 dark:text-stone-300">{currentText}</pre></div></div>
        </section>
      </div>
    </aside>
  </div>;
};
