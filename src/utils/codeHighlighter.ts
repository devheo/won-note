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

  // Ignore rich HTML tags like <img, <table, <p>, etc. from being classified as code
  if (
    trimmed.includes('<img') ||
    trimmed.includes('<table') ||
    trimmed.includes('<sticker-node') ||
    (trimmed.startsWith('<p>') && trimmed.endsWith('</p>'))
  ) {
    return { isCode: false, language: 'plaintext' };
  }

  // 4. XML / HTML Code Heuristic Detection (explicit <?xml, <!DOCTYPE, <html> or pure XML structures)
  if (
    trimmed.startsWith('<?xml') ||
    trimmed.startsWith('<!DOCTYPE') ||
    (trimmed.startsWith('<html') && trimmed.endsWith('</html>')) ||
    (trimmed.startsWith('<svg') && trimmed.endsWith('</svg>'))
  ) {
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

  // 7. Java Heuristic Detection (Comprehensive patterns for classes, methods, imports, annotations)
  const javaPatterns = [
    /\b(package\s+[a-zA-Z0-9_.]+;)/,
    /\b(import\s+java[x]?\.[a-zA-Z0-9_.*]+;)/,
    /\b(public|private|protected)\s+(static\s+)?(final\s+)?(class|interface|enum|record)\b/,
    /\b(public|private|protected)\s+(static\s+)?(final\s+)?(void|int|long|double|float|boolean|char|byte|short|String|List|Map|Set|Optional|[A-Z]\w+)\s+\w+\s*\(/,
    /\b(public\s+static\s+void\s+main\s*\()/i,
    /\bSystem\.(out|err)\.(println|print|printf)\b/,
    /@(Override|Autowired|Service|Controller|RestController|Repository|Entity|Table|Column|Bean|Component|Configuration|Getter|Setter|Data|Builder|Value|Transactional)\b/,
    /\b(throws\s+[A-Z]\w*Exception|catch\s*\(\s*[A-Z]\w*Exception)/,
    /\b(new\s+[A-Z]\w*(<[^>]*>)?\s*\()/,
    /\b(class\s+\w+(\s+extends\s+\w+)?(\s+implements\s+[\w,\s]+)?\s*\{)/,
  ];

  let javaScore = 0;
  for (const pattern of javaPatterns) {
    if (pattern.test(trimmed)) javaScore++;
  }

  if (javaScore >= 1) {
    return { isCode: true, language: 'java', reason: 'Java 코드 감지' };
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

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Intelligent Code Formatter for Java, SQL, and C-like languages.
 * Restores lines and indentations if code was flattened into a single line or lost newlines.
 */
export function formatJavaOrGeneralCode(code: string): string {
  if (!code || typeof code !== 'string') return '';
  const trimmed = code.trim();
  if (trimmed.length === 0) return '';

  // If it's already well formatted with multiple lines, check if any line has flattened comments/statements
  const lines = trimmed.split('\n');
  const isSingleOrFewLines = lines.length <= 2 && trimmed.length > 60;
  const hasFlattenedJavaComment = /\/\/[^\n]+?(?:public|private|protected|static|final|class|interface|enum|void|int|long|double|float|boolean|char|byte|short|String|return|if|for|while|import|package|@\w+|\})/.test(trimmed);
  const hasMultipleStatementsOnOneLine = /(?:;|\{)\s*(?:public|private|protected|static|final|class|interface|enum|void|int|long|double|float|boolean|char|byte|short|String|return|if|for|while|import|package|@\w+)/.test(trimmed);

  // If it's not flattened and has multiple lines, return as is
  if (!isSingleOrFewLines && !hasFlattenedJavaComment && !hasMultipleStatementsOnOneLine) {
    return code;
  }

  // Keywords that denote the beginning of a new statement/field in Java/C-like languages
  const keywordPattern = '(?:public|private|protected|static|final|class|interface|enum|record|void|int|long|double|float|boolean|char|byte|short|String|[A-Z]\\w+|return|if|for|while|import|package|@\\w+|\\})';

  let processed = trimmed;

  // 1. Separate comments glued to subsequent keywords (e.g. "// 지로 이미지 public static final ...")
  // Using global regex replacement
  processed = processed.replace(
    new RegExp(`(//[^\r\n]*?)\\s+(?=${keywordPattern}\\b)`, 'g'),
    '$1\n'
  );

  // 2. Separate statements after semicolons that are glued to next keywords (e.g. "; public static ...")
  processed = processed.replace(
    new RegExp(`(;)\\s*(?=${keywordPattern}\\b)`, 'g'),
    '$1\n'
  );

  // 3. Separate opening braces (e.g. "public class Constant { public static ...")
  processed = processed.replace(
    new RegExp(`(\\{)\\s*(?=\\S)`, 'g'),
    '$1\n'
  );

  // 4. Separate closing braces
  processed = processed.replace(
    new RegExp(`(\\S)\\s*(\\})`, 'g'),
    '$1\n$2'
  );
  processed = processed.replace(
    new RegExp(`(\\})(?!\\n)\\s*`, 'g'),
    '$1\n'
  );

  // 5. Now recompute proper indentation level
  const rawLines = processed.split('\n');
  let indentLevel = 0;
  const formattedLines: string[] = [];

  for (let i = 0; i < rawLines.length; i++) {
    const rawLine = rawLines[i].trim();
    if (!rawLine) continue;

    // If line starts with closing brace, decrement before adding
    if (rawLine.startsWith('}')) {
      indentLevel = Math.max(0, indentLevel - 1);
    }

    const indentStr = '    '.repeat(indentLevel);
    formattedLines.push(indentStr + rawLine);

    // If line ends with opening brace (or contains more { than }), increment indent
    const openBraces = (rawLine.match(/\{/g) || []).length;
    const closeBraces = (rawLine.match(/\}/g) || []).length;
    const diff = openBraces - closeBraces;
    if (diff > 0) {
      indentLevel += diff;
    } else if (diff < 0 && !rawLine.startsWith('}')) {
      indentLevel = Math.max(0, indentLevel + diff);
    }
  }

  return formattedLines.join('\n');
}
