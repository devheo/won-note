import { TextSelection } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';

/** Keep an existing text selection; otherwise select the nearest word at the pointer for a visible comment anchor. */
export function selectCommentAnchorAt(view: EditorView, position: number): void {
  const { state } = view;
  if (!state.selection.empty) return;

  const safePosition = Math.max(0, Math.min(position, state.doc.content.size));
  let nearest: { from: number; to: number; distance: number } | null = null;
  const scanFrom = Math.max(0, safePosition - 300);
  const scanTo = Math.min(state.doc.content.size, safePosition + 300);
  state.doc.nodesBetween(scanFrom, scanTo, (node, nodePosition) => {
    if (!node.isText || !node.text) return;
    const expression = /\S+/g;
    let match: RegExpExecArray | null;
    while ((match = expression.exec(node.text))) {
      const from = nodePosition + match.index;
      const to = from + match[0].length;
      const distance = safePosition < from ? from - safePosition : safePosition > to ? safePosition - to : 0;
      if (!nearest || distance < nearest.distance) nearest = { from, to, distance };
    }
  });

  if (nearest) {
    const range = nearest as { from: number; to: number; distance: number };
    view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, range.from, range.to)).scrollIntoView());
    return;
  }
  const resolved = state.doc.resolve(safePosition);
  view.dispatch(state.tr.setSelection(TextSelection.near(resolved)).scrollIntoView());
}
