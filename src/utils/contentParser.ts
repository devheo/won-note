import { SupportedLanguage, highlightHtmlCodeBlocks, extractCodeBlockFromContent } from './codeHighlighter';
import { isLikelyMarkdown, markdownToHtml } from './markdownHelper';
import { cleanTextValue, extractFirstImageSrc, isImageValue } from './textSanitizer';

export interface ContentAnalysisResult {
  rawString: string;
  cleanString: string;
  isPureCode: boolean;
  code: string;
  codeLanguage: SupportedLanguage;
  isMarkdown: boolean;
  markdownHtml: string;
  isRichHtml: boolean;
  richHtml: string;
  isImage: boolean;
  imageSrc: string | null;
  hasSticker: boolean;
  hasTable: boolean;
  sqlCount: number;
}

/**
 * Single Source of Truth Content Parser Utility
 * Unifies SQL query detection, pure code analysis, markdown conversion,
 * image extraction, and rich HTML highlighting across the application.
 */
export function analyzeContent(content: any, colType?: string): ContentAnalysisResult {
  if (content === null || content === undefined) {
    return {
      rawString: '',
      cleanString: '',
      isPureCode: false,
      code: '',
      codeLanguage: 'plaintext',
      isMarkdown: false,
      markdownHtml: '',
      isRichHtml: false,
      richHtml: '',
      isImage: false,
      imageSrc: null,
      hasSticker: false,
      hasTable: false,
      sqlCount: 0,
    };
  }

  const rawString = typeof content === 'object' ? JSON.stringify(content) : String(content);
  const trimmed = rawString.trim();
  const cleanString = cleanTextValue(trimmed);

  if (!trimmed) {
    return {
      rawString: '',
      cleanString: '',
      isPureCode: false,
      code: '',
      codeLanguage: 'plaintext',
      isMarkdown: false,
      markdownHtml: '',
      isRichHtml: false,
      richHtml: '',
      isImage: false,
      imageSrc: null,
      hasSticker: false,
      hasTable: false,
      sqlCount: 0,
    };
  }

  const hasSticker = trimmed.includes('wonbee-sticker') || trimmed.includes('<sticker-node');
  const hasTable = trimmed.includes('<table');
  const imageSrc = extractFirstImageSrc(trimmed);
  const isImage = colType === 'image' || isImageValue(trimmed) || (!!imageSrc && !trimmed.includes('!['));

  // 1. Pure Code Check
  const pureCodeInfo = extractCodeBlockFromContent(trimmed);

  // 2. Count SQL Queries
  const sqlMatchList = trimmed.match(/\b(SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM|CREATE\s+TABLE|ALTER\s+TABLE|DROP\s+TABLE)\b/gi);
  const sqlCount = sqlMatchList ? sqlMatchList.length : 0;

  // 3. Markdown Check
  const hasMarkdownFences = trimmed.includes('```');
  const isMd =
    !pureCodeInfo.isPureCode &&
    !hasSticker &&
    (colType === 'richText' ||
      hasMarkdownFences ||
      isLikelyMarkdown(trimmed) ||
      trimmed.includes('#') ||
      trimmed.includes('- ') ||
      trimmed.includes('* ') ||
      trimmed.includes('\n') ||
      /^\s*(\d+|[가-하])[\.\)]\s+/m.test(trimmed)) &&
    !(hasTable && !hasMarkdownFences);

  let markdownHtml = '';
  if (isMd) {
    const parsed = markdownToHtml(trimmed);
    markdownHtml = highlightHtmlCodeBlocks(parsed);
  }

  // 4. Rich HTML Check
  const isRichHtml =
    !pureCodeInfo.isPureCode &&
    !isMd &&
    (colType === 'richText' ||
      hasTable ||
      hasSticker ||
      trimmed.includes('<pre') ||
      trimmed.includes('<code') ||
      trimmed.includes('<img') ||
      (trimmed.includes('<') && trimmed.includes('>')));

  let richHtml = '';
  if (isRichHtml) {
    richHtml = highlightHtmlCodeBlocks(trimmed);
  }

  return {
    rawString,
    cleanString,
    isPureCode: pureCodeInfo.isPureCode,
    code: pureCodeInfo.code,
    codeLanguage: pureCodeInfo.language,
    isMarkdown: isMd,
    markdownHtml,
    isRichHtml,
    richHtml,
    isImage,
    imageSrc,
    hasSticker,
    hasTable,
    sqlCount,
  };
}
