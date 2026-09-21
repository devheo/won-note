import React from 'react';
import { AlertTriangle, Check, X, ShieldAlert, Calendar, Trash2, Edit3, Database, ArrowRight } from 'lucide-react';
import { ToolActionProposal } from '../../services/ai/ollamaClient';

interface ActionConfirmModalProps {
  isOpen: boolean;
  proposal: ToolActionProposal | null;
  onApprove: (proposal: ToolActionProposal) => void;
  onReject: () => void;
}

export const ActionConfirmModal: React.FC<ActionConfirmModalProps> = ({
  isOpen,
  proposal,
  onApprove,
  onReject,
}) => {
  if (!isOpen || !proposal) return null;

  const isDelete = proposal.tool.includes('delete');
  const isUpdate = proposal.tool.includes('update');
  const dataUpdates = proposal.arguments?.dataUpdates;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-[#1e1e1e] border border-stone-200 dark:border-[#333] rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div
          className={`px-6 py-4 flex items-center gap-3 border-b ${
            isDelete
              ? 'bg-rose-500/10 border-rose-500/20 text-rose-700 dark:text-rose-400'
              : isUpdate
              ? 'bg-blue-500/10 border-blue-500/20 text-blue-700 dark:text-blue-400'
              : 'bg-amber-500/10 border-amber-500/20 text-amber-700 dark:text-amber-400'
          }`}
        >
          <div className="w-10 h-10 rounded-xl bg-white/80 dark:bg-[#252525] flex items-center justify-center shadow-xs">
            {isDelete ? (
              <Trash2 className="w-5 h-5 text-rose-600" />
            ) : isUpdate ? (
              <Edit3 className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            ) : (
              <ShieldAlert className="w-5 h-5 text-amber-500" />
            )}
          </div>
          <div>
            <h3 className="text-base font-bold text-stone-900 dark:text-stone-100">
              {isDelete
                ? '데이터 삭제 승인 요청'
                : isUpdate
                ? '데이터 수정(Update) 승인 요청'
                : 'AI 작업 실행 승인 요청'}
            </h3>
            <p className="text-xs text-stone-500 dark:text-stone-400">
              안전한 데이터 보호를 위해 실행 전 사용자의 최종 승인이 필요합니다.
            </p>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4 text-xs">
          <div>
            <span className="font-bold text-stone-600 dark:text-stone-400">실행 도구 (Tool):</span>
            <div className="mt-1 px-3 py-2 bg-stone-100 dark:bg-[#252525] rounded-xl font-mono text-stone-800 dark:text-stone-200">
              {proposal.tool}
            </div>
          </div>

          <div>
            <span className="font-bold text-stone-600 dark:text-stone-400">작업 내용 요약:</span>
            <p className="mt-1 p-3 bg-amber-500/5 dark:bg-amber-950/20 border border-amber-500/20 rounded-xl text-stone-800 dark:text-stone-200 font-medium">
              {proposal.summary}
            </p>
          </div>

          {/* Visual Data Diff if updating table row */}
          {dataUpdates && typeof dataUpdates === 'object' && Object.keys(dataUpdates).length > 0 && (
            <div>
              <span className="font-bold text-stone-600 dark:text-stone-400">변경될 필드 데이터 (Visual Diff):</span>
              <div className="mt-1.5 border border-stone-200 dark:border-[#333] rounded-xl overflow-hidden">
                <table className="w-full text-left text-[11px]">
                  <thead className="bg-stone-100 dark:bg-[#2a2a2a] text-stone-500 dark:text-stone-400 border-b border-stone-200 dark:border-[#333]">
                    <tr>
                      <th className="px-3 py-2 font-semibold">속성/컬럼</th>
                      <th className="px-3 py-2 font-semibold">적용될 새 값</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100 dark:divide-[#2d2d2d]">
                    {Object.entries(dataUpdates).map(([colId, val]) => (
                      <tr key={colId} className="bg-white dark:bg-[#202020]">
                        <td className="px-3 py-2 font-mono text-stone-600 dark:text-stone-400">
                          {colId}
                        </td>
                        <td className="px-3 py-2">
                          <span className="inline-flex items-center gap-1 font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800/40">
                            {String(val)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div>
            <span className="font-bold text-stone-600 dark:text-stone-400">전체 매개변수 (Arguments):</span>
            <pre className="mt-1 p-3 bg-[#181818] text-amber-300 rounded-xl font-mono text-[11px] overflow-auto max-h-32">
              {JSON.stringify(proposal.arguments, null, 2)}
            </pre>
          </div>

          {isDelete && (
            <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400 text-xs font-semibold">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>주의: 이 작업은 SQLite 데이터베이스에서 영구적으로 삭제됩니다.</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-stone-50 dark:bg-[#252525] border-t border-stone-200 dark:border-[#2a2a2a] flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onReject}
            className="px-4 py-2 rounded-xl border border-stone-300 dark:border-[#383838] hover:bg-stone-200 dark:hover:bg-[#333] text-stone-700 dark:text-stone-300 font-bold text-xs transition-colors"
          >
            거부 (취소)
          </button>
          <button
            type="button"
            onClick={() => onApprove(proposal)}
            className={`px-5 py-2 rounded-xl font-bold text-xs text-white transition-colors shadow-md flex items-center gap-1.5 ${
              isDelete
                ? 'bg-rose-600 hover:bg-rose-500'
                : isUpdate
                ? 'bg-blue-600 hover:bg-blue-500'
                : 'bg-amber-600 hover:bg-amber-500'
            }`}
          >
            <Check className="w-4 h-4" />
            <span>승인 및 실행</span>
          </button>
        </div>
      </div>
    </div>
  );
};
