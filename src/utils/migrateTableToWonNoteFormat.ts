import { TableDocument, WonNoteDocument } from '../types';

const valueText = (value: unknown) => {
  if (value == null) return '';
  if (typeof value === 'object') {
    try { return JSON.stringify(value); } catch { return String(value); }
  }
  return String(value);
};

const escapeHtml = (value: unknown) => valueText(value).replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char] as string));

/** Builds a separate WonNote copy; the source table is never modified. */
export function migrateTableToWonNoteFormat(table: TableDocument, documentId = `doc-${table.id}-${Date.now().toString(36)}`): WonNoteDocument {
  const parts = [`<h1>${escapeHtml(table.title || '새 페이지')}</h1>`];
  if (table.description) parts.push(`<p>${escapeHtml(table.description)}</p>`);

  if (table.rows?.length) {
    table.rows.forEach((row, index) => {
      const heading = table.columns.find((column) => column.isPrimaryKey) || table.columns[0];
      const title = heading ? row.data?.[heading.id] : `항목 ${index + 1}`;
      parts.push(`<h2>${escapeHtml(title || `항목 ${index + 1}`)}</h2>`);
      table.columns.forEach((column) => {
        const value = row.data?.[column.id];
        if (value !== undefined && value !== null && String(value) !== '') {
          parts.push(`<p><strong>${escapeHtml(column.name)}:</strong> ${escapeHtml(value).replace(/\r?\n/g, '<br>')}</p>`);
        }
      });
      if (row.richContent) parts.push(row.richContent);
      if (row.stickers?.length) {
        row.stickers.forEach((sticker) => parts.push(`<blockquote><strong>${escapeHtml(sticker.title)}</strong><br>${escapeHtml(sticker.content).replace(/\r?\n/g, '<br>')}</blockquote>`));
      }
    });
  } else {
    parts.push('<p></p>');
  }

  const now = Date.now();
  return { id: documentId, title: table.title || '가져온 노트', content: parts.join(''), createdAt: now, updatedAt: now };
}
