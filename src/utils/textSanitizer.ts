/**
 * Utility functions for cleaning and sanitizing text values
 * to prevent accidental HTML wrapping (like `<p>...</p>`) on non-rich text fields.
 */

export function cleanTextValue(val: any): string {
  if (val === null || val === undefined) return '';
  if (typeof val !== 'string') return String(val);

  let str = val.trim();
  if (!str) return '';

  // If HTML tags are present (e.g. <p>...</p>, <span>...</span>, or unclosed <p>...)
  if (str.includes('<') && str.includes('>')) {
    if (typeof document !== 'undefined') {
      const temp = document.createElement('div');
      temp.innerHTML = str;
      str = (temp.textContent || temp.innerText || '').trim();
    } else {
      str = str.replace(/<[^>]*>/g, '').trim();
    }
  }

  // Also clean unclosed or remaining tags like `<p>` or `</p>`
  str = str.replace(/<\/?[a-zA-Z0-9]+[^>]*>/g, '').trim();

  return str;
}

export function cleanHtmlToPlainText(html: string): string {
  if (!html) return '';
  if (typeof document !== 'undefined') {
    const temp = document.createElement('div');
    temp.innerHTML = html;
    return (temp.textContent || temp.innerText || '').trim();
  }
  return html.replace(/<[^>]*>/g, '').trim();
}

