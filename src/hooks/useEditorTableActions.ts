import { useCallback } from 'react';
import { TextSelection } from 'prosemirror-state';

interface UseEditorTableActionsProps {
  editor: any;
  setActiveTopDialog: (dialog: any) => void;
  setToastMessage: (msg: string | null) => void;
}

export function useEditorTableActions({
  editor,
  setActiveTopDialog,
  setToastMessage,
}: UseEditorTableActionsProps) {
  const showToast = useCallback(
    (msg: string, duration = 2500) => {
      setToastMessage(msg);
      setTimeout(() => setToastMessage(null), duration);
    },
    [setToastMessage]
  );

  const handleInsertNewTable = useCallback(
    (rows: number, cols: number, withHeader = true) => {
      if (!editor) return;
      editor
        .chain()
        .focus()
        .insertTable({ rows, cols, withHeaderRow: withHeader })
        .run();
      setActiveTopDialog(null);
      showToast(`✓ ${cols}열 × ${rows}행 표가 삽입되었습니다.`);
    },
    [editor, setActiveTopDialog, showToast]
  );

  const getActiveTableAttrs = useCallback(() => {
    if (!editor) return { borderStyle: 'all', borderColor: '' };
    return {
      borderStyle: editor.getAttributes('table').borderStyle || 'all',
      borderColor: editor.getAttributes('table').borderColor || '',
    };
  }, [editor]);

  const setTableBorderStyle = useCallback(
    (style: 'all' | 'outer' | 'thick' | 'horizontal' | 'none', color?: string) => {
      if (!editor) return;
      const current = getActiveTableAttrs();
      editor
        .chain()
        .focus()
        .updateAttributes('table', {
          borderStyle: style,
          borderColor: color !== undefined ? color : current.borderColor,
        })
        .run();
      showToast(`✓ 표 테두리 스타일이 변경되었습니다.`);
    },
    [editor, getActiveTableAttrs, showToast]
  );

  const setTableBorderColor = useCallback(
    (color: string) => {
      if (!editor) return;
      const current = getActiveTableAttrs();
      editor
        .chain()
        .focus()
        .updateAttributes('table', {
          borderStyle: current.borderStyle,
          borderColor: color,
        })
        .run();
      showToast(`✓ 표 테두리 색상이 변경되었습니다.`);
    },
    [editor, getActiveTableAttrs, showToast]
  );

  const handleInsertParagraphBeforeTable = useCallback(() => {
    if (!editor) return;
    const { state, dispatch } = editor.view;
    const { $from } = state.selection;
    let tablePos = -1;
    for (let d = $from.depth; d > 0; d--) {
      if ($from.node(d).type.name === 'table') {
        tablePos = $from.before(d);
        break;
      }
    }
    if (tablePos !== -1) {
      const tr = state.tr.insert(tablePos, state.schema.nodes.paragraph.create());
      const resolved = tr.doc.resolve(tablePos + 1);
      tr.setSelection(TextSelection.near(resolved));
      dispatch(tr.scrollIntoView());
      editor.view.focus();
      showToast('✓ 표 위쪽에 새 본문 줄(단락)이 생성되었습니다.');
    }
  }, [editor, showToast]);

  const handleInsertParagraphAfterTable = useCallback(() => {
    if (!editor) return;
    const { state, dispatch } = editor.view;
    const { $from } = state.selection;
    let tablePos = -1;
    for (let d = $from.depth; d > 0; d--) {
      if ($from.node(d).type.name === 'table') {
        tablePos = $from.after(d);
        break;
      }
    }
    if (tablePos !== -1) {
      const tr = state.tr.insert(tablePos, state.schema.nodes.paragraph.create());
      const resolved = tr.doc.resolve(tablePos + 1);
      tr.setSelection(TextSelection.near(resolved));
      dispatch(tr.scrollIntoView());
      editor.view.focus();
      showToast('✓ 표 아래쪽에 새 본문 줄(단락)이 생성되었습니다.');
    }
  }, [editor, showToast]);

  const getActiveTableCellAttrs = useCallback(() => {
    if (!editor) return { cellBorderStyle: '', cellBorderColor: '' };
    return {
      cellBorderStyle: editor.getAttributes('tableCell').cellBorderStyle || editor.getAttributes('tableHeader').cellBorderStyle || '',
      cellBorderColor: editor.getAttributes('tableCell').cellBorderColor || editor.getAttributes('tableHeader').cellBorderColor || '',
    };
  }, [editor]);

  const applyCellBorder = useCallback(
    (borderStyle: string | null, borderColor?: string) => {
      if (!editor) return;
      const targetTag = editor.isActive('tableHeader') ? 'tableHeader' : 'tableCell';
      editor
        .chain()
        .focus()
        .updateAttributes(targetTag, {
          cellBorderStyle: borderStyle,
          cellBorderColor: borderColor !== undefined ? borderColor : getActiveTableCellAttrs().cellBorderColor,
        })
        .run();
    },
    [editor, getActiveTableCellAttrs]
  );

  const applyCellBorderColor = useCallback(
    (color: string) => {
      if (!editor) return;
      const targetTag = editor.isActive('tableHeader') ? 'tableHeader' : 'tableCell';
      editor
        .chain()
        .focus()
        .updateAttributes(targetTag, {
          cellBorderColor: color,
        })
        .run();
    },
    [editor]
  );

  return {
    handleInsertNewTable,
    getActiveTableAttrs,
    setTableBorderStyle,
    setTableBorderColor,
    handleInsertParagraphBeforeTable,
    handleInsertParagraphAfterTable,
    getActiveTableCellAttrs,
    applyCellBorder,
    applyCellBorderColor,
  };
}
