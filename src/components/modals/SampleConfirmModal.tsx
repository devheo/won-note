import React from 'react';
import { Sparkles, X, PlusCircle, ShieldCheck } from 'lucide-react';

interface SampleConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isLoading?: boolean;
}

export const SampleConfirmModal: React.FC<SampleConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  isLoading = false,
}) => {
  if (!isOpen) return null;

  return (
    <div
      id="sample-confirm-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/60 backdrop-blur-sm animate-in fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-stone-900 rounded-2xl shadow-2xl border border-stone-200 dark:border-stone-800 w-full max-w-md overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-200 dark:border-stone-800 bg-amber-500/10 dark:bg-amber-950/30">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-400/20 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold">
              <Sparkles className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <h2 className="text-base font-bold text-stone-900 dark:text-stone-100">
                샘플 템플릿 추가 확인
              </h2>
              <p className="text-xs text-stone-500 dark:text-stone-400">
                기존 작업 데이터를 보존하며 샘플을 추가합니다
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-4 text-xs">
          <div className="p-3.5 bg-stone-50 dark:bg-stone-800/60 rounded-xl border border-stone-200 dark:border-stone-700/60 space-y-2">
            <div className="flex items-center gap-2 font-bold text-stone-800 dark:text-stone-200">
              <PlusCircle className="w-4 h-4 text-amber-500 shrink-0" />
              <span>추가되는 기본 샘플 프로젝트</span>
            </div>
            <ul className="list-disc list-inside text-stone-600 dark:text-stone-300 space-y-1 pl-1 text-[11px] leading-relaxed">
              <li>🎯 원비 2026 로드맵 &amp; 기능 정의</li>
              <li>⚡ 개발 스프린트 &amp; 백로그</li>
              <li>💻 SQL 쿼리 &amp; 데이터 딕셔너리</li>
              <li>💌 유저 피드백 &amp; 꿀팁 수집함</li>
            </ul>
          </div>

          <div className="flex items-start gap-2.5 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-800 dark:text-emerald-300">
            <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <div className="text-[11px] leading-relaxed font-medium">
              <strong>기존 데이터 안전 보존:</strong> 현재 작성되어 있는 테이블과 노트는 삭제되지 않고 안전하게 유지되며, 샘플 데이터만 고유한 ID로 신규 추가됩니다.
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 border-t border-stone-200 dark:border-stone-800 bg-stone-50/50 dark:bg-stone-900/50 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="px-3.5 py-2 text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
          >
            취소
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold rounded-xl text-xs transition-colors flex items-center gap-1.5 shadow-sm cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-stone-950" />
            <span>{isLoading ? '추가 중...' : '기존 데이터에 샘플 추가'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
