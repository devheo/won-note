import React, { memo, createContext, useContext, useState, useMemo, useCallback } from 'react';

export interface StatusBarMetrics {
  line?: number;
  col?: number;
  selectedChars?: number;
  selectedBytes?: number;
  lastModifiedAt?: number | string | null;
  totalBytes?: number;
  totalChars?: number;
  totalLines?: number;
  tableName?: string;
  viewModeName?: string;
}

interface GlobalStatusBarProps {
  metrics: StatusBarMetrics;
}

export const GlobalStatusBar: React.FC<GlobalStatusBarProps> = memo(({ metrics }) => {
  const line = metrics.line ?? 1;
  const col = metrics.col ?? 1;
  const selectedChars = metrics.selectedChars ?? 0;
  const selectedBytes = metrics.selectedBytes ?? 0;

  // Format last modified timestamp
  const formatTime = (ts?: number | string | null) => {
    if (!ts) return new Date().toISOString().replace('T', ' ').slice(0, 16);
    if (typeof ts === 'string') return ts;
    const d = new Date(ts);
    if (isNaN(d.getTime())) return String(ts);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const modifiedStr = formatTime(metrics.lastModifiedAt);

  // Format total size
  const formatSize = (bytes?: number) => {
    if (!bytes || bytes <= 0) return '0 KB';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const totalSizeStr = formatSize(metrics.totalBytes);

  return (
    <div
      id="global-status-bar"
      className="fixed bottom-0 left-0 right-0 z-40 h-7 bg-stone-100 dark:bg-[#1a1a1a] border-t border-stone-200 dark:border-[#333333] text-[11px] font-mono text-stone-600 dark:text-[#aaaaaa] px-4 flex items-center justify-between shadow-xs select-none shrink-0"
    >
      {/* Left Area: Position & Selection */}
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1 font-medium">
          <span>Ln {line}, Col {col}</span>
        </span>
        <span className="text-stone-300 dark:text-stone-700">|</span>
        <span title="전체 문서 길이">문서: {(metrics.totalChars ?? 0).toLocaleString()}자 · {(metrics.totalLines ?? 0).toLocaleString()}줄</span>
        <span className="text-stone-300 dark:text-stone-700">|</span>
        <span className="flex items-center gap-1">
          <span>Sel: {selectedChars.toLocaleString()} chars, {selectedBytes.toLocaleString()} bytes</span>
        </span>
      </div>

      {/* Right Area: Meta Info & System Status */}
      <div className="flex items-center gap-3">
        {metrics.tableName && (
          <>
            <span className="text-amber-600 dark:text-amber-400 font-semibold">{metrics.tableName}</span>
            <span className="text-stone-300 dark:text-stone-700">|</span>
          </>
        )}
        <span title="마지막 수정 일시">수정: {modifiedStr}</span>
        <span className="text-stone-300 dark:text-stone-700">|</span>
        <span title="전체 데이터 크기">크기: {totalSizeStr}</span>
        <span className="text-stone-300 dark:text-stone-700">|</span>
        <span className="text-amber-600 dark:text-amber-400 font-bold" title="입력 모드">INS</span>
        <span className="text-stone-300 dark:text-stone-700">|</span>
        <span title="문자 인코딩">UTF-8</span>
      </div>
    </div>
  );
});

GlobalStatusBar.displayName = 'GlobalStatusBar';

export const computeTextMetrics = (text: string) => {
  if (!text) return { chars: 0, bytes: 0 };
  const chars = text.length;
  const encoder = new TextEncoder();
  const bytes = encoder.encode(text).length;
  return { chars, bytes };
};

interface StatusBarContextType {
  metrics: StatusBarMetrics;
  setMetrics: React.Dispatch<React.SetStateAction<StatusBarMetrics>>;
  updateMetrics: (partial: Partial<StatusBarMetrics>) => void;
}

const GlobalStatusBarContext = createContext<StatusBarContextType | null>(null);

export const GlobalStatusBarProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [metrics, setMetrics] = useState<StatusBarMetrics>({
    line: 1,
    col: 1,
    selectedChars: 0,
    selectedBytes: 0,
    lastModifiedAt: Date.now(),
    totalBytes: 0,
  });

  const updateMetrics = useCallback((partial: Partial<StatusBarMetrics>) => {
    setMetrics((prev) => ({ ...prev, ...partial }));
  }, []);

  const value = useMemo(() => ({ metrics, setMetrics, updateMetrics }), [metrics, updateMetrics]);

  return (
    <GlobalStatusBarContext.Provider value={value}>
      {children}
      <GlobalStatusBar metrics={metrics} />
    </GlobalStatusBarContext.Provider>
  );
};

export const useStatusBar = () => {
  const context = useContext(GlobalStatusBarContext);
  if (!context) {
    throw new Error('useStatusBar must be used within a GlobalStatusBarProvider');
  }
  return context;
};
