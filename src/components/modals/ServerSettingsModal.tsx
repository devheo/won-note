import React, { useState, useEffect } from 'react';
import { IWorkspaceRepository } from '../../types';
import { wonbeeDB } from '../../services/storage/indexedDb';
import {
  Server,
  HardDrive,
  CheckCircle2,
  Database,
  Radio,
  RefreshCw,
  X,
  Sparkles,
  ShieldCheck,
  Zap,
} from 'lucide-react';

interface ServerSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  useServer: boolean;
  serverUrl: string;
  onToggleUseServer: (useServer: boolean, serverUrl?: string) => void;
  onRefreshData: () => Promise<void>;
}

export const ServerSettingsModal: React.FC<ServerSettingsModalProps> = ({
  isOpen,
  onClose,
  useServer,
  serverUrl,
  onToggleUseServer,
  onRefreshData,
}) => {
  const [tempUseServer, setTempUseServer] = useState(useServer);
  const [tempServerUrl, setTempServerUrl] = useState(serverUrl || '/api');
  const [stats, setStats] = useState<{ totalItems: number; sizeEstimatedBytes: number }>({
    totalItems: 0,
    sizeEstimatedBytes: 0,
  });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [cleanConfirmMode, setCleanConfirmMode] = useState(false);
  const [cleanFeedback, setCleanFeedback] = useState<string | null>(null);
  const [networkInfo, setNetworkInfo] = useState<{ ips: string[]; port: number } | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  useEffect(() => {
    setTempUseServer(useServer);
    setTempServerUrl(serverUrl || '/api');
    wonbeeDB.getStorageStats().then(setStats);
    setCleanConfirmMode(false);
    setCleanFeedback(null);

    fetch('/api/network/info')
      .then((res) => res.json())
      .then((data) => setNetworkInfo(data))
      .catch(() => {});
  }, [isOpen, useServer, serverUrl]);

  if (!isOpen) return null;

  const handleSave = async () => {
    onToggleUseServer(tempUseServer, tempServerUrl);
    setIsRefreshing(true);
    await onRefreshData();
    setIsRefreshing(false);
    onClose();
  };

  const formattedBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div
      id="server-settings-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/60 backdrop-blur-sm animate-in fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-stone-900 rounded-2xl shadow-2xl border border-stone-200 dark:border-stone-800 w-full max-w-lg overflow-hidden flex flex-col relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Toast Notification */}
        {toastMessage && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-50 bg-stone-900/95 dark:bg-stone-100 text-white dark:text-stone-900 px-3.5 py-1.5 rounded-xl text-xs font-semibold shadow-xl flex items-center gap-2 backdrop-blur-sm animate-in fade-in pointer-events-none">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>{toastMessage}</span>
          </div>
        )}
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-200 dark:border-stone-800 bg-stone-50/50 dark:bg-stone-900/50">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-amber-400/20 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold">
              <Database className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-stone-900 dark:text-stone-100">
                저장소 및 서버 모드 설정 (USE_SERVER)
              </h2>
              <p className="text-xs text-stone-500 dark:text-stone-400">
                Repository Pattern 기반의 저장소 추상화 엔진
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-stone-400 hover:text-stone-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 text-xs">
          {/* Mode Switch Cards */}
          <div className="space-y-2.5">
            <div
              onClick={() => setTempUseServer(false)}
              className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                !tempUseServer
                  ? 'border-amber-500 bg-amber-50/60 dark:bg-amber-950/30 ring-1 ring-amber-500/50'
                  : 'border-stone-200 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-800/40'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2 font-bold text-stone-900 dark:text-stone-100">
                  <HardDrive className="w-4 h-4 text-amber-500" />
                  <span>Serverless 모드 (IndexedDB 로컬 단독 동작)</span>
                </div>
                {!tempUseServer && <CheckCircle2 className="w-4 h-4 text-amber-500" />}
              </div>
              <p className="text-stone-500 dark:text-stone-400 text-[11px] leading-relaxed">
                서버 없이 브라우저 내장 IndexedDB에 데이터를 초고속으로 영구 보관합니다. 데이터가 외부로 유출되지 않는 제로 서버 아키텍처입니다.
              </p>
            </div>

            <div
              onClick={() => setTempUseServer(true)}
              className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                tempUseServer
                  ? 'border-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/30 ring-1 ring-emerald-500/50'
                  : 'border-stone-200 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-800/40'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2 font-bold text-stone-900 dark:text-stone-100">
                  <Server className="w-4 h-4 text-emerald-500" />
                  <span>Server 모드 (REST API 백엔드 동기화)</span>
                </div>
                {tempUseServer && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
              </div>
              <p className="text-stone-500 dark:text-stone-400 text-[11px] leading-relaxed">
                중앙 API 서버와 실시간으로 데이터를 동기화합니다. 오프라인 상태에서도 로컬 캐시로 안전하게 폴백됩니다.
              </p>
            </div>
          </div>

          {/* LAN Network Access Guide (Server Mode vs Client Mode) */}
          <div className="p-3.5 bg-sky-500/5 border border-sky-500/20 rounded-xl space-y-2">
            <div className="text-[11px] font-bold text-sky-700 dark:text-sky-300 flex items-center gap-1.5">
              <Radio className="w-3.5 h-3.5 text-sky-500 animate-pulse" />
              <span>🌐 다른 PC 접속 가이드 (Server Mode vs Client Mode)</span>
            </div>
            <p className="text-[10px] text-stone-500 dark:text-stone-400 leading-relaxed">
              현재 PC를 호스트 서버(Server Mode)로 실행하여 동일 Wi-Fi / LAN 상의 다른 PC에서 아래 주소로 접속할 수 있습니다.
            </p>
            {networkInfo && networkInfo.ips.length > 0 ? (
              <div className="space-y-1 pt-1">
                <div className="text-[10px] font-semibold text-stone-600 dark:text-stone-300">
                  다른 PC 브라우저 주소창에 입력할 주소 (서버 호스트 주소):
                </div>
                {networkInfo.ips.map((ip) => {
                  const fullUrl = `http://${ip}:${networkInfo.port}`;
                  return (
                    <div key={ip} className="flex items-center justify-between bg-white dark:bg-stone-900 px-2.5 py-1.5 rounded-lg border border-sky-200 dark:border-sky-900/50 font-mono text-xs">
                      <span className="text-sky-800 dark:text-sky-300 font-bold">{fullUrl}</span>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(fullUrl);
                          showToast('✓ 주소가 클립보드에 복사되었습니다.');
                        }}
                        className="px-2 py-0.5 rounded bg-sky-500/15 text-sky-700 dark:text-sky-300 font-semibold text-[10px] hover:bg-sky-500/25 cursor-pointer"
                      >
                        주소 복사
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-[10px] text-stone-400 italic">로컬 네트워크 IP 탐색 중...</div>
            )}
            <div className="text-[10px] text-stone-500 dark:text-stone-400 pt-1 border-t border-sky-500/10">
              💡 <strong>클라이언트 모드(Client Mode):</strong> 다른 PC에서 접속 시 <strong>Server 모드</strong>를 켜고 위 서버 주소의 <code className="bg-sky-500/10 px-1 py-0.5 rounded font-mono">/api</code>를 백엔드 엔드포인트 URL로 설정하세요.
            </div>
          </div>

          {/* Server URL Config (if Server Mode) */}
          {tempUseServer && (
            <div className="p-3 bg-stone-50 dark:bg-stone-800/50 rounded-xl border border-stone-200 dark:border-stone-700/60 space-y-2 animate-in fade-in">
              <label className="text-[11px] font-semibold text-stone-700 dark:text-stone-300">
                백엔드 API 엔드포인트 URL:
              </label>
              <input
                type="text"
                value={tempServerUrl}
                onChange={(e) => setTempServerUrl(e.target.value)}
                placeholder="/api"
                className="w-full px-3 py-1.5 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-lg text-xs outline-none focus:border-emerald-500 font-mono"
              />
            </div>
          )}

          {/* IndexedDB Storage Stats info */}
          <div className="p-3 bg-stone-50 dark:bg-stone-800/50 rounded-xl border border-stone-200 dark:border-stone-700/60 flex items-center justify-between">
            <div className="space-y-0.5">
              <div className="text-[11px] font-semibold text-stone-700 dark:text-stone-300">
                로컬 IndexedDB 캐시 상태
              </div>
              <div className="text-[10px] text-stone-400">
                보관 항목: {stats.totalItems}개 / 예상 용량: {formattedBytes(stats.sizeEstimatedBytes)}
              </div>
            </div>
            <div className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md">
              <Zap className="w-3 h-3" />
              정상 가동 중
            </div>
          </div>

          {/* Database Consistency & Orphan Tables Cleanup */}
          {tempUseServer && (
            <div className="p-3 bg-amber-500/5 border border-amber-500/20 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[11px] font-bold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-amber-500" />
                    <span>데이터베이스 정합성 &amp; 불필요한 테이블 정리</span>
                  </div>
                  <p className="text-[10px] text-stone-500 dark:text-stone-400 mt-0.5">
                    트리에 없는 고아 테이블이나 남겨진 샘플 물리 테이블을 완전 영구 삭제합니다.
                  </p>
                </div>

                {!cleanConfirmMode ? (
                  <button
                    type="button"
                    disabled={isRefreshing}
                    onClick={() => {
                      setCleanConfirmMode(true);
                      setCleanFeedback(null);
                    }}
                    className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-stone-950 font-bold rounded-lg text-[10px] shrink-0 transition-colors cursor-pointer"
                  >
                    정합성 정리 실행
                  </button>
                ) : (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      disabled={isRefreshing}
                      onClick={async () => {
                        setIsRefreshing(true);
                        try {
                          const res = await fetch(`${tempServerUrl}/workspace/clean`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({}),
                          });
                          const data = await res.json();
                          await onRefreshData();
                          setCleanConfirmMode(false);
                          setCleanFeedback(`정합성 정리 완료: ${data.dropped?.length || 0}개 테이블 정리됨`);
                        } catch (err: any) {
                          setCleanFeedback(`정리 실패: ${err.message}`);
                        } finally {
                          setIsRefreshing(false);
                        }
                      }}
                      className="px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg text-[10px] transition-colors cursor-pointer"
                    >
                      {isRefreshing ? '정리 중...' : '확인 (영구 삭제)'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setCleanConfirmMode(false)}
                      className="px-2 py-1 bg-stone-200 dark:bg-stone-700 text-stone-700 dark:text-stone-300 rounded-lg text-[10px] cursor-pointer"
                    >
                      취소
                    </button>
                  </div>
                )}
              </div>
              {cleanFeedback && (
                <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium px-2 py-1 bg-emerald-500/10 rounded-md">
                  ✓ {cleanFeedback}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 border-t border-stone-200 dark:border-stone-800 bg-stone-50/50 dark:bg-stone-900/50 flex items-center justify-between">
          <span className="text-[11px] text-stone-400">
            USE_SERVER: <code>{tempUseServer ? 'true' : 'false'}</code>
          </span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-lg text-xs"
            >
              취소
            </button>
            <button
              onClick={handleSave}
              disabled={isRefreshing}
              className="px-4 py-1.5 bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold rounded-lg text-xs transition-colors"
            >
              {isRefreshing ? '적용 중...' : '설정 저장 & 반영'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
