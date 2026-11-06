import { Extension, Mark, mergeAttributes } from '@tiptap/core';

export const SubscriptMark = Mark.create({
  name: 'subscript',
  excludes: 'superscript',
  parseHTML() { return [{ tag: 'sub' }]; },
  renderHTML({ HTMLAttributes }) { return ['sub', mergeAttributes(HTMLAttributes), 0]; },
});

export const SuperscriptMark = Mark.create({
  name: 'superscript',
  excludes: 'subscript',
  parseHTML() { return [{ tag: 'sup' }]; },
  renderHTML({ HTMLAttributes }) { return ['sup', mergeAttributes(HTMLAttributes), 0]; },
});

export const ParagraphLineHeight = Extension.create({
  name: 'paragraphLineHeight',
  addGlobalAttributes() {
    return [{
      types: ['paragraph', 'heading'],
      attributes: {
        lineHeight: {
          default: null,
          parseHTML: element => element.style.lineHeight || null,
          renderHTML: attributes => attributes.lineHeight ? { style: `line-height: ${attributes.lineHeight}` } : {},
        },
      },
    }];
  },
});

export const OneNoteTagMark = Mark.create({
  name: 'oneNoteTag',
  inclusive: false,
  addAttributes() {
    return {
      tag: { default: 'important' },
    };
  },
  parseHTML() {
    return [{ tag: 'span[data-won-note-tag]', getAttrs: element => ({ tag: (element as HTMLElement).dataset.wonNoteTag || 'important' }) }];
  },
  renderHTML({ HTMLAttributes, mark }) {
    const tag = String(mark.attrs.tag || 'important');
    const colors: Record<string, string> = {
      todo: '#fef3c7', important: '#fee2e2', question: '#dbeafe', idea: '#dcfce7',
    };
    const darkColors: Record<string, string> = {
      todo: '#713f12', important: '#7f1d1d', question: '#1e3a8a', idea: '#14532d',
    };
    return ['span', mergeAttributes(HTMLAttributes, {
      'data-won-note-tag': tag,
      class: 'won-note-inline-tag',
      style: `background-color: ${colors[tag] || colors.important}; --won-note-tag-dark-bg: ${darkColors[tag] || darkColors.important}`,
    }), 0];
  },
});
