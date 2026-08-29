/**
 * Local File System Sync Service (File System Access API)
 * Allows WonBee to directly read/write `wonbee_data.json` on the local machine/folder.
 * Compatible with single-file HTML (file://), local servers (http://localhost), and server backends.
 */

import { WorkspaceData } from '../../types';

class FileSystemSyncService {
  private fileHandle: any = null;
  private fileName: string = 'wonbee_data.json';
  private isAutoSyncEnabled: boolean = false;

  public isSupported(): boolean {
    return typeof window !== 'undefined' && 'showOpenFilePicker' in window && 'showSaveFilePicker' in window;
  }

  public getConnectedFileName(): string | null {
    return this.fileHandle ? this.fileHandle.name : null;
  }

  public isConnected(): boolean {
    return !!this.fileHandle;
  }

  public hasConnectedFile(): boolean {
    return !!this.fileHandle;
  }

  /**
   * Disconnect currently linked local file
   */
  public disconnect(): void {
    this.fileHandle = null;
    this.isAutoSyncEnabled = false;
  }

  /**
   * Open an existing local JSON file (e.g. wonbee_data.json)
   */
  public async openLocalFile(): Promise<{ data: WorkspaceData; fileName: string } | null> {
    if (!this.isSupported()) {
      throw new Error('이 브라우저는 로컬 파일 직접 연동(File System Access API)을 지원하지 않습니다. Chrome, Edge, Whale 최신 버전을 권장합니다.');
    }

    try {
      // @ts-ignore
      const [handle] = await window.showOpenFilePicker({
        types: [
          {
            description: 'WonBee 데이터 파일 (JSON)',
            accept: {
              'application/json': ['.json'],
            },
          },
        ],
        multiple: false,
      });

      if (!handle) return null;

      const file = await handle.getFile();
      const content = await file.text();
      const data: WorkspaceData = JSON.parse(content);

      this.fileHandle = handle;
      this.fileName = handle.name;
      this.isAutoSyncEnabled = true;

      return { data, fileName: handle.name };
    } catch (err: any) {
      if (err.name === 'AbortError') {
        return null; // User cancelled
      }
      throw err;
    }
  }

  /**
   * Create/Connect a new local data file (Save As / Link)
   */
  public async linkNewLocalFile(initialData: WorkspaceData): Promise<string | null> {
    if (!this.isSupported()) {
      throw new Error('이 브라우저는 로컬 파일 직접 연동을 지원하지 않습니다.');
    }

    try {
      // @ts-ignore
      const handle = await window.showSaveFilePicker({
        suggestedName: 'wonbee_data.json',
        types: [
          {
            description: 'WonBee 데이터 파일 (JSON)',
            accept: {
              'application/json': ['.json'],
            },
          },
        ],
      });

      if (!handle) return null;

      this.fileHandle = handle;
      this.fileName = handle.name;
      this.isAutoSyncEnabled = true;

      // Write initial state to file
      await this.saveToFile(initialData);

      return handle.name;
    } catch (err: any) {
      if (err.name === 'AbortError') {
        return null;
      }
      throw err;
    }
  }

  /**
   * Save workspace data directly to the connected local file
   */
  public async saveToFile(data: WorkspaceData): Promise<boolean> {
    if (!this.fileHandle) return false;

    try {
      // Request write permission if not granted
      // @ts-ignore
      if (this.fileHandle.queryPermission) {
        // @ts-ignore
        const permission = await this.fileHandle.queryPermission({ mode: 'readwrite' });
        if (permission !== 'granted') {
          // @ts-ignore
          const req = await this.fileHandle.requestPermission({ mode: 'readwrite' });
          if (req !== 'granted') return false;
        }
      }

      // @ts-ignore
      const writable = await this.fileHandle.createWritable();
      const serialized = JSON.stringify(data, null, 2);
      await writable.write(serialized);
      await writable.close();
      return true;
    } catch (err) {
      console.error('Failed to write directly to local file handle:', err);
      return false;
    }
  }

  /**
   * Alias for saveToFile
   */
  public async saveToConnectedFile(data: WorkspaceData): Promise<boolean> {
    return this.saveToFile(data);
  }

  /**
   * Standard File Download Fallback (for non-supporting browsers or manual backup)
   */
  public downloadAsFile(data: WorkspaceData, customFileName = 'wonbee_data.json'): void {
    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = customFileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}

export const localFileService = new FileSystemSyncService();
