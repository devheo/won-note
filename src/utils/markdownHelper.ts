import { marked } from 'marked';
import { TableColumn, TableRow } from '../types';

/**
 * Converts Markdown string into semantic HTML that TipTap seamlessly consumes,
 * including headings, code blocks, tables, task lists, blockquotes, and text formatting.
 */
export function markdownToHtml(markdown: string): string {
  if (!markdown || typeof markdown !== 'string') return '';
  const trimmed = markdown.trim();
  if (!trimmed) return '';

  // Configure marked for GitHub Flavored Markdown
  const rawHtml = marked.parse(trimmed, {
    gfm: true,
    breaks: false,
    async: false,
  }) as string;

  // Post-process HTML for TipTap specific node schemas:
  let processedHtml = rawHtml;

  // 1. Task Lists: TipTap expects <ul data-type="taskList"><li data-type="taskItem" data-checked="true/false">...
  if (processedHtml.includes('type="checkbox"')) {
    processedHtml = processedHtml.replace(/<ul>(\s*<li[^>]*><input[^>]*type="checkbox"[^>]*>[\s\S]*?<\/ul>)/g, (match) => {
      return match
        .replace(/^<ul>/, '<ul data-type="taskList">')
        .replace(/<li[^>]*><input([^>]*)type="checkbox"([^>]*)>([\s\S]*?)<\/li>/g, (_, p1, p2, text) => {
          const isChecked = (p1 + p2).includes('checked');
          const cleanContent = text.trim();
          return `<li data-type="taskItem" data-checked="${isChecked}"><label><input type="checkbox" ${isChecked ? 'checked="checked"' : ''} /></label><div><p>${cleanContent}</p></div></li>`;
        });
    });
  }

  // 2. Wrap tables with wonbee-rich-table styling class and default all borders
  if (processedHtml.includes('<table>')) {
    processedHtml = processedHtml.replace(/<table>/g, '<table class="wonbee-rich-table wonbee-table-border-all" data-border-style="all">');
  }

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
      const lang = langClass ? langClass[1] : '';
      const codeContent = codeEl ? codeEl.textContent : el.textContent;
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
  if (trimmed.length < 3) return false;

  // Fast-sampling for large texts (first 8KB) to prevent catastrophic regex backtracking and main-thread freezes
  const sample = trimmed.length > 8000 ? trimmed.slice(0, 8000) : trimmed;

  // 1. Headings (# Title, ## Title)
  if (/^#{1,6}\s+\S/m.test(sample)) return true;

  // 2. Markdown Code Fences (```lang ... ```)
  if (/^```[a-zA-Z0-9_-]*\s*[\s\S]*?```/m.test(sample)) return true;

  // 3. Markdown Tables (| Col1 | Col2 | and |---|---|)
  if (/\|[^\n]+\|\s*\n\s*\|[\s-:|]+\|/m.test(sample)) return true;

  // 4. Task Lists (- [ ] or - [x])
  if (/^[-*+]\s+\[[ xX]\]\s+\S/m.test(sample)) return true;

  // 5. Blockquotes (> quote)
  if (/^>\s+\S/m.test(sample)) return true;

  // 6. Multiple list items with * or - or numbers
  const listMatches = sample.match(/^(\s*[-*+]\s+\S+|\s*\d+\.\s+\S+)/gm);
  if (listMatches && listMatches.length >= 2) return true;

  // 7. Bold/Italic formatting across text
  if (/\*\*[^*\n]+\*\*|__[^_\n]+__|~~[^~\n]+~~/.test(sample)) return true;

  return false;
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
