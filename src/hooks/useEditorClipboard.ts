import { useCallback } from 'react';

interface UseEditorClipboardProps {
  editor: any;
  contextMenu: { x: number; y: number; isInTable: boolean } | null;
  setContextMenu: (val: any) => void;
  setToastMessage: (msg: string | null) => void;
  getSelectedText: () => string;
}

export function useEditorClipboard({
  editor,
  contextMenu,
  setContextMenu,
  setToastMessage,
  getSelectedText,
}: UseEditorClipboardProps) {
  const showToast = useCallback(
    (msg: string, duration = 2000) => {
      setToastMessage(msg);
      setTimeout(() => setToastMessage(null), duration);
    },
    [setToastMessage]
  );

  const handleContextCopy = useCallback(async () => {
    if (!editor) return;
    const { state } = editor;
    const { from, to, empty } = state.selection;
    const selectedText = empty ? getSelectedText() : state.doc.textBetween(from, to, ' ');
    if (selectedText && selectedText.trim() !== '') {
      try {
        await navigator.clipboard.writeText(selectedText);
        showToast('✓ 선택 영역이 클립보드에 복사되었습니다.');
      } catch {
        try {
          document.execCommand('copy');
          showToast('✓ 선택 영역이 복사되었습니다.');
        } catch (_) {
          showToast('⚠ 복사 실패 (Ctrl+C를 이용하세요)');
        }
      }
    } else if (contextMenu?.isInTable) {
      const cellText = editor.getAttributes('tableCell').textContent || editor.getAttributes('tableHeader').textContent || '';
      if (cellText) {
        try {
          await navigator.clipboard.writeText(cellText);
          showToast('✓ 표 셀 데이터가 복사되었습니다.');
        } catch {
          showToast('⚠ 복사 실패');
        }
      }
    }
    setContextMenu(null);
  }, [editor, getSelectedText, contextMenu, setContextMenu, showToast]);

  const handleContextCut = useCallback(async () => {
    if (!editor) return;
    const { state } = editor;
    const { from, to, empty } = state.selection;
    const selectedText = empty ? getSelectedText() : state.doc.textBetween(from, to, ' ');
    if (selectedText && selectedText.trim() !== '') {
      try {
        await navigator.clipboard.writeText(selectedText);
        editor.chain().focus().deleteSelection().run();
        showToast('✓ 잘라내기 완료.');
      } catch {
        try {
          document.execCommand('cut');
          showToast('✓ 잘라내기 완료.');
        } catch (_) {
          editor.chain().focus().deleteSelection().run();
          showToast('✓ 선택 영역이 삭제되었습니다.');
        }
      }
    }
    setContextMenu(null);
  }, [editor, getSelectedText, setContextMenu, showToast]);

  const handleContextPaste = useCallback(async () => {
    if (!editor) return;
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        editor.chain().focus().insertContent(text).run();
        showToast('✓ 클립보드 내용 붙여넣기 완료.');
      } else {
        showToast('💡 브라우저 보안 정책으로 인해 단축키(Ctrl+V / Cmd+V)를 사용해 주세요.', 3500);
      }
    } catch (err) {
      showToast('💡 브라우저 보안 정책으로 인해 단축키(Ctrl+V / Cmd+V)를 사용해 주세요.', 3500);
    }
    setContextMenu(null);
  }, [editor, setContextMenu, showToast]);

  const handleContextDeleteSelection = useCallback(() => {
    if (!editor) return;
    editor.commands.focus();
    editor.chain().focus().deleteSelection().run();
    setContextMenu(null);
  }, [editor, setContextMenu]);

  return {
    handleContextCopy,
    handleContextCut,
    handleContextPaste,
    handleContextDeleteSelection,
  };
}
