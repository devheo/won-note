/**
 * Utility functions for cleaning and sanitizing text values
 * to prevent accidental HTML wrapping (like `<p>...</p>`, `<pre>...</pre>`) on plain text and table cells,
 * while strictly preserving original spaces, indents, and newlines.
 */

export function cleanTextValue(val: any): string {
  if (val === null || val === undefined) return '';
  if (typeof val !== 'string') return String(val);

  let str = val;
  if (!str) return '';

  // If HTML tags are present (e.g. <p>...</p>, <pre>...</pre>, <span>...</span>)
  if (str.includes('<') && str.includes('>')) {
    str = str
      // Convert block elements & linebreaks to real newlines
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|tr|h[1-6]|blockquote)>/gi, '\n')
      .replace(/<(p|div|li|tr|h[1-6]|blockquote)[^>]*>/gi, '')
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

  return str.trim();
}

export function cleanHtmlToPlainText(html: string): string {
  if (!html) return '';
  return cleanTextValue(html);
}

export function extractFirstImageSrc(htmlOrText: string): string | null {
  if (!htmlOrText || typeof htmlOrText !== 'string') return null;
  const match = htmlOrText.match(/<img[^>]+src=["']([^"']+)["']/i);
  return match ? match[1] : null;
}
