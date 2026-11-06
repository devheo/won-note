import { Extension, mergeAttributes, Node } from '@tiptap/core';

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
          parseHTML: (element: HTMLElement) => element.getAttribute('data-border-style') || 'all',
          renderHTML: (attributes: Record<string, unknown>) => {
            const style = String(attributes.borderStyle || 'all');
            return { 'data-border-style': style, class: `wonbee-rich-table wonbee-table-border-${style}` };
          },
        },
      },
    }];
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
