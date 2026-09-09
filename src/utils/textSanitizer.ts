/**
 * Utility functions for cleaning and sanitizing text values
 * to prevent accidental HTML wrapping (like `<p>...</p>`, `<pre>...</pre>`) on plain text and table cells,
 * while strictly preserving original spaces, indents, and newlines.
 */

// High-performance LRU-like Map caches for text cleaning and image extraction
const CLEAN_TEXT_CACHE = new Map<string, string>();
const IMAGE_SRC_CACHE = new Map<string, string | null>();
const MAX_CACHE_ENTRIES = 5000;

function trimCache<K, V>(cache: Map<K, V>) {
  if (cache.size > MAX_CACHE_ENTRIES) {
    const iter = cache.keys();
    // Evict oldest 500 entries
    for (let i = 0; i < 500; i++) {
      const nextKey = iter.next().value;
      if (nextKey !== undefined) {
        cache.delete(nextKey);
      }
    }
  }
}

export function cleanTextValue(val: any): string {
  if (val === null || val === undefined) return '';
  if (typeof val !== 'string') return String(val);

  let str = val;
  if (!str) return '';

  // Return cached result if available
  if (str.length < 5000 && CLEAN_TEXT_CACHE.has(str)) {
    return CLEAN_TEXT_CACHE.get(str)!;
  }

  const originalStr = str;

  // Check if real HTML markup is present (prevent stripping Java generics like List<String> or <T> or comparisons)
  const hasRealHtml = /<\/?(?:p|div|span|strong|b|em|i|s|del|h[1-6]|ul|ol|li|blockquote|pre|code|table|thead|tbody|tfoot|tr|th|td|img|br|hr|a)\b/i.test(str);
  if (hasRealHtml) {
    // Preserve OneNote sticker tags as readable text summary
    if (str.includes('wonbee-sticker')) {
      str = str.replace(/<div[^>]*data-type=["']wonbee-sticker["'][^>]*>([\s\S]*?)(?:<\/div>|$)/gi, (fullMatch) => {
        const title = fullMatch.match(/data-title=["']([^"']*)["']/i)?.[1] || '스티커';
        const body = fullMatch.match(/data-body=["']([^"']*)["']/i)?.[1] || '';
        return ` [📌 ${title}${body ? `: ${body}` : ''}] `;
      });
    }

    // Preserve pre/code blocks by ensuring newlines before and after, preserving all indentations
    str = str.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, (_match, p1) => {
      // Decode inside pre code block
      const cleanInner = p1
        .replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, '$1')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&amp;/gi, '&')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'");
      return `\n${cleanInner}\n`;
    });

    str = str
      // Convert block elements & linebreaks to real newlines
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|tr|h[1-6]|blockquote|pre)>/gi, '\n')
      .replace(/<(p|div|li|tr|h[1-6]|blockquote|pre)[^>]*>/gi, '')
      .replace(/<td[^>]*>/gi, '\t')
      .replace(/<\/td>/gi, ' ')
      .replace(/<th[^>]*>/gi, '\t')
      .replace(/<\/th>/gi, ' ')
      .replace(/<[^>]*>/g, '');

    // Decode standard HTML entities preserving spaces
    str = str
      .replace(/&nbsp;/gi, ' ')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&amp;/gi, '&')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'");
  }

  const result = str.trim();

  if (originalStr.length < 5000) {
    CLEAN_TEXT_CACHE.set(originalStr, result);
    trimCache(CLEAN_TEXT_CACHE);
  }

  return result;
}

export function cleanHtmlToPlainText(html: string): string {
  if (!html) return '';
  return cleanTextValue(html);
}

export function extractFirstImageSrc(htmlOrText: string): string | null {
  if (!htmlOrText || typeof htmlOrText !== 'string') return null;

  if (htmlOrText.length < 5000 && IMAGE_SRC_CACHE.has(htmlOrText)) {
    return IMAGE_SRC_CACHE.get(htmlOrText)!;
  }

  const match = htmlOrText.match(/<img[^>]+src=["']([^"']+)["']/i);
  const src = match ? match[1] : null;

  if (htmlOrText.length < 5000) {
    IMAGE_SRC_CACHE.set(htmlOrText, src);
    trimCache(IMAGE_SRC_CACHE);
  }

  return src;
}

