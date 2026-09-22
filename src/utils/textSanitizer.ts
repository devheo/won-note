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

/**
 * Checks if a string represents an image (data URL, image file URL, HTML img, or raw base64 image)
 */
export function isImageValue(val: any): boolean {
  if (!val || typeof val !== 'string') return false;
  const trimmed = val.trim();
  if (trimmed.startsWith('data:image/')) return true;
  if (trimmed.startsWith('<img') && (trimmed.includes('src=') || trimmed.includes('data:image/'))) return true;
  if (/^!\[.*?\]\((data:image\/|https?:\/\/).*?\)/i.test(trimmed)) return true;
  if (/^https?:\/\/[^\s"'<>]+\.(?:png|jpe?g|gif|webp|svg|bmp|ico)(?:\?[^\s"'<>]*)?$/i.test(trimmed)) return true;
  // Raw base64 image strings
  if (trimmed.length > 60 && (/^iVBORw0KGgo/i.test(trimmed) || /^\/9j\/4/i.test(trimmed) || /^R0lGOD/i.test(trimmed) || /^UklGR/i.test(trimmed))) {
    return true;
  }
  return false;
}

export function cleanTextValue(val: any): string {
  if (val === null || val === undefined) return '';
  if (typeof val !== 'string') return String(val);

  let str = val;
  if (!str) return '';

  const trimmed = str.trim();
  // If the entire value is a base64 image data URL or raw base64 image, do not dump tens of thousands of characters
  if (trimmed.startsWith('data:image/')) {
    return '[이미지]';
  }
  if (trimmed.length > 60 && (/^iVBORw0KGgo/i.test(trimmed) || /^\/9j\/4/i.test(trimmed) || /^R0lGOD/i.test(trimmed) || /^UklGR/i.test(trimmed))) {
    return '[이미지]';
  }

  // Return cached result if available
  if (str.length < 5000 && CLEAN_TEXT_CACHE.has(str)) {
    return CLEAN_TEXT_CACHE.get(str)!;
  }

  const originalStr = str;

  // Replace embedded long base64 data URLs in text with a clean badge
  if (str.includes('data:image/')) {
    str = str.replace(/data:image\/[a-zA-Z0-9+\/]+;base64,[A-Za-z0-9+/=]+/g, '[이미지]');
  }

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

    // Replace <img> tags with clean [이미지] indicator before stripping tags
    str = str.replace(/<img[^>]*>/gi, (imgTag) => {
      const altMatch = imgTag.match(/alt=["']([^"']*)["']/i);
      const altText = altMatch && altMatch[1] && altMatch[1] !== 'thumb' ? altMatch[1] : '';
      return altText ? ` [이미지: ${altText}] ` : ' [이미지] ';
    });

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

  const cacheKey = htmlOrText.length < 300 ? htmlOrText : htmlOrText.substring(0, 150) + '__' + htmlOrText.length;
  if (IMAGE_SRC_CACHE.has(cacheKey)) {
    return IMAGE_SRC_CACHE.get(cacheKey)!;
  }

  let src: string | null = null;
  const trimmed = htmlOrText.trim();

  // 1. Direct Data URL (e.g. data:image/png;base64,...)
  if (trimmed.startsWith('data:image/')) {
    src = trimmed;
  }
  // 2. HTML <img> tag
  else if (htmlOrText.includes('<img')) {
    const match = htmlOrText.match(/<img[^>]+src=["']([^"']+)["']/i);
    if (match && match[1]) {
      src = match[1];
    }
  }
  // 3. Markdown image syntax: ![alt](url)
  else if (htmlOrText.includes('![')) {
    const mdMatch = htmlOrText.match(/!\[.*?\]\((data:image\/[^)]+|https?:\/\/[^)]+)\)/i);
    if (mdMatch && mdMatch[1]) {
      src = mdMatch[1];
    }
  }
  // 4. Standalone direct HTTP(S) image URL
  else if (/^https?:\/\/[^\s"'<>]+\.(?:png|jpe?g|gif|webp|svg|bmp|ico)(?:\?[^\s"'<>]*)?$/i.test(trimmed)) {
    src = trimmed;
  }
  // 5. Raw base64 image strings without "data:image/..." prefix
  else if (trimmed.length > 60) {
    if (/^iVBORw0KGgo/i.test(trimmed)) {
      src = `data:image/png;base64,${trimmed}`;
    } else if (/^\/9j\/4/i.test(trimmed)) {
      src = `data:image/jpeg;base64,${trimmed}`;
    } else if (/^R0lGOD/i.test(trimmed)) {
      src = `data:image/gif;base64,${trimmed}`;
    } else if (/^UklGR/i.test(trimmed)) {
      src = `data:image/webp;base64,${trimmed}`;
    }
  }

  IMAGE_SRC_CACHE.set(cacheKey, src);
  trimCache(IMAGE_SRC_CACHE);

  return src;
}

