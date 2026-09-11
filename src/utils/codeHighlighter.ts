import Prism from 'prismjs';
import { cleanTextValue } from './textSanitizer';

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

  // Sample up to 32KB to inspect code beyond long top comments or license headers
  const sample = trimmed.length > 32000 ? trimmed.slice(0, 32000) : trimmed;

  // 1. Explicit Markdown Code Fence ```lang ... ```
  const fenceMatch = sample.match(/^```([a-zA-Z0-9_-]+)?\s*([\s\S]*?)```/);
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
    if (pattern.test(sample)) sqlScore += 2;
  }

  if (sqlScore >= 2) {
    return { isCode: true, language: 'sql', reason: 'SQL 쿼리 감지' };
  }

  // 3. JSON Heuristic Detection
  if (trimmed.length < 200000 && ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']')))) {
    try {
      JSON.parse(trimmed);
      return { isCode: true, language: 'json', reason: 'JSON 데이터' };
    } catch {
      // Not strict JSON, continue checking
    }
  }

  // Ignore rich HTML tags like <img, <table, <p>, etc. from being classified as code
  if (
    sample.includes('<img') ||
    sample.includes('<table') ||
    sample.includes('<sticker-node') ||
    (sample.startsWith('<p>') && sample.endsWith('</p>'))
  ) {
    return { isCode: false, language: 'plaintext' };
  }

  // 4. XML / HTML Code Heuristic Detection (explicit <?xml, <!DOCTYPE, <html> or pure XML structures)
  if (
    sample.startsWith('<?xml') ||
    sample.startsWith('<!DOCTYPE') ||
    (sample.startsWith('<html') && sample.endsWith('</html>')) ||
    (sample.startsWith('<svg') && sample.endsWith('</svg>'))
  ) {
    return { isCode: true, language: 'markup', reason: 'XML/HTML' };
  }

  // 5. Python Heuristic Detection
  if (/\b(def\s+\w+\(|import\s+\w+|from\s+\w+\s+import|class\s+\w+:|elif\s+:|if\s+__name__\s*==)\b/.test(sample)) {
    return { isCode: true, language: 'python', reason: 'Python 코드' };
  }

  // 6. JavaScript / TypeScript Heuristic Detection
  if (/\b(const\s+\w+\s*=|let\s+\w+\s*=|function\s*\w*\(|=>\s*\{|console\.log\(|interface\s+\w+|type\s+\w+\s*=)\b/.test(sample)) {
    return { isCode: true, language: 'javascript', reason: 'JS/TS 코드' };
  }

  // 7. Java Heuristic Detection (Comprehensive patterns for classes, methods, imports, fields, constants, annotations)
  const javaPatterns = [
    /\b(package\s+[a-zA-Z0-9_.]+;)/,
    /\b(import\s+java[x]?\.[a-zA-Z0-9_.*]+;)/,
    /\b(public|private|protected)\s+(static\s+)?(final\s+)?(class|interface|enum|record)\b/,
    /\b(public|private|protected)\s+(static\s+)?(final\s+)?(void|int|long|double|float|boolean|char|byte|short|String|List|Map|Set|Optional|[A-Z]\w+)\s+\w+\s*\(/,
    /\b(public|private|protected)\s+(static\s+)?(final\s+)?(volatile\s+)?(transient\s+)?(void|int|long|double|float|boolean|char|byte|short|String|List|Map|Set|Optional|[A-Z]\w*(?:<[^>]*>)?)\s+[a-zA-Z0-9_]+\s*(=|;)/,
    /\b(public|private|protected)\s+static\s+final\b/,
    /\b(public\s+static\s+void\s+main\s*\()/i,
    /\bSystem\.(out|err)\.(println|print|printf)\b/,
    /@(Override|Autowired|Service|Controller|RestController|Repository|Entity|Table|Column|Bean|Component|Configuration|Getter|Setter|Data|Builder|Value|Transactional)\b/,
    /\b(throws\s+[A-Z]\w*Exception|catch\s*\(\s*[A-Z]\w*Exception)/,
    /\b(new\s+[A-Z]\w*(<[^>]*>)?\s*\()/,
    /\b(class\s+\w+(\s+extends\s+\w+)?(\s+implements\s+[\w,\s]+)?\s*\{)/,
    /\b(String|Integer|Long|Boolean|Double|Float)\s+[a-zA-Z0-9_]+\s*=\s*["0-9]/,
  ];

  let javaScore = 0;
  for (const pattern of javaPatterns) {
    if (pattern.test(sample)) javaScore++;
  }

  if (javaScore >= 1) {
    return { isCode: true, language: 'java', reason: 'Java 코드 감지' };
  }

  // 8. Bash / Shell Script Heuristic Detection
  const isShebang = /^(#!\/(bin|usr\/bin|usr\/local\/bin)\/(bash|sh|zsh|env\s+bash|env\s+sh))/m.test(sample);
  const bashPatterns = [
    /^(#!\/(bin|usr\/bin|usr\/local\/bin)\/(bash|sh|zsh|env\s+bash|env\s+sh))/m,
    /^\s*\$\s+[a-zA-Z0-9_-]+/m, // Terminal prompt style: $ command
    /\b(if\s+\[[\s\S]+?\];\s*then\b[\s\S]+?\bfi\b)/,
    /\b(for\s+\w+\s+in\s+[\s\S]+?;\s*do\b[\s\S]+?\bdone\b)/,
    /\b(while\s+\[[\s\S]+?\];\s*do\b[\s\S]+?\bdone\b)/,
    /\b(case\s+\$\w+\s+in\b[\s\S]+?\besac\b)/,
    /\b(sudo\s+(systemctl|apt|apt-get|yum|dnf|pacman|docker|chmod|chown|mkdir|rm|cp|mv|service))\b/,
    /\b(curl\s+(-[a-zA-Z]+|\S+)\s+http|wget\s+http)/,
    /\b(git\s+(clone|pull|push|checkout|branch|commit|status|diff|rebase|merge|stash))\b/,
    /\b(docker\s+(run|build|ps|stop|compose|exec|images|network))\b|docker-compose\s+(up|down)/,
    /\b(npm\s+(install|run|start|test|build|i)|pnpm\s+(install|run|add)|yarn\s+(install|add|build))\b/,
    /\b(export\s+[A-Z0-9_]+=|source\s+[\w./~]+|\.\/[\w./-]+)/,
    /\b(chmod\s+(\+x|[0-7]{3,4})|chown\s+[\w.-]+:[\w.-]+)/,
    /\b(cat\s+<<\s*['"]?EOF['"]?)/,
    /\|\s*(grep|awk|sed|xargs|cut|sort|uniq|head|tail|wc|tee)\b/,
    />\s*\/dev\/null(\s*2>&1)?|\b2>&1\b/,
    /\b(echo\s+.*|mkdir\s+-p\s+.*|rm\s+-rf\s+.*|tar\s+-[a-zA-Z]+\s+.*|find\s+.*-name\s+.*|grep\s+-[a-zA-Z]+\s+.*)\b/,
    /\b(ssh\s+\w+@|scp\s+.*|rsync\s+.*|curl\s+.*|wget\s+.*|ping\s+.*)\b/,
    /\b(ps\s+aux|kill\s+-[0-9]+|systemctl\s+(start|stop|restart|status)|journalctl\s+)/,
  ];

  let bashScore = 0;
  if (isShebang) bashScore += 3;
  for (const pattern of bashPatterns) {
    if (pattern.test(sample)) bashScore++;
  }

  if (bashScore >= 1) {
    return { isCode: true, language: 'bash', reason: 'Bash / Shell 스크립트 감지' };
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

export function unescapeHtml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

/**
 * Parses any HTML string containing <pre><code> code blocks and injects Prism syntax
 * highlighting directly into each block. Ensures code blocks inside rich text HTML
 * (such as in detail modals or hover popups) render with full syntax coloring.
 */
export function highlightHtmlCodeBlocks(htmlContent: string): string {
  if (!htmlContent || typeof htmlContent !== 'string') return '';
  if (!htmlContent.includes('<pre') && !htmlContent.includes('<code')) {
    return htmlContent;
  }

  // Matches <pre ...><code ...>codeContent</code></pre>
  return htmlContent.replace(
    /<pre(?:\s+[^>]*)?>\s*<code(?:\s+class="([^"]*)")?(?:\s+[^>]*)?>([\s\S]*?)<\/code>\s*<\/pre>/gi,
    (_fullMatch, classAttr, innerCode) => {
      let lang: SupportedLanguage = 'plaintext';
      if (classAttr) {
        const langMatch = classAttr.match(/language-([a-zA-Z0-9_-]+)/);
        if (langMatch) {
          const rawL = langMatch[1].toLowerCase();
          if (['sql', 'javascript', 'typescript', 'json', 'python', 'bash', 'java', 'markup', 'css', 'yaml'].includes(rawL)) {
            lang = rawL as SupportedLanguage;
          } else if (rawL === 'js') lang = 'javascript';
          else if (rawL === 'ts') lang = 'typescript';
          else if (rawL === 'sh' || rawL === 'shell') lang = 'bash';
          else if (rawL === 'py') lang = 'python';
          else if (rawL === 'html' || rawL === 'xml') lang = 'markup';
        }
      }

      const rawCode = unescapeHtml(innerCode);
      if (lang === 'plaintext') {
        const detected = detectLanguage(rawCode);
        if (detected.isCode) {
          lang = detected.language;
        }
      }

      const formatted = formatJavaOrGeneralCode(rawCode);
      const highlighted = highlightCode(formatted, lang);

      return `<pre class="code-theme-dark rounded-xl my-3 p-3.5 overflow-x-auto font-mono text-xs leading-relaxed bg-[#181a1f] text-[#f1f5f9] border border-[#2d3139] shadow-md language-${lang}"><code class="language-${lang} block whitespace-pre">${highlighted}</code></pre>`;
    }
  );
}

/**
 * Determines whether a cell value (raw text or TipTap HTML) is purely a code block.
 * If so, extracts the clean code string and detected language so the UI can render
 * it using the high-contrast CodeBlockViewer with line numbers, copy button, and theme toggle.
 */
export function extractCodeBlockFromContent(content: any): {
  isPureCode: boolean;
  code: string;
  language: SupportedLanguage;
} {
  if (content === null || content === undefined) {
    return { isPureCode: false, code: '', language: 'plaintext' };
  }
  const str = typeof content === 'object' ? JSON.stringify(content) : String(content);
  const trimmed = str.trim();
  if (!trimmed) {
    return { isPureCode: false, code: '', language: 'plaintext' };
  }

  // If contains complex rich elements like images, tables, or stickers, it's a composite document, not pure code
  if (
    trimmed.includes('<img') ||
    trimmed.includes('<table') ||
    trimmed.includes('wonbee-sticker') ||
    trimmed.includes('<sticker-node')
  ) {
    return { isPureCode: false, code: '', language: 'plaintext' };
  }

  // Check 1: Single <pre><code ...>...</code></pre> enclosing the entire content (optionally wrapped in a single <p>)
  const preCodeRegex = /^\s*(?:<p>\s*)?<pre(?:\s+[^>]*)?>\s*<code(?:\s+class="([^"]*)")?(?:\s+[^>]*)?>([\s\S]*?)<\/code>\s*<\/pre>(?:\s*<\/p>)?\s*$/i;
  const match = trimmed.match(preCodeRegex);
  if (match) {
    const classAttr = match[1] || '';
    const inner = unescapeHtml(match[2]);
    let lang: SupportedLanguage = 'plaintext';
    const langMatch = classAttr.match(/language-([a-zA-Z0-9_-]+)/);
    if (langMatch) {
      const rawL = langMatch[1].toLowerCase();
      if (['sql', 'javascript', 'typescript', 'json', 'python', 'bash', 'java', 'markup', 'css', 'yaml'].includes(rawL)) {
        lang = rawL as SupportedLanguage;
      } else if (rawL === 'js') lang = 'javascript';
      else if (rawL === 'ts') lang = 'typescript';
      else if (rawL === 'sh' || rawL === 'shell') lang = 'bash';
      else if (rawL === 'py') lang = 'python';
    }
    if (lang === 'plaintext') {
      const detected = detectLanguage(inner);
      lang = detected.isCode ? detected.language : 'plaintext';
    }
    return { isPureCode: true, code: inner, language: lang };
  }

  // Check 2: If wrapped in standard TipTap <p>...</p> but the content inside is code
  const plain = cleanTextValue(trimmed);
  const detected = detectLanguage(plain);
  if (detected.isCode && (plain.includes('\n') || plain.length > 20)) {
    return { isPureCode: true, code: plain, language: detected.language };
  }

  return { isPureCode: false, code: '', language: 'plaintext' };
}

/**
 * Intelligent Code Formatter for Java, SQL, and C-like languages.
 * Restores lines and indentations if code was flattened into a single line or lost newlines.
 */
export function formatJavaOrGeneralCode(code: string): string {
  if (!code || typeof code !== 'string') return '';
  const trimmed = code.trim();
  if (trimmed.length === 0) return '';

  // For gigantic data buffers (> 500KB), skip heavy regular-expression lookahead
  // to prevent blocking the JavaScript main thread.
  if (trimmed.length > 500000) {
    return code;
  }

  // If it's already well formatted with multiple lines, check if any line has flattened comments/statements
  const lines = trimmed.split('\n');
  if (lines.length > 100) {
    return code;
  }

  const isSingleOrFewLines = lines.length <= 2 && trimmed.length > 60;
  const checkSample = trimmed.length > 8000 ? trimmed.slice(0, 8000) : trimmed;
  const hasFlattenedJavaComment = /\/\/[^\n]+?(?:public|private|protected|static|final|class|interface|enum|void|int|long|double|float|boolean|char|byte|short|String|return|if|for|while|import|package|@\w+|\})/.test(checkSample);
  const hasMultipleStatementsOnOneLine = /(?:;|\{)\s*(?:public|private|protected|static|final|class|interface|enum|void|int|long|double|float|boolean|char|byte|short|String|return|if|for|while|import|package|@\w+)/.test(checkSample);

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
