import React from 'react';
import { AlertTriangle, Trash2, X, Table, Folder } from 'lucide-react';
import { TreeItem, TableDocument } from '../../types';

interface DeleteTreeItemModalProps {
  isOpen: boolean;
  item: TreeItem | null;
  tree: TreeItem[];
  tables: Record<string, TableDocument>;
  onConfirm: () => void;
  onClose: () => void;
}

export const DeleteTreeItemModal: React.FC<DeleteTreeItemModalProps> = ({
  isOpen,
  item,
  tree,
  tables,
  onConfirm,
  onClose,
}) => {
  if (!isOpen || !item) return null;

  // Find all descendant IDs (including the item itself)
  const findDescendants = (rootId: string): string[] => {
    const children = tree.filter((t) => t.parentId === rootId);
    let ids = [rootId];
    children.forEach((c) => {
      ids = [...ids, ...findDescendants(c.id)];
    });
    return ids;
  };

  const descendantIds = findDescendants(item.id);
  const affectedTables = descendantIds
    .map((id) => tables[id])
    .filter((t): t is TableDocument => Boolean(t));

  const totalRowCount = affectedTables.reduce(
    (acc, t) => acc + (Array.isArray(t.rows) ? t.rows.length : 0),
    0
  );

  const isFolder = item.type === 'folder';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white dark:bg-[#1e1e1e] border border-stone-200 dark:border-[#333] rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between border-b border-rose-100 dark:border-rose-950/40 bg-rose-50/70 dark:bg-rose-950/20">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-500/10 dark:bg-rose-500/20 flex items-center justify-center text-rose-600 dark:text-rose-400 shadow-2xs">
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-stone-900 dark:text-stone-100">
                {isFolder ? '폴더 및 하위 테이블 일괄 삭제' : '테이블 및 DB 데이터 일괄 삭제'}
              </h3>
              <p className="text-xs text-rose-600 dark:text-rose-400 font-medium">
                데이터베이스(SQLite) 영구 삭제 안내
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-[#2a2a2a] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 text-stone-700 dark:text-stone-300">
          {/* Target Item Badge */}
          <div className="flex items-center gap-3 p-3 bg-stone-100/70 dark:bg-[#282828] rounded-xl border border-stone-200/60 dark:border-[#383838]">
            {isFolder ? (
              <Folder className="w-5 h-5 text-amber-500 shrink-0" />
            ) : (
              <Table className="w-5 h-5 text-blue-500 shrink-0" />
            )}
            <div className="min-w-0 flex-1">
              <div className="text-xs text-stone-500 dark:text-stone-400">
                {isFolder ? '삭제 대상 폴더' : '삭제 대상 테이블'}
              </div>
              <div className="text-sm font-bold text-stone-900 dark:text-stone-100 truncate">
                {item.title}
              </div>
            </div>
          </div>

          {/* Warning Notice Box */}
          <div className="p-3.5 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 rounded-xl text-xs space-y-2">
            <div className="flex items-center gap-2 font-bold text-rose-700 dark:text-rose-400">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>데이터 일괄 영구 삭제 안내</span>
            </div>
            <p className="text-rose-600/90 dark:text-rose-300 leading-relaxed">
              워크스페이스 트리에서 삭제 시, SQLite 데이터베이스에 저장된 
              <strong> 테이블 스키마, 모든 행({totalRowCount}개 레코드), 캘린더 일정 및 첨부 이미지</strong>가 
              일괄 영구 삭제됩니다.
            </p>
            {isFolder && affectedTables.length > 0 && (
              <p className="text-rose-700 dark:text-rose-400 font-semibold pt-1 border-t border-rose-200/50 dark:border-rose-900/40">
                ※ 포함된 테이블: {affectedTables.length}개 ({affectedTables.map((t) => t.title).join(', ')})
              </p>
            )}
          </div>

          <p className="text-xs text-stone-500 dark:text-stone-400 text-center">
            이 작업은 실행 후 되돌릴 수 없습니다. 계속 진행하시겠습니까?
          </p>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-stone-50 dark:bg-[#181818] border-t border-stone-200 dark:border-[#2a2a2a] flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-stone-600 dark:text-stone-300 hover:bg-stone-200/70 dark:hover:bg-[#282828] rounded-xl transition-colors cursor-pointer"
          >
            취소
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 active:bg-rose-800 rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>일괄 영구 삭제</span>
          </button>
        </div>
      </div>
    </div>
  );
};
