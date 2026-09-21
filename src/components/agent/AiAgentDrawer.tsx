import React, { useState, useEffect } from 'react';
import {
  X,
  Sparkles,
  FileText,
  Search,
  Network,
  Calendar,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Send,
  ArrowRight,
  ShieldCheck,
  Check,
  Database,
  Table as TableIcon,
  SlidersHorizontal,
  Edit2,
  CheckSquare,
  Layers,
  Clock,
  Settings,
  HelpCircle,
} from 'lucide-react';
import {
  ollamaClient,
  OllamaStatus,
  LintResult,
  RagResultItem,
  ToolActionProposal,
  RowDataEditProposal,
  BatchDataEditProposal,
  ColumnChangeProposal,
} from '../../services/ai/ollamaClient';
import { TableColumn, TableRow, TableDocument } from '../../types';
import { DiffViewModal } from './DiffViewModal';
import { MermaidViewer } from './MermaidViewer';
import { ActionConfirmModal } from './ActionConfirmModal';

interface AiAgentDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  editorContent?: string;
  onApplyToEditor?: (newContent: string) => void;
  onInsertToEditor?: (snippet: string) => void;
  activeTableId?: string;
  table?: TableDocument;
  columns?: TableColumn[];
  activeRow?: TableRow;
  onUpdateTable?: (table: TableDocument) => void;
  onUpdateRow?: (row: TableRow) => void;
  onRefreshData?: () => void;
  initialTab?: 'data' | 'editor' | 'rag' | 'diagram' | 'action';
}

export const AiAgentDrawer: React.FC<AiAgentDrawerProps> = ({
  isOpen,
  onClose,
  editorContent = '',
  onApplyToEditor,
  onInsertToEditor,
  activeTableId = 'table-roadmap',
  table,
  columns: propColumns,
  activeRow,
  onUpdateTable,
  onUpdateRow,
  onRefreshData,
  initialTab = 'data',
}) => {
  // Tabs: 'data' | 'editor' | 'rag' | 'diagram' | 'action'
  const [activeTab, setActiveTab] = useState<'data' | 'editor' | 'rag' | 'diagram' | 'action'>(initialTab);

  // Synchronize initialTab when drawer opens or prop updates
  useEffect(() => {
    if (isOpen && initialTab) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  // Ollama status
  const [status, setStatus] = useState<OllamaStatus | null>(null);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);

  // Common Loading & Success/Error
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // --- Effective Table, Columns, Rows ---
  const effectiveColumns = propColumns || table?.columns || [];
  const effectiveRows = table?.rows || [];

  // --- Data Edit Agent States ---
  const [dataEditMode, setDataEditMode] = useState<'row' | 'batch'>('row');
  const [selectedRowId, setSelectedRowId] = useState<string>(activeRow?.id || effectiveRows[0]?.id || '');
  const [dataEditPrompt, setDataEditPrompt] = useState<string>('');
  const [rowProposal, setRowProposal] = useState<RowDataEditProposal | null>(null);
  const [batchProposal, setBatchProposal] = useState<BatchDataEditProposal | null>(null);

  // Update selectedRowId when activeRow changes
  useEffect(() => {
    if (activeRow?.id) {
      setSelectedRowId(activeRow.id);
    } else if (effectiveRows.length > 0 && !selectedRowId) {
      setSelectedRowId(effectiveRows[0].id);
    }
  }, [activeRow?.id, effectiveRows]);

  // Currently selected row object
  const currentTargetRow =
    effectiveRows.find((r) => r.id === selectedRowId) || activeRow || effectiveRows[0];

  // --- 1. Editor Agent States ---
  const [formatType, setFormatType] = useState<'report' | 'meeting'>('report');
  const [isDiffModalOpen, setIsDiffModalOpen] = useState(false);
  const [diffOriginal, setDiffOriginal] = useState('');
  const [diffRevised, setDiffRevised] = useState('');
  const [diffSummary, setDiffSummary] = useState('');

  // --- 2. RAG Agent States ---
  const [ragQuery, setRagQuery] = useState('');
  const [ragResults, setRagResults] = useState<RagResultItem[]>([]);
  const [ragAnswer, setRagAnswer] = useState<{ summary: string; citations: string[] } | null>(null);
  const [ragDocTitle, setRagDocTitle] = useState('');
  const [ragDocContent, setRagDocContent] = useState('');
  const [indexedCount, setIndexedCount] = useState<number | null>(null);

  // --- 3. Diagram Agent States ---
  const [diagramPrompt, setDiagramPrompt] = useState('사용자 인증 및 일정 삭제 API 호출 흐름');
  const [diagramType, setDiagramType] = useState<'flowchart' | 'sequence' | 'er'>('flowchart');
  const [generatedMermaid, setGeneratedMermaid] = useState<string>('');

  // --- 4. Action Agent States ---
  const [actionInput, setActionInput] = useState('');
  const [pendingProposal, setPendingProposal] = useState<ToolActionProposal | null>(null);
  const [actionHistory, setActionHistory] = useState<Array<{ text: string; success: boolean }>>([]);

  // Check Ollama status on open
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [customHost, setCustomHost] = useState('http://localhost:11434');
  const [isSavingConfig, setIsSavingConfig] = useState(false);

  useEffect(() => {
    if (isOpen) {
      checkStatus();
      setErrorMsg(null);
      setSuccessMsg(null);
    }
  }, [isOpen]);

  const checkStatus = async () => {
    setIsCheckingStatus(true);
    try {
      const st = await ollamaClient.getStatus();
      setStatus(st);
      if (st.host) {
        setCustomHost(st.host);
      }
    } finally {
      setIsCheckingStatus(false);
    }
  };

  const handleSaveHostConfig = async () => {
    setIsSavingConfig(true);
    setErrorMsg(null);
    try {
      const res = await ollamaClient.updateConfig({ host: customHost });
      setStatus(res.status);
      if (res.status.online) {
        setSuccessMsg(`Ollama(${res.status.host}) 연결 성공! (${res.status.models.length}개 모델 감지됨)`);
        setIsConfigOpen(false);
      } else {
        setErrorMsg(res.status.error || 'Ollama 연결에 실패했습니다. 주소를 다시 확인해주세요.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || '설정 저장 실패');
    } finally {
      setIsSavingConfig(false);
    }
  };

  // ==========================================
  // --- Data Edit Agent Handlers ---
  // ==========================================
  const handleProposeRowDataEdit = async (customPrompt?: string) => {
    if (!currentTargetRow) {
      setErrorMsg('수정할 대상 행을 선택해주세요.');
      return;
    }
    const promptToUse = customPrompt || dataEditPrompt;
    if (!promptToUse.trim()) {
      setErrorMsg('수정 지시사항(프롬프트)을 입력해주세요.');
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    setBatchProposal(null);

    try {
      const proposal = await ollamaClient.proposeRowDataEdit({
        row: currentTargetRow,
        columns: effectiveColumns,
        prompt: promptToUse,
        editorContent: editorContent || currentTargetRow.richContent,
      });

      if (proposal.changes.length === 0) {
        setErrorMsg('지시사항에 해당하는 수정 대상을 찾지 못했습니다.');
      } else {
        setRowProposal(proposal);
      }
    } catch (err: any) {
      setErrorMsg(err.message || '데이터 수정안 도출 실패');
    } finally {
      setIsLoading(false);
    }
  };

  const handleProposeBatchDataEdit = async (customPrompt?: string) => {
    if (!table) {
      setErrorMsg('현재 활성화된 테이블 정보를 찾을 수 없습니다.');
      return;
    }
    const promptToUse = customPrompt || dataEditPrompt;
    if (!promptToUse.trim()) {
      setErrorMsg('일괄 수정 지시사항을 입력해주세요.');
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    setRowProposal(null);

    try {
      const bProposal = await ollamaClient.proposeBatchDataEdit({
        table,
        prompt: promptToUse,
      });

      if (bProposal.affectedRowCount === 0) {
        setErrorMsg('지시 조건에 일치하는 대상 행을 찾지 못했습니다.');
      } else {
        setBatchProposal(bProposal);
      }
    } catch (err: any) {
      setErrorMsg(err.message || '일괄 수정안 도출 실패');
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleChangeItem = (colId: string) => {
    if (!rowProposal) return;
    setRowProposal({
      ...rowProposal,
      changes: rowProposal.changes.map((c) =>
        c.columnId === colId ? { ...c, enabled: !c.enabled } : c
      ),
    });
  };

  // Apply Single Row Data Changes to State & SQLite
  const handleApplyRowDataChanges = async () => {
    if (!rowProposal || !currentTargetRow) return;

    const enabledChanges = rowProposal.changes.filter((c) => c.enabled !== false);
    if (enabledChanges.length === 0) {
      setErrorMsg('적용할 변경 항목이 선택되지 않았습니다.');
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);

    const dataUpdates: Record<string, any> = {};
    enabledChanges.forEach((c) => {
      dataUpdates[c.columnId] = c.newValue;
    });

    try {
      const updatedRow: TableRow = {
        ...currentTargetRow,
        data: {
          ...currentTargetRow.data,
          ...dataUpdates,
        },
        updatedAt: Date.now(),
      };

      // 1. Update backend SQLite DB
      await ollamaClient.executeTool('update_table_row', {
        tableId: activeTableId || table?.id || 'table-roadmap',
        rowId: currentTargetRow.id,
        dataUpdates,
      });

      // 2. Update React State
      if (onUpdateRow) {
        onUpdateRow(updatedRow);
      } else if (table && onUpdateTable) {
        const updatedTable: TableDocument = {
          ...table,
          rows: table.rows.map((r) => (r.id === updatedRow.id ? updatedRow : r)),
          updatedAt: Date.now(),
        };
        onUpdateTable(updatedTable);
      }

      setSuccessMsg(`성공적으로 '${rowProposal.rowTitle}' 행의 ${enabledChanges.length}개 컬럼을 수정하고 SQLite에 저장했습니다.`);
      setRowProposal(null);
      setDataEditPrompt('');
      if (onRefreshData) onRefreshData();
    } catch (err: any) {
      setErrorMsg(err.message || '데이터 수정 적용 중 오류 발생');
    } finally {
      setIsLoading(false);
    }
  };

  // Apply Batch Data Changes to State & SQLite
  const handleApplyBatchDataChanges = async () => {
    if (!batchProposal || !table) return;

    setIsLoading(true);
    setErrorMsg(null);

    try {
      const updatesPayload: Array<{ rowId: string; dataUpdates: Record<string, any> }> = [];
      const updatedRowsMap = new Map<string, TableRow>();

      table.rows.forEach((r) => updatedRowsMap.set(r.id, { ...r }));

      batchProposal.rowProposals.forEach((rp) => {
        const target = updatedRowsMap.get(rp.rowId);
        if (target) {
          const rowDataUpdates: Record<string, any> = {};
          rp.changes.forEach((c) => {
            rowDataUpdates[c.columnId] = c.newValue;
          });
          updatesPayload.push({
            rowId: rp.rowId,
            dataUpdates: rowDataUpdates,
          });
          target.data = { ...target.data, ...rowDataUpdates };
          target.updatedAt = Date.now();
        }
      });

      // 1. Update SQLite
      await ollamaClient.executeTool('batch_update_table_rows', {
        tableId: table.id,
        updates: updatesPayload,
      });

      // 2. Update React State
      if (onUpdateTable) {
        const updatedTable: TableDocument = {
          ...table,
          rows: Array.from(updatedRowsMap.values()),
          updatedAt: Date.now(),
        };
        onUpdateTable(updatedTable);
      }

      setSuccessMsg(`총 ${batchProposal.affectedRowCount}개 행의 데이터를 일괄 수정하고 SQLite에 영구 저장했습니다.`);
      setBatchProposal(null);
      setDataEditPrompt('');
      if (onRefreshData) onRefreshData();
    } catch (err: any) {
      setErrorMsg(err.message || '일괄 수정 적용 중 오류 발생');
    } finally {
      setIsLoading(false);
    }
  };

  // ==========================================
  // --- Editor Agent Handlers ---
  // ==========================================
  const handleConvertToReport = async () => {
    const sourceText = editorContent || '기존 내용이 없어 기본 샘플로 작성합니다.';
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const result = await ollamaClient.convertToReport(sourceText, formatType);
      setDiffOriginal(sourceText);
      setDiffRevised(result);
      setDiffSummary(`${formatType === 'meeting' ? '회의록' : '비즈니스 보고서'} 양식 변환 완료`);
      setIsDiffModalOpen(true);
    } catch (err: any) {
      setErrorMsg(err.message || '양식 변환 실패');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLintDocument = async () => {
    const sourceText = editorContent || '프로젝트 일정을 확인바람. 할수있습니다.';
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const lintResult: LintResult = await ollamaClient.lintDocument(sourceText);
      setDiffOriginal(sourceText);
      setDiffRevised(lintResult.revisedContent);
      setDiffSummary(lintResult.summary);
      setIsDiffModalOpen(true);
    } catch (err: any) {
      setErrorMsg(err.message || '린팅 수행 실패');
    } finally {
      setIsLoading(false);
    }
  };

  // ==========================================
  // --- RAG Agent Handlers ---
  // ==========================================
  const handleIndexDocument = async () => {
    if (!ragDocTitle.trim() || !ragDocContent.trim()) {
      setErrorMsg('문서 제목과 내용을 모두 입력해주세요.');
      return;
    }
    setIsLoading(true);
    try {
      const paragraphs = ragDocContent.split('\n\n').filter((p) => p.trim().length > 0);
      const chunks = paragraphs.map((p, idx) => ({
        id: `chunk_${Date.now()}_${idx}`,
        docId: `doc_${Date.now()}`,
        title: `${ragDocTitle} (Part ${idx + 1})`,
        content: p.trim(),
      }));

      const count = await ollamaClient.indexDocuments(chunks);
      setIndexedCount(count);
      setRagDocTitle('');
      setRagDocContent('');
      setErrorMsg(null);
      setSuccessMsg(`사내 문서가 ${count}개 청크로 분할되어 SQLite에 색인되었습니다.`);
    } catch (err: any) {
      setErrorMsg(err.message || '인덱싱 실패');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearchRag = async () => {
    if (!ragQuery.trim()) return;
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const results = await ollamaClient.searchRag(ragQuery);
      setRagResults(results);
      if (results.length > 0) {
        const answer = await ollamaClient.synthesizeWithCitations(ragQuery, results);
        setRagAnswer(answer);
      } else {
        setRagAnswer({ summary: '관련된 사내 문서를 찾을 수 없습니다. 문서를 먼저 등록해주세요.', citations: [] });
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'RAG 검색 실패');
    } finally {
      setIsLoading(false);
    }
  };

  // ==========================================
  // --- Diagram Agent Handlers ---
  // ==========================================
  const handleGenerateDiagram = async () => {
    if (!diagramPrompt.trim()) return;
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const code = await ollamaClient.generateMermaid(diagramPrompt, diagramType);
      setGeneratedMermaid(code);
    } catch (err: any) {
      setErrorMsg(err.message || '다이어그램 생성 실패');
    } finally {
      setIsLoading(false);
    }
  };

  // ==========================================
  // --- Action Agent Handlers ---
  // ==========================================
  const handleParseAction = async () => {
    if (!actionInput.trim()) return;
    setIsLoading(true);
    setErrorMsg(null);

    const inputLower = actionInput.toLowerCase();
    const today = new Date().toISOString().slice(0, 10);

    try {
      let proposal: ToolActionProposal;

      // 1. Data Modification Tool: update_table_row
      if (
        inputLower.includes('수정') ||
        inputLower.includes('변경') ||
        inputLower.includes('바꿔') ||
        inputLower.includes('업데이트') ||
        inputLower.includes('채워')
      ) {
        // Find matching row from current table
        let targetRow = currentTargetRow;
        if (table && table.rows.length > 0) {
          const matched = table.rows.find((r) => {
            const title = String(r.data['col-name'] || Object.values(r.data)[0] || '');
            return title && inputLower.includes(title.toLowerCase());
          });
          if (matched) targetRow = matched;
        }

        const targetRowTitle = String(
          targetRow?.data['col-name'] || Object.values(targetRow?.data || {})[0] || '선택된 행'
        );

        // Derive field updates
        const dataUpdates: Record<string, any> = {};
        const statusCol = effectiveColumns.find((c) => c.type === 'status' || c.name.includes('상태'));
        if (statusCol) {
          if (inputLower.includes('완료')) dataUpdates[statusCol.id] = '완료';
          else if (inputLower.includes('진행중')) dataUpdates[statusCol.id] = '진행중';
          else if (inputLower.includes('지연')) dataUpdates[statusCol.id] = '지연';
          else if (inputLower.includes('검토')) dataUpdates[statusCol.id] = '검토중';
        }

        const priorityCol = effectiveColumns.find((c) => c.name.includes('우선순위'));
        if (priorityCol) {
          if (inputLower.includes('긴급')) dataUpdates[priorityCol.id] = '긴급';
          else if (inputLower.includes('높음')) dataUpdates[priorityCol.id] = '높음';
          else if (inputLower.includes('보통')) dataUpdates[priorityCol.id] = '보통';
          else if (inputLower.includes('낮음')) dataUpdates[priorityCol.id] = '낮음';
        }

        const dateCol = effectiveColumns.find((c) => c.type === 'date' || c.name.includes('일'));
        if (dateCol) {
          if (inputLower.includes('오늘')) dataUpdates[dateCol.id] = today;
          else if (inputLower.includes('내일')) {
            const tm = new Date();
            tm.setDate(tm.getDate() + 1);
            dataUpdates[dateCol.id] = tm.toISOString().slice(0, 10);
          }
        }

        proposal = {
          id: `prop_${Date.now()}`,
          tool: 'update_table_row',
          arguments: {
            tableId: activeTableId || table?.id || 'table-roadmap',
            rowId: targetRow?.id || 'row-1',
            dataUpdates: Object.keys(dataUpdates).length > 0 ? dataUpdates : { 'col-status': '완료' },
          },
          summary: `'${targetRowTitle}' 데이터 행의 속성값을 자연어 지시에 맞춰 안전하게 수정합니다.`,
          isDestructive: false,
          status: 'pending',
        };
      } else if (inputLower.includes('삭제') || inputLower.includes('지워')) {
        proposal = {
          id: `prop_${Date.now()}`,
          tool: 'delete_calendar_event',
          arguments: {
            eventId: 'evt_sample_to_delete',
          },
          summary: `'${actionInput}' 요청에 따라 해당 일정을 캘린더 및 SQLite 데이터베이스에서 영구 삭제합니다.`,
          isDestructive: true,
          status: 'pending',
        };
      } else {
        proposal = {
          id: `prop_${Date.now()}`,
          tool: 'create_calendar_event',
          arguments: {
            title: actionInput.replace(/(일정|등록|추가|잡아줘)/g, '').trim() || '새 미팅',
            startDate: today,
            endDate: today,
            startTime: '14:00',
            endTime: '15:00',
            tableId: activeTableId,
            category: 'work',
          },
          summary: `신규 일정 '${actionInput}'을(를) 생성하고 SQLite 캘린더에 등록합니다.`,
          isDestructive: false,
          status: 'pending',
        };
      }

      setPendingProposal(proposal);
    } catch (err: any) {
      setErrorMsg(err.message || '작업 분석 실패');
    } finally {
      setIsLoading(false);
    }
  };

  const handleApproveAction = async (proposal: ToolActionProposal) => {
    setIsLoading(true);
    try {
      const res = await ollamaClient.executeTool(proposal.tool, proposal.arguments);
      setPendingProposal(null);
      setActionHistory((prev) => [
        { text: `[성공] ${proposal.summary} (${new Date().toLocaleTimeString()})`, success: true },
        ...prev,
      ]);
      setActionInput('');
      if (onRefreshData) onRefreshData();
    } catch (err: any) {
      setActionHistory((prev) => [
        { text: `[실패] ${err.message || '작업 실행 중 오류'}`, success: false },
        ...prev,
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 z-40 w-full sm:w-[560px] bg-white dark:bg-[#1c1c1c] border-l border-stone-200 dark:border-[#2e2e2e] shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
      {/* Header */}
      <div className="px-5 py-4 border-b border-stone-200 dark:border-[#2a2a2a] flex items-center justify-between bg-stone-50 dark:bg-[#232323]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center font-bold">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2">
              WonBee AI 멀티 에이전트
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400 font-mono">
                Qwen 2.5
              </span>
            </h2>
            <div className="flex items-center gap-2 mt-0.5 text-[11px] text-stone-500 dark:text-stone-400">
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  status?.online ? 'bg-emerald-500 shadow-xs shadow-emerald-500/50 animate-pulse' : 'bg-amber-500'
                }`}
                title={status?.online ? 'Ollama Qwen 2.5 백엔드 연결 완료 (초록불)' : '내장 규칙 기반 오프라인 엔진 동작 중 (주황불)'}
              />
              <span className="font-medium">
                {status?.online
                  ? `Ollama 데몬 연결됨 (${status.recommendedModel})`
                  : '오프라인 모드 (내장 규칙 엔진 구동)'}
              </span>
              <button
                type="button"
                onClick={checkStatus}
                className="hover:text-stone-900 dark:hover:text-stone-200 p-0.5"
                title="Ollama 상태 새로고침"
              >
                <RefreshCw className={`w-3 h-3 ${isCheckingStatus ? 'animate-spin' : ''}`} />
              </button>
              <button
                type="button"
                onClick={() => setIsConfigOpen(!isConfigOpen)}
                className="hover:text-stone-900 dark:hover:text-stone-200 p-0.5 flex items-center gap-1 text-[10px] text-amber-700 dark:text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 px-1.5 py-0.5 rounded"
                title="Ollama 연결 주소(URL) 및 초록불 설정 가이드"
              >
                <Settings className="w-3 h-3" />
                <span>호스트 설정</span>
              </button>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="w-8 h-8 rounded-xl hover:bg-stone-200 dark:hover:bg-[#333] flex items-center justify-center text-stone-500 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Ollama Host Configuration & Status Guide Box */}
      {isConfigOpen && (
        <div className="px-5 py-3.5 bg-amber-50/80 dark:bg-amber-950/30 border-b border-amber-300 dark:border-amber-800 text-xs space-y-2.5 animate-in slide-in-from-top-2 duration-150">
          <div className="flex items-center justify-between">
            <span className="font-bold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
              <HelpCircle className="w-4 h-4 text-amber-500" />
              <span>Ollama 연결 주소 설정 및 주황불 안내</span>
            </span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
              status?.online ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
            }`}>
              {status?.online ? '🟢 연결됨 (초록불)' : '🟠 대기/오프라인 (주황불)'}
            </span>
          </div>

          <div className="text-stone-600 dark:text-stone-300 space-y-1.5 leading-relaxed text-[11px]">
            <p>
              • <strong>주황색불인 이유:</strong> 현재 앱이 구동되는 클라우드 컨테이너 환경에서 로컬 컴퓨터의 <code>http://localhost:11434</code>에 접근할 수 없을 때 자동으로 <strong>내장 오프라인 엔진(주황불)</strong>으로 동작하여 데이터 수정/보고서 변환이 중단 없이 수행됩니다.
            </p>
            <p>
              • <strong>초록불(실제 Qwen 2.5 모델)로 전환하려면:</strong>
            </p>
            <ol className="list-decimal list-inside pl-1 text-[11px] space-y-0.5 text-stone-700 dark:text-stone-200 font-mono">
              <li>터미널에서 외부 접근 허용으로 실행: <code>OLLAMA_ORIGINS="*" ollama serve</code></li>
              <li>공유기/터널링(ngrok, Cloudflare 등) 또는 외부 접근 가능 IP 주소를 아래에 입력하세요.</li>
            </ol>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              type="text"
              value={customHost}
              onChange={(e) => setCustomHost(e.target.value)}
              placeholder="예: http://localhost:11434 또는 http://192.168.x.x:11434"
              className="flex-1 px-3 py-1.5 rounded-lg border border-amber-300 dark:border-amber-700 bg-white dark:bg-[#1a1a1a] text-stone-900 dark:text-stone-100 outline-none font-mono text-xs focus:ring-1 focus:ring-amber-500"
            />
            <button
              type="button"
              disabled={isSavingConfig}
              onClick={handleSaveHostConfig}
              className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs shrink-0 flex items-center gap-1 shadow-2xs disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${isSavingConfig ? 'animate-spin' : ''}`} />
              <span>연결 테스트 & 저장</span>
            </button>
          </div>
          {status?.error && !status.online && (
            <div className="text-[10px] text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 p-2 rounded border border-red-200 dark:border-red-900">
              {status.error}
            </div>
          )}
        </div>
      )}

      {/* 5 Tab Navigation */}
      <div className="flex border-b border-stone-200 dark:border-[#2a2a2a] bg-stone-100/60 dark:bg-[#1a1a1a] p-1.5 gap-1 text-xs font-semibold overflow-x-auto">
        {/* Tab: Data Edit */}
        <button
          type="button"
          onClick={() => {
            setActiveTab('data');
            setErrorMsg(null);
            setSuccessMsg(null);
          }}
          className={`flex-1 min-w-[70px] py-2 rounded-xl flex items-center justify-center gap-1.5 transition-colors ${
            activeTab === 'data'
              ? 'bg-amber-500 text-stone-950 font-bold shadow-xs'
              : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200'
          }`}
          title="테이블 및 행 데이터 자연어 수정 / 스마트 자동 채우기"
        >
          <Database className="w-3.5 h-3.5" />
          <span>데이터 수정</span>
        </button>

        {/* Tab: Editor */}
        <button
          type="button"
          onClick={() => {
            setActiveTab('editor');
            setErrorMsg(null);
            setSuccessMsg(null);
          }}
          className={`flex-1 min-w-[70px] py-2 rounded-xl flex items-center justify-center gap-1.5 transition-colors ${
            activeTab === 'editor'
              ? 'bg-white dark:bg-[#252525] text-amber-600 dark:text-amber-400 shadow-xs'
              : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>에디터</span>
        </button>

        {/* Tab: Action */}
        <button
          type="button"
          onClick={() => {
            setActiveTab('action');
            setErrorMsg(null);
            setSuccessMsg(null);
          }}
          className={`flex-1 min-w-[70px] py-2 rounded-xl flex items-center justify-center gap-1.5 transition-colors ${
            activeTab === 'action'
              ? 'bg-white dark:bg-[#252525] text-amber-600 dark:text-amber-400 shadow-xs'
              : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200'
          }`}
        >
          <Calendar className="w-3.5 h-3.5" />
          <span>Action 도구</span>
        </button>

        {/* Tab: RAG */}
        <button
          type="button"
          onClick={() => {
            setActiveTab('rag');
            setErrorMsg(null);
            setSuccessMsg(null);
          }}
          className={`flex-1 min-w-[70px] py-2 rounded-xl flex items-center justify-center gap-1.5 transition-colors ${
            activeTab === 'rag'
              ? 'bg-white dark:bg-[#252525] text-amber-600 dark:text-amber-400 shadow-xs'
              : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200'
          }`}
        >
          <Search className="w-3.5 h-3.5" />
          <span>RAG 리서치</span>
        </button>

        {/* Tab: Diagram */}
        <button
          type="button"
          onClick={() => {
            setActiveTab('diagram');
            setErrorMsg(null);
            setSuccessMsg(null);
          }}
          className={`flex-1 min-w-[70px] py-2 rounded-xl flex items-center justify-center gap-1.5 transition-colors ${
            activeTab === 'diagram'
              ? 'bg-white dark:bg-[#252525] text-amber-600 dark:text-amber-400 shadow-xs'
              : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200'
          }`}
        >
          <Network className="w-3.5 h-3.5" />
          <span>다이어그램</span>
        </button>
      </div>

      {/* Feedback Banners */}
      {errorMsg && (
        <div className="mx-5 mt-4 p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded-xl text-xs text-rose-700 dark:text-rose-300 flex items-start gap-2 animate-in fade-in">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="flex-1">{errorMsg}</div>
        </div>
      )}
      {successMsg && (
        <div className="mx-5 mt-4 p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 rounded-xl text-xs text-emerald-700 dark:text-emerald-300 flex items-start gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="flex-1">{successMsg}</div>
        </div>
      )}

      {/* Content Body */}
      <div className="flex-1 overflow-auto p-5 space-y-6 custom-scrollbar">
        {/* ==================================================== */}
        {/* TAB 0: DATA EDIT AGENT (테이블 및 행 데이터 지능형 수정) */}
        {/* ==================================================== */}
        {activeTab === 'data' && (
          <div className="space-y-5">
            {/* Target Header & Mode Switcher */}
            <div className="p-4 border border-stone-200 dark:border-[#2e2e2e] rounded-2xl bg-stone-50/50 dark:bg-[#222]">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <TableIcon className="w-4 h-4 text-amber-500" />
                  <span className="font-bold text-xs text-stone-900 dark:text-stone-100">
                    {table?.title || '로드맵 테이블'}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-stone-200 dark:bg-[#333] text-stone-600 dark:text-stone-400 font-mono">
                    총 {effectiveRows.length}개 행
                  </span>
                </div>

                {/* Single Row vs Batch Edit Switcher */}
                <div className="flex bg-stone-200 dark:bg-[#333] p-0.5 rounded-lg text-[11px] font-semibold">
                  <button
                    type="button"
                    onClick={() => {
                      setDataEditMode('row');
                      setBatchProposal(null);
                    }}
                    className={`px-2.5 py-1 rounded-md transition-colors ${
                      dataEditMode === 'row'
                        ? 'bg-white dark:bg-[#202020] text-amber-600 dark:text-amber-400 font-bold shadow-xs'
                        : 'text-stone-600 dark:text-stone-400 hover:text-stone-900'
                    }`}
                  >
                    단일 행 수정
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDataEditMode('batch');
                      setRowProposal(null);
                    }}
                    className={`px-2.5 py-1 rounded-md transition-colors ${
                      dataEditMode === 'batch'
                        ? 'bg-white dark:bg-[#202020] text-amber-600 dark:text-amber-400 font-bold shadow-xs'
                        : 'text-stone-600 dark:text-stone-400 hover:text-stone-900'
                    }`}
                  >
                    테이블 일괄 수정
                  </button>
                </div>
              </div>

              {/* Row Selector (When in Single Row Mode) */}
              {dataEditMode === 'row' && (
                <div className="space-y-2 pt-2 border-t border-stone-200/80 dark:border-[#333]">
                  <div className="flex items-center justify-between text-[11px] text-stone-500 dark:text-stone-400 font-medium">
                    <span>수정 대상 행 선택:</span>
                    {currentTargetRow && (
                      <span className="text-amber-600 dark:text-amber-400 font-mono">
                        ID: {currentTargetRow.id}
                      </span>
                    )}
                  </div>
                  <select
                    value={selectedRowId}
                    onChange={(e) => {
                      setSelectedRowId(e.target.value);
                      setRowProposal(null);
                    }}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-stone-300 dark:border-[#383838] bg-white dark:bg-[#1a1a1a] text-stone-800 dark:text-stone-100 outline-none"
                  >
                    {effectiveRows.map((r, idx) => {
                      const title = r.data['col-name'] || Object.values(r.data)[0] || `행 #${idx + 1}`;
                      return (
                        <option key={r.id} value={r.id}>
                          #{idx + 1} {String(title).slice(0, 35)}
                        </option>
                      );
                    })}
                  </select>

                  {/* Quick Preview Chips of Selected Row */}
                  {currentTargetRow && (
                    <div className="flex flex-wrap gap-1.5 pt-1 text-[11px]">
                      {Object.entries(currentTargetRow.data).slice(0, 4).map(([k, v]) => (
                        <span
                          key={k}
                          className="px-2 py-0.5 rounded-lg bg-stone-100 dark:bg-[#282828] text-stone-600 dark:text-stone-300 border border-stone-200 dark:border-[#333]"
                        >
                          <strong className="text-stone-400 font-normal mr-1">{k}:</strong>
                          {String(v || '(비어있음)')}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Quick 1-Click Smart Action Buttons */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-stone-600 dark:text-stone-400 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                <span>원클릭 AI 스마트 추천 수정</span>
              </span>

              <div className="flex flex-wrap gap-1.5">
                {dataEditMode === 'row' ? (
                  <>
                    <button
                      type="button"
                      disabled={isLoading}
                      onClick={() => handleProposeRowDataEdit("상태를 '완료'로 변경하고 마감일을 오늘 날짜로 수정해줘")}
                      className="px-2.5 py-1.5 rounded-xl text-xs bg-amber-500/10 hover:bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-400/40 transition-colors font-medium text-left"
                    >
                      ⚡ 상태 '완료' & 오늘 마감일
                    </button>
                    <button
                      type="button"
                      disabled={isLoading}
                      onClick={() => handleProposeRowDataEdit("본문 내용을 요약해서 비고란에 자동으로 채워줘")}
                      className="px-2.5 py-1.5 rounded-xl text-xs bg-stone-100 dark:bg-[#282828] hover:bg-stone-200 dark:hover:bg-[#333] text-stone-700 dark:text-stone-300 border border-stone-200 dark:border-[#383838] transition-colors font-medium text-left"
                    >
                      ⚡ 본문 기반 비고/요약 자동 생성
                    </button>
                    <button
                      type="button"
                      disabled={isLoading}
                      onClick={() => handleProposeRowDataEdit("우선순위를 '긴급'으로 상향 조정해줘")}
                      className="px-2.5 py-1.5 rounded-xl text-xs bg-stone-100 dark:bg-[#282828] hover:bg-stone-200 dark:hover:bg-[#333] text-stone-700 dark:text-stone-300 border border-stone-200 dark:border-[#383838] transition-colors font-medium text-left"
                    >
                      ⚡ 우선순위 '긴급' 상향
                    </button>
                    <button
                      type="button"
                      disabled={isLoading}
                      onClick={() => handleProposeRowDataEdit("제목의 오탈자 및 불필요한 공백을 교정해줘")}
                      className="px-2.5 py-1.5 rounded-xl text-xs bg-stone-100 dark:bg-[#282828] hover:bg-stone-200 dark:hover:bg-[#333] text-stone-700 dark:text-stone-300 border border-stone-200 dark:border-[#383838] transition-colors font-medium text-left"
                    >
                      ⚡ 오탈자 및 제목 공백 교정
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={isLoading}
                      onClick={() => handleProposeBatchDataEdit("지연 상태인 모든 항목의 우선순위를 '긴급'으로 변경해줘")}
                      className="px-2.5 py-1.5 rounded-xl text-xs bg-amber-500/10 hover:bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-400/40 transition-colors font-medium text-left"
                    >
                      ⚡ 지연 항목 우선순위 '긴급' 일괄 변경
                    </button>
                    <button
                      type="button"
                      disabled={isLoading}
                      onClick={() => handleProposeBatchDataEdit("완료된 항목들의 우선순위를 '낮음'으로 변경해줘")}
                      className="px-2.5 py-1.5 rounded-xl text-xs bg-stone-100 dark:bg-[#282828] hover:bg-stone-200 dark:hover:bg-[#333] text-stone-700 dark:text-stone-300 border border-stone-200 dark:border-[#383838] transition-colors font-medium text-left"
                    >
                      ⚡ 완료 항목 우선순위 '낮음' 일괄 변경
                    </button>
                    <button
                      type="button"
                      disabled={isLoading}
                      onClick={() => handleProposeBatchDataEdit("모든 항목의 담당자를 '미정'으로 설정해줘")}
                      className="px-2.5 py-1.5 rounded-xl text-xs bg-stone-100 dark:bg-[#282828] hover:bg-stone-200 dark:hover:bg-[#333] text-stone-700 dark:text-stone-300 border border-stone-200 dark:border-[#383838] transition-colors font-medium text-left"
                    >
                      ⚡ 모든 항목 담당자 '미정' 설정
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Custom Natural Language Prompt Input */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-stone-700 dark:text-stone-300 flex items-center justify-between">
                <span>자연어 데이터 수정 지시:</span>
                <span className="text-[11px] text-stone-400 font-normal">
                  한국어 문장으로 자유롭게 입력하세요
                </span>
              </label>
              <textarea
                value={dataEditPrompt}
                onChange={(e) => setDataEditPrompt(e.target.value)}
                placeholder={
                  dataEditMode === 'row'
                    ? "예: 마감일을 다음주 금요일로 연장하고, 진행상태를 '검토중'으로 바꿔줘."
                    : "예: 진행상태가 '지연'인 항목들의 마감일을 2026-09-30으로 1주일 연장해줘."
                }
                rows={3}
                className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-stone-300 dark:border-[#383838] bg-white dark:bg-[#1a1a1a] text-stone-800 dark:text-stone-100 outline-none focus:border-amber-500 transition-colors"
              />
              <button
                type="button"
                disabled={isLoading || !dataEditPrompt.trim()}
                onClick={() => (dataEditMode === 'row' ? handleProposeRowDataEdit() : handleProposeBatchDataEdit())}
                className="w-full py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs flex items-center justify-center gap-2 transition-colors shadow-sm disabled:opacity-50"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>
                  {isLoading
                    ? 'AI 분석 및 수정안 계산 중...'
                    : dataEditMode === 'row'
                    ? 'AI 행 데이터 수정안 도출'
                    : 'AI 일괄 데이터 수정안 도출'}
                </span>
              </button>
            </div>

            {/* Visual Data Diff Preview for Single Row */}
            {rowProposal && (
              <div className="p-4 border border-amber-500/30 rounded-2xl bg-amber-50/20 dark:bg-amber-950/10 space-y-3 animate-in fade-in duration-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckSquare className="w-4 h-4 text-amber-500" />
                    <span className="font-bold text-xs text-stone-900 dark:text-stone-100">
                      수정안 검토 ({rowProposal.rowTitle})
                    </span>
                  </div>
                  <span className="text-[11px] font-bold text-amber-700 dark:text-amber-400 font-mono">
                    {rowProposal.changes.length}개 컬럼
                  </span>
                </div>

                <p className="text-xs text-stone-600 dark:text-stone-300">
                  {rowProposal.summary}
                </p>

                {/* Diff Table per Column */}
                <div className="border border-stone-200 dark:border-[#383838] rounded-xl overflow-hidden text-xs bg-white dark:bg-[#1c1c1c]">
                  <table className="w-full text-left">
                    <thead className="bg-stone-100 dark:bg-[#252525] text-stone-500 dark:text-stone-400 border-b border-stone-200 dark:border-[#333]">
                      <tr>
                        <th className="p-2 w-8 text-center">선택</th>
                        <th className="p-2 font-semibold">컬럼명</th>
                        <th className="p-2 font-semibold">수정 전</th>
                        <th className="p-2 font-semibold">수정 후</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100 dark:divide-[#292929]">
                      {rowProposal.changes.map((change) => (
                        <tr key={change.columnId} className="hover:bg-stone-50 dark:hover:bg-[#222]">
                          <td className="p-2 text-center">
                            <input
                              type="checkbox"
                              checked={change.enabled !== false}
                              onChange={() => handleToggleChangeItem(change.columnId)}
                              className="rounded accent-amber-500 cursor-pointer"
                            />
                          </td>
                          <td className="p-2 font-medium text-stone-800 dark:text-stone-200">
                            {change.columnName}
                          </td>
                          <td className="p-2">
                            <span className="line-through text-stone-400 bg-stone-100 dark:bg-[#252525] px-1.5 py-0.5 rounded text-[11px]">
                              {String(change.oldValue || '(없음)')}
                            </span>
                          </td>
                          <td className="p-2">
                            <span className="font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800/40 text-[11px]">
                              {String(change.newValue)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Apply Button */}
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setRowProposal(null)}
                    className="flex-1 py-2 px-3 rounded-xl border border-stone-300 dark:border-[#383838] text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-[#282828] text-xs font-semibold"
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    disabled={isLoading}
                    onClick={handleApplyRowDataChanges}
                    className="flex-[2] py-2 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md transition-colors"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>수정 사항 SQLite DB 및 화면에 즉시 적용</span>
                  </button>
                </div>
              </div>
            )}

            {/* Visual Data Diff Preview for Batch Edit */}
            {batchProposal && (
              <div className="p-4 border border-amber-500/30 rounded-2xl bg-amber-50/20 dark:bg-amber-950/10 space-y-3 animate-in fade-in duration-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-amber-500" />
                    <span className="font-bold text-xs text-stone-900 dark:text-stone-100">
                      일괄 수정안 검토
                    </span>
                  </div>
                  <span className="text-[11px] font-bold text-amber-700 dark:text-amber-400 font-mono">
                    총 {batchProposal.affectedRowCount}개 행 대상
                  </span>
                </div>

                <p className="text-xs text-stone-600 dark:text-stone-300">
                  {batchProposal.summary}
                </p>

                <div className="space-y-2 max-h-56 overflow-y-auto pr-1 custom-scrollbar">
                  {batchProposal.rowProposals.map((rp) => (
                    <div
                      key={rp.rowId}
                      className="p-2.5 rounded-xl border border-stone-200 dark:border-[#333] bg-white dark:bg-[#1f1f1f] text-xs space-y-1.5"
                    >
                      <div className="font-bold text-stone-900 dark:text-stone-100 flex items-center justify-between">
                        <span>{rp.rowTitle}</span>
                        <span className="text-[10px] text-stone-400 font-mono">{rp.rowId}</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {rp.changes.map((c) => (
                          <div key={c.columnId} className="flex items-center gap-1 text-[11px]">
                            <span className="text-stone-500">{c.columnName}:</span>
                            <span className="line-through text-stone-400">{String(c.oldValue)}</span>
                            <ArrowRight className="w-3 h-3 text-stone-400" />
                            <span className="font-bold text-emerald-600 dark:text-emerald-400">
                              {String(c.newValue)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Batch Apply Button */}
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setBatchProposal(null)}
                    className="flex-1 py-2 px-3 rounded-xl border border-stone-300 dark:border-[#383838] text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-[#282828] text-xs font-semibold"
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    disabled={isLoading}
                    onClick={handleApplyBatchDataChanges}
                    className="flex-[2] py-2 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md transition-colors"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>{batchProposal.affectedRowCount}개 행 일괄 적용 및 SQLite 저장</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ==================================================== */}
        {/* TAB 1: Editor Agent (에디터 & 문서 서식 변환) */}
        {/* ==================================================== */}
        {activeTab === 'editor' && (
          <div className="space-y-6">
            {/* Action 1: Memo -> Formal Report */}
            <div className="p-4 border border-stone-200 dark:border-[#2e2e2e] rounded-2xl bg-stone-50/50 dark:bg-[#222]">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-bold text-stone-900 dark:text-stone-100 flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-amber-500" />
                  <span>메모 → 정규 양식 자동 변환</span>
                </h3>
                <div className="flex bg-stone-200 dark:bg-[#333] p-0.5 rounded-lg text-[11px] font-semibold">
                  <button
                    type="button"
                    onClick={() => setFormatType('report')}
                    className={`px-2 py-0.5 rounded-md ${
                      formatType === 'report' ? 'bg-white dark:bg-[#222] text-amber-600 shadow-xs' : 'text-stone-600'
                    }`}
                  >
                    보고서
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormatType('meeting')}
                    className={`px-2 py-0.5 rounded-md ${
                      formatType === 'meeting' ? 'bg-white dark:bg-[#222] text-amber-600 shadow-xs' : 'text-stone-600'
                    }`}
                  >
                    회의록
                  </button>
                </div>
              </div>
              <p className="text-xs text-stone-500 dark:text-stone-400 mb-3">
                현재 에디터 본문(또는 메모)을 분석하여 개조식 항목, 추진 경과, 액션 플랜 표가 포함된 전문 서식으로
                재구성합니다.
              </p>
              <button
                type="button"
                disabled={isLoading}
                onClick={handleConvertToReport}
                className="w-full py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs flex items-center justify-center gap-2 transition-colors shadow-sm disabled:opacity-50"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{isLoading ? '변환 중...' : `${formatType === 'meeting' ? '회의록' : '보고서'} 양식으로 변환 & Diff 비교`}</span>
              </button>
            </div>

            {/* Action 2: Document Linting */}
            <div className="p-4 border border-stone-200 dark:border-[#2e2e2e] rounded-2xl bg-stone-50/50 dark:bg-[#222]">
              <h3 className="text-xs font-bold text-stone-900 dark:text-stone-100 flex items-center gap-1.5 mb-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <span>문서 Linting (맞춤법, 문체 통일, Heading 교정)</span>
              </h3>
              <p className="text-xs text-stone-500 dark:text-stone-400 mb-3">
                오탈자 및 띄어쓰기 규정을 교정하고, 공식 보고체(-함, -임 등 개조식 어조)로 통일하며, 누락된 Heading 계층을 정비합니다.
              </p>
              <button
                type="button"
                disabled={isLoading}
                onClick={handleLintDocument}
                className="w-full py-2.5 px-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-bold text-xs flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
              >
                <Check className="w-3.5 h-3.5" />
                <span>{isLoading ? '린팅 검사 중...' : '문서 전체 린팅 및 검사'}</span>
              </button>
            </div>
          </div>
        )}

        {/* ==================================================== */}
        {/* TAB 2: Action Agent & Tool Registry */}
        {/* ==================================================== */}
        {activeTab === 'action' && (
          <div className="space-y-6">
            <div className="p-4 border border-stone-200 dark:border-[#2e2e2e] rounded-2xl bg-stone-50/50 dark:bg-[#222]">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-bold text-stone-900 dark:text-stone-100 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-500" />
                  <span>Action Agent & Tool Registry (안전 확인)</span>
                </h3>
              </div>
              <p className="text-xs text-stone-500 dark:text-stone-400 mb-3">
                자연어로 일정 등록, 데이터 수정, 삭제를 지시하세요. 변경 및 삭제 작업은 반드시 승인 모달 확인 후 안전하게 실행됩니다.
              </p>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={actionInput}
                  onChange={(e) => setActionInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleParseAction()}
                  placeholder="예: 스마트 배송 모듈 행의 우선순위를 '긴급'으로 변경해줘"
                  className="flex-1 px-3 py-2 text-xs rounded-xl border border-stone-300 dark:border-[#383838] bg-white dark:bg-[#1a1a1a] text-stone-800 dark:text-stone-100 outline-none"
                />
                <button
                  type="button"
                  disabled={isLoading}
                  onClick={handleParseAction}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs rounded-xl flex items-center gap-1 shadow-sm disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>실행</span>
                </button>
              </div>
            </div>

            {/* Action Execution History */}
            {actionHistory.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-bold text-stone-600 dark:text-stone-400">실행 내역:</div>
                {actionHistory.map((item, idx) => (
                  <div
                    key={idx}
                    className={`p-2.5 rounded-xl text-xs font-mono border ${
                      item.success
                        ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                        : 'bg-rose-500/10 border-rose-500/20 text-rose-700 dark:text-rose-300'
                    }`}
                  >
                    {item.text}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ==================================================== */}
        {/* TAB 3: RAG Agent (지식 베이스 & 팩트체크) */}
        {/* ==================================================== */}
        {activeTab === 'rag' && (
          <div className="space-y-6">
            {/* Search Query */}
            <div className="p-4 border border-stone-200 dark:border-[#2e2e2e] rounded-2xl bg-stone-50/50 dark:bg-[#222]">
              <h3 className="text-xs font-bold text-stone-900 dark:text-stone-100 flex items-center gap-1.5 mb-2">
                <Search className="w-4 h-4 text-amber-500" />
                <span>사내 문서 RAG 검색 & 팩트체크</span>
              </h3>
              <p className="text-xs text-stone-500 dark:text-stone-400 mb-3">
                SQLite에 색인된 사내 가이드, 정책, 기획 문서를 검색하여 출처 각주와 함께 팩트체크 답변을 제공합니다.
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={ragQuery}
                  onChange={(e) => setRagQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearchRag()}
                  placeholder="예: 클라우드 보안 가이드라인 및 암호화 정책"
                  className="flex-1 px-3 py-2 text-xs rounded-xl border border-stone-300 dark:border-[#383838] bg-white dark:bg-[#1a1a1a] text-stone-800 dark:text-stone-100 outline-none"
                />
                <button
                  type="button"
                  disabled={isLoading}
                  onClick={handleSearchRag}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs rounded-xl flex items-center gap-1 shadow-sm disabled:opacity-50"
                >
                  <Search className="w-3.5 h-3.5" />
                  <span>검색</span>
                </button>
              </div>
            </div>

            {/* RAG Answer Display with Citations */}
            {ragAnswer && (
              <div className="p-4 border border-stone-200 dark:border-[#2e2e2e] rounded-2xl bg-white dark:bg-[#202020] space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-stone-900 dark:text-stone-100 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    <span>팩트체크 요약 결과</span>
                  </span>
                  {onInsertToEditor && (
                    <button
                      type="button"
                      onClick={() => onInsertToEditor(`\n\n> 💡 **RAG 팩트체크 결과**\n> ${ragAnswer.summary}\n\n${ragAnswer.citations.join('\n')}\n`)}
                      className="text-[11px] px-2 py-1 rounded bg-amber-500/10 text-amber-700 dark:text-amber-300 hover:bg-amber-500/20 font-bold"
                    >
                      에디터에 삽입
                    </button>
                  )}
                </div>
                <p className="text-xs text-stone-700 dark:text-stone-300 leading-relaxed whitespace-pre-wrap">
                  {ragAnswer.summary}
                </p>

                {ragAnswer.citations.length > 0 && (
                  <div className="pt-2 border-t border-stone-200 dark:border-[#333] space-y-1">
                    <span className="text-[11px] font-bold text-stone-500">참조 출처 (Citations):</span>
                    {ragAnswer.citations.map((c, idx) => (
                      <div key={idx} className="text-[11px] text-stone-500 dark:text-stone-400 font-mono">
                        {c}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Index New Document */}
            <div className="p-4 border border-dashed border-stone-300 dark:border-[#383838] rounded-2xl bg-stone-50/50 dark:bg-[#222]">
              <h3 className="text-xs font-bold text-stone-900 dark:text-stone-100 flex items-center gap-1.5 mb-2">
                <span>사내 문서 청킹 & SQLite 색인 등록</span>
              </h3>
              <input
                type="text"
                value={ragDocTitle}
                onChange={(e) => setRagDocTitle(e.target.value)}
                placeholder="문서 제목 (예: 2026 데이터 거버넌스 가이드)"
                className="w-full px-3 py-1.5 text-xs rounded-xl border border-stone-300 dark:border-[#383838] bg-white dark:bg-[#1a1a1a] text-stone-800 dark:text-stone-100 outline-none mb-2"
              />
              <textarea
                value={ragDocContent}
                onChange={(e) => setRagDocContent(e.target.value)}
                placeholder="문서 본문 내용 (단락별로 분할되어 SQLite에 색인됩니다)..."
                rows={3}
                className="w-full px-3 py-2 text-xs rounded-xl border border-stone-300 dark:border-[#383838] bg-white dark:bg-[#1a1a1a] text-stone-800 dark:text-stone-100 outline-none mb-3"
              />
              <button
                type="button"
                disabled={isLoading}
                onClick={handleIndexDocument}
                className="w-full py-2 px-3 rounded-xl border border-stone-300 dark:border-[#383838] bg-white dark:bg-[#252525] hover:bg-stone-100 dark:hover:bg-[#2e2e2e] text-stone-800 dark:text-stone-200 font-bold text-xs transition-colors"
              >
                <span>문서 청킹 후 SQLite 색인 추가</span>
              </button>
            </div>
          </div>
        )}

        {/* ==================================================== */}
        {/* TAB 4: Diagram Agent (Mermaid.js 실시간 시각화) */}
        {/* ==================================================== */}
        {activeTab === 'diagram' && (
          <div className="space-y-6">
            <div className="p-4 border border-stone-200 dark:border-[#2e2e2e] rounded-2xl bg-stone-50/50 dark:bg-[#222]">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-bold text-stone-900 dark:text-stone-100 flex items-center gap-1.5">
                  <Network className="w-4 h-4 text-amber-500" />
                  <span>Mermaid 다이어그램 자동 생성</span>
                </h3>
                <div className="flex bg-stone-200 dark:bg-[#333] p-0.5 rounded-lg text-[11px] font-semibold">
                  <button
                    type="button"
                    onClick={() => setDiagramType('flowchart')}
                    className={`px-2 py-0.5 rounded-md ${
                      diagramType === 'flowchart' ? 'bg-white dark:bg-[#222] text-amber-600 shadow-xs' : 'text-stone-600'
                    }`}
                  >
                    플로우
                  </button>
                  <button
                    type="button"
                    onClick={() => setDiagramType('sequence')}
                    className={`px-2 py-0.5 rounded-md ${
                      diagramType === 'sequence' ? 'bg-white dark:bg-[#222] text-amber-600 shadow-xs' : 'text-stone-600'
                    }`}
                  >
                    시퀀스
                  </button>
                </div>
              </div>

              <textarea
                value={diagramPrompt}
                onChange={(e) => setDiagramPrompt(e.target.value)}
                placeholder="시각화할 아키텍처 또는 업무 흐름을 설명하세요..."
                rows={2}
                className="w-full px-3 py-2 text-xs rounded-xl border border-stone-300 dark:border-[#383838] bg-white dark:bg-[#1a1a1a] text-stone-800 dark:text-stone-100 outline-none mb-3"
              />

              <button
                type="button"
                disabled={isLoading}
                onClick={handleGenerateDiagram}
                className="w-full py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs flex items-center justify-center gap-2 transition-colors shadow-sm disabled:opacity-50"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{isLoading ? '다이어그램 생성 중...' : 'Mermaid 다이어그램 생성'}</span>
              </button>
            </div>

            {/* Render Mermaid Component */}
            {generatedMermaid && (
              <MermaidViewer
                code={generatedMermaid}
                onInsertToEditor={onInsertToEditor ? (code) => onInsertToEditor(`\n\`\`\`mermaid\n${code}\n\`\`\`\n`) : undefined}
              />
            )}
          </div>
        )}
      </div>

      {/* Diff View Modal */}
      <DiffViewModal
        isOpen={isDiffModalOpen}
        onClose={() => setIsDiffModalOpen(false)}
        originalText={diffOriginal}
        revisedText={diffRevised}
        summary={diffSummary}
        onApply={(text) => {
          if (onApplyToEditor) {
            onApplyToEditor(text);
          }
        }}
      />

      {/* Safety Action Confirmation Modal */}
      <ActionConfirmModal
        isOpen={Boolean(pendingProposal)}
        proposal={pendingProposal}
        onApprove={handleApproveAction}
        onReject={() => setPendingProposal(null)}
      />
    </div>
  );
};
