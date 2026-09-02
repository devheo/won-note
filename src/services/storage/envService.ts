/**
 * WonBee - user_env.json Management Service
 * Manages UI environment settings: column widths, theme, zoom level, density, active table, etc.
 */

import { UserEnvData, RowDensity } from '../../types';

const ENV_STORAGE_KEY = 'wonbee_user_env';

export const DEFAULT_USER_ENV: UserEnvData = {
  version: '1.0.0',
  theme: 'light',
  zoomLevel: 100,
  activeTableId: 'table-roadmap',
  rowDensity: 'normal',
  columnWidths: {},
  hiddenColumns: {},
  updatedAt: Date.now(),
};

class EnvService {
  private currentEnv: UserEnvData;

  constructor() {
    this.currentEnv = this.loadFromStorage();
  }

  private loadFromStorage(): UserEnvData {
    if (typeof window === 'undefined') return DEFAULT_USER_ENV;
    try {
      const raw = localStorage.getItem(ENV_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          ...DEFAULT_USER_ENV,
          ...parsed,
          columnWidths: parsed.columnWidths || {},
          hiddenColumns: parsed.hiddenColumns || {},
        };
      }
    } catch (e) {
      console.warn('Failed to parse user_env from localStorage, initializing default.', e);
    }

    // Migration fallback from older localStorage keys if present
    const legacyTheme = localStorage.getItem('wonbee_theme');
    const legacyZoom = localStorage.getItem('wonbee_zoom_level');
    const legacyTable = localStorage.getItem('wonbee_active_table_id');
    const legacyDensity = localStorage.getItem('wonbee_row_density');

    return {
      ...DEFAULT_USER_ENV,
      theme: legacyTheme === 'dark' ? 'dark' : 'light',
      zoomLevel: legacyZoom ? parseInt(legacyZoom, 10) : 100,
      activeTableId: legacyTable || DEFAULT_USER_ENV.activeTableId,
      rowDensity: (legacyDensity as RowDensity) || 'normal',
      updatedAt: Date.now(),
    };
  }

  public getEnv(): UserEnvData {
    return { ...this.currentEnv };
  }

  public updateEnv(partial: Partial<UserEnvData>): UserEnvData {
    this.currentEnv = {
      ...this.currentEnv,
      ...partial,
      updatedAt: Date.now(),
    };
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(ENV_STORAGE_KEY, JSON.stringify(this.currentEnv));
        // Keep legacy keys in sync for compatibility
        if (this.currentEnv.theme) localStorage.setItem('wonbee_theme', this.currentEnv.theme);
        if (this.currentEnv.zoomLevel) localStorage.setItem('wonbee_zoom_level', String(this.currentEnv.zoomLevel));
        if (this.currentEnv.activeTableId) localStorage.setItem('wonbee_active_table_id', this.currentEnv.activeTableId);
        if (this.currentEnv.rowDensity) localStorage.setItem('wonbee_row_density', this.currentEnv.rowDensity);
      } catch (e) {
        console.error('Failed to save user_env to localStorage', e);
      }
    }
    return { ...this.currentEnv };
  }

  public setColumnWidth(tableId: string, colId: string, width: number): UserEnvData {
    const tableMap = { ...(this.currentEnv.columnWidths[tableId] || {}) };
    tableMap[colId] = width;
    const newWidths = {
      ...this.currentEnv.columnWidths,
      [tableId]: tableMap,
    };
    return this.updateEnv({ columnWidths: newWidths });
  }

  public setTableColumnWidths(tableId: string, widths: Record<string, number>): UserEnvData {
    const newWidths = {
      ...this.currentEnv.columnWidths,
      [tableId]: widths,
    };
    return this.updateEnv({ columnWidths: newWidths });
  }

  public setHiddenColumns(tableId: string, hiddenIds: string[]): UserEnvData {
    const newHidden = {
      ...this.currentEnv.hiddenColumns,
      [tableId]: hiddenIds,
    };
    return this.updateEnv({ hiddenColumns: newHidden });
  }

  /**
   * Export user_env.json file for download
   */
  public exportUserEnvFile(): void {
    const jsonStr = JSON.stringify(this.currentEnv, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'user_env.json';
    link.click();
    URL.revokeObjectURL(url);
  }

  /**
   * Import user_env.json file
   */
  public async importUserEnvFile(file: File): Promise<UserEnvData> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const parsed = JSON.parse(e.target?.result as string);
          if (typeof parsed === 'object' && parsed !== null) {
            const merged = this.updateEnv({
              ...parsed,
              version: parsed.version || '1.0.0',
            });
            resolve(merged);
          } else {
            reject(new Error('유효한 user_env.json 형식이 아닙니다.'));
          }
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error('파일을 읽는 중 오류가 발생했습니다.'));
      reader.readAsText(file);
    });
  }
}

export const envService = new EnvService();
