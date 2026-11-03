/**
 * Format Express (format-express.dev) Smart Data Cleaning & Formatter Engine
 */

export function cleanLogNoise(text: string): string {
  if (!text || typeof text !== 'string') return '';
  const lines = text.split('\n');
  const cleaned = lines.map((line) => {
    return line.replace(/^(\[[0-9\-\s:.,]+\]|\d{4}-\d{2}-\d{2}[\sT]\d{2}:\d{2}:\d{2}[,.\d]*Z?)\s*(?:\[?[A-Z]+\]?)?\s*[-:]?\s*/, '');
  });
  return cleaned.join('\n');
}

export function unescapeText(text: string): string {
  if (!text || typeof text !== 'string') return '';
  let res = text;
  try {
    res = res
      .replace(/\\\\n/g, '\n')
      .replace(/\\\\t/g, '\t')
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t')
      .replace(/\\r/g, '\r')
      .replace(/\\"/g, '"')
      .replace(/\\'/g, "'")
      .replace(/\\\\/g, '\\');

    res = res.replace(/\\u([0-9a-fA-F]{4})/g, (_, grp) => String.fromCharCode(parseInt(grp, 16)));
  } catch (_) {}
  return res;
}

export function formatJson(text: string): string {
  const unescaped = unescapeText(cleanLogNoise(text)).trim();
  try {
    const parsed = JSON.parse(unescaped);
    return JSON.stringify(parsed, null, 2);
  } catch (_) {
    const firstBrace = unescaped.indexOf('{');
    const lastBrace = unescaped.lastIndexOf('}');
    const firstBracket = unescaped.indexOf('[');
    const lastBracket = unescaped.lastIndexOf(']');

    let start = -1;
    let end = -1;
    if (firstBrace !== -1 && lastBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
      start = firstBrace;
      end = lastBrace;
    } else if (firstBracket !== -1 && lastBracket !== -1) {
      start = firstBracket;
      end = lastBracket;
    }

    if (start !== -1 && end !== -1 && end > start) {
      try {
        const sub = unescaped.slice(start, end + 1);
        const parsed = JSON.parse(sub);
        return JSON.stringify(parsed, null, 2);
      } catch (__) {}
    }
    return unescaped;
  }
}

export function formatXml(text: string): string {
  const unescaped = unescapeText(cleanLogNoise(text)).trim();
  let formatted = '';
  let indent = 0;
  const pad = (n: number) => '  '.repeat(n);

  const xml = unescaped.replace(/>\s+</g, '><');
  const parts = xml.split(/(<\/?[^>]+>)/g);

  for (const part of parts) {
    if (!part) continue;
    if (part.startsWith('</')) {
      indent = Math.max(0, indent - 1);
      formatted += pad(indent) + part + '\n';
    } else if (part.startsWith('<') && part.endsWith('/>')) {
      formatted += pad(indent) + part + '\n';
    } else if (part.startsWith('<') && !part.startsWith('<?')) {
      formatted += pad(indent) + part + '\n';
      indent++;
    } else {
      const trimmed = part.trim();
      if (trimmed) {
        formatted += pad(indent) + trimmed + '\n';
      }
    }
  }
  return formatted.trim() || unescaped;
}

export function formatSql(text: string): string {
  const unescaped = unescapeText(cleanLogNoise(text)).trim();
  const keywords = [
    'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'INSERT INTO', 'VALUES',
    'UPDATE', 'SET', 'DELETE FROM', 'JOIN', 'LEFT JOIN', 'RIGHT JOIN',
    'INNER JOIN', 'OUTER JOIN', 'GROUP BY', 'ORDER BY', 'HAVING',
    'LIMIT', 'OFFSET', 'UNION', 'CREATE TABLE', 'DROP TABLE', 'ALTER TABLE'
  ];

  let upper = unescaped;
  for (const kw of keywords) {
    const regex = new RegExp(`\\b${kw}\\b`, 'gi');
    upper = upper.replace(regex, `\n${kw}`);
  }

  return upper
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join('\n');
}

export function extractAndFormatEmbeddedQuery(text: string): string {
  const unescaped = unescapeText(text);
  const matches = unescaped.match(/["']([\s\S]*?)["']/g);
  if (matches && matches.length > 0) {
    const longest = matches.reduce((prev, curr) => (curr.length > prev.length ? curr : prev), matches[0]);
    const inner = longest.slice(1, -1);
    if (inner.toLowerCase().includes('select') || inner.toLowerCase().includes('from')) {
      return formatSql(inner);
    }
    if (inner.trim().startsWith('<')) {
      return formatXml(inner);
    }
    return unescapeText(inner);
  }
  return unescaped;
}

export function autoFormatExpress(text: string): { formatted: string; detectedType: string } {
  const cleaned = unescapeText(cleanLogNoise(text)).trim();
  if (!cleaned) return { formatted: text, detectedType: 'Plain Text' };

  if ((cleaned.startsWith('{') && cleaned.endsWith('}')) || (cleaned.startsWith('[') && cleaned.endsWith(']'))) {
    try {
      JSON.parse(cleaned);
      return { formatted: formatJson(cleaned), detectedType: 'JSON' };
    } catch (_) {}
  }

  if (cleaned.startsWith('<') && cleaned.endsWith('>')) {
    return { formatted: formatXml(cleaned), detectedType: 'XML / HTML' };
  }

  const upper = cleaned.toUpperCase();
  if (upper.includes('SELECT ') || upper.includes('INSERT INTO ') || upper.includes('UPDATE ') || upper.includes('DELETE FROM ')) {
    return { formatted: formatSql(cleaned), detectedType: 'SQL' };
  }

  return { formatted: unescapeText(cleaned), detectedType: 'Cleaned Text' };
}
