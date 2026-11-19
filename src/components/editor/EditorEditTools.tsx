import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Editor } from '@tiptap/core';
import { DOMSerializer } from '@tiptap/pm/model';
import { ClipboardPaste, Copy, Scissors, Search, Undo2, Redo2, Replace } from 'lucide-react';
import { isLikelyMarkdown, markdownToHtml } from '../../utils/markdownHelper';

type Match = { from: number; to: number };

function findMatches(editor: Editor, query: string, caseSensitive: boolean): Match[] {
  if (!query) return [];
  const matches: Match[] = [];
  const needle = caseSensitive ? query : query.toLocaleLowerCase();
  editor.state.doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    const text = node.textContent;
    const source = caseSensitive ? text : text.toLocaleLowerCase();
    const offsets: number[] = [];
    node.descendants((child, childPos) => {
      if (child.isText) {
        for (let i = 0; i < child.text!.length; i++) offsets.push(pos + 1 + childPos + i);
      }
      return true;
    });
    let index = 0;
    while ((index = source.indexOf(needle, index)) !== -1) {
      const from = offsets[index];
      const to = offsets[index + query.length - 1];
      if (from !== undefined && to !== undefined) matches.push({ from, to: to + 1 });
      index += Math.max(query.length, 1);
    }
    return false;
  });
  return matches;
}

const buttonClass = 'inline-flex h-8 items-center gap-1 rounded-md border border-stone-200 bg-white px-2 text-xs text-stone-700 hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700';

export function EditorEditTools({ editor, onNotify }: { editor: Editor; onNotify?: (message: string) => void }) {
  const [query, setQuery] = useState('');
  const [replacement, setReplacement] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [activeMatch, setActiveMatch] = useState(-1);
  const [showPasteInput, setShowPasteInput] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [documentRevision, setDocumentRevision] = useState(0);
  useEffect(() => {
    const refresh = () => setDocumentRevision(revision => revision + 1);
    editor.on('transaction', refresh);
    return () => { editor.off('transaction', refresh); };
  }, [editor]);
  const matches = useMemo(() => findMatches(editor, query, caseSensitive), [editor, query, caseSensitive, documentRevision]);

  const selectMatch = (direction: 1 | -1) => {
    if (!matches.length) { setActiveMatch(-1); return; }
    const current = editor.state.selection.from;
    let next = -1;
    if (direction > 0) next = matches.findIndex(match => match.from >= editor.state.selection.to);
    else {
      for (let i = matches.length - 1; i >= 0; i--) {
        if (matches[i].to <= current) { next = i; break; }
      }
    }
    if (next < 0) next = direction > 0 ? 0 : matches.length - 1;
    setActiveMatch(next);
    editor.chain().focus().setTextSelection(matches[next]).scrollIntoView().run();
  };

  const copy = async (cut: boolean) => {
    const { from, to, empty } = editor.state.selection;
    if (empty) { onNotify?.('먼저 복사할 텍스트를 선택해주세요.'); return; }
    const text = editor.state.doc.textBetween(from, to, '\n');
    let copied = false;

    // Prefer the Clipboard API from the actual click gesture. This preserves
    // rich formatting when supported and gives a clear success signal.
    try {
      if (navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
        const wrapper = window.document.createElement('div');
        wrapper.appendChild(DOMSerializer.fromSchema(editor.schema).serializeFragment(editor.state.selection.content().content));
        await navigator.clipboard.write([new ClipboardItem({
          'text/html': new Blob([wrapper.innerHTML], { type: 'text/html' }),
          'text/plain': new Blob([text], { type: 'text/plain' }),
        })]);
        copied = true;
      }
    } catch { /* Try plain text, then the legacy browser copy command. */ }
    if (!copied) {
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(text);
          copied = true;
        }
      } catch { /* Continue with execCommand fallback. */ }
    }
    if (!copied) {
      const temporary = window.document.createElement('textarea');
      temporary.value = text;
      temporary.style.position = 'fixed';
      temporary.style.opacity = '0';
      window.document.body.appendChild(temporary);
      temporary.focus();
      temporary.select();
      try { copied = window.document.execCommand('copy'); } catch { copied = false; }
      temporary.remove();
      editor.view.focus();
    }
    if (copied) {
      if (cut) editor.chain().focus().setTextSelection({ from, to }).deleteSelection().run();
      else editor.view.focus();
      onNotify?.(cut ? '선택한 내용을 잘라냈습니다.' : '선택한 내용을 복사했습니다.');
    } else {
      editor.chain().focus().setTextSelection({ from, to }).run();
      onNotify?.('복사하지 못했습니다. 브라우저의 클립보드 권한을 확인해주세요.');
    }
  };

  const paste = async () => {
    const selection = { from: editor.state.selection.from, to: editor.state.selection.to };
    try {
      const text = await navigator.clipboard.readText();
      if (!text) { onNotify?.('클립보드에 붙여넣을 텍스트가 없습니다.'); return; }
      const content = isLikelyMarkdown(text) ? markdownToHtml(text) : [{ type: 'text', text }];
      editor.chain().focus().insertContentAt(selection, content).run();
    } catch {
      setPasteText('');
      setShowPasteInput(true);
    }
  };

  const insertPastedText = () => {
    if (!pasteText) return;
    const selection = { from: editor.state.selection.from, to: editor.state.selection.to };
    const content = isLikelyMarkdown(pasteText) ? markdownToHtml(pasteText) : [{ type: 'text', text: pasteText }];
    editor.chain().focus().insertContentAt(selection, content).run();
    setPasteText('');
    setShowPasteInput(false);
  };

  const replaceCurrent = () => {
    const { from, to } = editor.state.selection;
    const selected = editor.state.doc.textBetween(from, to, '\n');
    if (selected && (caseSensitive ? selected === query : selected.toLocaleLowerCase() === query.toLocaleLowerCase())) {
      if (replacement) editor.chain().focus().insertContentAt({ from, to }, [{ type: 'text', text: replacement }]).run();
      else editor.chain().focus().deleteRange({ from, to }).run();
      return;
    }
    selectMatch(1);
  };

  const replaceAll = () => {
    if (!matches.length) return;
    const transaction = editor.state.tr;
    [...matches].reverse().forEach(match => {
      if (replacement) transaction.insertText(replacement, match.from, match.to);
      else transaction.delete(match.from, match.to);
    });
    editor.view.dispatch(transaction);
    editor.view.focus();
  };

  return (
    <div className="flex min-w-max items-center gap-1.5 text-xs">
      <button type="button" className={buttonClass} title="실행 취소 (Ctrl+Z)" onMouseDown={event => event.preventDefault()} onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()}><Undo2 size={14}/>실행 취소</button>
      <button type="button" className={buttonClass} title="다시 실행 (Ctrl+Y)" onMouseDown={event => event.preventDefault()} onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()}><Redo2 size={14}/>다시 실행</button>
      <span className="mx-1 h-5 w-px bg-stone-200 dark:bg-stone-700"/>
      <button type="button" className={buttonClass} title="선택한 텍스트 잘라내기" onMouseDown={event => event.preventDefault()} onClick={() => void copy(true)}><Scissors size={14}/>잘라내기</button>
      <button type="button" className={buttonClass} title="선택한 텍스트 복사" onMouseDown={event => event.preventDefault()} onClick={() => void copy(false)}><Copy size={14}/>복사</button>
      <button type="button" className={buttonClass} title="클립보드 텍스트 붙여넣기" onMouseDown={event => event.preventDefault()} onClick={() => void paste()}><ClipboardPaste size={14}/>붙여넣기</button>
      <span className="mx-1 h-5 w-px bg-stone-200 dark:bg-stone-700"/>
      <label className="flex h-8 items-center gap-1 rounded-md border border-stone-200 bg-white px-2 dark:border-stone-700 dark:bg-stone-800"><Search size={14}/><input aria-label="찾을 내용" value={query} onChange={event => { setQuery(event.target.value); setActiveMatch(-1); }} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); selectMatch(event.shiftKey ? -1 : 1); } }} placeholder="찾기" className="w-28 bg-transparent outline-none"/></label>
      <button type="button" className={buttonClass} disabled={!query || !matches.length} onMouseDown={event => event.preventDefault()} onClick={() => selectMatch(-1)}>이전</button>
      <button type="button" className={buttonClass} disabled={!query || !matches.length} onMouseDown={event => event.preventDefault()} onClick={() => selectMatch(1)}>다음</button>
      <span className="min-w-12 text-center text-stone-500">{matches.length ? `${activeMatch >= 0 ? activeMatch + 1 : '–'}/${matches.length}` : '0개'}</span>
      <label className="flex h-8 items-center gap-1 rounded-md border border-stone-200 bg-white px-2 dark:border-stone-700 dark:bg-stone-800"><Replace size={14}/><input aria-label="바꿀 내용" value={replacement} onChange={event => setReplacement(event.target.value)} placeholder="바꾸기" className="w-24 bg-transparent outline-none"/></label>
      <button type="button" className={buttonClass} disabled={!query || !matches.length} onMouseDown={event => event.preventDefault()} onClick={replaceCurrent}>바꾸기</button>
      <button type="button" className={buttonClass} disabled={!query || !matches.length} onMouseDown={event => event.preventDefault()} onClick={replaceAll}>모두 바꾸기</button>
      <label className="flex items-center gap-1 px-1 text-stone-500"><input type="checkbox" checked={caseSensitive} onChange={event => setCaseSensitive(event.target.checked)}/>대소문자</label>
      {showPasteInput && createPortal(<div className="fixed inset-0 z-[13000] flex items-center justify-center bg-black/40 p-4" onMouseDown={event => { if (event.target === event.currentTarget) setShowPasteInput(false); }}>
        <div className="w-full max-w-xl rounded-xl border border-stone-200 bg-white p-4 shadow-2xl dark:border-stone-700 dark:bg-stone-900">
          <div className="mb-2 text-sm font-semibold text-stone-800 dark:text-stone-100">붙여넣을 내용을 여기에 넣으세요</div>
          <textarea autoFocus aria-label="붙여넣을 텍스트" value={pasteText} onChange={event => setPasteText(event.target.value)} onKeyDown={event => { if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') insertPastedText(); if (event.key === 'Escape') setShowPasteInput(false); }} placeholder="여기를 클릭한 뒤 Ctrl+V 또는 ⌘V를 누르세요" className="h-48 w-full resize-y rounded-lg border border-stone-300 bg-white p-3 text-sm outline-none focus:border-amber-500 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100" />
          <div className="mt-3 flex justify-end gap-2"><button type="button" onClick={() => setShowPasteInput(false)} className={buttonClass}>취소</button><button type="button" onClick={insertPastedText} disabled={!pasteText} className={buttonClass}>에디터에 삽입</button></div>
        </div>
      </div>, window.document.body)}
    </div>
  );
}
