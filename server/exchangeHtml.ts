import sanitizeHtml from 'sanitize-html';
import { HTML_ALLOWED_ATTRIBUTES, HTML_ALLOWED_STYLE_VALUES, HTML_ALLOWED_TAGS } from '../src/constants/htmlSanitizer';

export function sanitizeExchangeHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [...HTML_ALLOWED_TAGS],
    allowedAttributes: HTML_ALLOWED_ATTRIBUTES,
    allowedSchemes: ['https', 'http', 'mailto', 'asset', 'data'],
    allowedSchemesByTag: { img: ['asset', 'data'] },
    allowProtocolRelative: false,
    allowedStyles: { '*': Object.fromEntries(Object.entries(HTML_ALLOWED_STYLE_VALUES).map(([property, rule]) => [property, [rule]])) },
  });
}
