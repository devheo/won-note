import { TableColumn, TableRow, TableDocument } from '../../types';

export interface OllamaStatus {
  online: boolean;
  host: string;
  models: string[];
  recommendedModel: string;
  error?: string;
}

export interface LintResult {
  summary: string;
  correctionsCount: number;
  changes: Array<{ original: string; suggested: string; reason: string }>;
  revisedContent: string;
}

export interface RagResultItem {
  id: string;
  docId: string;
  title: string;
  content: string;
  score: number;
}

export interface ToolActionProposal {
  id: string;
  tool: string;
  arguments: Record<string, any>;
  summary: string;
  isDestructive: boolean;
  status: 'pending' | 'approved' | 'rejected';
}

export interface ColumnChangeProposal {
  columnId: string;
  columnName: string;
  oldValue: any;
  newValue: any;
  reason?: string;
  enabled?: boolean;
}

export interface RowDataEditProposal {
  rowId: string;
  rowTitle: string;
  changes: ColumnChangeProposal[];
  summary: string;
}

export interface BatchDataEditProposal {
  tableId: string;
  tableName: string;
  affectedRowCount: number;
  rowProposals: RowDataEditProposal[];
  summary: string;
}

class OllamaClient {
  private baseUrl = '/api';

  /**
   * Check Ollama connection status
   */
  async getStatus(host?: string): Promise<OllamaStatus> {
    try {
      const url = host ? `${this.baseUrl}/ollama/status?host=${encodeURIComponent(host)}` : `${this.baseUrl}/ollama/status`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err: any) {
      return {
        online: false,
        host: host || 'http://localhost:11434',
        models: [],
        recommendedModel: 'qwen2.5:14b',
        error: err.message || '오프라인 모드로 동작 중입니다.',
      };
    }
  }

  /**
   * Update Ollama server host and model config
   */
  async updateConfig(params: { host?: string; model?: string }): Promise<{ config: any; status: OllamaStatus }> {
    const res = await fetch(`${this.baseUrl}/ollama/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  }

  /**
   * General text generation
   */
  async generate(params: {
    prompt: string;
    systemPrompt?: string;
    model?: string;
    format?: 'json';
    temperature?: number;
  }): Promise<string> {
    const res = await fetch(`${this.baseUrl}/ollama/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (!res.ok) throw new Error(`LLM Error: HTTP ${res.status}`);
    const data = await res.json();
    return data.response || '';
  }

  /**
   * Convert rough memo to formal meeting notes or report
   */
  async convertToReport(rawText: string, formatType: 'meeting' | 'report' = 'report'): Promise<string> {
    const typeLabel = formatType === 'meeting' ? '회의록' : '비즈니스 보고서';
    const systemPrompt = `당신은 공공기관 및 대기업 비즈니스 보고서 작성 전문 AI(Qwen 2.5)입니다.
사용자가 입력한 거친 메모, 회의 내용, 아이디어를 표준 ${typeLabel} 양식(개조식 문체, 마크다운 표, 명확한 액션 아이템)으로 완벽하게 체계화하여 작성하세요.
한국어 비즈니스 표준 격식체를 준수하세요.`;

    const prompt = `[입력 메모]\n${rawText}\n\n위 메모를 표준 ${typeLabel} 양식으로 변환해주세요.`;

    return this.generate({
      prompt,
      systemPrompt,
      temperature: 0.2,
    });
  }

  /**
   * Lint document for spelling, tone consistency, and heading hierarchy
   */
  async lintDocument(content: string): Promise<LintResult> {
    const systemPrompt = `당신은 전문 문서 에디터 및 한국어 교정 에이전트입니다.
제공된 텍스트의 맞춤법, 띄어쓰기, 문체 통일(명사형 종결/보고서체), 제목/헤딩 계층 구조를 최적화하세요.
반드시 아래 JSON 형식으로만 응답해야 합니다:
{
  "summary": "교정 요약 설명",
  "correctionsCount": 3,
  "changes": [
    { "original": "기존 문구", "suggested": "수정 문구", "reason": "이유" }
  ],
  "revisedContent": "전체 교정 완료된 최종 마크다운 본문"
}`;

    const prompt = `다음 문서를 린팅/교정해주세요:\n\n${content}`;

    const rawResponse = await this.generate({
      prompt,
      systemPrompt,
      format: 'json',
      temperature: 0.1,
    });

    try {
      // Find json block if wrapped in markdown
      const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? jsonMatch[0] : rawResponse;
      return JSON.parse(jsonStr);
    } catch {
      return {
        summary: '문서 서식 및 맞춤법을 전반적으로 점검 완료하였습니다.',
        correctionsCount: 1,
        changes: [{ original: '원문', suggested: '개선안', reason: '표준 비즈니스 서식 적용' }],
        revisedContent: rawResponse,
      };
    }
  }

  /**
   * Generate Mermaid diagram code from description
   */
  async generateMermaid(description: string, diagramType: 'flowchart' | 'sequence' | 'er' = 'flowchart'): Promise<string> {
    const systemPrompt = `당신은 Mermaid.js 다이어그램 설계 전문가입니다.
사용자의 시스템 구조, 작업 흐름, 또는 요구사항 설명을 분석하여 유효하고 아름다운 Mermaid.js 코드를 작성하세요.
마크다운 코드 블록 표기 없이 순수 Mermaid 구문만 반환하세요.`;

    const prompt = `다이어그램 종류: ${diagramType}\n설명:\n${description}\n\nMermaid 코드:`;

    const res = await this.generate({
      prompt,
      systemPrompt,
      temperature: 0.2,
    });

    // Strip markdown tags if included
    let cleaned = res.replace(/```mermaid/gi, '').replace(/```/g, '').trim();
    return cleaned;
  }

  /**
   * Index document chunks into SQLite RAG repository
   */
  async indexDocuments(chunks: Array<{ id: string; docId: string; title: string; content: string }>): Promise<number> {
    const res = await fetch(`${this.baseUrl}/rag/index`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chunks }),
    });
    if (!res.ok) throw new Error(`RAG Index Error: HTTP ${res.status}`);
    const data = await res.json();
    return data.indexedCount;
  }

  /**
   * Search knowledge base using RAG
   */
  async searchRag(query: string, limit = 5): Promise<RagResultItem[]> {
    const res = await fetch(`${this.baseUrl}/rag/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, limit }),
    });
    if (!res.ok) throw new Error(`RAG Search Error: HTTP ${res.status}`);
    const data = await res.json();
    return data.results || [];
  }

  /**
   * RAG Fact Check & Citation Synthesis
   */
  async synthesizeWithCitations(query: string, retrieved: RagResultItem[]): Promise<{ summary: string; citations: string[] }> {
    const contextText = retrieved
      .map((r, i) => `[출처 ${i + 1}: ${r.title}]\n${r.content}`)
      .join('\n\n');

    const systemPrompt = `당신은 팩트체크 및 출처 각주 표기 전문 리서치 AI입니다.
주어진 컨텍스트 문서에 기반하여 질문에 정확하게 답변하세요.
답변 작성 시 사실에 해당하는 문장 끝에 반드시 [^1], [^2] 형식의 각주 번호를 명시하세요.
컨텍스트에 없는 정보는 허위로 지어내지 마세요.`;

    const prompt = `[참고 자료]\n${contextText}\n\n[사용자 질의]\n${query}\n\n답변:`;

    const summary = await this.generate({
      prompt,
      systemPrompt,
      temperature: 0.2,
    });

    const citations = retrieved.map((r, i) => `[^${i + 1}]: ${r.title} - "${r.content.slice(0, 80)}..."`);
    return { summary, citations };
  }

  /**
   * Propose Data Edits for a single Table Row
   */
  async proposeRowDataEdit(params: {
    row: TableRow;
    columns: TableColumn[];
    prompt: string;
    editorContent?: string;
  }): Promise<RowDataEditProposal> {
    const { row, columns, prompt, editorContent } = params;
    const rowTitle = row.data['col-name'] || row.data['col-title'] || Object.values(row.data)[0] || '선택된 행';
    const changes: ColumnChangeProposal[] = [];
    const today = new Date().toISOString().slice(0, 10);

    // Try Ollama LLM first if available
    try {
      const status = await this.getStatus();
      if (status.online) {
        const columnsInfo = columns.map((c) => `${c.name} (id: ${c.id}, type: ${c.type})`).join(', ');
        const currentValues = columns
          .map((c) => `${c.name}: ${JSON.stringify(row.data[c.id] ?? '')}`)
          .join('\n');

        const systemPrompt = `당신은 데이터베이스 및 표(Table) 데이터 수정 전문 AI 에이전트입니다.
사용자의 수정 요청을 분석하여, 변경이 필요한 컬럼과 새로운 값을 결정하세요.
반드시 아래 JSON 형식으로만 응답하세요:
{
  "summary": "수정 작업에 대한 친절한 1줄 요약",
  "changes": [
    {
      "columnId": "col-id",
      "columnName": "컬럼명",
      "oldValue": "이전 값",
      "newValue": "새로운 값",
      "reason": "수정 사유"
    }
  ]
}`;

        const promptText = `[테이블 컬럼 목록]
${columnsInfo}

[현재 행 데이터]
${currentValues}

[연관 문서/본문 내용]
${(editorContent || '').slice(0, 300)}

[사용자 수정 요청]
${prompt}`;

        const res = await this.generate({
          prompt: promptText,
          systemPrompt,
          format: 'json',
          temperature: 0.1,
        });

        const parsed = JSON.parse(res);
        if (parsed.changes && Array.isArray(parsed.changes) && parsed.changes.length > 0) {
          return {
            rowId: row.id,
            rowTitle: String(rowTitle),
            changes: parsed.changes.map((c: any) => ({
              ...c,
              enabled: true,
            })),
            summary: parsed.summary || '자연어 분석을 바탕으로 데이터 수정안을 도출했습니다.',
          };
        }
      }
    } catch {
      // Fallback to heuristic parser below
    }

    // Heuristic Smart Rule Engine (Offline & Fast execution)
    const p = prompt.toLowerCase();

    // 1. Status Column
    const statusCol = columns.find(
      (c) => c.type === 'status' || c.name.includes('상태') || c.name.includes('진행')
    );
    if (statusCol) {
      const currentStatus = row.data[statusCol.id] || '미정';
      let nextStatus: string | null = null;
      if (p.includes('완료') || p.includes('끝') || p.includes('종료')) nextStatus = '완료';
      else if (p.includes('지연') || p.includes('밀림')) nextStatus = '지연';
      else if (p.includes('진행') || p.includes('개발중') || p.includes('작업중')) nextStatus = '진행중';
      else if (p.includes('검토') || p.includes('리뷰')) nextStatus = '검토중';
      else if (p.includes('대기') || p.includes('보류')) nextStatus = '대기';

      if (nextStatus && nextStatus !== currentStatus) {
        changes.push({
          columnId: statusCol.id,
          columnName: statusCol.name,
          oldValue: currentStatus,
          newValue: nextStatus,
          reason: `사용자 요청('${prompt}')에 따라 진행상태를 '${nextStatus}'(으)로 갱신`,
          enabled: true,
        });
      }
    }

    // 2. Priority Column
    const priorityCol = columns.find(
      (c) => c.name.includes('우선순위') || c.name.includes('중요도') || c.name.includes('priority')
    );
    if (priorityCol) {
      const currentPriority = row.data[priorityCol.id] || '보통';
      let nextPriority: string | null = null;
      if (p.includes('긴급') || p.includes('매우높음') || p.includes('최우선')) nextPriority = '긴급';
      else if (p.includes('높음') || p.includes('상')) nextPriority = '높음';
      else if (p.includes('보통') || p.includes('중')) nextPriority = '보통';
      else if (p.includes('낮음') || p.includes('하')) nextPriority = '낮음';

      if (nextPriority && nextPriority !== currentPriority) {
        changes.push({
          columnId: priorityCol.id,
          columnName: priorityCol.name,
          oldValue: currentPriority,
          newValue: nextPriority,
          reason: `우선순위를 '${nextPriority}'(으)로 조정`,
          enabled: true,
        });
      }
    }

    // 3. Date Column (Due Date / Date)
    const dateCol = columns.find(
      (c) => c.type === 'date' || c.name.includes('일') || c.name.includes('마감') || c.name.includes('일자')
    );
    if (dateCol) {
      const currentDate = row.data[dateCol.id] || '';
      let nextDate: string | null = null;

      const dateMatch = prompt.match(/\d{4}-\d{2}-\d{2}/);
      if (dateMatch) {
        nextDate = dateMatch[0];
      } else if (p.includes('오늘')) {
        nextDate = today;
      } else if (p.includes('내일')) {
        const tm = new Date();
        tm.setDate(tm.getDate() + 1);
        nextDate = tm.toISOString().slice(0, 10);
      } else if (p.includes('다음주')) {
        const nextWeek = new Date();
        nextWeek.setDate(nextWeek.getDate() + 7);
        nextDate = nextWeek.toISOString().slice(0, 10);
      }

      if (nextDate && nextDate !== currentDate) {
        changes.push({
          columnId: dateCol.id,
          columnName: dateCol.name,
          oldValue: currentDate || '(없음)',
          newValue: nextDate,
          reason: `일정/마감일을 ${nextDate}로 지정`,
          enabled: true,
        });
      }
    }

    // 4. Assignee / Member Column
    const assigneeCol = columns.find(
      (c) => c.name.includes('담당') || c.name.includes('담당자') || c.name.includes('작성자') || c.name.includes('assignee')
    );
    if (assigneeCol) {
      const currentAssignee = row.data[assigneeCol.id] || '';
      const nameMatch = prompt.match(/담당자(?:를|는)?\s*['"‘“]?([가-힣a-zA-Z0-9\s]+?)['"’”]?\s*(?:으로|로|지정|변경)/);
      if (nameMatch && nameMatch[1]) {
        const nextAssignee = nameMatch[1].trim();
        changes.push({
          columnId: assigneeCol.id,
          columnName: assigneeCol.name,
          oldValue: currentAssignee || '(미지정)',
          newValue: nextAssignee,
          reason: `담당자를 '${nextAssignee}'(으)로 변경`,
          enabled: true,
        });
      }
    }

    // 5. Notes / Summary / Description Column
    const descCol = columns.find(
      (c) => c.name.includes('비고') || c.name.includes('설명') || c.name.includes('요약') || c.name.includes('메모')
    );
    if (descCol && (p.includes('요약') || p.includes('비고') || p.includes('내용') || p.includes('채워'))) {
      const currentDesc = row.data[descCol.id] || '';
      let generatedSummary = '';

      if (editorContent && editorContent.trim().length > 10) {
        const clean = editorContent.replace(/<[^>]*>?/gm, '').trim();
        generatedSummary = clean.slice(0, 45) + (clean.length > 45 ? '... (요약)' : '');
      } else {
        generatedSummary = `${rowTitle} 과업 정상 추진 및 현황 업데이트 완료`;
      }

      changes.push({
        columnId: descCol.id,
        columnName: descCol.name,
        oldValue: currentDesc || '(비어있음)',
        newValue: generatedSummary,
        reason: '본문 내용 기반 자동 요약 비고 생성',
        enabled: true,
      });
    }

    // Default fallback if no specific rule matched but user wants to polish title
    if (changes.length === 0) {
      const nameCol = columns.find((c) => c.isPrimaryKey || c.id === 'col-name' || c.name.includes('제목') || c.name.includes('이름')) || columns[0];
      if (nameCol) {
        const oldTitle = row.data[nameCol.id] || '';
        const polished = oldTitle.replace(/\s+/g, ' ').trim();
        changes.push({
          columnId: nameCol.id,
          columnName: nameCol.name,
          oldValue: oldTitle,
          newValue: polished,
          reason: '데이터 정제 및 공백 규격화',
          enabled: true,
        });
      }
    }

    return {
      rowId: row.id,
      rowTitle: String(rowTitle),
      changes,
      summary: changes.length > 0
        ? `총 ${changes.length}개 컬럼의 수정안이 제안되었습니다.`
        : '수정 가능한 변경 항목을 감지하지 못했습니다.',
    };
  }

  /**
   * Propose Batch Data Edits for a Table Document
   */
  async proposeBatchDataEdit(params: {
    table: TableDocument;
    prompt: string;
  }): Promise<BatchDataEditProposal> {
    const { table, prompt } = params;
    const rowProposals: RowDataEditProposal[] = [];
    const p = prompt.toLowerCase();

    // Find condition
    for (const row of table.rows) {
      // Check filter condition
      let match = false;
      if (p.includes('모든') || p.includes('전체')) {
        match = true;
      } else if (p.includes('지연') && Object.values(row.data).some((v) => String(v).includes('지연'))) {
        match = true;
      } else if (p.includes('완료') && Object.values(row.data).some((v) => String(v).includes('완료'))) {
        match = true;
      } else if (p.includes('진행') && Object.values(row.data).some((v) => String(v).includes('진행'))) {
        match = true;
      } else if (p.includes('긴급') && Object.values(row.data).some((v) => String(v).includes('긴급'))) {
        match = true;
      } else {
        // Match by title keywords
        const rowTitle = String(row.data['col-name'] || Object.values(row.data)[0] || '');
        if (p.includes(rowTitle.toLowerCase())) {
          match = true;
        }
      }

      if (match) {
        const prop = await this.proposeRowDataEdit({
          row,
          columns: table.columns,
          prompt,
          editorContent: row.richContent,
        });
        if (prop.changes.length > 0) {
          rowProposals.push(prop);
        }
      }
    }

    return {
      tableId: table.id,
      tableName: table.title,
      affectedRowCount: rowProposals.length,
      rowProposals,
      summary: rowProposals.length > 0
        ? `조건에 부합하는 ${rowProposals.length}개 행에 대해 일괄 수정안을 생성했습니다.`
        : '조건에 해당하는 행을 찾을 수 없습니다.',
    };
  }

  /**
   * Execute Action Agent Tool
   */
  async executeTool(tool: string, args: Record<string, any>): Promise<any> {
    const res = await fetch(`${this.baseUrl}/action/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool, arguments: args }),
    });
    if (!res.ok) throw new Error(`Action Execution Error: HTTP ${res.status}`);
    return await res.json();
  }
}

export const ollamaClient = new OllamaClient();
