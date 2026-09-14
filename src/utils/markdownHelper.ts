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

  // 2. Wrap tables with wonbee-rich-table styling class and default all borders
  if (processedHtml.includes('<table>')) {
    processedHtml = processedHtml.replace(
      /<table>/g,
      '<div class="wonbee-table-scroll-wrapper overflow-x-auto my-3"><table class="wonbee-rich-table wonbee-table-border-all" data-border-style="all">'
    ).replace(/<\/table>/g, '</table></div>');
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
  if (trimmed.length < 2) return false;

  // Fast-sampling for large texts (first 16KB) to prevent catastrophic regex backtracking
  const sample = trimmed.length > 16000 ? trimmed.slice(0, 16000) : trimmed;

  // PRIORITY 1: Markdown Code Fences (```lang ... ``` or ``` ... ```)
  // Matches any markdown code block regardless of indentation or wrapping
  if (/```[\s\S]+?```/.test(sample)) {
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
  if (cleanText.includes('```') && /<[a-z1-6]+/i.test(cleanText)) {
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
  if (!fenceMatch) return null;

  const introRaw = cleanText.slice(0, fenceMatch.index).trim();
  const introText = cleanMarkdownForPreview(introRaw);
  const codeContent = fenceMatch[2].trim();

  // Grab the first 1-2 non-empty lines for compact cell display
  const lines = codeContent.split('\n').map((l) => l.trimEnd()).filter((l) => l.trim().length > 0);
  const codeSnippet = lines.slice(0, 2).join('\n');
  const codeLanguage = fenceMatch[1] || '';

  return {
    hasCodeBlock: true,
    introText,
    codeSnippet,
    codeLanguage,
  };
}
