import { Mark, mergeAttributes } from '@tiptap/core';
import { Plugin } from '@tiptap/pm/state';

interface CommentOptions { onCommentClick: (id: string) => void }

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    comment: {
      setComment: (commentId: string) => ReturnType;
      unsetComment: () => ReturnType;
    };
  }
}

export const CommentExtension = Mark.create<CommentOptions>({
  name: 'comment',
  inclusive: false,
  addOptions() { return { onCommentClick: (_id: string) => {} }; },
  addAttributes() {
    return {
      commentId: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-comment-id'),
        renderHTML: attrs => attrs.commentId ? { 'data-comment-id': attrs.commentId } : {},
      },
    };
  },
  parseHTML() { return [{ tag: 'span[data-comment-id]' }]; },
  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { class: 'comment-highlight' }), 0];
  },
  addCommands() {
    return {
      setComment: commentId => ({ commands }) => commands.setMark(this.name, { commentId }),
      unsetComment: () => ({ commands }) => commands.unsetMark(this.name),
    };
  },
  addProseMirrorPlugins() {
    return [new Plugin({ props: { handleClick: (_view, _pos, event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return false;
      const commentId = target.closest<HTMLElement>('[data-comment-id]')?.dataset.commentId;
      if (!commentId) return false;
      this.options.onCommentClick(commentId);
      return true;
    } } })];
  },
});
