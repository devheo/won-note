import type { Editor } from '@tiptap/core';

const editors = new Map<string, Editor>();
export function registerNoteEditor(id: string, editor: Editor) {
  editors.set(id, editor);
  return () => { if (editors.get(id) === editor) editors.delete(id); };
}
export function currentNoteContent(id: string, fallback: string) {
  const editor = editors.get(id);
  return editor && !editor.isDestroyed ? editor.getHTML() : fallback;
}
export function replaceNoteContent(id: string, content: string) {
  const editor = editors.get(id);
  if (editor && !editor.isDestroyed) editor.commands.setContent(content, { emitUpdate: false });
}
