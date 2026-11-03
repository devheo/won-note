import { isTauri, getRuntimeMode } from '../utils/platformBridge';

export interface FileSaveResult {
  success: boolean;
  filePath?: string;
  cancelled?: boolean;
  error?: string;
}

export interface FileOpenResult {
  content: string;
  filePath?: string;
  fileName?: string;
}

/**
 * Unified File Save Bridge
 * - tauri_app: Opens OS Native Save Dialog & writes file to disk.
 * - client_web / server: Creates Browser Blob URL & triggers anchor download.
 */
export async function saveTextFile(
  filename: string,
  content: string,
  defaultPath?: string
): Promise<FileSaveResult> {
  const mode = getRuntimeMode();

  if (mode === 'tauri_app') {
    try {
      // Dynamic import for Tauri plugins to prevent Web bundle errors
      const dialog = await import(/* @vite-ignore */ '@tauri-apps/plugin-dialog');
      const fs = await import(/* @vite-ignore */ '@tauri-apps/plugin-fs');

      const selectedPath = await dialog.save({
        title: '파일 저장',
        defaultPath: defaultPath || filename,
        filters: [
          {
            name: 'Text & Markdown Documents',
            extensions: ['txt', 'md', 'json', 'csv', 'tsv', 'html'],
          },
        ],
      });

      if (!selectedPath) {
        return { success: false, cancelled: true };
      }

      await fs.writeTextFile(selectedPath, content);
      return { success: true, filePath: selectedPath };
    } catch (err: any) {
      console.error('[FileBridge] Tauri saveTextFile error:', err);
      return { success: false, error: err.message || 'Tauri File Save Failed' };
    }
  }

  // Web Browser Fallback (Server & Client-Only Web Modes)
  try {
    const mimeType = filename.endsWith('.json')
      ? 'application/json'
      : filename.endsWith('.md')
      ? 'text/markdown'
      : filename.endsWith('.csv')
      ? 'text/csv'
      : 'text/plain;charset=utf-8;';

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    return { success: true };
  } catch (err: any) {
    console.error('[FileBridge] Web saveTextFile error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Unified File Open Bridge
 * - tauri_app: Opens OS Native Open Dialog & reads file text from disk.
 * - client_web / server: Dynamically creates <input type="file"> & reads via FileReader.
 */
export async function openTextFile(
  extensions: string[] = ['txt', 'md', 'json', 'csv', 'tsv', 'html']
): Promise<FileOpenResult | null> {
  const mode = getRuntimeMode();

  if (mode === 'tauri_app') {
    try {
      const dialog = await import(/* @vite-ignore */ '@tauri-apps/plugin-dialog');
      const fs = await import(/* @vite-ignore */ '@tauri-apps/plugin-fs');

      const selected = await dialog.open({
        title: '파일 열기',
        multiple: false,
        filters: [{ name: 'Text Documents', extensions }],
      });

      if (!selected) return null;

      const filePath = typeof selected === 'string' ? selected : selected[0];
      if (!filePath) return null;

      const content = await fs.readTextFile(filePath);
      const fileName = filePath.split(/[/\\]/).pop() || 'opened_file.txt';

      return { content, filePath, fileName };
    } catch (err: any) {
      console.error('[FileBridge] Tauri openTextFile error:', err);
      return null;
    }
  }

  // Web Browser Fallback
  return new Promise((resolve) => {
    try {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = extensions.map((e) => `.${e}`).join(',');

      input.onchange = (e: Event) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) {
          resolve(null);
          return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
          const content = (event.target?.result as string) || '';
          resolve({
            content,
            fileName: file.name,
          });
        };
        reader.onerror = () => resolve(null);
        reader.readAsText(file);
      };

      input.click();
    } catch (err) {
      console.error('[FileBridge] Web openTextFile error:', err);
      resolve(null);
    }
  });
}

/**
 * Unified Image Source Resolver Bridge
 * - tauri_app: Converts local OS file path to asset:// protocol via convertFileSrc().
 * - client_web / server: Returns Base64, Blob URL, or HTTP URL as-is.
 */
export async function resolveImageSrc(src: string): Promise<string> {
  if (!src) return '';

  if (isTauri() && (src.startsWith('/') || /^[a-zA-Z]:\\/.test(src))) {
    try {
      const core = await import(/* @vite-ignore */ '@tauri-apps/api/core');
      return core.convertFileSrc(src);
    } catch (err) {
      console.warn('[FileBridge] convertFileSrc failed, fallback raw src:', err);
    }
  }

  return src;
}
