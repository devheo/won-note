import type { Editor } from '@tiptap/core';

const editors = new Map<string, Editor>();
const pendingContent = new Map<string, string>();
export function registerNoteEditor(id: string, editor: Editor) {
  editors.set(id, editor);
  const pending = pendingContent.get(id);
  if (pending !== undefined && !editor.isDestroyed) {
    editor.commands.setContent(pending, { emitUpdate: false });
    pendingContent.delete(id);
  }
  return () => { if (editors.get(id) === editor) editors.delete(id); };
}
export function currentNoteContent(id: string, fallback: string) {
  const editor = editors.get(id);
  return editor && !editor.isDestroyed ? editor.getHTML() : pendingContent.get(id) ?? fallback;
}
export function replaceNoteContent(id: string, content: string) {
  pendingContent.set(id, content);
  const editor = editors.get(id);
  if (editor && !editor.isDestroyed) {
    editor.commands.setContent(content, { emitUpdate: false });
    pendingContent.delete(id);
  }
}
