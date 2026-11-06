import { useCallback } from 'react';

function applyWholeTableTextStyle(editor: any, attribute: 'fontFamily' | 'fontSize', value: string | null) {
  const { state, view } = editor;
  const { selection } = state;
  let match: { pos: number; node: any } | null = null;
  state.doc.nodesBetween(selection.from, selection.to, (node: any, pos: number) => {
    if (node.type.name !== 'table') return true;
    const coversTableContent = selection.from <= pos + 1 && selection.to >= pos + node.nodeSize - 1;
    if (coversTableContent) {
      match = { pos, node };
      return false;
    }
    return true;
  });
  if (!match) return false;
  const { pos, node } = match;
  view.dispatch(state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, [attribute]: value }));
  return true;
}

interface UseEditorFormattingProps {
  editor: any;
  setActiveTopDialog: (dialog: any) => void;
  setToastMessage: (msg: string | null) => void;
  savedSelectionRef: React.MutableRefObject<{ from: number; to: number } | null>;
}

export function useEditorFormatting({
  editor,
  setActiveTopDialog,
  setToastMessage,
  savedSelectionRef,
}: UseEditorFormattingProps) {
  const showToast = useCallback(
    (msg: string, duration = 2500) => {
      setToastMessage(msg);
      setTimeout(() => setToastMessage(null), duration);
    },
    [setToastMessage]
  );

  const setFontSize = useCallback(
    (size: string) => {
      if (!editor) return;
      const nextValue = size === 'default' ? null : size;
      if (applyWholeTableTextStyle(editor, 'fontSize', nextValue)) return;
      if (size === 'default') {
        editor.chain().focus().unsetFontSize().run();
      } else {
        editor.chain().focus().setFontSize(size).run();
      }
    },
    [editor]
  );

  const setFontFamily = useCallback(
    (family: string) => {
      if (!editor) return;
      const nextValue = family === 'default' ? null : family;
      if (applyWholeTableTextStyle(editor, 'fontFamily', nextValue)) return;
      if (family === 'default') {
        editor.chain().focus().unsetFontFamily().run();
      } else {
        editor.chain().focus().setFontFamily(family).run();
      }
    },
    [editor]
  );

  const handleIndent = useCallback(() => {
    if (!editor) return;
    if (editor.isActive('listItem')) {
      (editor.chain().focus() as any).sinkListItem('listItem').run();
      return;
    }
    if (editor.isActive('taskItem')) {
      (editor.chain().focus() as any).sinkListItem('taskItem').run();
      return;
    }
    editor.chain().focus().insertContent('    ').run();
  }, [editor]);

  const handleOutdent = useCallback(() => {
    if (!editor) return;
    if (editor.isActive('listItem')) {
      (editor.chain().focus() as any).liftListItem('listItem').run();
      return;
    }
    if (editor.isActive('taskItem')) {
      (editor.chain().focus() as any).liftListItem('taskItem').run();
      return;
    }
    editor.chain().focus().lift('blockquote').run();
  }, [editor]);

  const handleApplyTextColor = useCallback(
    (color: string) => {
      if (!editor) return;
      if (savedSelectionRef.current && savedSelectionRef.current.from !== savedSelectionRef.current.to) {
        const { from, to } = savedSelectionRef.current;
        editor.chain().focus().setTextSelection({ from, to }).setColor(color).run();
      } else {
        editor.chain().focus().setColor(color).run();
      }
      setActiveTopDialog(null);
      showToast('✓ 글자 색상이 적용되었습니다.');
    },
    [editor, savedSelectionRef, setActiveTopDialog, showToast]
  );

  const handleResetTextColor = useCallback(() => {
    if (!editor) return;
    if (savedSelectionRef.current && savedSelectionRef.current.from !== savedSelectionRef.current.to) {
      const { from, to } = savedSelectionRef.current;
      editor.chain().focus().setTextSelection({ from, to }).unsetColor().run();
    } else {
      editor.chain().focus().unsetColor().run();
    }
    setActiveTopDialog(null);
    showToast('✓ 글자 색상이 초기화되었습니다.');
  }, [editor, savedSelectionRef, setActiveTopDialog, showToast]);

  const handleApplyHighlight = useCallback(
    (color: string) => {
      if (!editor) return;
      if (savedSelectionRef.current && savedSelectionRef.current.from !== savedSelectionRef.current.to) {
        const { from, to } = savedSelectionRef.current;
        editor.chain().focus().setTextSelection({ from, to }).setHighlight({ color }).run();
      } else {
        editor.chain().focus().setHighlight({ color }).run();
      }
      setActiveTopDialog(null);
      showToast('✓ 형광펜 강조 효과가 적용되었습니다.');
    },
    [editor, savedSelectionRef, setActiveTopDialog, showToast]
  );

  const handleResetHighlight = useCallback(() => {
    if (!editor) return;
    if (savedSelectionRef.current && savedSelectionRef.current.from !== savedSelectionRef.current.to) {
      const { from, to } = savedSelectionRef.current;
      editor.chain().focus().setTextSelection({ from, to }).unsetHighlight().run();
    } else {
      editor.chain().focus().unsetHighlight().run();
    }
    setActiveTopDialog(null);
    showToast('✓ 형광펜 지우기가 완료되었습니다.');
  }, [editor, savedSelectionRef, setActiveTopDialog, showToast]);

  return {
    setFontSize,
    setFontFamily,
    handleIndent,
    handleOutdent,
    handleApplyTextColor,
    handleResetTextColor,
    handleApplyHighlight,
    handleResetHighlight,
  };
}
