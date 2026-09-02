import { TableRow, TableColumn, StickerData } from '../types';

export interface ExtractedSticker {
  id: string;
  title: string;
  content: string;
  color: 'yellow' | 'amber' | 'green' | 'blue' | 'rose' | 'purple';
  isPinned?: boolean;
  completed?: boolean;
  columnId?: string;
  columnName?: string;
}

/**
 * Color style mapping for OneNote sticky notes
 */
export const STICKER_COLOR_MAP: Record<
  string,
  { bg: string; border: string; text: string; header: string; tag: string; badge: string }
> = {
  yellow: {
    bg: 'bg-yellow-100 dark:bg-yellow-950/40',
    border: 'border-yellow-300 dark:border-yellow-700/60',
    text: 'text-yellow-950 dark:text-yellow-100',
    header: 'bg-yellow-200/70 dark:bg-yellow-900/50',
    tag: 'bg-yellow-300/80 text-yellow-900',
    badge: 'bg-yellow-400 text-yellow-950',
  },
  amber: {
    bg: 'bg-amber-100 dark:bg-amber-950/40',
    border: 'border-amber-300 dark:border-amber-700/60',
    text: 'text-amber-950 dark:text-amber-100',
    header: 'bg-amber-200/70 dark:bg-amber-900/50',
    tag: 'bg-amber-300/80 text-amber-900',
    badge: 'bg-amber-400 text-amber-950',
  },
  green: {
    bg: 'bg-emerald-100 dark:bg-emerald-950/40',
    border: 'border-emerald-300 dark:border-emerald-700/60',
    text: 'text-emerald-950 dark:text-emerald-100',
    header: 'bg-emerald-200/70 dark:bg-emerald-900/50',
    tag: 'bg-emerald-300/80 text-emerald-900',
    badge: 'bg-emerald-400 text-emerald-950',
  },
  blue: {
    bg: 'bg-sky-100 dark:bg-sky-950/40',
    border: 'border-sky-300 dark:border-sky-700/60',
    text: 'text-sky-950 dark:text-sky-100',
    header: 'bg-sky-200/70 dark:bg-sky-900/50',
    tag: 'bg-sky-300/80 text-sky-900',
    badge: 'bg-sky-400 text-sky-950',
  },
  rose: {
    bg: 'bg-rose-100 dark:bg-rose-950/40',
    border: 'border-rose-300 dark:border-rose-700/60',
    text: 'text-rose-950 dark:text-rose-100',
    header: 'bg-rose-200/70 dark:bg-rose-900/50',
    tag: 'bg-rose-300/80 text-rose-900',
    badge: 'bg-rose-400 text-rose-950',
  },
  purple: {
    bg: 'bg-purple-100 dark:bg-purple-950/40',
    border: 'border-purple-300 dark:border-purple-700/60',
    text: 'text-purple-950 dark:text-purple-100',
    header: 'bg-purple-200/70 dark:bg-purple-900/50',
    tag: 'bg-purple-300/80 text-purple-900',
    badge: 'bg-purple-400 text-purple-950',
  },
};

/**
 * Extract all stickers associated with a row:
 * 1. From row.stickers array
 * 2. From HTML sticker nodes embedded in any row.data column
 * 3. From richContent if present
 */
export function getAllStickersFromRow(row: TableRow, columns?: TableColumn[]): ExtractedSticker[] {
  const result: ExtractedSticker[] = [];
  const seenIds = new Set<string>();

  // 1. From explicit row.stickers array
  if (row.stickers && Array.isArray(row.stickers)) {
    row.stickers.forEach((s: StickerData) => {
      if (!s.id || seenIds.has(s.id)) return;
      seenIds.add(s.id);
      result.push({
        id: s.id,
        title: s.title || '원노트 스티커 메모',
        content: s.content || '',
        color: (s.color as any) || 'amber',
        isPinned: !!s.isPinned,
        completed: false,
        columnName: '행 부착 스티커',
      });
    });
  }

  // Helper to extract sticker nodes from HTML string
  const parseHtmlForStickers = (htmlStr: string, colId?: string, colName?: string) => {
    if (!htmlStr || typeof htmlStr !== 'string' || !htmlStr.includes('wonbee-sticker')) return;

    const regex = /<div[^>]*data-type=["']wonbee-sticker["'][^>]*>([\s\S]*?)(?:<\/div>|$)/gi;
    let match;
    while ((match = regex.exec(htmlStr)) !== null) {
      const tag = match[0];
      const idMatch = tag.match(/data-id=["']([^"']*)["']/i);
      const titleMatch = tag.match(/data-title=["']([^"']*)["']/i);
      const bodyMatch = tag.match(/data-body=["']([^"']*)["']/i);
      const colorMatch = tag.match(/data-color=["']([^"']*)["']/i);
      const completedMatch = tag.match(/data-completed=["']true["']/i);
      const pinnedMatch = tag.match(/data-pinned=["']true["']/i);

      let bodyText = bodyMatch ? bodyMatch[1] : '';
      if (!bodyText && match[1]) {
        const contentMatch = match[1].match(/class=["'][^"']*wonbee-sticker-content[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
        if (contentMatch) {
          bodyText = contentMatch[1].replace(/<[^>]+>/g, '').trim();
        }
      }

      const id = idMatch ? idMatch[1] : `stk-${Math.random().toString(36).substring(2, 9)}`;
      if (seenIds.has(id)) continue;
      seenIds.add(id);

      result.push({
        id,
        title: titleMatch ? titleMatch[1] : '원노트 스티커 메모',
        content: bodyText,
        color: (colorMatch?.[1] as any) || 'amber',
        completed: !!completedMatch,
        isPinned: !!pinnedMatch,
        columnId: colId,
        columnName: colName,
      });
    }
  };

  // 2. From column data fields
  if (row.data) {
    Object.entries(row.data).forEach(([colId, val]) => {
      if (typeof val === 'string' && val.includes('wonbee-sticker')) {
        const col = columns?.find((c) => c.id === colId);
        parseHtmlForStickers(val, colId, col?.name || colId);
      }
    });
  }

  // 3. From richContent
  if (row.richContent && typeof row.richContent === 'string' && row.richContent.includes('wonbee-sticker')) {
    parseHtmlForStickers(row.richContent, undefined, '상세 서식 문서');
  }

  return result;
}
