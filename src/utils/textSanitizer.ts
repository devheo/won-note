/**
 * Utility functions for cleaning and sanitizing text values
 * to prevent accidental HTML wrapping (like `<p>...</p>`, `<pre>...</pre>`) on plain text and table cells.
 */

export function cleanTextValue(val: any): string {
  if (val === null || val === undefined) return '';
  if (typeof val !== 'string') return String(val);

  let str = val;
  if (!str) return '';

  // If HTML tags are present (e.g. <p>...</p>, <pre>...</pre>, <span>...</span>)
  if (str.includes('<') && str.includes('>')) {
    // Replace common block breaks with newlines before stripping tags
    const formatted = str
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<\/li>/gi, '\n');

    if (typeof document !== 'undefined') {
      const temp = document.createElement('div');
      temp.innerHTML = formatted;
      str = (temp.textContent || temp.innerText || '');
    } else {
      str = formatted.replace(/<[^>]*>/g, '');
    }
  }

  // Also clean any leftover or unclosed HTML tags
  str = str.replace(/<\/?[a-zA-Z0-9]+[^>]*>/g, '');

  return str.trim();
}

export function cleanHtmlToPlainText(html: string): string {
  if (!html) return '';
  const formatted = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/li>/gi, '\n');

  if (typeof document !== 'undefined') {
    const temp = document.createElement('div');
    temp.innerHTML = formatted;
    return (temp.textContent || temp.innerText || '').trim();
  }
  return formatted.replace(/<[^>]*>/g, '').trim();
}

export function extractFirstImageSrc(htmlOrText: string): string | null {
  if (!htmlOrText || typeof htmlOrText !== 'string') return null;
  const match = htmlOrText.match(/<img[^>]+src=["']([^"']+)["']/i);
  return match ? match[1] : null;
}
