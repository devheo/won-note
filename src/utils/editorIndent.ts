import type { Editor } from '@tiptap/core';

/** Indent or outdent selected text blocks, list items, and lists without replacing contents. */
export function changeTextBlockIndent(editor: Editor, delta: number): boolean {
  if (!editor || editor.isDestroyed) return false;
  const { state, view } = editor;
  const { selection } = state;

  let handledList = false;

  // 1. First attempt native Tiptap list nesting (sink/lift list items)
  if (editor.isActive('listItem') || editor.isActive('taskItem')) {
    const isTask = editor.isActive('taskItem');
    const primaryType = isTask ? 'taskItem' : 'listItem';
    const secondaryType = isTask ? 'listItem' : 'taskItem';

    if (delta > 0) {
      handledList =
        (editor.chain().focus() as any).sinkListItem?.(primaryType)?.run() ||
        (editor.chain().focus() as any).sinkListItem?.(secondaryType)?.run() ||
        false;
    } else {
      handledList =
        (editor.chain().focus() as any).liftListItem?.(primaryType)?.run() ||
        (editor.chain().focus() as any).liftListItem?.(secondaryType)?.run() ||
        false;
    }
  }

  // 2. Collect all indentable nodes in the current selection
  const blocks: Array<{ pos: number; node: any }> = [];
  const addBlock = (node: any, pos: number) => {
    if (
      node &&
      (node.isTextblock ||
        ['bulletList', 'orderedList', 'taskList', 'listItem', 'taskItem', 'blockquote'].includes(
          node.type.name
        ))
    ) {
      if (!blocks.some((block) => block.pos === pos)) {
        blocks.push({ pos, node });
      }
    }
  };

  if (selection.empty) {
    for (let depth = selection.$from.depth; depth > 0; depth--) {
      const node = selection.$from.node(depth);
      if (node) {
        addBlock(node, selection.$from.before(depth));
      }
    }
  } else {
    state.doc.nodesBetween(selection.from, selection.to, (node, pos) => {
      if (node) {
        addBlock(node, pos);
      }
      return true;
    });
  }

  if (!blocks.length && !handledList) return false;

  if (blocks.length > 0) {
    let transaction = state.tr;
    let hasIndentChanges = false;
    for (const { pos, node } of blocks) {
      const typeName = node.type.name;
      const isIndentableType = [
        'paragraph',
        'heading',
        'blockquote',
        'bulletList',
        'orderedList',
        'taskList',
        'listItem',
        'taskItem',
      ].includes(typeName);

      if (isIndentableType) {
        // If sink/lift succeeded for list items, skip double-indenting with margin
        if (handledList && (typeName === 'listItem' || typeName === 'taskItem')) {
          continue;
        }
        const current = Number(node.attrs?.blockIndent) || 0;
        const blockIndent = Math.max(0, Math.min(240, current + delta));
        if (blockIndent !== current) {
          transaction = transaction.setNodeMarkup(pos, undefined, { ...node.attrs, blockIndent });
          hasIndentChanges = true;
        }
      }
    }
    if (hasIndentChanges) {
      view.dispatch(transaction);
      return true;
    }
  }

  return true;
}
