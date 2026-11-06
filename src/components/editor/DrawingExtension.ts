import { Editor, Node, mergeAttributes } from '@tiptap/core';
import { closeHistory } from '@tiptap/pm/history';
import { yUndoPluginKey } from '@tiptap/y-tiptap';

export type DrawingPoint = { x: number; y: number };
export type DrawingStroke = { points: DrawingPoint[]; color: string; width: number; tool: 'pen' | 'highlighter' };

/** Keep each completed stroke or erase as one independent undo step. */
export function dispatchDrawingChange(editor: Editor, position: number, attrs: Record<string, unknown>) {
  const undoManager = yUndoPluginKey.getState(editor.state)?.undoManager;
  undoManager?.stopCapturing();
  const transaction = closeHistory(editor.state.tr).setNodeMarkup(position, undefined, attrs);
  editor.view.dispatch(transaction);
  undoManager?.stopCapturing();
  editor.view.dispatch(closeHistory(editor.state.tr));
}

export function dispatchDrawingDelete(editor: Editor, position: number, nodeSize: number) {
  const undoManager = yUndoPluginKey.getState(editor.state)?.undoManager;
  undoManager?.stopCapturing();
  editor.view.dispatch(closeHistory(editor.state.tr).delete(position, position + nodeSize));
  undoManager?.stopCapturing();
  editor.view.dispatch(closeHistory(editor.state.tr));
}

/** Inline SVG overlay that shares the note's coordinate plane with text. */
export const DrawingExtension = Node.create({
  name: 'drawingLayer',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: false,
  draggable: false,
  addAttributes() {
    return {
      strokes: {
        default: [],
        parseHTML: element => {
          try { return JSON.parse(element.getAttribute('data-strokes') || '[]'); } catch { return []; }
        },
        renderHTML: attributes => ({ 'data-strokes': JSON.stringify(attributes.strokes || []) }),
      },
      coordinateHeight: {
        default: null,
        parseHTML: element => Number(element.getAttribute('data-coordinate-height')) || null,
        renderHTML: attributes => attributes.coordinateHeight ? { 'data-coordinate-height': String(attributes.coordinateHeight) } : {},
      },
    };
  },
  parseHTML() { return [{ tag: 'span[data-wonnote-drawing-layer]' }]; },
  renderHTML({ HTMLAttributes, node }) {
    const paths = (node.attrs.strokes as DrawingStroke[]).map(stroke => {
      const points = stroke.points;
      const path = points.map((point, index) => `${index ? 'L' : 'M'} ${point.x * 1000} ${point.y * 1000}`).join(' ');
      return ['path', { d: path, fill: 'none', stroke: stroke.color, 'stroke-width': stroke.width, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity: stroke.tool === 'highlighter' ? 0.3 : 1, 'vector-effect': 'non-scaling-stroke' }];
    });
    return ['span', mergeAttributes(HTMLAttributes, { 'data-wonnote-drawing-layer': '', 'data-strokes': JSON.stringify(node.attrs.strokes), class: 'wonnote-drawing-layer', style: 'display:none;' }, { contenteditable: 'false' }), ['svg', { viewBox: '0 0 1000 1000', preserveAspectRatio: 'none', style: 'display:none;' }, ...paths]];
  },
});
