import { Extension, mergeAttributes, Node } from '@tiptap/core';
import { Plugin } from '@tiptap/pm/state';
import { Table } from '@tiptap/extension-table';

export const CustomTable = Table.extend({
  addAttributes() {
    return {
      ...(this.parent?.() || {}),
      borderStyle: {
        default: 'all',
        parseHTML: (element: HTMLElement) => {
          const attr = element.getAttribute('data-border-style');
          if (attr) return attr;
          const cls = element.className || '';
          const match = cls.match(/wonbee-table-border-([a-z]+)/);
          return match ? match[1] : 'all';
        },
        renderHTML: (attributes: Record<string, unknown>) => {
          const style = String(attributes.borderStyle || 'all');
          return {
            'data-border-style': style,
            class: `wonbee-rich-table wonbee-table-border-${style}`,
          };
        },
      },
    };
  },
  renderHTML({ HTMLAttributes }) {
    const style = String(HTMLAttributes['data-border-style'] || HTMLAttributes.borderStyle || 'all');
    const merged = mergeAttributes(HTMLAttributes, {
      'data-border-style': style,
      class: `wonbee-rich-table wonbee-table-border-${style}`,
    });
    return ['table', merged, 0];
  },
});

/** Persists list marker choices in the ProseMirror document. */
export const ListMarkerAttributes = Extension.create({
  name: 'listMarkerAttributes',
  addGlobalAttributes() {
    return [{
      types: ['bulletList', 'orderedList'],
      attributes: {
        listMarker: {
          default: null,
          parseHTML: (element: HTMLElement) => element.getAttribute('data-list-marker'),
          renderHTML: (attributes: Record<string, unknown>) => attributes.listMarker
            ? { 'data-list-marker': attributes.listMarker }
            : {},
        },
      },
    }];
  },
});

export const NoteTableBorderStyle = Extension.create({
  name: 'noteTableBorderStyle',
  addGlobalAttributes() {
    return [{
      types: ['table'],
      attributes: {
        borderStyle: {
          default: 'all',
          parseHTML: (element: HTMLElement) => {
            const attr = element.getAttribute('data-border-style');
            if (attr) return attr;
            const cls = element.className || '';
            const match = cls.match(/wonbee-table-border-([a-z]+)/);
            return match ? match[1] : 'all';
          },
          renderHTML: (attributes: Record<string, unknown>) => {
            const style = String(attributes.borderStyle || 'all');
            return { 'data-border-style': style, class: `wonbee-rich-table wonbee-table-border-${style}` };
          },
        },
      },
    }];
  },
});

/** Persist individual cell borders for the Excel-style border picker. */
export const NoteTableCellBorders = Extension.create({
  name: 'noteTableCellBorders',
  addGlobalAttributes() {
    return [{
      types: ['tableCell', 'tableHeader'],
      attributes: {
        cellBorder: {
          default: null,
          parseHTML: (element: HTMLElement) => element.getAttribute('data-cell-border'),
          renderHTML: (attributes: Record<string, unknown>) => attributes.cellBorder
            ? { 'data-cell-border': String(attributes.cellBorder) }
            : {},
        },
        cellBorderColor: {
          default: null,
          parseHTML: (element: HTMLElement) => element.getAttribute('data-cell-border-color'),
          renderHTML: (attributes: Record<string, unknown>) => attributes.cellBorderColor
            ? { 'data-cell-border-color': String(attributes.cellBorderColor) }
            : {},
        },
        cellBorders: {
          default: null,
          parseHTML: (element: HTMLElement) => {
            const value = element.getAttribute('data-cell-borders');
            if (!value) return null;
            try { return JSON.parse(value); } catch { return null; }
          },
          renderHTML: (attributes: Record<string, unknown>) => attributes.cellBorders
            ? { 'data-cell-borders': JSON.stringify(attributes.cellBorders) }
            : {},
        },
      },
    }];
  },
});

export const TextBlockIndent = Extension.create({
  name: 'textBlockIndent',
  addGlobalAttributes() {
    return [{
      types: ['paragraph', 'heading', 'blockquote', 'bulletList', 'orderedList', 'taskList', 'listItem', 'taskItem'],
      attributes: {
        blockIndent: {
          default: 0,
          parseHTML: (element: HTMLElement) => Number(element.getAttribute('data-block-indent')) || 0,
          renderHTML: (attributes: Record<string, unknown>) => {
            const indent = Math.max(0, Math.min(240, Number(attributes.blockIndent) || 0));
            return indent ? { 'data-block-indent': String(indent), style: `margin-left: ${indent}px;` } : {};
          },
        },
      },
    }];
  },
});

/** Persist and interactively resize the height of an individual table row. */
export const NoteTableRowHeight = Extension.create({
  name: 'noteTableRowHeight',
  addGlobalAttributes() {
    return [{
      types: ['tableRow'],
      attributes: {
        rowHeight: {
          default: null,
          parseHTML: (element: HTMLElement) => Number(element.getAttribute('data-row-height')) || null,
          renderHTML: (attributes: Record<string, unknown>) => {
            const height = Number(attributes.rowHeight);
            return height > 0 ? { 'data-row-height': String(height), style: `height: ${height}px;` } : {};
          },
        },
      },
    }];
  },
  addProseMirrorPlugins() {
    return [new Plugin({
      props: {
        handleDOMEvents: {
          mousemove: (view, event) => {
            const mouse = event as MouseEvent;
            const row = (mouse.target as HTMLElement | null)?.closest('tr');
            const rect = row?.getBoundingClientRect();
            view.dom.style.cursor = row && rect && rect.bottom - mouse.clientY <= 5 && rect.bottom - mouse.clientY >= -2 ? 'row-resize' : '';
            return false;
          },
          mousedown: (view, event) => {
            const mouse = event as MouseEvent;
            if (mouse.button !== 0) return false;
            const row = (mouse.target as HTMLElement | null)?.closest('tr');
            const rect = row?.getBoundingClientRect();
            if (!row || !rect || rect.bottom - mouse.clientY > 5 || rect.bottom - mouse.clientY < -2) return false;

            let rowPos: number | null = null;
            let rowAttrs: Record<string, unknown> | null = null;
            view.state.doc.descendants((node, pos) => {
              if (node.type.name === 'tableRow' && node === view.state.doc.nodeAt(pos) && view.nodeDOM(pos) === row) {
                rowPos = pos;
                rowAttrs = node.attrs;
                return false;
              }
              return true;
            });
            if (rowPos === null || !rowAttrs) return false;

            mouse.preventDefault();
            const startY = mouse.clientY;
            const startHeight = rect.height;
            const initialCursor = view.dom.style.cursor;
            const onMove = (moveEvent: MouseEvent) => {
              const height = Math.max(24, Math.round(startHeight + moveEvent.clientY - startY));
              row.style.height = `${height}px`;
            };
            const onUp = (upEvent: MouseEvent) => {
              window.removeEventListener('mousemove', onMove);
              window.removeEventListener('mouseup', onUp);
              view.dom.style.cursor = initialCursor;
              const height = Math.max(24, Math.round(startHeight + upEvent.clientY - startY));
              if (!view.isDestroyed) {
                const currentNode = view.state.doc.nodeAt(rowPos!);
                if (currentNode?.type.name === 'tableRow') {
                  view.dispatch(view.state.tr.setNodeMarkup(rowPos!, undefined, { ...currentNode.attrs, rowHeight: height }).scrollIntoView());
                }
              }
            };
            window.addEventListener('mousemove', onMove);
            window.addEventListener('mouseup', onUp, { once: true });
            return true;
          },
        },
      },
    })];
  },
});

export const WonBeeShape = Node.create({
  name: 'wonbeeShape',
  group: 'block',
  content: 'inline*',
  defining: true,
  draggable: true,
  addAttributes() {
    return {
      shapeType: {
        default: 'rectangle',
        parseHTML: (element: HTMLElement) => element.getAttribute('data-shape-type') || 'rectangle',
        renderHTML: (attributes: Record<string, unknown>) => ({ 'data-shape-type': attributes.shapeType || 'rectangle' }),
      },
      width: {
        default: 280,
        parseHTML: (element: HTMLElement) => Number(element.getAttribute('data-shape-width')) || 280,
        renderHTML: (attributes: Record<string, unknown>) => ({ 'data-shape-width': String(attributes.width || 280), style: `width: ${Number(attributes.width) || 280}px;` }),
      },
      height: {
        default: 120,
        parseHTML: (element: HTMLElement) => Number(element.getAttribute('data-shape-height')) || 120,
        renderHTML: (attributes: Record<string, unknown>) => ({ 'data-shape-height': String(attributes.height || 120), style: `height: ${Number(attributes.height) || 120}px;` }),
      },
      fontSize: {
        default: 16,
        parseHTML: (element: HTMLElement) => Number(element.getAttribute('data-shape-font-size')) || 16,
        renderHTML: (attributes: Record<string, unknown>) => ({ 'data-shape-font-size': String(attributes.fontSize || 16), style: `font-size: ${Number(attributes.fontSize) || 16}px;` }),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-wonbee-shape]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-wonbee-shape': 'true', class: 'wonbee-shape' }), 0];
  },
});
