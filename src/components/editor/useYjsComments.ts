import { useCallback, useEffect, useState } from 'react';
import type { Editor } from '@tiptap/react';
import * as Y from 'yjs';
import { absolutePositionToRelativePosition, relativePositionToAbsolutePosition } from '@tiptap/y-tiptap';
import { ySyncPluginKey } from '@tiptap/y-tiptap';
import { TextSelection } from '@tiptap/pm/state';

export interface YjsComment {
  id: string; author: string; text: string; createdAt: number; resolved: boolean;
  start: Uint8Array; end: Uint8Array;
}

function currentYState(editor: Editor) {
  const state = ySyncPluginKey.getState(editor.state);
  if (!state) throw new Error('Collaboration sync 상태를 아직 사용할 수 없습니다.');
  return state;
}

function removeCommentMarks(editor: Editor | null, commentIds: string[]) {
  if (!editor || editor.isDestroyed) return;
  const markType = editor.schema.marks.comment;
  if (!markType || !commentIds.length) return;
  const ids = new Set(commentIds);
  const ranges: Array<{ from: number; to: number; mark: ReturnType<typeof markType.create> }> = [];
  editor.state.doc.descendants((node, position) => {
    if (!node.isText) return true;
    for (const mark of node.marks) {
      if (mark.type === markType && ids.has(String(mark.attrs.commentId))) {
        ranges.push({ from: position, to: position + node.nodeSize, mark });
      }
    }
    return true;
  });
  if (!ranges.length) return;
  const transaction = editor.state.tr;
  for (const range of ranges) transaction.removeMark(range.from, range.to, range.mark);
  if (transaction.docChanged) editor.view.dispatch(transaction);
}

function removeOrphanCommentMarks(editor: Editor | null, validIds: Set<string>) {
  if (!editor || editor.isDestroyed) return;
  const markType = editor.schema.marks.comment;
  if (!markType) return;
  const ranges: Array<{ from: number; to: number; mark: ReturnType<typeof markType.create> }> = [];
  editor.state.doc.descendants((node, position) => {
    if (!node.isText) return true;
    for (const mark of node.marks) {
      const commentId = String(mark.attrs.commentId || '');
      if (mark.type === markType && commentId && !validIds.has(commentId)) {
        ranges.push({ from: position, to: position + node.nodeSize, mark });
      }
    }
    return true;
  });
  if (!ranges.length) return;
  const transaction = editor.state.tr;
  for (const range of ranges) transaction.removeMark(range.from, range.to, range.mark);
  if (transaction.docChanged) editor.view.dispatch(transaction);
}

export function useYjsComments(editor: Editor | null, ydoc: Y.Doc, isDocumentReady = true) {
  const map = ydoc.getMap<YjsComment>('comments');
  const [comments, setComments] = useState<YjsComment[]>([]);

  const refresh = useCallback(() => {
    setComments([...map.values()].sort((a, b) => a.createdAt - b.createdAt));
  }, [map]);

  useEffect(() => {
    const handleMapChange = (event: Y.YMapEvent<YjsComment>) => {
      // A removed thread also owns its inline document mark. Removing marks from
      // the map observer makes single deletes and map.clear() behave consistently.
      const deletedIds = [...event.changes.keys].filter(([, change]) => change.action === 'delete').map(([commentId]) => commentId);
      removeCommentMarks(editor, deletedIds);
      refresh();
    };
    map.observe(handleMapChange);
    refresh();
    return () => map.unobserve(handleMapChange);
  }, [editor, map, refresh]);

  useEffect(() => {
    if (!isDocumentReady || !editor || editor.isDestroyed) return;
    // Old clients or interrupted deletes can leave inline marks after their Y.Map
    // thread was removed. Reconcile only after local restore/server sync completes.
    removeOrphanCommentMarks(editor, new Set(map.keys()));
  }, [editor, isDocumentReady, map]);

  const addComment = useCallback((author: string, text: string) => {
    if (!editor || !text.trim()) return;
    const { from, to, empty } = editor.state.selection;
    const yState = currentYState(editor);

    // ProseMirror selection offsets become Yjs RelativePositions. They track the
    // selected text as concurrent edits shift absolute character positions.
    const start = absolutePositionToRelativePosition(from, yState.type, yState.binding.mapping);
    const end = absolutePositionToRelativePosition(to, yState.type, yState.binding.mapping);
    const id = crypto.randomUUID();
    ydoc.transact(() => {
      map.set(id, { id, author, text: text.trim(), createdAt: Date.now(), resolved: false,
        start: Y.encodeRelativePosition(start), end: Y.encodeRelativePosition(end) });
      if (!empty) editor.chain().focus().setComment(id).run();
    }, 'comment-add');
    return id;
  }, [editor, map, ydoc]);

  const focusComment = useCallback((id: string) => {
    if (!editor || editor.isDestroyed) return false;
    const item = map.get(id);
    if (!item) return false;
    try {
      // The comment mark is the most direct anchor for selected text; RelativePosition
      // remains the fallback when concurrent edits have moved or removed that mark.
      let markedRange: { from: number; to: number } | null = null;
      editor.state.doc.descendants((node, position) => {
        if (!node.isText) return true;
        const mark = node.marks.find(candidate => candidate.type.name === 'comment' && candidate.attrs.commentId === id);
        if (mark) markedRange = {
          from: Math.min(markedRange?.from ?? position, position),
          to: Math.max(markedRange?.to ?? position + node.nodeSize, position + node.nodeSize),
        };
        return true;
      });
      let from = markedRange?.from ?? null;
      let to = markedRange?.to ?? null;
      if (from === null || to === null) {
        const yState = currentYState(editor);
        from = relativePositionToAbsolutePosition(ydoc, yState.type, Y.decodeRelativePosition(item.start), yState.binding.mapping);
        to = relativePositionToAbsolutePosition(ydoc, yState.type, Y.decodeRelativePosition(item.end), yState.binding.mapping);
      }
      if (from === null || to === null) return false;
      const safeFrom = Math.max(0, Math.min(from, editor.state.doc.content.size));
      const safeTo = Math.max(safeFrom, Math.min(to, editor.state.doc.content.size));
      const selection = safeFrom === safeTo
        ? TextSelection.near(editor.state.doc.resolve(safeFrom))
        : TextSelection.between(editor.state.doc.resolve(safeFrom), editor.state.doc.resolve(safeTo));
      editor.view.dispatch(editor.state.tr.setSelection(selection).scrollIntoView());
      editor.commands.focus();
      requestAnimationFrame(() => {
        const markedElement = Array.from(editor.view.dom.querySelectorAll<HTMLElement>('[data-comment-id]'))
          .find(element => element.dataset.commentId === id);
        if (markedElement) {
          markedElement.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
        } else {
          try {
            const dom = editor.view.domAtPos(safeFrom).node;
            const element = dom instanceof HTMLElement ? dom : dom.parentElement;
            element?.closest('p, li, h1, h2, h3, blockquote, td, th')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          } catch { /* The selection itself has already been moved and scrolled into view. */ }
        }
      });
      return true;
    } catch {
      return false;
    }
  }, [editor, map, ydoc]);

  const resolveComment = useCallback((id: string, resolved: boolean) => {
    const item = map.get(id);
    if (item) map.set(id, { ...item, resolved });
  }, [map]);

  const deleteComment = useCallback((id: string) => {
    if (!map.has(id)) return;
    map.delete(id);
  }, [map]);

  return { comments, addComment, resolveComment, deleteComment, focusComment };
}
