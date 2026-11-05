export const HTML_ALLOWED_TAGS = new Set([
  'p', 'br', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'em', 'b', 'i', 'u', 's', 'span', 'mark', 'div',
  'blockquote', 'pre', 'code', 'ul', 'ol', 'li', 'hr', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'img', 'a',
]);

export const HTML_ALLOWED_ATTRIBUTES: Record<string, string[]> = {
  '*': ['class', 'style', 'data-type', 'data-checked', 'data-pdf-page', 'data-pdf-total'],
  img: ['src', 'alt', 'width', 'height', 'data-width', 'data-layout'],
  a: ['href', 'title', 'target', 'rel'],
  td: ['colspan', 'rowspan', 'colwidth'],
  th: ['colspan', 'rowspan', 'colwidth'],
  code: ['class', 'data-language'],
};

export const HTML_ALLOWED_STYLE_VALUES: Record<string, RegExp> = {
  color: /^(#[\da-f]{3,8}|[a-z]+|rgba?\([\d., %]+\))$/i,
  'background-color': /^(#[\da-f]{3,8}|[a-z]+|rgba?\([\d., %]+\))$/i,
  'text-align': /^(left|right|center|justify)$/i,
  width: /^[\d.]+(px|%|em)?$/,
  'font-size': /^[\d.]+(px|pt|em)$/,
  'font-family': /^[\w\s가-힣,"'-]+$/,
};
