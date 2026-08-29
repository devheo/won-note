import React, { useState, useRef } from 'react';
import { WorkspaceData, TableDocument, TreeItem } from '../../types';
import { localFileService } from '../../services/storage/localFileService';
import {
  Layers,
  Download,
  Upload,
  Copy,
  Check,
  Sparkles,
  AlertCircle,
  FileJson,
  X,
  HardDrive,
  RefreshCw,
  ArrowRight,
  Database,
  Plus,
} from 'lucide-react';

interface DataPortabilityModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentWorkspace: WorkspaceData;
  onMergeWorkspace: (importedData: WorkspaceData, mode: 'merge' | 'replace' | 'keep_both') => Promise<void>;
  onLocalFileConnected?: (fileName: string, data: WorkspaceData) => void;
}

export const DataPortabilityModal: React.FC<DataPortabilityModalProps> = ({
  isOpen,
  onClose,
  currentWorkspace,
  onMergeWorkspace,
  onLocalFileConnected,
}) => {
  const [mergeMode, setMergeMode] = useState<'merge' | 'replace' | 'keep_both'>('merge');
  const [importedJson, setImportedJson] = useState<string>('');
  const [parsedImport, setParsedImport] = useState<WorkspaceData | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  const isFsSupported = localFileService.isSupported();
  const connectedLocalFile = localFileService.getConnectedFileName();

  const handleExportJson = () => {
    const jsonStr = JSON.stringify(currentWorkspace, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `wonbee_data.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyJson = () => {
    const jsonStr = JSON.stringify(currentWorkspace, null, 2);
    navigator.clipboard.writeText(jsonStr);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleConnectLocalFile = async () => {
    try {
      setErrorMsg(null);
      const res = await localFileService.openLocalFile();
      if (res) {
        if (onLocalFileConnected) {
          onLocalFileConnected(res.fileName, res.data);
        }
        onClose();
      }
    } catch (err: any) {
      setErrorMsg(`로컬 파일 연결 실패: ${err.message}`);
    }
  };

  const handleLinkNewLocalFile = async () => {
    try {
      setErrorMsg(null);
      const fileName = await localFileService.linkNewLocalFile(currentWorkspace);
      if (fileName) {
        if (onLocalFileConnected) {
          onLocalFileConnected(fileName, currentWorkspace);
        }
        onClose();
      }
    } catch (err: any) {
      setErrorMsg(`새 로컬 파일 생성 실패: ${err.message}`);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setImportedJson(content);
      parseJson(content);
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const parseJson = (text: string) => {
    try {
      setErrorMsg(null);
      const parsed = JSON.parse(text);
      if (!parsed.tree || !parsed.tables) {
        throw new Error('WonBee 워크스페이스 유효한 형식이 아닙니다 (tree, tables 필드 누락).');
      }
      setParsedImport(parsed);
    } catch (err: any) {
      setParsedImport(null);
      setErrorMsg(err.message || 'JSON 파싱에 실패했습니다.');
    }
  };

  const handleExecuteMerge = async () => {
    if (!parsedImport) return;
    try {
      setIsMerging(true);
      await onMergeWorkspace(parsedImport, mergeMode);
      setIsMerging(false);
      onClose();
    } catch (err: any) {
      setIsMerging(false);
      setErrorMsg(`병합 실패: ${err.message}`);
    }
  };

  // Load a demo template for instant testing of the merge feature!
  const loadDemoExternalData = () => {
    const demoData: WorkspaceData = {
      version: '1.0.0',
      exportedAt: Date.now(),
      author: '동료 꿀벌 (Team Bee)',
      tree: [
        {
          id: 'folder-imported-marketing',
          parentId: null,
          title: '📦 [가져온 데이터] 2026 마케팅 캠페인 팩',
          type: 'folder',
          isExpanded: true,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        {
          id: 'table-imported-sns',
          parentId: 'folder-imported-marketing',
          title: '🐝 인스타그램/유튜브 콘텐츠 캘린더',
          type: 'table',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
      tables: {
        'table-imported-sns': {
          id: 'table-imported-sns',
          title: '🐝 인스타그램/유튜브 콘텐츠 캘린더',
          description: '다른 팀원이 공유한 WonBee 마케팅 플래너입니다.',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          columns: [
            { id: 'col-channel', name: '채널명', type: 'select', width: 140, isPrimaryKey: true, options: [
              { id: 'yt', label: 'YouTube Shorts', color: '#EF4444' },
              { id: 'ig', label: 'Instagram Reels', color: '#EC4899' },
            ]},
            { id: 'col-theme', name: '게시물 주제', type: 'text', width: 260 },
            { id: 'col-date', name: '업로드 예정일', type: 'date', width: 140 },
          ],
          rows: [
            {
              id: 'imp-row-1',
              data: {
                'col-channel': 'yt',
                'col-theme': '꿀벌 원비의 하루 (미니멀 라이프 VLOG)',
                'col-date': '2026-09-01',
              },
              richContent: '<h2>🎬 숏폼 스크립트 초안</h2><p>귀여운 원비가 미니멀 테이블을 정리하는 15초 영상</p>',
              stickers: [
                {
                  id: 'demo-stk-1',
                  title: '📢 타겟층',
                  content: '생산성 툴을 찾는 2030 디자이너 & 개발자',
                  color: 'rose',
                  position: { x: 10, y: 10 },
                  completed: true,
                }
              ],
              createdAt: Date.now(),
              updatedAt: Date.now(),
            }
          ],
        },
      },
    };

    const str = JSON.stringify(demoData, null, 2);
    setImportedJson(str);
    setParsedImport(demoData);
  };

  return (
    <div
      id="data-portability-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/60 backdrop-blur-sm animate-in fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-stone-900 rounded-2xl shadow-2xl border border-stone-200 dark:border-stone-800 w-full max-w-2xl overflow-hidden flex flex-col max-h-[88vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-200 dark:border-stone-800 bg-stone-50/50 dark:bg-stone-900/50">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-amber-400/20 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-stone-900 dark:text-stone-100">
                데이터 파일 관리 &amp; 포터블 병합
              </h2>
              <p className="text-xs text-stone-500 dark:text-stone-400">
                로컬 파일(wonbee_data.json) 직접 연동, 백업 다운로드 및 타인 데이터 병합
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-stone-400 hover:text-stone-600 dark:hover:text-stone-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1 text-xs">
          {/* 1. Direct Local File Sync Section */}
          {isFsSupported && (
            <div className="p-4 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-300/80 dark:border-emerald-800/80">
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-emerald-900 dark:text-emerald-200 flex items-center gap-1.5">
                  <HardDrive className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  로컬 폴더 내 데이터 파일 직접 연동 (File System Sync)
                </span>
                {connectedLocalFile && (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200 text-[10px] font-bold">
                    연결됨: {connectedLocalFile}
                  </span>
                )}
              </div>
              <p className="text-emerald-950/80 dark:text-emerald-300/80 mb-3 leading-relaxed">
                컴퓨터의 특정 폴더 내 <code className="font-mono bg-emerald-100 dark:bg-emerald-900/60 px-1 py-0.5 rounded text-emerald-900 dark:text-emerald-200 font-semibold">wonbee_data.json</code> 파일을 직접 연결하여 수정 시 파일에 실시간 자동 저장합니다. (서버/싱글HTML 완벽 호환)
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={handleConnectLocalFile}
                  className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg flex items-center gap-1.5 shadow-2xs transition-colors"
                >
                  <FileJson className="w-3.5 h-3.5" />
                  기존 wonbee_data.json 파일 열기
                </button>
                <button
                  onClick={handleLinkNewLocalFile}
                  className="px-3.5 py-1.5 bg-white dark:bg-emerald-950/80 border border-emerald-400 dark:border-emerald-700 text-emerald-900 dark:text-emerald-200 font-semibold rounded-lg flex items-center gap-1.5 hover:bg-emerald-50 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  새 wonbee_data.json 파일로 저장/연결
                </button>
              </div>
            </div>
          )}

          {/* 2. Export Section */}
          <div className="p-4 rounded-xl bg-stone-50 dark:bg-stone-800/50 border border-stone-200 dark:border-stone-700/60">
            <div className="flex items-center justify-between mb-2">
              <span className="font-bold text-stone-800 dark:text-stone-200 flex items-center gap-1.5">
                <Download className="w-3.5 h-3.5 text-amber-500" />
                데이터 파일 백업 및 내보내기 (Export JSON)
              </span>
              <span className="text-[11px] text-stone-400">
                테이블 {Object.keys(currentWorkspace.tables).length}개 / 트리 노드 {currentWorkspace.tree.length}개
              </span>
            </div>
            <p className="text-stone-500 dark:text-stone-400 mb-3">
              현재 작성된 모든 폴더, 테이블, 셀 데이터 및 원노트 스티커를 표준 <code className="font-mono">wonbee_data.json</code> 파일로 다운로드합니다.
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={handleExportJson}
                className="px-3 py-1.5 bg-stone-900 dark:bg-stone-100 hover:bg-amber-500 dark:hover:bg-amber-400 text-stone-100 dark:text-stone-900 font-semibold rounded-lg flex items-center gap-1.5 transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                wonbee_data.json 다운로드
              </button>
              <button
                onClick={handleCopyJson}
                className="px-3 py-1.5 bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-300 font-medium rounded-lg flex items-center gap-1.5 hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? '복사 완료!' : '클립보드 복사'}
              </button>
            </div>
          </div>

          {/* 3. Import / Merge Section */}
          <div className="p-4 rounded-xl bg-amber-500/5 dark:bg-amber-400/5 border border-amber-200/60 dark:border-amber-900/60">
            <div className="flex items-center justify-between mb-2">
              <span className="font-bold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                <Upload className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                다른 사용자의 데이터 가져오기 &amp; 병합
              </span>
              <button
                onClick={loadDemoExternalData}
                className="text-[11px] font-semibold text-amber-700 dark:text-amber-300 hover:underline flex items-center gap-1"
              >
                <Sparkles className="w-3 h-3" />
                외부 샘플 데이터 불러오기
              </button>
            </div>

            <div className="mb-3">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept=".json"
                className="hidden"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold rounded-lg flex items-center gap-1.5 transition-colors"
                >
                  <FileJson className="w-3.5 h-3.5" />
                  JSON 파일 선택
                </button>
              </div>
            </div>

            {/* JSON Text Input */}
            <div className="space-y-1.5">
              <textarea
                value={importedJson}
                onChange={(e) => {
                  setImportedJson(e.target.value);
                  parseJson(e.target.value);
                }}
                placeholder="또는 공유받은 WonBee JSON 코드를 여기에 붙여넣으세요..."
                rows={3}
                className="w-full bg-white dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-lg p-2.5 font-mono text-[11px] text-stone-800 dark:text-stone-200 outline-none focus:border-amber-500 leading-relaxed resize-none"
              />
            </div>

            {errorMsg && (
              <div className="mt-2 text-xs text-rose-500 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" />
                {errorMsg}
              </div>
            )}

            {/* Parsed Preview & Merge Mode Selection */}
            {parsedImport && (
              <div className="mt-4 p-3 bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 space-y-3">
                <div className="flex items-center justify-between text-xs font-semibold text-stone-800 dark:text-stone-200">
                  <span>가져올 데이터 미리보기:</span>
                  <span className="text-amber-600 dark:text-amber-400 font-mono">
                    {Object.keys(parsedImport.tables).length}개 테이블 / {parsedImport.tree.length}개 노드
                  </span>
                </div>

                <div className="text-[11px] text-stone-500 dark:text-stone-400 bg-stone-50 dark:bg-stone-950 p-2 rounded-lg font-mono">
                  {Object.values(parsedImport.tables).map((t) => (
                    <div key={t.id} className="truncate">
                      • {t.title} ({t.rows.length}개 행)
                    </div>
                  ))}
                </div>

                {/* Merge Strategy Radio */}
                <div className="space-y-1.5 pt-1">
                  <div className="text-xs font-semibold text-stone-700 dark:text-stone-300">
                    병합 방식 선택:
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <label
                      className={`p-2.5 rounded-lg border cursor-pointer flex flex-col gap-1 transition-colors ${
                        mergeMode === 'merge'
                          ? 'border-amber-500 bg-amber-50/50 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200'
                          : 'border-stone-200 dark:border-stone-800 text-stone-600 dark:text-stone-400'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-bold text-xs">
                        <input
                          type="radio"
                          name="mergeMode"
                          checked={mergeMode === 'merge'}
                          onChange={() => setMergeMode('merge')}
                          className="accent-amber-500"
                        />
                        스마트 병합 (Merge)
                      </div>
                      <span className="text-[10px] opacity-75">
                        기존 데이터 보존 + 새 테이블 추가 확장
                      </span>
                    </label>

                    <label
                      className={`p-2.5 rounded-lg border cursor-pointer flex flex-col gap-1 transition-colors ${
                        mergeMode === 'keep_both'
                          ? 'border-amber-500 bg-amber-50/50 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200'
                          : 'border-stone-200 dark:border-stone-800 text-stone-600 dark:text-stone-400'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-bold text-xs">
                        <input
                          type="radio"
                          name="mergeMode"
                          checked={mergeMode === 'keep_both'}
                          onChange={() => setMergeMode('keep_both')}
                          className="accent-amber-500"
                        />
                        별도 복사본 생성
                      </div>
                      <span className="text-[10px] opacity-75">
                        충돌 시 새 ID 부여하여 나란히 보관
                      </span>
                    </label>

                    <label
                      className={`p-2.5 rounded-lg border cursor-pointer flex flex-col gap-1 transition-colors ${
                        mergeMode === 'replace'
                          ? 'border-amber-500 bg-amber-50/50 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200'
                          : 'border-stone-200 dark:border-stone-800 text-stone-600 dark:text-stone-400'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-bold text-xs text-rose-600 dark:text-rose-400">
                        <input
                          type="radio"
                          name="mergeMode"
                          checked={mergeMode === 'replace'}
                          onChange={() => setMergeMode('replace')}
                          className="accent-rose-500"
                        />
                        전체 덮어쓰기
                      </div>
                      <span className="text-[10px] opacity-75">
                        기존 워크스페이스를 완전히 대체
                      </span>
                    </label>
                  </div>
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    onClick={handleExecuteMerge}
                    disabled={isMerging}
                    className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold rounded-lg flex items-center gap-1.5 text-xs shadow-sm transition-all"
                  >
                    <Check className="w-4 h-4" />
                    {isMerging ? '병합 진행 중...' : '데이터 병합 실행하기'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-stone-200 dark:border-stone-800 bg-stone-50/50 dark:bg-stone-900/50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-stone-200 dark:bg-stone-800 hover:bg-stone-300 text-stone-700 dark:text-stone-300 font-medium rounded-lg text-xs transition-colors"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
};
