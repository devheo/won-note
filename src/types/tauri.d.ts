/**
 * Ambient Module Declarations for Tauri 2.0 Plugins
 * Ensures dynamic imports (await import('@tauri-apps/...')) typecheck cleanly
 * across Web, Server, and Tauri Desktop build targets without forcing mandatory package installation.
 */

declare module '@tauri-apps/plugin-dialog' {
  export function save(options?: any): Promise<string | null>;
  export function open(options?: any): Promise<string | string[] | null>;
}

declare module '@tauri-apps/plugin-fs' {
  export function writeTextFile(path: string, contents: string, options?: any): Promise<void>;
  export function readTextFile(path: string, options?: any): Promise<string>;
}

declare module '@tauri-apps/api/core' {
  export function convertFileSrc(filePath: string, protocol?: string): string;
  export function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
}

declare module '@tauri-apps/plugin-http' {
  export function fetch(input: any, init?: any): Promise<Response>;
}

declare module '@tauri-apps/plugin-notification' {
  export function isPermissionGranted(): Promise<boolean>;
  export function requestPermission(): Promise<'granted' | 'denied' | 'default'>;
  export function sendNotification(options: { title: string; body?: string; icon?: string; sound?: string }): void;
}
