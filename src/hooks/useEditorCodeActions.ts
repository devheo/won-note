import { useCallback } from 'react';
import { detectLanguage, escapeHtml, formatJavaOrGeneralCode } from '../utils/codeHighlighter';

interface UseEditorCodeActionsProps {
  editor: any;
  setToastMessage: (msg: string | null) => void;
}

export function useEditorCodeActions({
  editor,
  setToastMessage,
}: UseEditorCodeActionsProps) {
  const showToast = useCallback(
    (msg: string, duration = 2500) => {
      setToastMessage(msg);
      setTimeout(() => setToastMessage(null), duration);
    },
    [setToastMessage]
  );

  const getSelectedText = useCallback((): string => {
    if (!editor) return '';
    const { state } = editor;
    const { from, to, empty } = state.selection;
    if (empty) return '';
    return state.doc.textBetween(from, to, '\n');
  }, [editor]);

  const handleAutoHighlightSelection = useCallback(() => {
    if (!editor) return;
    const selected = getSelectedText();
    if (!selected || selected.trim() === '') {
      editor.chain().focus().toggleCodeBlock().run();
      return;
    }

    const langDetection = detectLanguage(selected);
    const hasJavaPattern = /\b(package\s+[a-zA-Z0-9_.]+|import\s+java|public\s+class|class\s+\w+|public\s+static\s+void|System\.out|public\s+static\s+final)\b/.test(selected);
    const isShebang = /^(#!\/(bin|usr\/bin|usr\/local\/bin)\/(bash|sh|zsh|env\s+bash|env\s+sh))/.test(selected);

    let detectedLang = langDetection.isCode ? langDetection.language : 'plaintext';
    if (isShebang || /\b(sudo\s+|chmod\s+|curl\s+|docker\s+|npm\s+run|git\s+|grep\s+|echo\s+)/.test(selected)) {
      detectedLang = 'bash';
    } else if (hasJavaPattern) {
      detectedLang = 'java';
    } else if (/\b(SELECT\s+|INSERT\s+INTO|UPDATE\s+|DELETE\s+FROM|CREATE\s+TABLE)\b/i.test(selected)) {
      detectedLang = 'sql';
    }

    if (editor.isActive('codeBlock')) {
      editor.chain().focus().updateAttributes('codeBlock', { language: detectedLang }).run();
    } else {
      editor.chain().focus().setCodeBlock({ language: detectedLang }).run();
    }

    showToast(`✓ 선택 데이터가 [${detectedLang.toUpperCase()}] 코드 블록으로 자동 변환되었습니다.`);
  }, [editor, getSelectedText, showToast]);

  const handleInsertBashBlock = useCallback(() => {
    if (!editor) return;
    const selected = getSelectedText();
    if (selected && selected.trim() !== '') {
      if (editor.isActive('codeBlock')) {
        editor.chain().focus().updateAttributes('codeBlock', { language: 'bash' }).run();
      } else {
        editor.chain().focus().setCodeBlock({ language: 'bash' }).run();
      }
    } else {
      editor.chain().focus().insertContent(`<pre><code class="language-bash">#!/bin/bash\n# Shell Script Header\necho "Execution Started..."</code></pre>`).run();
    }
    showToast('✓ [BASH / SHELL] 코드 블록이 설정되었습니다.');
  }, [editor, getSelectedText, showToast]);

  const handleInsertSqlBlock = useCallback(() => {
    if (!editor) return;
    const selected = getSelectedText();
    if (selected && selected.trim() !== '') {
      if (editor.isActive('codeBlock')) {
        editor.chain().focus().updateAttributes('codeBlock', { language: 'sql' }).run();
      } else {
        editor.chain().focus().setCodeBlock({ language: 'sql' }).run();
      }
    } else {
      editor.chain().focus().insertContent(`<pre><code class="language-sql">-- SQL Query Template\nSELECT id, title, content\nFROM workspace_data\nWHERE status = 'active'\nORDER BY created_at DESC;</code></pre>`).run();
    }
    showToast('✓ [SQL] 쿼리 블록이 설정되었습니다.');
  }, [editor, getSelectedText, showToast]);

  const handleInsertJavaBlock = useCallback(() => {
    if (!editor) return;
    const selected = getSelectedText();
    if (selected && selected.trim() !== '') {
      if (editor.isActive('codeBlock')) {
        editor.chain().focus().updateAttributes('codeBlock', { language: 'java' }).run();
      } else {
        editor.chain().focus().setCodeBlock({ language: 'java' }).run();
      }
    } else {
      editor.chain().focus().insertContent(`<pre><code class="language-java">public class ServiceHandler {\n    public static void main(String[] args) {\n        System.out.println("Processing...");\n    }\n}</code></pre>`).run();
    }
    showToast('✓ [JAVA] 코드 블록이 설정되었습니다.');
  }, [editor, getSelectedText, showToast]);

  const handleInsertCBlock = useCallback(() => {
    if (!editor) return;
    const selected = getSelectedText();
    if (selected && selected.trim() !== '') {
      if (editor.isActive('codeBlock')) {
        editor.chain().focus().updateAttributes('codeBlock', { language: 'c' }).run();
      } else {
        editor.chain().focus().setCodeBlock({ language: 'c' }).run();
      }
    } else {
      editor.chain().focus().insertContent(`<pre><code class="language-c">#include &lt;stdio.h&gt;\n\nint main() {\n    printf("Native Processing...\\n");\n    return 0;\n}</code></pre>`).run();
    }
    showToast('✓ [C / PRO*C] 코드 블록이 설정되었습니다.');
  }, [editor, getSelectedText, showToast]);

  const handleInsertPythonBlock = useCallback(() => {
    if (!editor) return;
    const selected = getSelectedText();
    if (selected && selected.trim() !== '') {
      if (editor.isActive('codeBlock')) {
        editor.chain().focus().updateAttributes('codeBlock', { language: 'python' }).run();
      } else {
        editor.chain().focus().setCodeBlock({ language: 'python' }).run();
      }
    } else {
      editor.chain().focus().insertContent(`<pre><code class="language-python"># Python Data Pipeline\ndef process_data(records):\n    return [r for r in records if r.get('active')]</code></pre>`).run();
    }
    showToast('✓ [PYTHON] 코드 블록이 설정되었습니다.');
  }, [editor, getSelectedText, showToast]);

  const handleFormatCodeInEditor = useCallback(() => {
    if (!editor) return;
    const { state } = editor;
    const { $from } = state.selection;
    let codeNodePos: number | null = null;
    let codeNodeText = '';

    for (let d = $from.depth; d > 0; d--) {
      if ($from.node(d).type.name === 'codeBlock') {
        codeNodePos = $from.before(d);
        codeNodeText = $from.node(d).textContent;
        break;
      }
    }

    if (codeNodePos !== null && codeNodeText) {
      const formatted = formatJavaOrGeneralCode(codeNodeText);
      const start = codeNodePos + 1;
      const end = codeNodePos + $from.node($from.depth).nodeSize - 1;
      const tr = state.tr;
      tr.replaceWith(start, end, state.schema.text(formatted));
      editor.view.dispatch(tr);
      showToast('✓ 코드 들여쓰기 자동 정밀 정렬 완료.');
    } else {
      const plain = getSelectedText() || editor.getText();
      if (plain) {
        const formatted = formatJavaOrGeneralCode(plain);
        const lang = detectLanguage(formatted).language || 'java';
        editor.commands.setContent(`<pre><code class="language-${lang}">${escapeHtml(formatted)}</code></pre>`);
        showToast('✓ 전체 텍스트 소스 코드 포매팅 완료.');
      }
    }
  }, [editor, getSelectedText, showToast]);

  return {
    getSelectedText,
    handleAutoHighlightSelection,
    handleInsertBashBlock,
    handleInsertSqlBlock,
    handleInsertJavaBlock,
    handleInsertCBlock,
    handleInsertPythonBlock,
    handleFormatCodeInEditor,
  };
}
