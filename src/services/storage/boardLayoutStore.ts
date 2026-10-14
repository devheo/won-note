/**
 * Board Layout Store (boardLayoutStore.ts)
 * Non-invasive metadata store for MEMOJJANG Sticky Note Board view.
 * Stores 2D positions (x, y), sizes (width, height), zIndex, bgColor, and pin states
 * in localStorage / Dexie without modifying the core TableRow business database schema.
 */

export interface BoardNoteLayout {
  rowId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  bgColor: 'yellow' | 'amber' | 'green' | 'blue' | 'rose' | 'purple' | 'dark';
  isPinned: boolean;
  updatedAt: number;
}

const STORAGE_KEY_PREFIX = 'wonbee_memo_board_layout_';

export const boardLayoutStore = {
  /**
   * Retrieves all note layouts for a given tableId
   */
  getLayouts(tableId: string): Record<string, BoardNoteLayout> {
    if (!tableId || typeof localStorage === 'undefined') return {};
    try {
      const json = localStorage.getItem(`${STORAGE_KEY_PREFIX}${tableId}`);
      if (json) {
        return JSON.parse(json);
      }
    } catch (err) {
      console.warn('[boardLayoutStore] Failed to read layouts from localStorage:', err);
    }
    return {};
  },

  /**
   * Saves or updates layout metadata for a single note/row
   */
  saveLayout(tableId: string, layout: BoardNoteLayout): void {
    if (!tableId || !layout.rowId || typeof localStorage === 'undefined') return;
    try {
      const layouts = this.getLayouts(tableId);
      layouts[layout.rowId] = {
        ...layout,
        updatedAt: Date.now(),
      };
      localStorage.setItem(`${STORAGE_KEY_PREFIX}${tableId}`, JSON.stringify(layouts));
    } catch (err) {
      console.warn('[boardLayoutStore] Failed to save layout:', err);
    }
  },

  /**
   * Batch saves multiple layouts
   */
  saveLayoutsBatch(tableId: string, newLayouts: Record<string, BoardNoteLayout>): void {
    if (!tableId || typeof localStorage === 'undefined') return;
    try {
      const existing = this.getLayouts(tableId);
      const merged = { ...existing, ...newLayouts };
      localStorage.setItem(`${STORAGE_KEY_PREFIX}${tableId}`, JSON.stringify(merged));
    } catch (err) {
      console.warn('[boardLayoutStore] Failed to batch save layouts:', err);
    }
  },

  /**
   * Removes layout metadata for a deleted note/row
   */
  removeLayout(tableId: string, rowId: string): void {
    if (!tableId || !rowId || typeof localStorage === 'undefined') return;
    try {
      const layouts = this.getLayouts(tableId);
      if (layouts[rowId]) {
        delete layouts[rowId];
        localStorage.setItem(`${STORAGE_KEY_PREFIX}${tableId}`, JSON.stringify(layouts));
      }
    } catch (err) {
      console.warn('[boardLayoutStore] Failed to remove layout:', err);
    }
  },

  /**
   * Generates default grid fallback layout for unpositioned notes
   */
  getOrCreateDefaultLayout(
    tableId: string,
    rowId: string,
    index: number,
    existingLayouts: Record<string, BoardNoteLayout>
  ): BoardNoteLayout {
    if (existingLayouts[rowId]) {
      return existingLayouts[rowId];
    }

    // Default grid position calculation
    const cols = 3;
    const cardWidth = 280;
    const cardHeight = 220;
    const gapX = 24;
    const gapY = 24;
    const paddingX = 32;
    const paddingY = 32;

    const col = index % cols;
    const row = Math.floor(index / cols);

    const x = paddingX + col * (cardWidth + gapX);
    const y = paddingY + row * (cardHeight + gapY);

    const colors: BoardNoteLayout['bgColor'][] = ['amber', 'yellow', 'green', 'blue', 'rose', 'purple'];
    const bgColor = colors[index % colors.length];

    const defaultLayout: BoardNoteLayout = {
      rowId,
      x,
      y,
      width: cardWidth,
      height: cardHeight,
      zIndex: 10 + index,
      bgColor,
      isPinned: false,
      updatedAt: Date.now(),
    };

    return defaultLayout;
  },
};
