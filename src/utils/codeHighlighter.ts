import Prism from 'prismjs';

// Load language definitions for syntax highlighting
import 'prismjs/components/prism-sql';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-java';
import 'prismjs/components/prism-markup'; // HTML / XML
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-yaml';

export type SupportedLanguage =
  | 'sql'
  | 'javascript'
  | 'typescript'
  | 'json'
  | 'python'
  | 'bash'
  | 'java'
  | 'markup'
  | 'css'
  | 'yaml'
  | 'plaintext';

/**
 * Detects if a given text is likely SQL or a programming language
 */
export function detectLanguage(text: string): { isCode: boolean; language: SupportedLanguage; reason?: string } {
  if (!text || typeof text !== 'string') {
    return { isCode: false, language: 'plaintext' };
  }

  const trimmed = text.trim();
  if (trimmed.length < 5) {
    return { isCode: false, language: 'plaintext' };
  }

  // 1. Explicit Markdown Code Fence ```lang ... ```
  const fenceMatch = trimmed.match(/^```([a-zA-Z0-9_-]+)?\s*([\s\S]*?)```$/);
  if (fenceMatch) {
    const lang = (fenceMatch[1] || '').toLowerCase();
    if (lang === 'sql') return { isCode: true, language: 'sql', reason: 'Markdown Code Block' };
    if (['js', 'javascript'].includes(lang)) return { isCode: true, language: 'javascript' };
    if (['ts', 'typescript'].includes(lang)) return { isCode: true, language: 'typescript' };
    if (['json'].includes(lang)) return { isCode: true, language: 'json' };
    if (['py', 'python'].includes(lang)) return { isCode: true, language: 'python' };
    if (['sh', 'bash', 'shell'].includes(lang)) return { isCode: true, language: 'bash' };
    if (['java'].includes(lang)) return { isCode: true, language: 'java' };
    if (['xml', 'html'].includes(lang)) return { isCode: true, language: 'markup' };
    return { isCode: true, language: 'sql' }; // default fallback
  }

  // 2. SQL Heuristic Detection
  const sqlPatterns = [
    /\b(SELECT\s+[\s\S]+?\s+FROM\b)/i,
    /\b(INSERT\s+INTO\s+[\s\S]+?\s+VALUES\b)/i,
    /\b(UPDATE\s+[\s\S]+?\s+SET\b)/i,
    /\b(DELETE\s+FROM\b)/i,
    /\b(CREATE\s+TABLE|ALTER\s+TABLE|DROP\s+TABLE)\b/i,
    /\b(CREATE\s+VIEW|CREATE\s+INDEX|CREATE\s+PROCEDURE)\b/i,
    /\b(LEFT\s+JOIN|INNER\s+JOIN|RIGHT\s+JOIN|FULL\s+OUTER\s+JOIN|CROSS\s+JOIN)\b/i,
    /\b(GROUP\s+BY|ORDER\s+BY|HAVING\b)/i,
    /\b(UNION\s+ALL|UNION\s+SELECT)\b/i,
    /\b(DECLARE\s+@|BEGIN\s+TRAN|COMMIT\s+TRAN)\b/i,
    /\b(WHERE\s+[\w.]+\s*(=|!=|<>|LIKE|IN|IS\s+NULL|BETWEEN)\b)/i,
  ];

  let sqlScore = 0;
  for (const pattern of sqlPatterns) {
    if (pattern.test(trimmed)) sqlScore += 2;
  }

  if (sqlScore >= 2) {
    return { isCode: true, language: 'sql', reason: 'SQL 쿼리 감지' };
  }

  // 3. JSON Heuristic Detection
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      JSON.parse(trimmed);
      return { isCode: true, language: 'json', reason: 'JSON 데이터' };
    } catch {
      // Not strict JSON, continue checking
    }
  }

  // 4. XML / HTML Heuristic Detection
  if (trimmed.startsWith('<?xml') || (trimmed.startsWith('<') && trimmed.endsWith('>') && /<\/[a-z0-9_-]+>/i.test(trimmed))) {
    return { isCode: true, language: 'markup', reason: 'XML/HTML' };
  }

  // 5. Python Heuristic Detection
  if (/\b(def\s+\w+\(|import\s+\w+|from\s+\w+\s+import|class\s+\w+:|elif\s+:|if\s+__name__\s*==)\b/.test(trimmed)) {
    return { isCode: true, language: 'python', reason: 'Python 코드' };
  }

  // 6. JavaScript / TypeScript Heuristic Detection
  if (/\b(const\s+\w+\s*=|let\s+\w+\s*=|function\s*\w*\(|=>\s*\{|console\.log\(|interface\s+\w+|type\s+\w+\s*=)\b/.test(trimmed)) {
    return { isCode: true, language: 'javascript', reason: 'JS/TS 코드' };
  }

  // 7. Java / C# Heuristic Detection
  if (/\b(public\s+class|public\s+static\s+void|System\.out\.println|private\s+final|@Override)\b/.test(trimmed)) {
    return { isCode: true, language: 'java', reason: 'Java 코드' };
  }

  // 8. Bash / Shell Script Heuristic Detection
  if (trimmed.startsWith('#!/bin/bash') || trimmed.startsWith('#!/bin/sh') || /\b(curl\s+-X|npm\s+run|git\s+commit|docker\s+run)\b/.test(trimmed)) {
    return { isCode: true, language: 'bash', reason: 'Shell 스크립트' };
  }

  return { isCode: false, language: 'plaintext' };
}

/**
 * Highlights code string into Prism HTML
 */
export function highlightCode(code: string, language: SupportedLanguage): string {
  const cleanCode = extractRawCode(code);
  const grammar = Prism.languages[language] || Prism.languages.sql || Prism.languages.plaintext;
  try {
    return Prism.highlight(cleanCode, grammar, language);
  } catch (err) {
    return escapeHtml(cleanCode);
  }
}

/**
 * Strips markdown code fence if present
 */
export function extractRawCode(text: string): string {
  if (!text) return '';
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/^```[a-zA-Z0-9_-]*\s*([\s\S]*?)```$/);
  if (fenceMatch) {
    return fenceMatch[1].trim();
  }
  return text;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
