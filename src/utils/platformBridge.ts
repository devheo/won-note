/**
 * Unified Platform Bridge Detection Helper
 * Supports 3 Execution Targets:
 * 1. 'server': Web Server Mode (REST API & Remote SQLite Backend)
 * 2. 'client_web': Web Client-Only Mode (IndexedDB / Dexie.js Serverless)
 * 3. 'tauri_app': Tauri 2.0 Native Desktop App Mode
 */

export type RuntimeMode = 'server' | 'client_web' | 'tauri_app';

/**
 * Detects if the application is running inside a Tauri 2.0 Desktop Container.
 */
export function isTauri(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean((window as any).__TAURI_INTERNALS__ || (window as any).__TAURI__);
}

/**
 * Returns the active runtime execution target.
 */
export function getRuntimeMode(): RuntimeMode {
  if (isTauri()) {
    return 'tauri_app';
  }
  if (typeof window !== 'undefined') {
    const savedUseServer = localStorage.getItem('wonbee_use_server');
    if (savedUseServer === 'true') {
      return 'server';
    }
  }
  return 'client_web';
}

/**
 * Debug helper to log active platform capabilities.
 */
export function getPlatformInfo(): {
  isDesktop: boolean;
  runtimeMode: RuntimeMode;
  userAgent: string;
  isMac: boolean;
  isWindows: boolean;
} {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const isMac = /Macintosh|Mac OS X/i.test(ua);
  const isWindows = /Windows/i.test(ua);

  return {
    isDesktop: isTauri(),
    runtimeMode: getRuntimeMode(),
    userAgent: ua,
    isMac,
    isWindows,
  };
}
