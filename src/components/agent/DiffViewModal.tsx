import React, { useState, useMemo } from 'react';
import * as Diff from 'diff';
import { X, Check, ArrowLeftRight, FileText, Sparkles, Copy } from 'lucide-react';

interface DiffViewModalProps {
  isOpen: boolean;
  onClose: () => void;
  originalText: string;
  revisedText: string;
  title?: string;
  summary?: string;
  onApply: (newText: string) => void;
}

export const DiffViewModal: React.FC<DiffViewModalProps> = ({
  isOpen,
  onClose,
  originalText,
  revisedText,
  title = 'AI 문서 수정안 비교 (Diff)',
  summary,
  onApply,
}) => {
  const [viewMode, setViewMode] = useState<'unified' | 'split'>('unified');
  const [copied, setCopied] = useState(false);

  // Calculate diff lines
  const diffLines = useMemo(() => {
    return Diff.diffLines(originalText, revisedText);
  }, [originalText, revisedText]);

  // Statistics
  const stats = useMemo(() => {
    let added = 0;
    let removed = 0;
    diffLines.forEach((part) => {
      const count = part.value.split('\n').filter(Boolean).length;
      if (part.added) added += count;
      if (part.removed) removed += count;
    });
    return { added, removed };
  }, [diffLines]);

  if (!isOpen) return null;

  const handleCopyRevised = () => {
    navigator.clipboard.writeText(revisedText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-[#1e1e1e] border border-stone-200 dark:border-[#333] rounded-2xl shadow-2xl w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-200 dark:border-[#2a2a2a] bg-stone-50 dark:bg-[#252525]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2">
                {title}
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium">
                  +{stats.added}행 추가
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 font-medium">
                  -{stats.removed}행 삭제
                </span>
              </h2>
              {summary && <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">{summary}</p>}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* View Mode Switcher */}
            <div className="flex items-center bg-stone-200 dark:bg-[#333] p-1 rounded-xl text-xs font-semibold">
              <button
                type="button"
                onClick={() => setViewMode('unified')}
                className={`px-3 py-1 rounded-lg transition-colors ${
                  viewMode === 'unified'
                    ? 'bg-white dark:bg-[#1e1e1e] text-stone-900 dark:text-stone-100 shadow-xs'
                    : 'text-stone-600 dark:text-stone-400 hover:text-stone-900'
                }`}
              >
                통합 뷰 (Unified)
              </button>
              <button
                type="button"
                onClick={() => setViewMode('split')}
                className={`px-3 py-1 rounded-lg transition-colors ${
                  viewMode === 'split'
                    ? 'bg-white dark:bg-[#1e1e1e] text-stone-900 dark:text-stone-100 shadow-xs'
                    : 'text-stone-600 dark:text-stone-400 hover:text-stone-900'
                }`}
              >
                좌우 비교 (Split)
              </button>
            </div>

            <button
              type="button"
              onClick={handleCopyRevised}
              className="px-3 py-1.5 rounded-xl border border-stone-300 dark:border-[#383838] hover:bg-stone-100 dark:hover:bg-[#2a2a2a] text-xs font-semibold text-stone-700 dark:text-stone-300 flex items-center gap-1.5 transition-colors"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>{copied ? '복사됨' : '수정안 복사'}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-xl hover:bg-stone-200 dark:hover:bg-[#333] flex items-center justify-center text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Diff Content Body */}
        <div className="flex-1 overflow-auto p-6 font-mono text-xs leading-relaxed bg-[#fdfdfd] dark:bg-[#181818]">
          {viewMode === 'unified' ? (
            <div className="space-y-0.5">
              {diffLines.map((part, index) => {
                const isAdded = part.added;
                const isRemoved = part.removed;
                const bgClass = isAdded
                  ? 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border-l-2 border-emerald-500 pl-2'
                  : isRemoved
                  ? 'bg-rose-500/10 text-rose-800 dark:text-rose-400 line-through opacity-75 border-l-2 border-rose-500 pl-2'
                  : 'text-stone-700 dark:text-stone-300 pl-2.5';

                const prefix = isAdded ? '+ ' : isRemoved ? '- ' : '  ';

                return (
                  <div key={index} className={`whitespace-pre-wrap py-0.5 rounded-sm ${bgClass}`}>
                    <span className="select-none font-bold opacity-50 mr-1">{prefix}</span>
                    {part.value}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 h-full">
              {/* Left: Original */}
              <div className="flex flex-col border border-stone-200 dark:border-[#2a2a2a] rounded-xl overflow-hidden bg-white dark:bg-[#1a1a1a]">
                <div className="px-3 py-2 bg-stone-100 dark:bg-[#222] border-b border-stone-200 dark:border-[#2a2a2a] font-bold text-stone-600 dark:text-stone-400">
                  기존 원문 (Original)
                </div>
                <div className="flex-1 p-4 overflow-auto whitespace-pre-wrap text-stone-700 dark:text-stone-300">
                  {originalText}
                </div>
              </div>

              {/* Right: Revised */}
              <div className="flex flex-col border border-emerald-500/30 rounded-xl overflow-hidden bg-emerald-500/5 dark:bg-[#1a221c]">
                <div className="px-3 py-2 bg-emerald-500/15 border-b border-emerald-500/30 font-bold text-emerald-700 dark:text-emerald-300 flex items-center justify-between">
                  <span>AI 수정안 (Revised by Qwen 2.5)</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-sm bg-emerald-500/20">추천</span>
                </div>
                <div className="flex-1 p-4 overflow-auto whitespace-pre-wrap text-stone-800 dark:text-stone-100">
                  {revisedText}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-stone-200 dark:border-[#2a2a2a] bg-stone-50 dark:bg-[#252525]">
          <span className="text-xs text-stone-500 dark:text-stone-400">
            수정안을 적용하면 에디터 본문이 즉시 교체되며 되돌리기(Ctrl+Z)가 가능합니다.
          </span>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-stone-300 dark:border-[#383838] hover:bg-stone-200 dark:hover:bg-[#333] text-stone-700 dark:text-stone-300 text-xs font-bold transition-colors"
            >
              원문 유지 (취소)
            </button>
            <button
              type="button"
              onClick={() => {
                onApply(revisedText);
                onClose();
              }}
              className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-bold transition-colors shadow-md flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              <span>AI 수정안 적용하기</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
