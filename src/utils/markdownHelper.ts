import { marked } from 'marked';
import { TableColumn, TableRow } from '../types';
import { detectLanguage } from './codeHighlighter';

/**
 * Converts Markdown string into semantic HTML that TipTap seamlessly consumes,
 * including headings, code blocks, tables, task lists, blockquotes, and text formatting.
 */
export function markdownToHtml(markdown: string): string {
  if (!markdown || typeof markdown !== 'string') return '';
  const trimmed = markdown.trim();
  if (!trimmed) return '';

  let cleanMd = trimmed;
  // If input contains HTML tags wrapping markdown code fences or syntax, normalize linebreaks and entities
  if (cleanMd.includes('```') || /^<[a-z1-6]+/i.test(cleanMd)) {
    const hasRealComplexHtml = /<(?:table|img|sticker-node|pre)\b/i.test(cleanMd);
    if (!hasRealComplexHtml) {
      cleanMd = cleanMd
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>\s*<p[^>]*>/gi, '\n\n')
        .replace(/<\/?(?:p|div|span)[^>]*>/gi, '\n')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'")
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .trim();
    }
  }

  // Auto-detect language for code blocks missing an explicit language tag (``` ... ```)
  // Ensures major languages like c, sql, java, python, bash get syntax highlighting templates applied
  cleanMd = cleanMd.replace(/```([a-zA-Z0-9_-]*)\s*\n([\s\S]*?)```/g, (match, explicitLang, code) => {
    const trimmedLang = (explicitLang || '').trim().toLowerCase();
    if (trimmedLang && trimmedLang !== 'auto' && trimmedLang !== 'plaintext') {
      return match;
    }
    const detected = detectLanguage(code);
    const lang = detected.isCode ? detected.language : (trimmedLang || 'plaintext');
    return `\`\`\`${lang}\n${code}\`\`\``;
  });

  // Auto-close any unclosed markdown code fence (e.g. user pasted partial/unclosed ```)
  const fenceMatches = cleanMd.match(/```/g);
  if (fenceMatches && fenceMatches.length % 2 !== 0) {
    cleanMd += '\n```\n';
  }

  // Configure marked for GitHub Flavored Markdown with breaks enabled
  const rawHtml = marked.parse(cleanMd, {
    gfm: true,
    breaks: true,
    async: false,
  }) as string;

  // Post-process HTML for TipTap & Viewer specific node schemas:
  let processedHtml = rawHtml;

  // 1. Task Lists: TipTap expects <ul data-type="taskList"><li data-type="taskItem" data-checked="true/false">...
  if (processedHtml.includes('type="checkbox"')) {
    processedHtml = processedHtml.replace(/<ul>(\s*<li[^>]*><input[^>]*type="checkbox"[^>]*>[\s\S]*?<\/ul>)/g, (match) => {
      return match
        .replace(/^<ul>/, '<ul data-type="taskList" class="wonbee-task-list">')
        .replace(/<li[^>]*><input([^>]*)type="checkbox"([^>]*)>([\s\S]*?)<\/li>/g, (_, p1, p2, text) => {
          const isChecked = (p1 + p2).includes('checked');
          const cleanContent = text.trim();
          return `<li data-type="taskItem" data-checked="${isChecked}" class="task-item flex items-start gap-2 my-1"><label class="flex items-center mt-0.5"><input type="checkbox" ${isChecked ? 'checked="checked"' : ''} class="rounded text-amber-600 focus:ring-amber-500" /></label><div class="task-content"><p class="m-0">${cleanContent}</p></div></li>`;
        });
    });
  }

  // 2. Add wonbee-rich-table styling class and default all borders
  if (processedHtml.includes('<table>')) {
    processedHtml = processedHtml.replace(
      /<table>/g,
      '<table class="wonbee-rich-table wonbee-table-border-all" data-border-style="all">'
    );
  }

  // 3. Normalize language class names for HTML / XML to language-html
  processedHtml = processedHtml.replace(/class="language-(?:markup|xml)"/g, 'class="language-html"');

  return processedHtml;
}

/**
 * Converts rich TipTap HTML back to clean, portable Markdown
 */
export function htmlToMarkdown(html: string): string {
  if (!html || typeof html !== 'string') return '';

  // Use DOMParser in browser environment
  if (typeof window === 'undefined') return html;

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  const traverse = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent || '';
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return '';

    const el = node as HTMLElement;
    const tagName = el.tagName.toLowerCase();

    // Headings
    if (tagName === 'h1') return `\n# ${getText(el)}\n\n`;
    if (tagName === 'h2') return `\n## ${getText(el)}\n\n`;
    if (tagName === 'h3') return `\n### ${getText(el)}\n\n`;
    if (tagName === 'h4') return `\n#### ${getText(el)}\n\n`;

    // Paragraph
    if (tagName === 'p') {
      const inner = getChildrenMarkdown(el);
      return inner.trim() ? `\n${inner.trim()}\n\n` : '\n';
    }

    // Code Block
    if (tagName === 'pre') {
      const codeEl = el.querySelector('code');
      const langClass = (codeEl?.className || el.className || '').match(/language-([a-zA-Z0-9_-]+)/);
      let lang = langClass ? langClass[1] : '';
      const codeContent = codeEl ? codeEl.textContent : el.textContent;
      // If language attribute is missing, auto-detect language so output Markdown preserves syntax blocks
      if (!lang || lang === 'auto' || lang === 'plaintext') {
        const detected = detectLanguage(codeContent || '');
        if (detected.isCode) {
          lang = detected.language;
        } else {
          lang = '';
        }
      }
      return `\n\`\`\`${lang}\n${codeContent || ''}\n\`\`\`\n\n`;
    }

    // Inline Code
    if (tagName === 'code') {
      return `\`${el.textContent || ''}\``;
    }

    // Task List
    if (el.getAttribute('data-type') === 'taskList' || tagName === 'ul' && el.querySelector('[data-type="taskItem"]')) {
      let md = '\n';
      el.querySelectorAll(':scope > li').forEach((li) => {
        const isChecked = li.getAttribute('data-checked') === 'true' || !!li.querySelector('input[checked]');
        const textContainer = li.querySelector('div') || li;
        const text = textContainer.textContent?.trim() || '';
        md += `- [${isChecked ? 'x' : ' '}] ${text}\n`;
      });
      return `${md}\n`;
    }

    // Bullet List
    if (tagName === 'ul') {
      let md = '\n';
      el.querySelectorAll(':scope > li').forEach((li) => {
        md += `* ${getChildrenMarkdown(li as HTMLElement).trim()}\n`;
      });
      return `${md}\n`;
    }

    // Ordered List
    if (tagName === 'ol') {
      let md = '\n';
      let idx = 1;
      el.querySelectorAll(':scope > li').forEach((li) => {
        md += `${idx++}. ${getChildrenMarkdown(li as HTMLElement).trim()}\n`;
      });
      return `${md}\n`;
    }

    // Blockquote
    if (tagName === 'blockquote') {
      const lines = getChildrenMarkdown(el).trim().split('\n');
      return `\n${lines.map((l) => `> ${l}`).join('\n')}\n\n`;
    }

    // Table
    if (tagName === 'table') {
      const rows = Array.from(el.querySelectorAll('tr'));
      if (rows.length === 0) return '';

      let md = '\n';
      const headerRow = rows[0];
      const headerCells = Array.from(headerRow.querySelectorAll('th, td'));
      const colCount = headerCells.length;

      md += `| ${headerCells.map((c) => c.textContent?.trim() || ' ').join(' | ')} |\n`;
      md += `| ${headerCells.map(() => '---').join(' | ')} |\n`;

      for (let i = 1; i < rows.length; i++) {
        const cells = Array.from(rows[i].querySelectorAll('td, th'));
        const rowVals = cells.map((c) => c.textContent?.trim().replace(/\|/g, '\\|') || ' ');
        while (rowVals.length < colCount) rowVals.push(' ');
        md += `| ${rowVals.slice(0, colCount).join(' | ')} |\n`;
      }
      return `${md}\n`;
    }

    // Bold / Italic / Strikethrough
    if (tagName === 'strong' || tagName === 'b') return `**${getChildrenMarkdown(el)}**`;
    if (tagName === 'em' || tagName === 'i') return `*${getChildrenMarkdown(el)}*`;
    if (tagName === 's' || tagName === 'del' || tagName === 'strike') return `~~${getChildrenMarkdown(el)}~~`;
    if (tagName === 'u') return `<u>${getChildrenMarkdown(el)}</u>`;

    // Horizontal Rule
    if (tagName === 'hr') return '\n---\n\n';

    // Line Break
    if (tagName === 'br') return '\n';

    // Images
    if (tagName === 'img') {
      const src = el.getAttribute('src') || '';
      const alt = el.getAttribute('alt') || 'image';
      return `![${alt}](${src})`;
    }

    // Fallback for generic div/span
    return getChildrenMarkdown(el);
  };

  const getText = (el: HTMLElement) => el.textContent?.trim() || '';
  const getChildrenMarkdown = (el: HTMLElement) => {
    let res = '';
    el.childNodes.forEach((child) => {
      res += traverse(child);
    });
    return res;
  };

  const result = traverse(doc.body).trim();
  return result;
}

/**
 * Checks if a string contains Markdown syntax
 */
export function isLikelyMarkdown(text: string): boolean {
  if (!text || typeof text !== 'string') return false;
  const trimmed = text.trim();
  if (trimmed.length < 2) return false;

  // Fast-sampling for large texts (first 16KB) to prevent catastrophic regex backtracking
  const sample = trimmed.length > 16000 ? trimmed.slice(0, 16000) : trimmed;

  // PRIORITY 1: Markdown Code Fences (```lang ... ``` or unclosed ```)
  // Matches any markdown code block regardless of indentation or wrapping
  if (/```[\s\S]+?```/.test(sample) || /```[a-zA-Z0-9_-]*\s*\n/.test(sample)) {
    return true;
  }

  // If it's already an explicit complex HTML structure without unrendered code fences, don't re-parse
  if (/^<(?:table|thead|tbody|tr|td|th|sticker-node|svg|img)\b/i.test(trimmed)) {
    return false;
  }

  // If it's a TipTap pre/code block that is already formatted HTML, keep as HTML
  if (/^\s*(?:<p>\s*)?<pre(?:\s+[^>]*)?>\s*<code/i.test(trimmed)) {
    return false;
  }

  // 1. Headings (# Title, ## Title)
  if (/^#{1,6}\s+\S/m.test(sample)) return true;

  // 2. Markdown Tables (| Col1 | Col2 | and |---|---|)
  if (/\|[^\n]+\|\s*\n\s*\|[\s-:|]+\|/m.test(sample)) return true;

  // 3. Task Lists (- [ ] or - [x])
  if (/^[-*+]\s+\[[ xX]\]\s+\S/m.test(sample)) return true;

  // 4. Blockquotes (> quote)
  if (/^>\s+\S/m.test(sample)) return true;

  // 5. List items with * or - or + or numbered lists (1. Item)
  if (/^(\s*[-*+]\s+\S+|\s*\d+\.\s+\S+)/m.test(sample)) return true;

  // 6. Bold / Italic / Strikethrough formatting
  if (/\*\*[^*\n]+\*\*|__[^_\n]+__|~~[^~\n]+~~|\*[^*\n\s]+\*|_[^_\n\s]+_/.test(sample)) return true;

  // 7. Markdown Links [text](url) or Images ![alt](url)
  if (/!?\[[^\]\n]+\]\((?:https?:\/\/[^\s\)]+|[^\s\)]+)\)/.test(sample)) return true;

  // 8. Horizontal Rule (---, ***, ___)
  if (/^(?:-{3,}|\*{3,}|_{3,})\s*$/m.test(sample)) return true;

  // 9. Inline code snippets (`code`)
  if (/`[^`\n]+`/.test(sample)) return true;

  return false;
}

/**
 * Strips common markdown syntax markers to produce clean, legible plain-text for table cells
 */
export function cleanMarkdownForPreview(markdown: string): string {
  if (!markdown || typeof markdown !== 'string') return '';
  return markdown
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(?:p|div|span)[^>]*>/gi, '\n')
    .replace(/```[a-zA-Z0-9_-]*\s*([\s\S]*?)```/g, '$1') // unwrap code block fences
    .replace(/^#{1,6}\s+/gm, '') // headings
    .replace(/!\[([^\]]*)\]\([^\)]*\)/g, '$1') // images
    .replace(/\[([^\]]+)\]\([^\)]*\)/g, '$1') // links
    .replace(/(\*\*|__)(.*?)\1/g, '$2') // bold
    .replace(/(\*|_)(.*?)\1/g, '$2') // italic
    .replace(/~~(.*?)~~/g, '$1') // strikethrough
    .replace(/`([^`]+)`/g, '$1') // inline code
    .replace(/^\s*[-*+]\s+\[[ xX]\]\s*/gm, '☐ ') // task lists
    .replace(/^\s*[-*+]\s+/gm, '• ') // unordered lists
    .replace(/^\s*\d+\.\s+/gm, (m) => m.trim() + ' ') // ordered lists
    .replace(/^\s*>\s+/gm, '') // blockquotes
    .replace(/\|/g, ' ') // table pipes
    .replace(/---+/g, '') // horizontal rules
    .replace(/<[^>]+>/g, '') // strip all remaining HTML tags
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();
}

/**
 * Parses a Markdown Table into TableColumn and TableRow objects
 */
export function parseMarkdownTable(markdown: string): { columns: TableColumn[]; rows: TableRow[] } | null {
  if (!markdown) return null;
  const lines = markdown.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('|') && l.endsWith('|'));
  if (lines.length < 2) return null;

  // Find header line and separator line (|---|---|)
  let headerIndex = -1;
  let separatorIndex = -1;

  for (let i = 0; i < lines.length - 1; i++) {
    if (/^\|[\s-:|]+\|$/.test(lines[i + 1])) {
      headerIndex = i;
      separatorIndex = i + 1;
      break;
    }
  }

  if (headerIndex === -1) return null;

  const parseCells = (line: string) => {
    return line
      .slice(1, -1)
      .split('|')
      .map((c) => c.trim());
  };

  const headerCells = parseCells(lines[headerIndex]);
  if (headerCells.length === 0) return null;

  const columns: TableColumn[] = headerCells.map((name, idx) => ({
    id: `col_${idx + 1}_${Date.now() % 10000}`,
    name: name || `열 ${idx + 1}`,
    type: 'text',
    width: 160,
    isPrimaryKey: idx === 0,
  }));

  const rows: TableRow[] = [];
  const now = Date.now();
  for (let i = separatorIndex + 1; i < lines.length; i++) {
    const cells = parseCells(lines[i]);
    if (cells.length === 0) continue;
    const rowData: Record<string, any> = {};
    columns.forEach((col, cIdx) => {
      rowData[col.id] = cells[cIdx] || '';
    });
    rows.push({
      id: `row_${i}_${(now + i) % 100000}`,
      data: rowData,
      createdAt: now,
      updatedAt: now,
    });
  }

  return { columns, rows };
}

export interface MarkdownCellPreviewInfo {
  hasCodeBlock: boolean;
  introText: string;
  codeSnippet: string;
  codeLanguage: string;
}

/**
 * Extracts preview information from Markdown content for table cell inline display.
 * Separates intro text from the first code block, enabling the cell to render
 * both the descriptive text and syntax-highlighted code inline.
 */
export function extractMarkdownCellPreview(text: string): MarkdownCellPreviewInfo | null {
  if (!text || typeof text !== 'string') return null;

  let cleanText = text;

  // Case 1: Markdown code fence ```lang ... ```
  if (cleanText.includes('```')) {
    if (/<[a-z1-6]+/i.test(cleanText)) {
      cleanText = cleanText
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>\s*<p[^>]*>/gi, '\n\n')
        .replace(/<\/?(?:p|div|span)[^>]*>/gi, '\n')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'")
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&');
    }

    const fenceMatch = cleanText.match(/```([a-zA-Z0-9_-]+)?\s*([\s\S]*?)```/);
    if (fenceMatch) {
      const introRaw = cleanText.slice(0, fenceMatch.index).trim();
      const introText = cleanMarkdownForPreview(introRaw);
      const codeContent = fenceMatch[2].trim();

      // Grab the first 1-2 non-empty lines for compact cell display
      const lines = codeContent.split('\n').map((l) => l.trimEnd()).filter((l) => l.trim().length > 0);
      const codeSnippet = lines.slice(0, 2).join('\n');
      const explicitLang = (fenceMatch[1] || '').trim().toLowerCase();
      const codeLanguage = explicitLang === 'auto' || !explicitLang
        ? (detectLanguage(codeSnippet).language || 'plaintext')
        : (explicitLang === 'markup' || explicitLang === 'xml' ? 'html' : explicitLang);

      return {
        hasCodeBlock: true,
        introText,
        codeSnippet,
        codeLanguage,
      };
    }
  }

  // Case 2: TipTap / HTML <pre><code ...>...</code></pre> block
  if (cleanText.includes('<pre') && cleanText.includes('<code')) {
    const preMatch = cleanText.match(/<pre(?:\s+[^>]*)?>\s*<code(?:\s+class="([^"]*)")?(?:\s+[^>]*)?>([\s\S]*?)<\/code>\s*<\/pre>/i);
    if (preMatch) {
      const introRaw = cleanText.slice(0, preMatch.index).trim();
      const introText = cleanMarkdownForPreview(introRaw);
      const classAttr = preMatch[1] || '';
      const langMatch = classAttr.match(/language-([a-zA-Z0-9_-]+)/);
      const rawCode = preMatch[2]
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'")
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .trim();

      const lines = rawCode.split('\n').map((l) => l.trimEnd()).filter((l) => l.trim().length > 0);
      const codeSnippet = lines.slice(0, 2).join('\n');
      const rawL = (langMatch ? langMatch[1] : '').toLowerCase();
      let codeLanguage = rawL;
      if (!codeLanguage || codeLanguage === 'plaintext' || codeLanguage === 'auto') {
        const detected = detectLanguage(codeSnippet);
        codeLanguage = detected.isCode ? detected.language : 'plaintext';
      }
      if (codeLanguage === 'markup' || codeLanguage === 'xml') {
        codeLanguage = 'html';
      }

      return {
        hasCodeBlock: true,
        introText,
        codeSnippet,
        codeLanguage,
      };
    }
  }

  return null;
}

export interface MarkdownLanguageTemplate {
  id: string;
  name: string;
  language: string;
  category: string;
  badge: string;
  description: string;
  filename: string;
  markdown: string;
}

export const MARKDOWN_LANGUAGE_TEMPLATES: MarkdownLanguageTemplate[] = [
  {
    id: 'c-proc',
    name: 'C / Pro*C 전문 처리 모듈 명세서',
    language: 'c',
    category: '시스템 / 금융',
    badge: 'C / Pro*C',
    description: '패킷 전문 수신/송신, memcpy, memcmp 및 로그 기록 로직 템플릿',
    filename: 'c_module_spec.md',
    markdown: `# C / Pro*C 전문 처리 모듈 명세서

## 1. 개요 및 처리 로직
- 금융 결제원 전문 송수신 처리 모듈 (\`bnkcliR.pc\`)
- 전문 식별자(\`szFileID\`)에 따른 분기 및 메모리 버퍼 복사

## 2. 소스 코드 구현
\`\`\`c
#include <stdio.h>
#include <string.h>

int processTransaction(const char* szFileID, char* szXCH_DIS, char* szPRC_PRG_DIS) {
    /* 자기앞 미지급 전문 처리 (TC33) */
    if (!memcmp(szFileID, "TC33", 4)) {
        writeLog("[INFO] 미지급 전문 수신: FileID=[%s]", szFileID);
        memcpy(szXCH_DIS, "21", 2);      /* 21: 미지급 수신 처리 */
    } else {
        writeLog("[INFO] 일반 거래 전문 수신: FileID=[%s]", szFileID);
        memcpy(szXCH_DIS, "22", 2);      /* 22: 일반 수신 처리 */
    }

    memcpy(szPRC_PRG_DIS, "31", 2);      /* 31: 결제원 수신 완료 */
    return 0;
}
\`\`\`

## 3. 검증 및 점검 사항
- [x] TC33 자기앞 미지급 패킷 수신 테스트 완료
- [x] 버퍼 오버플로우 방지 및 \`sizeof() - 1\` 검증 완료`,
  },
  {
    id: 'sql-db',
    name: 'SQL 데이터베이스 & 쿼리 명세서',
    language: 'sql',
    category: '데이터베이스',
    badge: 'SQL / DDL',
    description: '테이블 정의(DDL), 인덱스 구성 및 대용량 조회 최적화 쿼리 템플릿',
    filename: 'database_schema.md',
    markdown: `# 데이터베이스 테이블 및 쿼리 명세서

## 1. 테이블 정의 (DDL)
\`\`\`sql
CREATE TABLE TB_TRANSACTION_LOG (
    TX_ID         VARCHAR2(32)   NOT NULL,
    USER_ID       VARCHAR2(20)   NOT NULL,
    FILE_ID       CHAR(4)        NOT NULL,
    TRANS_AMOUNT  NUMBER(15, 2)  DEFAULT 0,
    STATUS_CODE   CHAR(2)        NOT NULL,
    CREATED_AT    TIMESTAMP      DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT PK_TB_TRANSACTION_LOG PRIMARY KEY (TX_ID)
);

CREATE INDEX IDX_TRANS_USER_DATE ON TB_TRANSACTION_LOG (USER_ID, CREATED_AT DESC);
\`\`\`

## 2. 주요 조회 및 통계 쿼리
\`\`\`sql
SELECT 
    FILE_ID,
    COUNT(*) AS TOTAL_COUNT,
    NVL(SUM(TRANS_AMOUNT), 0) AS TOTAL_AMOUNT,
    MAX(CREATED_AT) AS LAST_TRANS_TIME
FROM TB_TRANSACTION_LOG
WHERE STATUS_CODE = '01'
  AND CREATED_AT >= TRUNC(SYSDATE)
GROUP BY FILE_ID
ORDER BY TOTAL_AMOUNT DESC;
\`\`\`

## 3. 튜닝 및 인덱스 가이드
- 복합 인덱스(\`USER_ID\`, \`CREATED_AT\`)를 활용한 인덱스 레인지 스캔 유도`,
  },
  {
    id: 'java-spring',
    name: 'Java / Spring 서비스 명세서',
    language: 'java',
    category: '백엔드 서비스',
    badge: 'Java / Spring',
    description: 'Spring Service 인터페이스, 트랜잭션 및 비즈니스 예외 처리 템플릿',
    filename: 'java_service_spec.md',
    markdown: `# Java Spring 서비스 구현 명세서

## 1. 핵심 비즈니스 로직
\`\`\`java
package com.example.service;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Slf4j
@Service
@RequiredArgsConstructor
public class TransactionService {

    private final TransactionRepository transactionRepository;

    @Transactional(rollbackFor = Exception.class)
    public TransactionResponse processPacket(TransactionRequest request) {
        log.info("전문 처리 시작: fileId={}, userId={}", request.getFileId(), request.getUserId());
        
        if ("TC33".equals(request.getFileId())) {
            request.updateStatus("21"); // 미지급 수신 처리
        } else {
            request.updateStatus("22"); // 일반 수신 처리
        }

        Transaction entity = transactionRepository.save(request.toEntity());
        return TransactionResponse.of(entity);
    }
}
\`\`\`

## 2. 단위 테스트 가이드
- Mockito를 활용한 \`processPacket\` 상태 분기 단위 테스트 수행`,
  },
  {
    id: 'python-script',
    name: 'Python 데이터 처리 & 스크립트',
    language: 'python',
    category: '데이터 / 자동화',
    badge: 'Python',
    description: '데이터 정제, 판다스 집계 파이프라인 및 배치 스크립트 템플릿',
    filename: 'python_pipeline.md',
    markdown: `# Python 데이터 분석 및 배치 처리 명세서

## 1. 데이터 파이프라인 함수
\`\`\`python
import os
import pandas as pd
from typing import Dict, Any

def process_log_data(file_path: str) -> pd.DataFrame:
    """전문 로그 데이터를 파싱하고 요약 집계합니다."""
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"파일을 찾을 수 없습니다: {file_path}")

    df = pd.read_csv(file_path, encoding="utf-8")
    
    # 상태 코드 정규화 및 집계
    df["is_cleared"] = df["status_code"].isin(["21", "22"])
    summary = df.groupby("file_id").agg({
        "amount": ["count", "sum", "mean"],
        "is_cleared": "sum"
    }).reset_index()

    return summary

if __name__ == "__main__":
    result = process_log_data("./data/transaction_log.csv")
    print(result.head())
\`\`\`

## 2. 의존성 패키지
- \`pandas>=2.0.0\``,
  },
  {
    id: 'bash-shell',
    name: 'Bash / Shell 배포 & 기동 스크립트',
    language: 'bash',
    category: 'DevOps / 인프라',
    badge: 'Bash / Shell',
    description: '서버 환경변수 설정, 데몬 기동 및 프로세스 헬스체크 템플릿',
    filename: 'deploy_script.md',
    markdown: `# 서버 기동 및 배포 스크립트 명세서

## 1. 기동 쉘 스크립트 (\`run.sh\`)
\`\`\`bash
#!/usr/bin/env bash
set -euo pipefail

APP_NAME="bank-client-daemon"
CONF_DIR="/etc/bank/conf"
LOG_DIR="/var/log/bank"

echo "==> [\$(date '+%Y-%m-%d %H:%M:%S')] \${APP_NAME} 기동 준비..."

mkdir -p "\${LOG_DIR}"
export LOG_LEVEL="INFO"
export PROCESS_COUNT=4

# 실행 중인 기존 프로세스 확인 및 안전 종료
if pgrep -f "\${APP_NAME}" > /dev/null; then
    echo "기존 실행 프로세스 종료 중..."
    pkill -15 -f "\${APP_NAME}" || true
    sleep 2
fi

nohup ./bin/\${APP_NAME} --config "\${CONF_DIR}/daemon.conf" >> "\${LOG_DIR}/app.log" 2>&1 &
echo "==> \${APP_NAME} 백그라운드 기동 완료 (PID: \$!)"
\`\`\`

## 2. 크론탭(Crontab) 등록
- \`0 2 * * * /app/bin/run.sh\` (매일 새벽 2시 안전 재기동)`,
  },
  {
    id: 'typescript-api',
    name: 'TypeScript / API 규격 명세서',
    language: 'typescript',
    category: '웹 / API',
    badge: 'TypeScript',
    description: 'RESTful API 인터페이스, DTO 타입 정의 및 JSON 응답 구조 템플릿',
    filename: 'api_specification.md',
    markdown: `# RESTful API 인터페이스 규격서

## 1. 타입 및 인터페이스 정의
\`\`\`typescript
export interface TransactionPayload {
  transactionId: string;
  fileId: 'TC11' | 'TC33' | 'TC44';
  amount: number;
  timestamp: string;
}

export interface ApiResponse<T> {
  success: boolean;
  code: string;
  message: string;
  data: T;
}

export async function submitTransaction(payload: TransactionPayload): Promise<ApiResponse<string>> {
  const res = await fetch('/api/v1/transactions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.json();
}
\`\`\`

## 2. JSON 페이로드 예시
\`\`\`json
{
  "success": true,
  "code": "OK_200",
  "message": "전문 처리가 정상 완료되었습니다.",
  "data": "TX-20260914-001"
}
\`\`\``,
  },
];
