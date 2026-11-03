import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import * as Diff from 'diff';
import {
  X,
  GitCompare,
  Copy,
  Trash2,
  Upload,
  ArrowRightLeft,
  Sparkles,
  ChevronUp,
  ChevronDown,
  FileCode,
  Maximize2,
  Minimize2,
} from 'lucide-react';

interface FileDiffModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface SideBySideRow {
  id: string;
  lineNumA: number | null;
  textA: string;
  typeA: 'normal' | 'delete' | 'change' | 'empty';
  lineNumB: number | null;
  textB: string;
  typeB: 'normal' | 'add' | 'change' | 'empty';
}

export const FileDiffModal: React.FC<FileDiffModalProps> = ({ isOpen, onClose }) => {
  // Input texts for A (Original) and B (Modified)
  const [textA, setTextA] = useState<string>('');
  const [textB, setTextB] = useState<string>('');

  // Filenames for display
  const [fileAName, setFileAName] = useState<string>('원본 파일 (A)');
  const [fileBName, setFileBName] = useState<string>('비교 대상 파일 (B)');

  // Diff Engine Mode: 'semantic' (pure text existence comparison) vs 'line' (strict line positioning)
  const [diffMode, setDiffMode] = useState<'line' | 'semantic'>('semantic');

  // Diff Options
  const [ignoreMultipleSpaces, setIgnoreMultipleSpaces] = useState<boolean>(false);
  const [ignoreEmptyLines, setIgnoreEmptyLines] = useState<boolean>(false);
  const [ignoreCase, setIgnoreCase] = useState<boolean>(false);
  const [trimWhitespace, setTrimWhitespace] = useState<boolean>(true);
  const [autoFormatStructured, setAutoFormatStructured] = useState<boolean>(false);
  const [showOnlyDiffs, setShowOnlyDiffs] = useState<boolean>(false);

  // Screen Maximization State
  const [isMaximized, setIsMaximized] = useState<boolean>(false);

  // Navigation state for change jump
  const [activeChangeIndex, setActiveChangeIndex] = useState<number>(-1);

  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  // Scroll synchronization refs & timeout ref
  const scrollRefA = useRef<HTMLDivElement | null>(null);
  const scrollRefB = useRef<HTMLDivElement | null>(null);
  const isSyncingRef = useRef<boolean>(false);
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Textarea refs
  const textareaARef = useRef<HTMLTextAreaElement | null>(null);
  const textareaBRef = useRef<HTMLTextAreaElement | null>(null);

  // Row element refs map keyed by unique row.id for exact DOM reference
  const rowElementRefsA = useRef<Record<string, HTMLDivElement | null>>({});
  const rowElementRefsB = useRef<Record<string, HTMLDivElement | null>>({});

  const handleScrollA = () => {
    if (isSyncingRef.current) return;
    isSyncingRef.current = true;
    if (scrollRefB.current && scrollRefA.current) {
      scrollRefB.current.scrollTop = scrollRefA.current.scrollTop;
      scrollRefB.current.scrollLeft = scrollRefA.current.scrollLeft;
    }
    isSyncingRef.current = false;
  };

  const handleScrollB = () => {
    if (isSyncingRef.current) return;
    isSyncingRef.current = true;
    if (scrollRefA.current && scrollRefB.current) {
      scrollRefA.current.scrollTop = scrollRefB.current.scrollTop;
      scrollRefA.current.scrollLeft = scrollRefB.current.scrollLeft;
    }
    isSyncingRef.current = false;
  };

  // File drop refs
  const fileInputARef = useRef<HTMLInputElement | null>(null);
  const fileInputBRef = useRef<HTMLInputElement | null>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, isTargetA: boolean) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string || '';
      if (isTargetA) {
        setTextA(content);
        setFileAName(file.name);
      } else {
        setTextB(content);
        setFileBName(file.name);
      }
      showToast(`✓ '${file.name}' 파일을 성공적으로 불러왔습니다.`);
    };
    reader.readAsText(file, 'utf-8');
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent<HTMLElement>, isTargetA: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string || '';
      if (isTargetA) {
        setTextA(content);
        setFileAName(file.name);
      } else {
        setTextB(content);
        setFileBName(file.name);
      }
      showToast(`✓ '${file.name}' 파일을 성공적으로 드롭하였습니다.`);
    };
    reader.readAsText(file, 'utf-8');
  };

  const handleSwap = () => {
    const tempText = textA;
    const tempName = fileAName;
    setTextA(textB);
    setFileAName(fileBName);
    setTextB(tempText);
    setFileBName(tempName);
    setActiveChangeIndex(-1);
    showToast('원본과 비교 대상이 서로 교체되었습니다.');
  };

  const handleClearAll = () => {
    setTextA('');
    setTextB('');
    setFileAName('원본 파일 (A)');
    setFileBName('비교 대상 파일 (B)');
    setActiveChangeIndex(-1);
    showToast('모든 입력 내용이 초기화되었습니다.');
  };

  // XML / JSON Pretty Formatter helper with indentation
  const formatStructuredText = useCallback((text: string) => {
    if (!text.trim()) return text;
    const trimmed = text.trim();
    // JSON pretty formatting
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try {
        return JSON.stringify(JSON.parse(trimmed), null, 2);
      } catch {}
    }
    // XML / HTML pretty formatting
    if (trimmed.includes('<') && trimmed.includes('>')) {
      try {
        const reg = /(>)(<)(\/*)/g;
        const xml = trimmed.replace(reg, '$1\r\n$2$3');
        let pad = 0;
        const formatted = xml
          .split(/\r?\n/)
          .map((line) => {
            const node = line.trim();
            if (!node) return '';
            let indent = 0;
            if (node.match(/.+<\/\w[^>]*>$/)) {
              indent = 0;
            } else if (node.match(/^<\/\w/)) {
              if (pad !== 0) pad -= 1;
            } else if (node.match(/^<\w[^>]*[^\/]>$/) && !node.startsWith('<?') && !node.startsWith('<!')) {
              indent = 1;
            } else {
              indent = 0;
            }

            const padding = '  '.repeat(pad);
            pad += indent;
            return padding + node;
          })
          .filter((l) => l !== '')
          .join('\n');

        return formatted;
      } catch {}
    }
    return text;
  }, []);

  // Handle toggling autoFormatStructured checkbox
  const handleToggleAutoFormat = (checked: boolean) => {
    setAutoFormatStructured(checked);
    if (checked) {
      if (textA.trim()) setTextA(formatStructuredText(textA));
      if (textB.trim()) setTextB(formatStructuredText(textB));
      showToast('✓ XML/JSON 들여쓰기 및 개행 자동 포맷팅이 적용되었습니다.');
    }
  };

  // Formatted source texts for comparison
  const formattedTextA = useMemo(() => autoFormatStructured ? formatStructuredText(textA) : textA, [textA, autoFormatStructured, formatStructuredText]);
  const formattedTextB = useMemo(() => autoFormatStructured ? formatStructuredText(textB) : textB, [textB, autoFormatStructured, formatStructuredText]);

  // Pre-process lines based on options for matching
  const cleanLine = useCallback((line: string) => {
    let l = line;
    l = l.replace(/[\u00A0\u200B\uFEFF\r\t]/g, ' ');
    if (trimWhitespace) l = l.replace(/^\s+|\s+$/g, '');
    if (ignoreMultipleSpaces) l = l.replace(/\s+/g, ' ');
    if (ignoreCase) l = l.toLowerCase();
    return l;
  }, [trimWhitespace, ignoreMultipleSpaces, ignoreCase]);

  // Compute paired side-by-side rows with line alignment or pure semantic text content existence
  const sideBySideRows = useMemo(() => {
    const rawLinesA = formattedTextA.split(/\r?\n/);
    const rawLinesB = formattedTextB.split(/\r?\n/);

    const filteredLinesA = ignoreEmptyLines ? rawLinesA.filter(l => l.trim() !== '') : rawLinesA;
    const filteredLinesB = ignoreEmptyLines ? rawLinesB.filter(l => l.trim() !== '') : rawLinesB;

    const processedA = filteredLinesA.map(cleanLine);
    const processedB = filteredLinesB.map(cleanLine);

    // 🌟 Mode 1: Pure Semantic Text Content Existence Mode (diffMode === 'semantic')
    if (diffMode === 'semantic') {
      const countMapB = new Map<string, number>();
      processedB.forEach(line => {
        countMapB.set(line, (countMapB.get(line) || 0) + 1);
      });

      const countMapA = new Map<string, number>();
      processedA.forEach(line => {
        countMapA.set(line, (countMapA.get(line) || 0) + 1);
      });

      const remainingMapB = new Map(countMapB);
      const remainingMapA = new Map(countMapA);

      // Analyze Left A (Original): present in B -> normal, absent in B -> deleted
      const leftItems = filteredLinesA.map((rawText, idx) => {
        const cleaned = processedA[idx];
        const countB = remainingMapB.get(cleaned) || 0;
        if (countB > 0) {
          remainingMapB.set(cleaned, countB - 1);
          return { lineNum: idx + 1, rawText, cleaned, type: 'normal' as const };
        } else {
          return { lineNum: idx + 1, rawText, cleaned, type: 'delete' as const };
        }
      });

      // Analyze Right B (Modified): present in A -> normal, absent in A -> added
      const rightItems = filteredLinesB.map((rawText, idx) => {
        const cleaned = processedB[idx];
        const countA = remainingMapA.get(cleaned) || 0;
        if (countA > 0) {
          remainingMapA.set(cleaned, countA - 1);
          return { lineNum: idx + 1, rawText, cleaned, type: 'normal' as const };
        } else {
          return { lineNum: idx + 1, rawText, cleaned, type: 'add' as const };
        }
      });

      const pairedRows: SideBySideRow[] = [];
      let leftIdx = 0;
      let rightIdx = 0;
      let rowCounter = 0;

      while (leftIdx < leftItems.length || rightIdx < rightItems.length) {
        const left = leftItems[leftIdx];
        const right = rightItems[rightIdx];

        // 1. Both normal
        if (left && right && left.type === 'normal' && right.type === 'normal' && left.cleaned === right.cleaned) {
          pairedRows.push({
            id: `sem-${rowCounter++}`,
            lineNumA: left.lineNum,
            textA: left.rawText,
            typeA: 'normal',
            lineNumB: right.lineNum,
            textB: right.rawText,
            typeB: 'normal',
          });
          leftIdx++;
          rightIdx++;
        }
        // 2. Left is delete and Right is add -> Pair as 'change' for inline diff!
        else if (left && right && left.type === 'delete' && right.type === 'add') {
          pairedRows.push({
            id: `sem-${rowCounter++}`,
            lineNumA: left.lineNum,
            textA: left.rawText,
            typeA: 'change',
            lineNumB: right.lineNum,
            textB: right.rawText,
            typeB: 'change',
          });
          leftIdx++;
          rightIdx++;
        }
        // 3. Left is delete only
        else if (left && left.type === 'delete') {
          pairedRows.push({
            id: `sem-${rowCounter++}`,
            lineNumA: left.lineNum,
            textA: left.rawText,
            typeA: 'delete',
            lineNumB: null,
            textB: '',
            typeB: 'empty',
          });
          leftIdx++;
        }
        // 4. Right is add only
        else if (right && right.type === 'add') {
          pairedRows.push({
            id: `sem-${rowCounter++}`,
            lineNumA: null,
            textA: '',
            typeA: 'empty',
            lineNumB: right.lineNum,
            textB: right.rawText,
            typeB: 'add',
          });
          rightIdx++;
        }
        // 5. Fallback
        else {
          if (left) {
            pairedRows.push({
              id: `sem-${rowCounter++}`,
              lineNumA: left.lineNum,
              textA: left.rawText,
              typeA: left.type,
              lineNumB: null,
              textB: '',
              typeB: 'empty',
            });
            leftIdx++;
          } else if (right) {
            pairedRows.push({
              id: `sem-${rowCounter++}`,
              lineNumA: null,
              textA: '',
              typeA: 'empty',
              lineNumB: right.lineNum,
              textB: right.rawText,
              typeB: 'add',
            });
            rightIdx++;
          }
        }
      }

      return pairedRows;
    }

    // 📄 Mode 2: Strict Line Positioning Diff Mode (diffMode === 'line')
    const diffParts = Diff.diffLines(processedA.join('\n'), processedB.join('\n'));

    const rows: SideBySideRow[] = [];
    let lineIdxA = 0;
    let lineIdxB = 0;
    let rowCounter = 0;

    diffParts.forEach((part) => {
      const lines = typeof part.value === 'string' ? part.value.split(/\r?\n/) : (part.value as string[]);
      if (lines.length > 0 && lines[lines.length - 1] === '') {
        lines.pop();
      }

      if (part.added) {
        lines.forEach((lineText) => {
          lineIdxB++;
          rows.push({
            id: `row-${rowCounter++}`,
            lineNumA: null,
            textA: '',
            typeA: 'empty',
            lineNumB: lineIdxB,
            textB: filteredLinesB[lineIdxB - 1] ?? lineText,
            typeB: 'add',
          });
        });
      } else if (part.removed) {
        lines.forEach((lineText) => {
          lineIdxA++;
          rows.push({
            id: `row-${rowCounter++}`,
            lineNumA: lineIdxA,
            textA: filteredLinesA[lineIdxA - 1] ?? lineText,
            typeA: 'delete',
            lineNumB: null,
            textB: '',
            typeB: 'empty',
          });
        });
      } else {
        lines.forEach((lineText) => {
          lineIdxA++;
          lineIdxB++;
          rows.push({
            id: `row-${rowCounter++}`,
            lineNumA: lineIdxA,
            textA: filteredLinesA[lineIdxA - 1] ?? lineText,
            typeA: 'normal',
            lineNumB: lineIdxB,
            textB: filteredLinesB[lineIdxB - 1] ?? lineText,
            typeB: 'normal',
          });
        });
      }
    });

    const pairedRows: SideBySideRow[] = [];
    for (let i = 0; i < rows.length; i++) {
      const curr = rows[i];
      const next = rows[i + 1];
      if (curr && next && curr.typeA === 'delete' && next.typeB === 'add') {
        pairedRows.push({
          id: curr.id, // Preserve unique row.id
          lineNumA: curr.lineNumA,
          textA: curr.textA,
          typeA: 'change',
          lineNumB: next.lineNumB,
          textB: next.textB,
          typeB: 'change',
        });
        i++;
      } else {
        pairedRows.push(curr);
      }
    }

    return pairedRows;
  }, [formattedTextA, formattedTextB, ignoreEmptyLines, cleanLine, diffMode]);

  // Filtered rows for rendering when "Show Only Diffs" (showOnlyDiffs) is enabled
  const displayRows = useMemo(() => {
    if (!showOnlyDiffs) return sideBySideRows;
    return sideBySideRows.filter((row) => row.typeA !== 'normal' || row.typeB !== 'normal');
  }, [sideBySideRows, showOnlyDiffs]);

  // Indices of rows in displayRows that contain changes
  const changeIndices = useMemo(() => {
    const indices: number[] = [];
    displayRows.forEach((row, idx) => {
      if (row.typeA !== 'normal' || row.typeB !== 'normal') {
        indices.push(idx);
      }
    });
    return indices;
  }, [displayRows]);

  // Reset active change index when text, options, or diffMode change
  useEffect(() => {
    setActiveChangeIndex(-1);
  }, [textA, textB, ignoreMultipleSpaces, ignoreEmptyLines, ignoreCase, trimWhitespace, autoFormatStructured, showOnlyDiffs, diffMode]);

  // Distance-based scrollTop scroll guarantee
  const scrollToLineIndex = useCallback((targetRowIndex: number) => {
    const targetRow = displayRows[targetRowIndex];
    if (!targetRow) return;

    const containerA = scrollRefA.current;
    const containerB = scrollRefB.current;
    const targetEl = rowElementRefsA.current[targetRow.id] ?? rowElementRefsB.current[targetRow.id];

    if (targetEl && containerA) {
      const targetTop = targetEl.offsetTop;
      const safeTop = Math.max(0, targetTop - 48); // Top 48px padding offset
      const distance = Math.abs(containerA.scrollTop - safeTop);

      if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
      isSyncingRef.current = true;

      const scrollBehavior: ScrollBehavior = distance > 800 ? 'auto' : 'smooth';

      containerA.scrollTo({ top: safeTop, behavior: scrollBehavior });
      if (containerB) {
        containerB.scrollTo({ top: safeTop, behavior: scrollBehavior });
      }

      if (distance > 800) {
        containerA.scrollTop = safeTop;
        if (containerB) containerB.scrollTop = safeTop;
      }

      syncTimeoutRef.current = setTimeout(() => {
        isSyncingRef.current = false;
      }, 250);
    }
  }, [displayRows]);

  // Jump to specific change row index
  const scrollToChangeIndex = useCallback((targetChangeIdx: number) => {
    if (changeIndices.length === 0) return;
    const normalizedIdx = (targetChangeIdx + changeIndices.length) % changeIndices.length;
    setActiveChangeIndex(normalizedIdx);
    const rowIdx = changeIndices[normalizedIdx];
    scrollToLineIndex(rowIdx);
  }, [changeIndices, scrollToLineIndex]);

  const handleNextChange = () => {
    if (changeIndices.length === 0) return;
    const next = activeChangeIndex < changeIndices.length - 1 ? activeChangeIndex + 1 : 0;
    scrollToChangeIndex(next);
  };

  const handlePrevChange = () => {
    if (changeIndices.length === 0) return;
    const prev = activeChangeIndex > 0 ? activeChangeIndex - 1 : changeIndices.length - 1;
    scrollToChangeIndex(prev);
  };

  // Click on any change row to jump to it immediately
  const handleRowClick = (idx: number) => {
    const changeIdx = changeIndices.indexOf(idx);
    if (changeIdx !== -1) {
      scrollToChangeIndex(changeIdx);
    } else {
      scrollToLineIndex(idx);
    }
  };

  // Sync Diff Viewer scroll position with Textarea cursor position
  const handleTextareaCursorMove = (textarea: HTMLTextAreaElement, isTargetA: boolean) => {
    const selStart = textarea.selectionStart;
    const text = textarea.value;
    const uptoCursor = text.substring(0, selStart);
    const targetLineNum = uptoCursor.split('\n').length;

    const matchingRowIdx = displayRows.findIndex(row => isTargetA ? row.lineNumA === targetLineNum : row.lineNumB === targetLineNum);
    if (matchingRowIdx !== -1) {
      scrollToLineIndex(matchingRowIdx);
    }
  };

  // Summary statistics
  const stats = useMemo(() => {
    let addedLines = 0;
    let removedLines = 0;
    let changedCount = 0;

    sideBySideRows.forEach((row) => {
      if (row.typeA === 'delete' || row.typeA === 'change') removedLines++;
      if (row.typeB === 'add' || row.typeB === 'change') addedLines++;
      if (row.typeA === 'change' || row.typeB === 'change') changedCount++;
    });

    return { addedLines, removedLines, changedCount };
  }, [sideBySideRows]);

  // Robust Copy Diff result handler with fallback for HTTP / non-secure contexts
  const handleCopyDiff = useCallback(async () => {
    const rowsToCopy = showOnlyDiffs ? displayRows : sideBySideRows;
    const summaryText =
      `--- ${fileAName}\n+++ ${fileBName}\n` +
      `통계: +${stats.addedLines}줄 추가, -${stats.removedLines}줄 삭제, ${stats.changedCount}개 변경\n` +
      `--------------------------------------------------\n` +
      rowsToCopy
        .map((r, i) => {
          const lineAInfo = r.lineNumA !== null ? `A:${r.lineNumA}` : '   ';
          const lineBInfo = r.lineNumB !== null ? `B:${r.lineNumB}` : '   ';
          const typeInfo = r.typeA === 'delete' ? '[-]' : r.typeB === 'add' ? '[+]' : r.typeA === 'change' ? '[~]' : '   ';
          return `${typeInfo} [${lineAInfo} | ${lineBInfo}] 원본(A): ${r.textA || '(공백)'} \t|\t 수정(B): ${r.textB || '(공백)'}`;
        })
        .join('\n');

    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(summaryText);
        showToast('✓ A열 및 B열 비교 결과가 클립보드에 성공적으로 복사되었습니다.');
        return;
      }
      throw new Error('Clipboard API unavailable');
    } catch (err) {
      console.warn('Clipboard writeText failed, trying execCommand fallback:', err);
      try {
        const textarea = document.createElement('textarea');
        textarea.value = summaryText;
        textarea.style.position = 'fixed';
        textarea.style.top = '0';
        textarea.style.left = '0';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        const successful = document.execCommand('copy');
        document.body.removeChild(textarea);
        if (successful) {
          showToast('✓ A열 및 B열 비교 결과가 클립보드에 복사되었습니다.');
        } else {
          showToast('⚠ 복사 실패 (브라우저 보안 제한)');
        }
      } catch (fallbackErr) {
        console.error('Fallback copy failed:', fallbackErr);
        showToast('⚠ 클립보드 복사 실패');
      }
    }
  }, [fileAName, fileBName, stats, displayRows, sideBySideRows, showOnlyDiffs]);

  // Inline Character-level Diff helper for changed lines
  const renderInlineDiff = (text1: string, text2: string, isAdded: boolean) => {
    const wordDiff = Diff.diffWords(text1, text2);
    return wordDiff.map((part, pIdx) => {
      if (part.added && isAdded) {
        return (
          <span key={pIdx} className="bg-emerald-500/30 text-emerald-900 dark:text-emerald-200 font-semibold px-0.5 rounded">
            {part.value}
          </span>
        );
      }
      if (part.removed && !isAdded) {
        return (
          <span key={pIdx} className="bg-rose-500/30 text-rose-900 dark:text-rose-200 font-semibold px-0.5 rounded line-through">
            {part.value}
          </span>
        );
      }
      if (!part.added && !part.removed) {
        return <span key={pIdx}>{part.value}</span>;
      }
      return null;
    });
  };

  if (!isOpen) return null;

  return (
    <div
      id="file-diff-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/60 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={(e) => {
        if ((e.target as HTMLElement).id === 'file-diff-modal-backdrop') onClose();
      }}
    >
      <div
        id="file-diff-modal-container"
        className={`bg-white dark:bg-[#1a1a1a] rounded-2xl shadow-2xl border border-stone-200 dark:border-stone-800 flex flex-col overflow-hidden animate-in zoom-in-95 duration-150 transition-all ${
          isMaximized ? 'w-[98vw] h-[98vh]' : 'w-full max-w-7xl h-[92vh]'
        }`}
      >
        {/* Header */}
        <div className="px-6 py-3.5 bg-stone-50 dark:bg-[#222222] border-b border-stone-200 dark:border-stone-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center border border-amber-500/30">
              <GitCompare className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <h2 className="text-base font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2">
                <span>파일 Diff 비교기</span>
                {diffMode === 'semantic' ? (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500 text-white font-bold">
                    🔤 텍스트 비교 모드
                  </span>
                ) : (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500 text-white font-bold">
                    📄 줄 비교 모드
                  </span>
                )}
                {showOnlyDiffs && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500 text-stone-950 font-bold">
                    🔍 변경 내역 필터링
                  </span>
                )}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Diff Engine Mode Switcher Tabs */}
            <div className="flex items-center bg-stone-200/80 dark:bg-stone-800 p-0.5 rounded-xl text-xs font-semibold">
              <button
                type="button"
                onClick={() => setDiffMode('semantic')}
                className={`px-3 py-1 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
                  diffMode === 'semantic'
                    ? 'bg-white dark:bg-stone-700 text-stone-900 dark:text-white shadow-2xs font-bold'
                    : 'text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200'
                }`}
                title="라인 위치 오프셋 무시하고 텍스트 내용의 실제 존재 여부 비교"
              >
                <span>🔤 텍스트 내용만 비교</span>
              </button>
              <button
                type="button"
                onClick={() => setDiffMode('line')}
                className={`px-3 py-1 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
                  diffMode === 'line'
                    ? 'bg-white dark:bg-stone-700 text-stone-900 dark:text-white shadow-2xs font-bold'
                    : 'text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200'
                }`}
                title="기존 1:1 줄 단위 위치 기반 비교"
              >
                <span>📄 줄 단위 위치 비교</span>
              </button>
            </div>

            {/* Change Navigation Controls */}
            <div className="flex items-center gap-1 bg-stone-100 dark:bg-stone-800 px-2.5 py-1 rounded-xl text-xs font-mono border border-stone-200 dark:border-stone-700">
              <span className="text-stone-500 dark:text-stone-400 mr-1">변경점:</span>
              <span className="font-bold text-amber-600 dark:text-amber-400">
                {changeIndices.length > 0 ? `${activeChangeIndex >= 0 ? activeChangeIndex + 1 : 1} / ${changeIndices.length}` : '0 / 0'}
              </span>
              <button
                type="button"
                onClick={handlePrevChange}
                disabled={changeIndices.length === 0}
                className="p-1 rounded hover:bg-stone-200 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-300 disabled:opacity-30 transition-colors cursor-pointer"
                title="이전 변경점으로 마그네틱 이동 (▲)"
              >
                <ChevronUp className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleNextChange}
                disabled={changeIndices.length === 0}
                className="p-1 rounded hover:bg-stone-200 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-300 disabled:opacity-30 transition-colors cursor-pointer"
                title="다음 변경점으로 마그네틱 이동 (▼)"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>

            {/* Summary badges */}
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-xl bg-stone-100 dark:bg-stone-800 text-xs font-mono">
              <span className="text-emerald-600 dark:text-emerald-400 font-bold">+{stats.addedLines} 추가</span>
              <span className="text-stone-300 dark:text-stone-700">|</span>
              <span className="text-rose-600 dark:text-rose-400 font-bold">-{stats.removedLines} 삭제</span>
              <span className="text-stone-300 dark:text-stone-700">|</span>
              <span className="text-amber-600 dark:text-amber-400 font-bold">{stats.changedCount} 변경</span>
            </div>

            <button
              type="button"
              onClick={handleCopyDiff}
              className="px-3 py-1.5 rounded-xl bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-200 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              title="A열 및 B열 비교 결과 요약 복사"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>결과 복사</span>
            </button>

            {/* Maximize / Restore Toggle Button */}
            <button
              type="button"
              onClick={() => setIsMaximized((prev) => !prev)}
              className="p-2 rounded-xl text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors cursor-pointer"
              title={isMaximized ? '기존 창 크기로 복원' : '화면 전체 크게 보기'}
            >
              {isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Options Toolbar */}
        <div className="px-6 py-2.5 bg-stone-100/70 dark:bg-[#1e1e1e] border-b border-stone-200 dark:border-stone-800 flex flex-wrap items-center justify-between gap-3 shrink-0 text-xs">
          <div className="flex flex-wrap items-center gap-4">
            <span className="font-bold text-stone-700 dark:text-stone-300 flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>정밀 비교 옵션:</span>
            </span>

            {/* Show Only Diffs Toggle */}
            <label className="flex items-center gap-1.5 cursor-pointer select-none font-bold text-amber-900 dark:text-amber-300 bg-amber-500/15 px-2.5 py-1 rounded-lg border border-amber-500/30 hover:bg-amber-500/25 transition-colors">
              <input
                type="checkbox"
                checked={showOnlyDiffs}
                onChange={(e) => setShowOnlyDiffs(e.target.checked)}
                className="rounded accent-amber-500 cursor-pointer"
              />
              <span>🔍 변경된 내역만 보기</span>
            </label>

            <label className="flex items-center gap-1.5 cursor-pointer select-none text-stone-700 dark:text-stone-300 font-semibold text-amber-800 dark:text-amber-300">
              <input
                type="checkbox"
                checked={autoFormatStructured}
                onChange={(e) => handleToggleAutoFormat(e.target.checked)}
                className="rounded accent-amber-500 cursor-pointer"
              />
              <span>XML/JSON 자동 포맷팅 (Pretty)</span>
            </label>

            <label className="flex items-center gap-1.5 cursor-pointer select-none text-stone-700 dark:text-stone-300">
              <input
                type="checkbox"
                checked={ignoreMultipleSpaces}
                onChange={(e) => setIgnoreMultipleSpaces(e.target.checked)}
                className="rounded accent-amber-500 cursor-pointer"
              />
              <span>연속 공백 무시</span>
            </label>

            <label className="flex items-center gap-1.5 cursor-pointer select-none text-stone-700 dark:text-stone-300">
              <input
                type="checkbox"
                checked={ignoreEmptyLines}
                onChange={(e) => setIgnoreEmptyLines(e.target.checked)}
                className="rounded accent-amber-500 cursor-pointer"
              />
              <span>개행/빈 줄 무시</span>
            </label>

            <label className="flex items-center gap-1.5 cursor-pointer select-none text-stone-700 dark:text-stone-300">
              <input
                type="checkbox"
                checked={ignoreCase}
                onChange={(e) => setIgnoreCase(e.target.checked)}
                className="rounded accent-amber-500 cursor-pointer"
              />
              <span>대소문자 무시</span>
            </label>

            <label className="flex items-center gap-1.5 cursor-pointer select-none text-stone-700 dark:text-stone-300">
              <input
                type="checkbox"
                checked={trimWhitespace}
                onChange={(e) => setTrimWhitespace(e.target.checked)}
                className="rounded accent-amber-500 cursor-pointer"
              />
              <span>앞뒤 공백 무시 (Trim)</span>
            </label>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSwap}
              className="px-2.5 py-1 rounded-lg bg-stone-200 dark:bg-stone-700 hover:bg-stone-300 dark:hover:bg-stone-600 text-stone-700 dark:text-stone-200 flex items-center gap-1 font-medium transition-colors cursor-pointer"
              title="A와 B 파일 위치 교체"
            >
              <ArrowRightLeft className="w-3.5 h-3.5 text-amber-500" />
              <span>교체 (A ⇄ B)</span>
            </button>

            <button
              type="button"
              onClick={handleClearAll}
              className="px-2.5 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 flex items-center gap-1 font-medium transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>모두 지우기</span>
            </button>
          </div>
        </div>

        {/* Input Textareas Bar (Top section of body) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-stone-200 dark:divide-stone-800 shrink-0 bg-stone-50/70 dark:bg-[#1f1f1f] border-b border-stone-200 dark:border-stone-800">
          {/* Pane A Input */}
          <div className="flex flex-col p-3">
            <div className="flex items-center justify-between mb-1.5 text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <FileCode className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                <span className="font-bold text-stone-800 dark:text-stone-200 truncate" title={fileAName}>
                  {fileAName}
                </span>
                <span className="text-[10px] text-stone-400 font-mono">
                  ({textA.split('\n').length}줄)
                </span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <input type="file" ref={fileInputARef} onChange={(e) => handleFileUpload(e, true)} className="hidden" />
                <button
                  type="button"
                  onClick={() => fileInputARef.current?.click()}
                  className="px-2 py-0.5 rounded bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 hover:bg-stone-50 text-stone-700 dark:text-stone-300 flex items-center gap-1 text-[11px] cursor-pointer"
                >
                  <Upload className="w-3 h-3 text-blue-500" />
                  <span>파일 열기</span>
                </button>
              </div>
            </div>
            <textarea
              ref={textareaARef}
              value={textA}
              onChange={(e) => setTextA(e.target.value)}
              onSelect={(e) => handleTextareaCursorMove(e.currentTarget, true)}
              onKeyUp={(e) => handleTextareaCursorMove(e.currentTarget, true)}
              onClick={(e) => handleTextareaCursorMove(e.currentTarget, true)}
              placeholder="원본 텍스트(XML, JSON 등)를 입력하거나 파일을 드래그하여 놓으세요..."
              className="w-full h-28 p-2.5 font-mono text-xs bg-white dark:bg-[#141414] text-stone-800 dark:text-stone-200 border border-stone-200 dark:border-stone-800 rounded-xl focus:ring-1 focus:ring-amber-500 focus:outline-hidden resize-none custom-scrollbar leading-relaxed"
              spellCheck={false}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => handleDrop(e, true)}
            />
          </div>

          {/* Pane B Input */}
          <div className="flex flex-col p-3">
            <div className="flex items-center justify-between mb-1.5 text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <FileCode className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                <span className="font-bold text-stone-800 dark:text-stone-200 truncate" title={fileBName}>
                  {fileBName}
                </span>
                <span className="text-[10px] text-stone-400 font-mono">
                  ({textB.split('\n').length}줄)
                </span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <input type="file" ref={fileInputBRef} onChange={(e) => handleFileUpload(e, false)} className="hidden" />
                <button
                  type="button"
                  onClick={() => fileInputBRef.current?.click()}
                  className="px-2 py-0.5 rounded bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 hover:bg-stone-50 text-stone-700 dark:text-stone-300 flex items-center gap-1 text-[11px] cursor-pointer"
                >
                  <Upload className="w-3 h-3 text-emerald-500" />
                  <span>파일 열기</span>
                </button>
              </div>
            </div>
            <textarea
              ref={textareaBRef}
              value={textB}
              onChange={(e) => setTextB(e.target.value)}
              onSelect={(e) => handleTextareaCursorMove(e.currentTarget, false)}
              onKeyUp={(e) => handleTextareaCursorMove(e.currentTarget, false)}
              onClick={(e) => handleTextareaCursorMove(e.currentTarget, false)}
              placeholder="비교 대상 텍스트(XML, JSON 등)를 입력하거나 파일을 드래그하여 놓으세요..."
              className="w-full h-28 p-2.5 font-mono text-xs bg-white dark:bg-[#141414] text-stone-800 dark:text-stone-200 border border-stone-200 dark:border-stone-800 rounded-xl focus:ring-1 focus:ring-amber-500 focus:outline-hidden resize-none custom-scrollbar leading-relaxed"
              spellCheck={false}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => handleDrop(e, false)}
            />
          </div>
        </div>

        {/* Connected Side-by-Side Synchronized Diff Viewer */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-stone-200 dark:divide-stone-800 overflow-hidden bg-white dark:bg-[#121212] min-h-0">
          {/* Left Side (Original A) */}
          <div
            ref={scrollRefA}
            onScroll={handleScrollA}
            className="flex-1 h-full overflow-y-auto overflow-x-auto font-mono text-xs custom-scrollbar relative select-text"
          >
            {displayRows.length === 0 ? (
              <div className="text-center py-16 text-stone-400 text-xs">
                {showOnlyDiffs ? '변경된 내역이 없습니다 (동일한 내용).' : '비교할 텍스트를 입력해주세요.'}
              </div>
            ) : (
              displayRows.map((row, idx) => {
                const isDeleted = row.typeA === 'delete';
                const isChanged = row.typeA === 'change';
                const isEmpty = row.typeA === 'empty';
                const isCurrentActive = changeIndices[activeChangeIndex] === idx;
                const isChangeRow = row.typeA !== 'normal' && row.typeA !== 'empty';

                let bgClass = 'bg-transparent text-stone-700 dark:text-stone-300';
                if (isDeleted || isChanged) {
                  bgClass = 'bg-rose-500/20 dark:bg-rose-500/25 text-rose-950 dark:text-rose-100 font-medium';
                } else if (isEmpty) {
                  bgClass = 'bg-stone-100/50 dark:bg-stone-900/40 opacity-40';
                } else {
                  bgClass = 'text-stone-900 dark:text-stone-100';
                }

                if (isCurrentActive) {
                  bgClass = 'bg-amber-400/40 dark:bg-amber-500/40 ring-2 ring-amber-500 font-extrabold transition-all duration-500 z-10 text-stone-950 dark:text-white';
                }

                return (
                  <div
                    key={`left-${row.id}`}
                    ref={(el) => { rowElementRefsA.current[row.id] = el; }}
                    onClick={() => handleRowClick(idx)}
                    className={`flex items-stretch border-b border-stone-100 dark:border-stone-800/40 min-h-[24px] ${bgClass} ${isChangeRow ? 'cursor-pointer hover:opacity-90' : ''}`}
                    title={isChangeRow ? '클릭 시 이 변경점 위치로 이동합니다' : undefined}
                  >
                    <div className="w-12 py-1 px-2 select-none text-right text-stone-400 dark:text-stone-600 bg-stone-50 dark:bg-[#1a1a1a] border-r border-stone-200 dark:border-stone-800 font-mono text-[11px] shrink-0">
                      {row.lineNumA ?? ''}
                    </div>
                    <div className="w-6 py-1 px-1 select-none text-center font-bold shrink-0">
                      {isDeleted || isChanged ? '-' : ' '}
                    </div>
                    <div className="py-1 px-2 flex-1 whitespace-pre-wrap break-all leading-relaxed">
                      {isChanged ? renderInlineDiff(row.textA, row.textB, false) : row.textA}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Right Side (Modified B) */}
          <div
            ref={scrollRefB}
            onScroll={handleScrollB}
            className="flex-1 h-full overflow-y-auto overflow-x-auto font-mono text-xs custom-scrollbar relative select-text"
          >
            {displayRows.length === 0 ? (
              <div className="text-center py-16 text-stone-400 text-xs">
                {showOnlyDiffs ? '변경된 내역이 없습니다 (동일한 내용).' : '비교할 텍스트를 입력해주세요.'}
              </div>
            ) : (
              displayRows.map((row, idx) => {
                const isAdded = row.typeB === 'add';
                const isChanged = row.typeB === 'change';
                const isEmpty = row.typeB === 'empty';
                const isCurrentActive = changeIndices[activeChangeIndex] === idx;
                const isChangeRow = row.typeB !== 'normal' && row.typeB !== 'empty';

                let bgClass = 'bg-transparent text-stone-700 dark:text-stone-300';
                if (isAdded || isChanged) {
                  bgClass = 'bg-emerald-500/20 dark:bg-emerald-500/25 text-emerald-950 dark:text-emerald-100 font-medium';
                } else if (isEmpty) {
                  bgClass = 'bg-stone-100/50 dark:bg-stone-900/40 opacity-40';
                } else {
                  bgClass = 'text-stone-900 dark:text-stone-100';
                }

                if (isCurrentActive) {
                  bgClass = 'bg-amber-400/40 dark:bg-amber-500/40 ring-2 ring-amber-500 font-extrabold transition-all duration-500 z-10 text-stone-950 dark:text-white';
                }

                return (
                  <div
                    key={`right-${row.id}`}
                    ref={(el) => { rowElementRefsB.current[row.id] = el; }}
                    onClick={() => handleRowClick(idx)}
                    className={`flex items-stretch border-b border-stone-100 dark:border-stone-800/40 min-h-[24px] ${bgClass} ${isChangeRow ? 'cursor-pointer hover:opacity-90' : ''}`}
                    title={isChangeRow ? '클릭 시 이 변경점 위치로 이동합니다' : undefined}
                  >
                    <div className="w-12 py-1 px-2 select-none text-right text-stone-400 dark:text-stone-600 bg-stone-50 dark:bg-[#1a1a1a] border-r border-stone-200 dark:border-stone-800 font-mono text-[11px] shrink-0">
                      {row.lineNumB ?? ''}
                    </div>
                    <div className="w-6 py-1 px-1 select-none text-center font-bold shrink-0">
                      {isAdded || isChanged ? '+' : ' '}
                    </div>
                    <div className="py-1 px-2 flex-1 whitespace-pre-wrap break-all leading-relaxed">
                      {isChanged ? renderInlineDiff(row.textB, row.textA, true) : row.textB}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Footer Toast / Close */}
        {toastMessage && (
          <div className="absolute bottom-4 right-4 z-50 px-4 py-2 bg-stone-900 text-amber-300 rounded-xl shadow-2xl text-xs font-bold animate-in fade-in slide-in-from-bottom-2 duration-150 border border-amber-500/40">
            {toastMessage}
          </div>
        )}
      </div>
    </div>
  );
};
