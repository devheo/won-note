import React from 'react';
import { HardDrive, CheckCircle2, AlertCircle, Unlink, RefreshCw, Save } from 'lucide-react';

interface LocalFileStatusIndicatorProps {
  connectedFileName: string | null;
  isSupported: boolean;
  onConnectFile: () => void;
  onLinkNewFile: () => void;
  onDisconnectFile: () => void;
  onManualSave: () => void;
  isSaving: boolean;
}

export const LocalFileStatusIndicator: React.FC<LocalFileStatusIndicatorProps> = ({
  connectedFileName,
  isSupported,
  onConnectFile,
  onLinkNewFile,
  onDisconnectFile,
  onManualSave,
  isSaving,
}) => {
  if (!isSupported) {
    return null;
  }

  if (connectedFileName) {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300/80 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs shadow-2xs">
        <HardDrive className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
        <span className="font-semibold truncate max-w-[130px]" title={`로컬 파일 자동 동기화 중: ${connectedFileName}`}>
          {connectedFileName}
        </span>
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" title="실시간 자동 저장 연결됨" />

        <button
          onClick={onManualSave}
          disabled={isSaving}
          className="ml-1 p-1 hover:bg-emerald-200/60 dark:hover:bg-emerald-900/60 rounded text-emerald-700 dark:text-emerald-300 transition-colors"
          title="로컬 파일에 지금 즉시 저장"
        >
          {isSaving ? (
            <RefreshCw className="w-3 h-3 animate-spin" />
          ) : (
            <Save className="w-3 h-3" />
          )}
        </button>

        <button
          onClick={onDisconnectFile}
          className="p-1 hover:bg-emerald-200/60 dark:hover:bg-emerald-900/60 rounded text-emerald-700 dark:text-emerald-300 transition-colors"
          title="로컬 파일 연결 해제 (IndexedDB 모드로 전환)"
        >
          <Unlink className="w-3 h-3" />
        </button>
      </div>
    );
  }

  return (
    <div className="relative group">
      <button
        onClick={onConnectFile}
        className="px-2.5 py-1.5 bg-stone-100 dark:bg-[#282828] hover:bg-stone-200 dark:hover:bg-[#333333] text-stone-700 dark:text-[#e0e0e0] rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors border border-stone-200/80 dark:border-[#383838]"
        title="로컬 폴더의 wonbee_data.json 파일과 직접 연결하여 수정 시 파일에 실시간 저장합니다."
      >
        <HardDrive className="w-3.5 h-3.5 text-stone-500 dark:text-[#aaaaaa] group-hover:text-amber-500 transition-colors" />
        <span>로컬 파일 연동</span>
      </button>
    </div>
  );
};
